import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { OPEN_STAGES, stageIndex, validateStageChange, type PipelineStage } from "@/domain/sales-crm/pipeline";
import { OUTCOME_RULES, planFollowUp, type FieldVisitOutcome, type NextAction } from "@/domain/sales-crm/field-visit";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { moveOpportunityStage } from "@/lib/sales-crm/pipeline-service";
import { CrmError, applyDoNotContact, recomputeOpportunityScores, touchProspect, type Tx } from "@/lib/sales-crm/prospects";
import { insertCrmTask } from "@/lib/sales-crm/task-service";
import { addShopDays, formatShopDate, parseShopDateTime } from "@/lib/shop-timezone";

export interface VisitWrite {
  actor: PlatformSalesActor;
  prospectId: string;
  outcome: FieldVisitOutcome;
  note: string | null;
  nextAction?: NextAction;
  followUpDate?: string;
  contactId?: string;
  /** Idempotency key (unique per author): a retry resolves to the original activity. */
  submissionId: string | null;
  routeStopId?: string | null;
  timezone: string;
  now?: Date;
}

const TASK_TITLES: Record<string, string> = { CALL: "Call after field visit", EMAIL: "Email after field visit (manual — requires a valid sending basis)", FOLLOW_UP: "Follow up after field visit", DEMO_PREP: "Prepare demo agreed during field visit" };

/**
 * Writes ONE field visit inside the caller's transaction: the FIELD_VISIT activity (with its structured outcome), the opportunity
 * movement, the optional follow-up task, DNC/sequence consequences and the audit event. It never sends anything, never enrolls a
 * prospect in a sequence and never creates a sending basis: a visit is not consent.
 * The caller has already authorized the actor and checked the prospect (scope, ownership, availability).
 */
