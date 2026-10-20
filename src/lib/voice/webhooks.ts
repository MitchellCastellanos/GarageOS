import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isTerminal, nextState, stateFromTwilio, type CallState } from "@/domain/voice/state";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { conferenceHostTwiml, conferenceGuestTwiml, dialNumberTwiml, holdTwiml, twilioWebhookUrl, voiceProvider } from "@/lib/communications/twilio";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";
import { checkBaseGates, checkCommercialGates, checkProspect, hashAuth, voiceIdentity } from "@/lib/voice/session";
import { readVoiceSettings } from "@/lib/voice/settings";

export const VOICE_OUTBOUND_PATH = "/api/voice/outbound";
export const VOICE_STATUS_PATH = "/api/voice/status";
export const VOICE_HOLD_MUSIC_PATH = "/api/voice/hold-music";
export const conferenceName = (sessionId: string) => `garageos-call-${sessionId}`;
export const conferencePath = (sessionId: string, leaf: "join" | "status" | "events") => `/api/voice/conference/${sessionId}/${leaf}`;

const NO = '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-CA">This call cannot be placed.</Say><Hangup/></Response>';

const CLOSE = { openProspectKey: null, openNumberKey: null, openStaffKey: null, holdState: "NONE", heldAt: null } as const;

const dialTwiml = (destination: string, callerId: string, maxSeconds: number) => dialNumberTwiml({ destination, callerId, maxSeconds, statusCallbackUrl: twilioWebhookUrl(VOICE_STATUS_PATH) });

async function closeWithFailure(sessionId: string, code: string, state: CallState = "ABANDONED") {
  await db.crmCallSession.updateMany({ where: { id: sessionId, endedAt: null }, data: { state, failureCode: code, endedAt: new Date(), ...CLOSE } });
}

/**
 * TwiML App Voice URL. Called by Twilio (signature already verified by the route) when the browser Device connects. The destination is NEVER taken from the request: it comes from the
 * session created by the server, and every gate is evaluated again on live data before a single digit is dialled. The one-time authorization is consumed atomically (replay-proof).
 */
