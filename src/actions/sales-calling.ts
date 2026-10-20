"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, applyDoNotContact, touchProspect } from "@/lib/sales-crm/prospects";
import { insertCrmTask } from "@/lib/sales-crm/task-service";
import { suppressPhoneNumber } from "@/lib/sales-crm/phone-readiness";
import { loadCallingQueue, type CallingQueueItem } from "@/lib/sales-crm/calling-queue";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { getSharedNumberAccountSid, getTwilioClientFor } from "@/lib/communications/twilio";
import { publicGateView, readVoiceSettings } from "@/lib/voice/settings";
import { reapStale, staffKeyOf, startCallSession } from "@/lib/voice/session";
import { handleStatus } from "@/lib/voice/webhooks";
import { DISPOSITIONS, maskNumber, type DispositionInput, type DispositionResult, type StartCallResult } from "@/lib/voice/types";

// Browser calling actions. Every one re-derives the seller from the session; the browser can only name a CRM prospect (or a Super Admin test-list entry) and its own idempotency key.

const OPEN = ["PENDING", "RINGING", "IN_PROGRESS"] as const;

export async function startProspectCall(prospectId: string, idempotencyKey: string): Promise<StartCallResult> {
  const actor = await requireCrmActor("place_sales_calls");
  return startCallSession(actor, { kind: "PROSPECT", prospectId: String(prospectId), idempotencyKey: String(idempotencyKey) });
}

export async function startTestCall(testNumber: string, idempotencyKey: string): Promise<StartCallResult> {
  const actor = await requireCrmActor("place_sales_calls");
  return startCallSession(actor, { kind: "TEST", testNumber: String(testNumber), idempotencyKey: String(idempotencyKey) });
}

async function ownSession(actor: PlatformSalesActor, sessionId: string) {
  const s = await db.crmCallSession.findUnique({ where: { id: String(sessionId) } });
  return s && s.userId === actor.userId ? s : null;
}

