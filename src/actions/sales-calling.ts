"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, applyDoNotContact, touchProspect } from "@/lib/sales-crm/prospects";
import { insertCrmTask } from "@/lib/sales-crm/task-service";
import { moveOpportunityStage } from "@/lib/sales-crm/pipeline-service";
import { suppressPhoneNumber } from "@/lib/sales-crm/phone-readiness";
import { loadCallingQueue } from "@/lib/sales-crm/calling-queue";
import { loadWorkspaceProfile } from "@/lib/sales-crm/calling-workspace";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { getSharedNumberAccountSid, getTwilioClientFor } from "@/lib/communications/twilio";
import { publicGateView, readVoiceSettings } from "@/lib/voice/settings";
import { reapStale, staffKeyOf, startCallSession } from "@/lib/voice/session";
import { handleStatus } from "@/lib/voice/webhooks";
import { DISPOSITIONS, NEXT_ACTIONS, NOT_INTERESTED_REASONS, maskNumber, type DispositionInput, type DispositionResult, type StartCallResult } from "@/lib/voice/types";

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
  if (input.outcome === "NOT_INTERESTED" && !(NOT_INTERESTED_REASONS as readonly string[]).includes(String(input.reason))) return { ok: false, code: "INVALID_INPUT", detail: "REASON_REQUIRED" };
  const nextAction = (NEXT_ACTIONS as readonly string[]).includes(String(input.nextAction)) ? input.nextAction! : "NONE";
  const extras = {
    reason: input.outcome === "NOT_INTERESTED" ? input.reason : undefined, nextAction: nextAction === "NONE" ? undefined : nextAction,
    demoRequested: input.demoRequested === true || undefined, demoSent: input.demoSent === true || undefined, meetingScheduled: input.meetingScheduled === true || undefined,
  };
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
            metadata: { via: "softphone", callSessionId: s.id, callSid: s.parentCallSid, durationSec: s.durationSec, finalState: s.state, disposition: input.outcome, ...extras },
          },
          select: { id: true },
        });
        activityId = a.id;
        await tx.crmCallSession.update({ where: { id: s.id }, data: { activityId } });
        await touchProspect(tx, s.prospectId, s.answeredAt ?? s.requestedAt);
        if (wantsFollowUp) {
          const staff = await tx.platformSalesStaff.findUnique({ where: { id: actor.staffId ?? "" }, select: { timezone: true } });
          const dueAt = parseShopDateTime(String(input.followUpDate), String(input.followUpTime || "09:00"), staff?.timezone ?? "America/Toronto");
          const fr = actor.uiLocale === "fr";
          const typed = input.outcome !== "CALL_BACK" && nextAction !== "NONE" && nextAction !== "CALL_BACK";
          const type = typed ? (nextAction === "SCHEDULE_MEETING" ? "FOLLOW_UP" : "EMAIL") : "CALL";
          const title = !typed ? (fr ? `Rappeler ${p.name}` : `Call back ${p.name}`)
            : nextAction === "SEND_DEMO" ? (fr ? `Envoyer la démo à ${p.name}` : `Send demo to ${p.name}`)
            : nextAction === "SEND_INFO" ? (fr ? `Envoyer l'information à ${p.name}` : `Send information to ${p.name}`)
            : (fr ? `Planifier une rencontre avec ${p.name}` : `Schedule a meeting with ${p.name}`);
          const t = await insertCrmTask(tx, { actor, prospectId: s.prospectId, opportunityId: opp?.id ?? null, assignedStaffId: p.assignedStaffId ?? actor.staffId, type, title, notes: note, priority: "MEDIUM", dueAt });
          taskId = t.id;
        }
        if (input.demoRequested) await tx.crmActivity.create({ data: { prospectId: s.prospectId, opportunityId: opp?.id ?? null, type: "DEMO", authorUserId: actor.userId, metadata: { event: "DEMO_REQUESTED", callSessionId: s.id } } });
        if (input.outcome === "INTERESTED") {
          // Interest moves a NEW/CONTACTED opportunity to ENGAGED through the same transactional stage change the pipeline uses; later stages are a human decision and are left alone.
          const cur = await tx.crmOpportunity.findFirst({ where: { prospectId: s.prospectId, stage: { in: ["NEW", "CONTACTED"] } }, select: { id: true, stage: true } });
          if (cur) await moveOpportunityStage(tx, { actor, opportunityId: cur.id, prospectId: s.prospectId, from: cur.stage, to: "ENGAGED", note: note ?? "Interested (call)" });
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
  /** What this seller may do from the workspace (each gates a panel; the server actions enforce the same capabilities). */
  can: { email: boolean; editProspects: boolean; schedule: boolean };
  timezone: string;
  testNumbers: { value: string; masked: string }[];
  /** A call of this seller that has ended but has no recorded outcome yet (recovered after a reload). */
  pendingDisposition: { sessionId: string; prospectId: string | null; prospectName: string | null; state: string; durationSec: number | null } | null;
  /** The profile of the prospect behind the pending disposition or the still-open call, so a reload resumes exactly where the seller was. */
  resumeProfile: WorkspaceProfile | null;
  /** A call of this seller that is still open (e.g. after a page reload). */
  openCall: { sessionId: string; state: string; prospectId: string | null } | null;
  /** Calls placed by this seller in the last 24 h versus the daily cap (display only; the server enforces the cap). */
  today: { placed: number; cap: number };
}