export async function handleOutbound(body: Record<string, string>, now = new Date()): Promise<string> {
  const callSid = body.CallSid, sessionId = body.sessionId, token = body.authToken;
  if (!callSid || !sessionId || !token) return NO;
  const s = await db.crmCallSession.findUnique({ where: { id: sessionId } });
  if (!s) return NO;
  const settings = await readVoiceSettings();
  // Retry of the very same Twilio request (same CallSid): answer the same instruction without re-consuming anything.
  if (s.parentCallSid && s.parentCallSid === callSid) return s.state === "PENDING" || s.state === "RINGING" || s.state === "IN_PROGRESS" ? (s.topology === "CONFERENCE" ? conferenceHostTwiml({ name: conferenceName(s.id), eventsUrl: twilioWebhookUrl(conferencePath(s.id, "events")), maxSeconds: settings.maxCallSeconds }) : dialTwiml(s.destinationE164, s.callerIdE164, settings.maxCallSeconds)) : NO;
  if (s.state !== "PENDING" || s.endedAt || s.authConsumedAt || !s.authTokenHash || s.authTokenHash !== hashAuth(token) || s.authExpiresAt < now || body.From !== `client:${voiceIdentity(s.staffId)}`) {
    await audit(s.userId, s.id, "REJECTED", "AUTH_INVALID");
    if (!s.endedAt && s.state === "PENDING" && s.authTokenHash === hashAuth(token)) await closeWithFailure(s.id, "AUTH_EXPIRED_OR_REPLAYED");
    return NO;
  }
  const gate = checkBaseGates(settings) ?? (s.kind === "PROSPECT" ? checkCommercialGates(settings) : null);
  if (gate) { await closeWithFailure(s.id, gate.code); await audit(s.userId, s.id, "REJECTED", gate.code); return NO; }
  if (s.kind === "TEST") {
    if (!settings.testDestinations.includes(s.destinationE164)) { await closeWithFailure(s.id, "TEST_NUMBER_NOT_ALLOWED"); return NO; }
  } else {
    const actor = await resolvePlatformSalesActor(s.userId);
    const chk = actor && s.prospectId ? await checkProspect(actor, s.prospectId, now, { allowOutOfHours: settings.allowOutOfHoursCalls && (s.eligibilitySnapshot as { outOfHoursConfirmed?: boolean } | null)?.outOfHoursConfirmed === true }) : null;
    if (!chk || !chk.ok || chk.dial.destinationE164 !== s.destinationE164 || !normalizeCanadianPhone(s.destinationE164)) {
      const code = chk && !chk.ok ? chk.code : "NOT_CALLABLE";
      await closeWithFailure(s.id, code); await audit(s.userId, s.id, "REJECTED", code); return NO;
    }
  }
  const claimed = await db.crmCallSession.updateMany({ where: { id: s.id, state: "PENDING", authConsumedAt: null, endedAt: null }, data: { authConsumedAt: now, parentCallSid: callSid, authTokenHash: null } });
  if (claimed.count !== 1) return NO; // lost a race with a concurrent request carrying the same authorization
  if (!settings.holdEnabled) return dialTwiml(s.destinationE164, s.callerIdE164, settings.maxCallSeconds);

  // Hold-capable topology (Super Admin switch): the browser leg waits in a private conference and the prospect's call is placed through the REST API into the same conference.
  // The destination is still the server-resolved one; nothing from the request is used.
  try {
    const childSid = await voiceProvider.createConferenceProspectCall({
      accountSid: settings.twilioAccountSid, to: s.destinationE164, from: s.callerIdE164, maxSeconds: settings.maxCallSeconds,
      joinUrl: twilioWebhookUrl(conferencePath(s.id, "join")), statusCallbackUrl: twilioWebhookUrl(conferencePath(s.id, "status")),
    });
    try { await db.crmCallSession.update({ where: { id: s.id }, data: { topology: "CONFERENCE", childCallSid: childSid } }); }
    catch (e) { await voiceProvider.endProviderCall({ accountSid: settings.twilioAccountSid, callSid: childSid }).catch(() => undefined); throw e; }
  } catch (e) {
    await closeWithFailure(s.id, "PROVIDER_ERROR"); await audit(s.userId, s.id, "REJECTED", "PROVIDER_ERROR");
    console.error("[voice] conference dial failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return NO;
  }
  return conferenceHostTwiml({ name: conferenceName(s.id), eventsUrl: twilioWebhookUrl(conferencePath(s.id, "events")), maxSeconds: settings.maxCallSeconds });
}

/** TwiML fetched by Twilio when the prospect answers (conference topology). Only the exact call this server created for this session may join, and only while the session is live. */
export async function handleConferenceJoin(sessionId: string, body: Record<string, string>): Promise<string> {
  const s = await db.crmCallSession.findUnique({ where: { id: sessionId } });
  const callSid = body.CallSid;
  if (!s || !callSid || s.topology !== "CONFERENCE" || s.endedAt || isTerminal(s.state as CallState)) return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
  if (s.childCallSid && s.childCallSid !== callSid) return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
  if (!s.childCallSid) await db.crmCallSession.updateMany({ where: { id: s.id, childCallSid: null }, data: { childCallSid: callSid } });
  return conferenceGuestTwiml({ name: conferenceName(s.id) });
}

/** Conference callbacks: remember the live conference SID (idempotent by provider event). */
export async function handleConferenceEvent(sessionId: string, body: Record<string, string>): Promise<{ applied: boolean }> {
  const s = await db.crmCallSession.findUnique({ where: { id: sessionId }, select: { id: true, conferenceSid: true } });
  const confSid = body.ConferenceSid, event = body.StatusCallbackEvent;
  if (!s || !confSid || !event) return { applied: false };
  const sequence = Number.parseInt(body.SequenceNumber ?? "0", 10) || 0;
  const ins = await db.crmCallEvent.createMany({ data: [{ sessionId: s.id, callSid: confSid, status: event, sequence, payload: { leg: "conference" } }], skipDuplicates: true });
  if (ins.count === 0) return { applied: false };
  if (!s.conferenceSid) await db.crmCallSession.updateMany({ where: { id: s.id, conferenceSid: null }, data: { conferenceSid: confSid } });
  return { applied: true };
}

/** What the held prospect hears (fetched by Twilio as the participant's holdUrl). */
export function holdMusicTwiml(language: "en-CA" | "fr-CA" = "en-CA"): string { return holdTwiml({ selfUrl: twilioWebhookUrl(VOICE_HOLD_MUSIC_PATH), language }); }

async function audit(userId: string, sessionId: string, what: string, code: string) {
  await writeCrmAudit({ actorUserId: userId, action: what === "ENDED" ? "CALL_SESSION_ENDED" : "CALL_SESSION_REJECTED", entityType: "CrmCallSession", entityId: sessionId, metadata: { code } }).catch(() => undefined);
}

/**
 * Status callbacks (parent and child legs). Idempotent: the provider event is stored under a unique (CallSid, status, sequence) key, so a replay changes nothing; the state only moves forward
 * and a terminal state is final. Terminal states free the open-call locks.
 */
export async function handleStatus(body: Record<string, string>, now = new Date(), sessionHint: string | null = null): Promise<{ applied: boolean; reason?: string }> {
  const callSid = body.CallSid, parentSid = body.ParentCallSid || null, status = (body.CallStatus ?? "").toLowerCase();
  if (!callSid || !status) return { applied: false, reason: "BAD_REQUEST" };
  const s = sessionHint
    ? await db.crmCallSession.findFirst({ where: { id: sessionHint, topology: "CONFERENCE", OR: [{ childCallSid: callSid }, { childCallSid: null }] } })
    : await db.crmCallSession.findFirst({ where: { OR: [{ parentCallSid: parentSid ?? callSid }, { parentCallSid: callSid }, { childCallSid: callSid }] } });
  if (!s) return { applied: false, reason: "UNKNOWN_CALL" };
  const sequence = Number.parseInt(body.SequenceNumber ?? "0", 10) || 0;
  const isChild = (!!parentSid && parentSid === s.parentCallSid) || (!!sessionHint && callSid !== s.parentCallSid);
  const duration = body.CallDuration ? Number.parseInt(body.CallDuration, 10) : null;

  return db.$transaction(async (tx) => {
    const ins = await tx.crmCallEvent.createMany({ data: [{ sessionId: s.id, callSid, status, sequence, payload: { leg: isChild ? "child" : "parent", duration } }], skipDuplicates: true });
    if (ins.count === 0) return { applied: false, reason: "REPLAY" };
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "garageos"."CrmCallSession" WHERE "id" = ${s.id} FOR UPDATE`);
    const cur = await tx.crmCallSession.findUniqueOrThrow({ where: { id: s.id } });
    let incoming = stateFromTwilio(status);
    const data: Prisma.CrmCallSessionUpdateInput = {};
    if (isChild && !cur.childCallSid) data.childCallSid = callSid;
    if (!isChild) {
      // Parent leg: only its end matters (the rep's browser hung up or the call finished). It maps to COMPLETED if the far end answered, else CANCELED.
      incoming = status === "completed" ? (cur.answeredAt ? "COMPLETED" : "CANCELED") : null;
    }
    const next = nextState(cur.state as CallState, incoming);
    if (next !== cur.state) {
      data.state = next;
      if (next === "RINGING" && !cur.ringingAt) data.ringingAt = now;
      if (next === "IN_PROGRESS" && !cur.answeredAt) data.answeredAt = now;
      if (isTerminal(next)) {
        Object.assign(data, { endedAt: now, finalStatus: status, ...CLOSE });
        if (duration !== null && Number.isFinite(duration)) data.durationSec = duration;
      }
    }
    if (isChild && duration !== null && isTerminal(cur.state as CallState) && cur.durationSec === null) data.durationSec = duration; // late child 'completed' after the parent ended
    if (Object.keys(data).length) await tx.crmCallSession.update({ where: { id: s.id }, data });
    if (data.state && isTerminal(data.state as CallState)) await writeCrmAudit({ actorUserId: s.userId, action: "CALL_SESSION_ENDED", entityType: "CrmCallSession", entityId: s.id, prospectId: s.prospectId ?? undefined, metadata: { state: data.state, durationSec: duration } }, tx);
    return { applied: true };
  });
}

export const NOT_PLACED_TWIML = NO;
