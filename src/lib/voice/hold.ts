import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { isTerminal, type CallState } from "@/domain/voice/state";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { twilioWebhookUrl, voiceProvider } from "@/lib/communications/twilio";
import { readVoiceSettings } from "@/lib/voice/settings";
import { conferenceName, VOICE_HOLD_MUSIC_PATH } from "@/lib/voice/webhooks";
import type { CallErrorCode, HoldResult } from "@/lib/voice/types";

// Real telephony hold. Only the PROSPECT participant of the session's private conference is put on hold (it stops hearing/speaking and hears the hold document); the browser leg stays connected.
// Transitions are compare-and-set on the session row (NONE → HOLDING → HELD → RESUMING → NONE), so concurrent clicks cannot double-apply, a repeated request is idempotent, and a request that died
// halfway is healed from the provider's own state. A terminal call state always clears the hold (see webhooks CLOSE).

const STALE_TRANSIENT_MS = 15_000;
const fail = (code: CallErrorCode, detail?: string): HoldResult => ({ ok: false, code, ...(detail ? { detail } : {}) });

async function ownSession(actor: PlatformSalesActor, sessionId: string) {
  const s = await db.crmCallSession.findUnique({ where: { id: String(sessionId) } });
  return s && s.userId === actor.userId ? s : null;
}

/** An interrupted hold/resume leaves HOLDING/RESUMING behind: ask the provider what is true and record it. Safe to call at any time (a fresh transient state is left alone). */
export async function healHold(sessionId: string, now = new Date()): Promise<void> {
  const s = await db.crmCallSession.findUnique({ where: { id: sessionId } });
  if (!s || (s.holdState !== "HOLDING" && s.holdState !== "RESUMING")) return;
  if (s.holdUpdatedAt && now.getTime() - s.holdUpdatedAt.getTime() < STALE_TRANSIENT_MS) return;
  const settings = await readVoiceSettings();
  let truth: boolean | null = null;
  try {
    if (s.conferenceSid && s.childCallSid) truth = await voiceProvider.readParticipantHold({ accountSid: settings.twilioAccountSid, conferenceSid: s.conferenceSid, callSid: s.childCallSid });
  } catch { return; /* provider unreachable: try again on the next request */ }
  const to = truth === true ? "HELD" : "NONE"; // participant gone (null) or not held ⇒ not held
  await db.crmCallSession.updateMany({ where: { id: s.id, holdState: s.holdState }, data: { holdState: to, heldAt: to === "HELD" ? (s.heldAt ?? now) : null, holdUpdatedAt: now } });
  await writeCrmAudit({ actorUserId: s.userId, action: "CALL_HOLD_FAILED", entityType: "CrmCallSession", entityId: s.id, prospectId: s.prospectId ?? undefined, metadata: { healed: to, was: s.holdState } }).catch(() => undefined);
}

async function change(actor: PlatformSalesActor, sessionId: string, hold: boolean, now = new Date()): Promise<HoldResult> {
  if (!actor.capabilities.has("place_sales_calls")) return fail("NOT_ALLOWED");
  const settings = await readVoiceSettings();
  if (!settings.holdEnabled) return fail("HOLD_DISABLED");
  let s = await ownSession(actor, sessionId);
  if (!s) return fail("SESSION_NOT_FOUND");
  if (s.topology !== "CONFERENCE" || !s.childCallSid) return fail("HOLD_NOT_AVAILABLE");
  if (s.endedAt || isTerminal(s.state as CallState) || s.state !== "IN_PROGRESS") return fail("SESSION_NOT_ACTIVE");
  await healHold(s.id, now);
  s = (await db.crmCallSession.findUnique({ where: { id: s.id } }))!;
  const childSid = s.childCallSid!;
  const target = hold ? "HELD" : "NONE", from = hold ? "NONE" : "HELD", mid = hold ? "HOLDING" : "RESUMING";
  if (s.holdState === target) return { ok: true, held: hold, alreadyApplied: true };       // idempotent repeat
  if (s.holdState !== from) return fail("HOLD_BUSY");                                          // the opposite/other transition is in flight

  // Claim the transition (only one concurrent request can win).
  const claim = await db.crmCallSession.updateMany({ where: { id: s.id, holdState: from, state: "IN_PROGRESS", endedAt: null }, data: { holdState: mid, holdUpdatedAt: now } });
  if (claim.count !== 1) {
    const again = await db.crmCallSession.findUnique({ where: { id: s.id }, select: { holdState: true, endedAt: true } });
    if (again?.endedAt) return fail("SESSION_NOT_ACTIVE");
    if (again?.holdState === target) return { ok: true, held: hold, alreadyApplied: true };
    return fail("HOLD_BUSY");
  }
  try {
    let conferenceSid = s.conferenceSid;
    if (!conferenceSid) {
      conferenceSid = await voiceProvider.findConferenceSid({ accountSid: settings.twilioAccountSid, name: conferenceName(s.id) });
      if (!conferenceSid) throw new Error("CONFERENCE_NOT_FOUND");
      await db.crmCallSession.updateMany({ where: { id: s.id, conferenceSid: null }, data: { conferenceSid } });
    }
    await voiceProvider.setParticipantHold({ accountSid: settings.twilioAccountSid, conferenceSid, callSid: childSid, hold, holdUrl: twilioWebhookUrl(VOICE_HOLD_MUSIC_PATH) });
  } catch (e) {
    // The provider did not change anything we know of: release the claim so the seller can retry. A vanished participant means the call is over (the status callbacks close the session).
    await db.crmCallSession.updateMany({ where: { id: s.id, holdState: mid }, data: { holdState: from, holdUpdatedAt: new Date() } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "CALL_HOLD_FAILED", entityType: "CrmCallSession", entityId: s.id, prospectId: s.prospectId ?? undefined, metadata: { op: hold ? "hold" : "resume", error: e instanceof Error ? e.message.slice(0, 80) : "unknown" } }).catch(() => undefined);
    return fail("HOLD_FAILED");
  }
  const done = await db.crmCallSession.updateMany({
    where: { id: s.id, holdState: mid },
    data: hold ? { holdState: "HELD", heldAt: new Date(), holdUpdatedAt: new Date(), holdCount: { increment: 1 } } : { holdState: "NONE", heldAt: null, holdUpdatedAt: new Date() },
  });
  // done.count 0 ⇒ the call ended while the request was in flight: the terminal state already cleared the hold.
  if (done.count === 1) await writeCrmAudit({ actorUserId: actor.userId, action: hold ? "CALL_HOLD_SET" : "CALL_HOLD_RELEASED", entityType: "CrmCallSession", entityId: s.id, prospectId: s.prospectId ?? undefined });
  return { ok: true, held: hold, alreadyApplied: false };
}

export const holdCallSession = (actor: PlatformSalesActor, sessionId: string, now?: Date) => change(actor, sessionId, true, now);
export const resumeCallSession = (actor: PlatformSalesActor, sessionId: string, now?: Date) => change(actor, sessionId, false, now);