export async function getCallingPage(): Promise<CallingPageData> {
  const actor = await requireCrmActor("place_sales_calls");
  const key = staffKeyOf(actor);
  await reapStale(key, null);
  const [settings, openRow, pending, staff, placed] = await Promise.all([
    readVoiceSettings(),
    db.crmCallSession.findFirst({ where: { staffId: key, state: { in: [...OPEN] }, endedAt: null }, select: { id: true, prospectId: true, state: true } }),
    db.crmCallSession.findFirst({ where: { userId: actor.userId, endedAt: { not: null }, dispositionAt: null, kind: "PROSPECT", parentCallSid: { not: null } }, orderBy: { requestedAt: "desc" }, include: { prospect: { select: { name: true } } } }),
    actor.staffId ? db.platformSalesStaff.findUnique({ where: { id: actor.staffId }, select: { timezone: true } }) : null,
    db.crmCallSession.count({ where: { staffId: key, kind: "PROSPECT", requestedAt: { gt: new Date(Date.now() - 24 * 3600_000) }, state: { notIn: ["FAILED", "CANCELED", "ABANDONED"] } } }),
  ]);
  const resumeId = pending?.prospectId ?? openRow?.prospectId ?? null;
  const resumeProfile = resumeId ? await loadWorkspaceProfile(actor, resumeId).catch(() => null) : null;
  return {
    gates: publicGateView(settings), isSuperAdmin: actor.kind === "SUPER_ADMIN", locale: actor.uiLocale,
    can: { email: actor.capabilities.has("send_sales_email"), editProspects: actor.capabilities.has("manage_prospects"), schedule: actor.capabilities.has("manage_calendar") },
    timezone: staff?.timezone ?? "America/Toronto",
    testNumbers: actor.kind === "SUPER_ADMIN" ? settings.testDestinations.map((value) => ({ value, masked: maskNumber(value) })) : [],
    pendingDisposition: pending ? { sessionId: pending.id, prospectId: pending.prospectId, prospectName: pending.prospect?.name ?? null, state: pending.state, durationSec: pending.durationSec } : null,
    resumeProfile,
    openCall: openRow ? { sessionId: openRow.id, state: openRow.state, prospectId: openRow.prospectId } : null,
    today: { placed, cap: settings.dailyCallCapPerSeller },
  };
}

/** The signed-in seller's own REMOTE calling queue (read-only list; Remote sales is held by every active seller, FIELD + REMOTE included). */
export async function getMyCallingQueue(limit = 50) {
  const actor = await requireCrmActor("place_sales_calls");
  return loadCallingQueue(actor, { limit });
}