export async function writeFieldVisit(tx: Tx, v: VisitWrite): Promise<{ activityId: string; taskId: string | null }> {
  const now = v.now ?? new Date();
  const rule = OUTCOME_RULES[v.outcome];
  const plan = planFollowUp(v.outcome, v.nextAction, v.followUpDate);
  if (!plan.ok) throw new CrmError(plan.error);

  if (v.contactId) {
    const c = await tx.crmContact.findFirst({ where: { id: v.contactId, prospectId: v.prospectId, archivedAt: null }, select: { id: true } });
    if (!c) throw new CrmError("NOT_FOUND");
  }
  const opp = await tx.crmOpportunity.findFirst({ where: { prospectId: v.prospectId, stage: { in: [...OPEN_STAGES] } }, select: { id: true, stage: true, assignedStaffId: true } });

  const activity = await tx.crmActivity.create({
    data: {
      prospectId: v.prospectId, opportunityId: opp?.id ?? null, contactId: v.contactId ?? null, type: "FIELD_VISIT", subject: "Field visit", body: v.note,
      occurredAt: now, authorUserId: v.actor.userId, fieldVisitOutcome: v.outcome, idempotencyKey: v.submissionId,
      metadata: { outcome: v.outcome, ...(v.routeStopId ? { routeStopId: v.routeStopId } : {}) },
    },
    select: { id: true },
  });

  // Opportunity: forward-only for positive outcomes; closing outcomes go through the SAME validated transition as the pipeline UI.
  const step = rule.stage;
  if (step && opp) {
    if (step.kind === "ADVANCE") {
      if (stageIndex(opp.stage as PipelineStage) < stageIndex(step.minStage)) {
        await moveOpportunityStage(tx, { actor: v.actor, opportunityId: opp.id, prospectId: v.prospectId, from: opp.stage as PipelineStage, to: step.minStage, note: "Field visit", now });
      }
    } else if (step.kind === "LOSE") {
      const note = `Field visit: ${v.outcome}`;
      const check = validateStageChange({ from: opp.stage as PipelineStage, to: "LOST", lossReason: step.lossReason, note, contactCount: 0, assessedNeedCount: 0 });
      if (check.ok) await moveOpportunityStage(tx, { actor: v.actor, opportunityId: opp.id, prospectId: v.prospectId, from: opp.stage as PipelineStage, to: "LOST", note, lossReason: step.lossReason, now });
    }
  }
  if (step?.kind === "DNC") {
    if (opp) await moveOpportunityStage(tx, { actor: v.actor, opportunityId: opp.id, prospectId: v.prospectId, from: opp.stage as PipelineStage, to: "DO_NOT_CONTACT", note: v.note ?? "Field visit: do not contact", now });
    else await applyDoNotContact(tx, v.actor, v.prospectId, v.note);
  }
  if (step) {
    if (step.kind === "DNC" || step.kind === "LOSE") {
      // A refusal/closure/DNC ends automated outreach to this prospect immediately (never relies on the dispatcher's later re-check).
      await tx.crmSequenceEnrollment.updateMany({
        where: { prospectId: v.prospectId, status: { in: ["ACTIVE", "PAUSED"] } },
        data: { status: "STOPPED", stoppedAt: now, stopReason: `FIELD_VISIT_${v.outcome}`, stoppedByUserId: v.actor.userId, nextRunAt: null },
      });
    }
  }
  // DNC/closed/invalid also stop any other route stop still waiting for this prospect.
  if (step?.kind === "DNC" || step?.kind === "LOSE" || rule.invalidatesLocation) {
    await tx.crmFieldRouteStop.updateMany({
      where: { prospectId: v.prospectId, status: "PENDING", ...(v.routeStopId ? { id: { not: v.routeStopId } } : {}), route: { status: { in: ["DRAFT", "IN_PROGRESS"] } } },
      data: { status: "UNAVAILABLE", resolvedAt: now, skipReason: `VISIT_${v.outcome}` },
    });
  }
  if (rule.invalidatesLocation) {
    await tx.crmProspectLocation.updateMany({ where: { prospectId: v.prospectId }, data: { status: "INVALID", latitude: null, longitude: null, failureCode: "FIELD_REPORTED_INVALID", verifiedAt: null, verifiedByUserId: null } });
  }

  let taskId: string | null = null;
  if (plan.task) {
    const dueDate = plan.task.dueDate ?? addShopDays(formatShopDate(now, v.timezone), plan.task.daysAhead, v.timezone);
    const dueAt = parseShopDateTime(dueDate, "09:00", v.timezone);
    const assignee = v.actor.staffId ?? opp?.assignedStaffId ?? null;
    const t = await insertCrmTask(tx, { actor: v.actor, prospectId: v.prospectId, opportunityId: opp?.id ?? null, assignedStaffId: assignee, type: plan.task.type, title: TASK_TITLES[plan.task.type], notes: v.note, priority: "MEDIUM", dueAt });
    taskId = t.id;
  }

  await touchProspect(tx, v.prospectId, now);
  await recomputeOpportunityScores(tx, v.prospectId, now);
  await writeCrmAudit({ actorUserId: v.actor.userId, action: "FIELD_VISIT_LOGGED", entityType: "CrmProspect", entityId: v.prospectId, prospectId: v.prospectId, metadata: { outcome: v.outcome, activityId: activity.id, routeStopId: v.routeStopId ?? null, taskId } }, tx);
  return { activityId: activity.id, taskId };
}

/** Existing result of an earlier submission with this key (same author), for idempotent replay. */
export async function findVisitBySubmission(authorUserId: string, submissionId: string) {
  return db.crmActivity.findFirst({ where: { authorUserId, idempotencyKey: submissionId }, select: { id: true, prospectId: true, fieldVisitOutcome: true, type: true } });
}

/** Prospect facts a visit may be recorded against. Throws CrmError; scope/ownership are enforced by the caller's lookup. */
export function assertProspectVisitable(p: { status: string; doNotContact: boolean; mergedIntoId: string | null; archivedAt: Date | null }) {
  if (p.status === "ARCHIVED" || p.archivedAt) throw new CrmError("PROSPECT_ARCHIVED");
  if (p.mergedIntoId) throw new CrmError("PROSPECT_MERGED");
  if (p.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
}
