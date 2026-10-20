import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isTerminal, nextState, stateFromTwilio, type CallState } from "@/domain/voice/state";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { dialNumberTwiml, twilioWebhookUrl } from "@/lib/communications/twilio";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";
import { checkBaseGates, checkCommercialGates, checkProspect, hashAuth, voiceIdentity } from "@/lib/voice/session";
import { readVoiceSettings } from "@/lib/voice/settings";

export const VOICE_OUTBOUND_PATH = "/api/voice/outbound";
export const VOICE_STATUS_PATH = "/api/voice/status";

const NO = '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-CA">This call cannot be placed.</Say><Hangup/></Response>';

const CLOSE = { openProspectKey: null, openNumberKey: null, openStaffKey: null } as const;

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
  if (s.parentCallSid && s.parentCallSid === callSid) return s.state === "PENDING" || s.state === "RINGING" || s.state === "IN_PROGRESS" ? dialTwiml(s.destinationE164, s.callerIdE164, settings.maxCallSeconds) : NO;
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
    const chk = actor && s.prospectId ? await checkProspect(actor, s.prospectId, now) : null;
    if (!chk || !chk.ok || chk.dial.destinationE164 !== s.destinationE164 || !normalizeCanadianPhone(s.destinationE164)) {
      const code = chk && !chk.ok ? chk.code : "NOT_CALLABLE";
      await closeWithFailure(s.id, code); await audit(s.userId, s.id, "REJECTED", code); return NO;
    }
  }
  const claimed = await db.crmCallSession.updateMany({ where: { id: s.id, state: "PENDING", authConsumedAt: null, endedAt: null }, data: { authConsumedAt: now, parentCallSid: callSid, authTokenHash: null } });
  if (claimed.count !== 1) return NO; // lost a race with a concurrent request carrying the same authorization
  return dialTwiml(s.destinationE164, s.callerIdE164, settings.maxCallSeconds);
}

async function audit(userId: string, sessionId: string, what: string, code: string) {
  await writeCrmAudit({ actorUserId: userId, action: what === "ENDED" ? "CALL_SESSION_ENDED" : "CALL_SESSION_REJECTED", entityType: "CrmCallSession", entityId: sessionId, metadata: { code } }).catch(() => undefined);
}

/**
 * Status callbacks (parent and child legs). Idempotent: the provider event is stored under a unique (CallSid, status, sequence) key, so a replay changes nothing; the state only moves forward
 * and a terminal state is final. Terminal states free the open-call locks.
 */
export async function handleStatus(body: Record<string, string>, now = new Date()): Promise<{ applied: boolean; reason?: string }> {
  const callSid = body.CallSid, parentSid = body.ParentCallSid || null, status = (body.CallStatus ?? "").toLowerCase();
  if (!callSid || !status) return { applied: false, reason: "BAD_REQUEST" };
  const s = await db.crmCallSession.findFirst({ where: { OR: [{ parentCallSid: parentSid ?? callSid }, { parentCallSid: callSid }, { childCallSid: callSid }] } });
  if (!s) return { applied: false, reason: "UNKNOWN_CALL" };
  const sequence = Number.parseInt(body.SequenceNumber ?? "0", 10) || 0;
  const isChild = !!parentSid && parentSid === s.parentCallSid;
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