/** The browser gave up before the call connected (or the page closed): free the locks. A connected call ends through Twilio's callbacks; `reconcileCall` covers a lost one. */
export async function cancelCall(sessionId: string): Promise<{ ok: boolean }> {
  const actor = await requireCrmActor("place_sales_calls");
  const s = await ownSession(actor, sessionId);
  if (!s) return { ok: false };
  if (!s.parentCallSid) {
    await db.crmCallSession.updateMany({ where: { id: s.id, endedAt: null, parentCallSid: null }, data: { state: "CANCELED", failureCode: "CANCELED_BEFORE_CONNECT", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  }
  return { ok: true };
}

/** Asks Twilio what really happened to a call whose callbacks have not closed it (browser dropped, callback lost) and applies it through the same idempotent path. */
export async function reconcileCall(sessionId: string): Promise<{ ok: boolean; state: string | null }> {
  const actor = await requireCrmActor("place_sales_calls");
  const s = await ownSession(actor, sessionId);
  if (!s) return { ok: false, state: null };
  if (s.endedAt || !s.parentCallSid) return { ok: true, state: s.state };
  try {
    const c = getTwilioClientFor((await readVoiceSettings()).twilioAccountSid ?? getSharedNumberAccountSid());
    const parent = await c.calls(s.parentCallSid).fetch();
    const kid = (await c.calls.list({ parentCallSid: s.parentCallSid, limit: 1 }))[0];
    const src = kid ?? parent;
    await handleStatus({ CallSid: src.sid, ...(kid ? { ParentCallSid: s.parentCallSid } : {}), CallStatus: src.status, CallDuration: src.duration ?? "", SequenceNumber: "999" });
    if (parent.status === "completed" && !kid) await handleStatus({ CallSid: s.parentCallSid, CallStatus: "completed", SequenceNumber: "998" });
  } catch { /* leave it open; the stale-call reaper closes it */ }
  const after = await db.crmCallSession.findUnique({ where: { id: s.id }, select: { state: true } });
  return { ok: true, state: after?.state ?? null };
}

const OUTCOME_OF: Record<(typeof DISPOSITIONS)[number], "CONNECTED" | "VOICEMAIL" | "NO_ANSWER" | "WRONG_NUMBER" | "INTERESTED" | "NOT_INTERESTED" | "FOLLOW_UP_NEEDED"> = {
  NO_ANSWER: "NO_ANSWER", VOICEMAIL: "VOICEMAIL", GATEKEEPER: "CONNECTED", CALL_BACK: "FOLLOW_UP_NEEDED", INTERESTED: "INTERESTED", NOT_INTERESTED: "NOT_INTERESTED", WRONG_NUMBER: "WRONG_NUMBER",
  NOT_A_REPAIR_SHOP: "NOT_INTERESTED", DO_NOT_CALL: "NOT_INTERESTED",
};

/** Saves the structured outcome of an ENDED call: CRM CALL activity (idempotent per session), optional follow-up task, number/business suppression. Never places a call. */
export async function saveCallDisposition(sessionId: string, input: DispositionInput): Promise<DispositionResult> {
  const actor = await requireCrmActor("place_sales_calls");
  const s = await ownSession(actor, sessionId);
  if (!s) return { ok: false, code: "SESSION_NOT_FOUND" };
  if (!DISPOSITIONS.includes(input.outcome)) return { ok: false, code: "INVALID_INPUT" };
  if (!s.endedAt) return { ok: false, code: "SESSION_NOT_ENDED" };
  if (s.dispositionAt) return { ok: false, code: "ALREADY_RECORDED" };
  const note = (input.note ?? "").trim().slice(0, 2000) || null;
  const wantsFollowUp = !!input.followUpDate;
  if (input.outcome === "CALL_BACK" && !wantsFollowUp) return { ok: false, code: "INVALID_INPUT", detail: "FOLLOW_UP_REQUIRED" };
  if (input.outcome === "DO_NOT_CALL" && !note) return { ok: false, code: "INVALID_INPUT", detail: "NOTE_REQUIRED" };
  try {
    const result = await db.$transaction(async (tx) => {
      const claim = await tx.crmCallSession.updateMany({ where: { id: s.id, dispositionAt: null }, data: { dispositionAt: new Date(), dispositionCode: input.outcome } });
      if (claim.count !== 1) throw new CrmError("ALREADY_RECORDED");
      let activityId: string | null = null, taskId: string | null = null;
      if (s.kind === "PROSPECT" && s.prospectId) {
        const p = await tx.crmProspect.findUniqueOrThrow({ where: { id: s.prospectId }, select: { name: true, assignedStaffId: true } });
        const opp = await tx.crmOpportunity.findFirst({ where: { prospectId: s.prospectId, stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { id: true } });
        const a = await tx.crmActivity.create({
          data: {
            prospectId: s.prospectId, opportunityId: opp?.id ?? null, type: "CALL", outcome: OUTCOME_OF[input.outcome], subject: actor.uiLocale === "fr" ? "Appel (navigateur)" : "Call (browser)", body: note,
            occurredAt: s.answeredAt ?? s.requestedAt, authorUserId: actor.userId, idempotencyKey: s.id,
            metadata: { via: "softphone", callSessionId: s.id, callSid: s.parentCallSid, durationSec: s.durationSec, finalState: s.state, disposition: input.outcome },
          },
          select: { id: true },
        });
        activityId = a.id;
        await tx.crmCallSession.update({ where: { id: s.id }, data: { activityId } });
        await touchProspect(tx, s.prospectId, s.answeredAt ?? s.requestedAt);
        if (wantsFollowUp) {
          const staff = await tx.platformSalesStaff.findUnique({ where: { id: actor.staffId ?? "" }, select: { timezone: true } });
          const dueAt = parseShopDateTime(String(input.followUpDate), String(input.followUpTime || "09:00"), staff?.timezone ?? "America/Toronto");
          const t = await insertCrmTask(tx, { actor, prospectId: s.prospectId, opportunityId: opp?.id ?? null, assignedStaffId: p.assignedStaffId ?? actor.staffId, type: "CALL", title: actor.uiLocale === "fr" ? `Rappeler ${p.name}` : `Call back ${p.name}`, notes: note, priority: "MEDIUM", dueAt });
          taskId = t.id;
        }
        if (input.outcome === "WRONG_NUMBER") await suppressPhoneNumber(tx, { e164: s.destinationE164, prospectId: s.prospectId, userId: actor.userId, reason: "WRONG_NUMBER", source: "SOFTPHONE", note });
        if (input.outcome === "DO_NOT_CALL") await applyDoNotContact(tx, actor, s.prospectId, note);
        if (input.outcome === "NOT_A_REPAIR_SHOP") await tx.crmProspect.update({ where: { id: s.prospectId }, data: { tags: { push: "review-not-a-repair-shop" } } });
      }
      await writeCrmAudit({ actorUserId: actor.userId, action: "CALL_DISPOSITION_SAVED", entityType: "CrmCallSession", entityId: s.id, prospectId: s.prospectId ?? undefined, metadata: { outcome: input.outcome, followUp: wantsFollowUp } }, tx);
      return { activityId: activityId ?? "", taskId };
    });
    if (s.prospectId) revalidatePath(PLATFORM.salesProspect(s.prospectId));
    return { ok: true, activityId: result.activityId, taskId: result.taskId };
  } catch (e) {
    if (e instanceof CrmError) return { ok: false, code: e.message === "ALREADY_RECORDED" ? "ALREADY_RECORDED" : "INVALID_INPUT", detail: e.message };
    throw e;
  }
}

export interface CallingPageData {
  gates: ReturnType<typeof publicGateView>;
  isSuperAdmin: boolean;
  locale: "en" | "fr";
  queue: (Omit<CallingQueueItem, "phoneE164" | "lastActivityAt" | "window" | "phone"> & { phoneMasked: string; lastActivityAt: string | null; windowOpen: boolean; localTime: string })[];
  testNumbers: { value: string; masked: string }[];
  /** A call of this seller that has ended but has no recorded outcome yet. */
  pendingDisposition: { sessionId: string; prospectId: string | null; prospectName: string | null; state: string; durationSec: number | null } | null;
  /** A call of this seller that is still open (e.g. after a page reload). */
  openCall: { sessionId: string; state: string; prospectId: string | null } | null;
}

export async function getCallingPage(): Promise<CallingPageData> {
  const actor = await requireCrmActor("place_sales_calls");
  const key = staffKeyOf(actor);
  await reapStale(key, null);
  const [settings, openRows, pending] = await Promise.all([
    readVoiceSettings(),
    db.crmCallSession.findMany({ where: { state: { in: [...OPEN] }, endedAt: null }, select: { id: true, prospectId: true, staffId: true, state: true } }),
    db.crmCallSession.findFirst({ where: { userId: actor.userId, endedAt: { not: null }, dispositionAt: null, kind: "PROSPECT", parentCallSid: { not: null } }, orderBy: { requestedAt: "desc" }, include: { prospect: { select: { name: true } } } }),
  ]);
  const queue = await loadCallingQueue(actor, { limit: 50, openCallProspectIds: new Set(openRows.filter((r) => r.staffId !== key && r.prospectId).map((r) => r.prospectId!)) });
  const mine = openRows.find((r) => r.staffId === key);
  return {
    gates: publicGateView(settings), isSuperAdmin: actor.kind === "SUPER_ADMIN", locale: actor.uiLocale,
    queue: queue.map((q) => ({ id: q.id, name: q.name, city: q.city, province: q.province, language: q.language, phoneMasked: q.phoneE164 ? maskNumber(q.phoneE164) : "", lastActivityAt: q.lastActivityAt?.toISOString() ?? null, windowOpen: q.window.open, localTime: q.window.localTime })),
    testNumbers: actor.kind === "SUPER_ADMIN" ? settings.testDestinations.map((value) => ({ value, masked: maskNumber(value) })) : [],
    pendingDisposition: pending ? { sessionId: pending.id, prospectId: pending.prospectId, prospectName: pending.prospect?.name ?? null, state: pending.state, durationSec: pending.durationSec } : null,
    openCall: mine ? { sessionId: mine.id, state: mine.state, prospectId: mine.prospectId } : null,
  };
}

/** The signed-in seller's own REMOTE calling queue (read-only list; Remote sales is held by every active seller, FIELD + REMOTE included). */
export async function getMyCallingQueue(limit = 50) {
  const actor = await requireCrmActor("place_sales_calls");
  return loadCallingQueue(actor, { limit });
}
