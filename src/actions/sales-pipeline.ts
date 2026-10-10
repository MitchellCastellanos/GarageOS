"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { assignedScopeWhere, canAccessDemoCreator } from "@/domain/sales-crm/access";
import { PIPELINE_STAGES, validateStageChange, type PipelineStage } from "@/domain/sales-crm/pipeline";
import { opportunityUpdateSchema, scoreOverrideSchema, stageChangeSchema } from "@/domain/sales-crm/validation";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, recomputeOpportunityScores, requireScopedProspect, resolveAssignee } from "@/lib/sales-crm/prospects";
import { moveOpportunityStage } from "@/lib/sales-crm/pipeline-service";
import { crmAction, mapUniqueViolation } from "@/lib/sales-crm/result";
import { assertAcquisition } from "@/lib/sales-crm/territory";

function refresh(prospectId: string) {
  revalidatePath(PLATFORM.salesPipeline);
  revalidatePath(PLATFORM.salesProspect(prospectId));
  revalidatePath(PLATFORM.sales);
}

async function scopedOpportunity(actor: Awaited<ReturnType<typeof requireCrmActor>>, opportunityId: string) {
  const opp = await db.crmOpportunity.findFirst({
    where: { id: opportunityId, prospect: assignedScopeWhere(actor) },
    select: { id: true, stage: true, prospectId: true, assignedStaffId: true, prospect: { select: { doNotContact: true, status: true } } },
  });
  if (!opp) throw new CrmError("NOT_FOUND");
  return opp;
}

export async function changeOpportunityStage(opportunityId: string, to: string, form?: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    if (!(PIPELINE_STAGES as readonly string[]).includes(to)) throw new CrmError("INVALID");
    const target = to as PipelineStage;
    const { lossReason, note } = stageChangeSchema.parse(form ? Object.fromEntries(form) : {});
    const opp = await scopedOpportunity(actor, opportunityId);
    if (opp.prospect.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    if (opp.prospect.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    const [contactCount, assessedNeedCount] = await Promise.all([
      db.crmContact.count({ where: { prospectId: opp.prospectId, archivedAt: null } }),
      db.crmProspectNeed.count({ where: { prospectId: opp.prospectId, definition: { active: true } } }),
    ]);
    const check = validateStageChange({ from: opp.stage as PipelineStage, to: target, lossReason, note, contactCount, assessedNeedCount });
    if (!check.ok) throw new CrmError(check.error);

    await db.$transaction((tx) => moveOpportunityStage(tx, { actor, opportunityId, prospectId: opp.prospectId, from: opp.stage, to: target, note, lossReason }));
    refresh(opp.prospectId);
    return {};
  });
}

/** Starts a fresh opportunity for a prospect whose previous one is closed (LOST/UNQUALIFIED). One open opportunity max. */
export async function startNewOpportunity(prospectId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const p = await requireScopedProspect(actor, prospectId);
    if (p.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    if (p.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    const created = await db.$transaction(async (tx) => {
      const opp = await tx.crmOpportunity.create({ data: { prospectId, assignedStaffId: p.assignedStaffId, createdByUserId: actor.userId }, select: { id: true } });
      await tx.crmStageEvent.create({ data: { opportunityId: opp.id, toStage: "NEW", actorUserId: actor.userId } });
      await tx.crmActivity.create({ data: { prospectId, opportunityId: opp.id, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "OPPORTUNITY_CREATED" } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "OPPORTUNITY_CREATED", entityType: "CrmOpportunity", entityId: opp.id, prospectId }, tx);
      await recomputeOpportunityScores(tx, prospectId);
      return opp;
    }).catch((e) => mapUniqueViolation(e, "OPEN_OPPORTUNITY_EXISTS"));
    refresh(prospectId);
    return { opportunityId: created.id };
  });
}

export async function updateOpportunityDetails(opportunityId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const opp = await scopedOpportunity(actor, opportunityId);
    const input = opportunityUpdateSchema.parse(Object.fromEntries(form));
    await db.$transaction(async (tx) => {
      await tx.crmOpportunity.update({
        where: { id: opportunityId },
        data: { urgency: input.urgency, estimatedPlan: input.estimatedPlan, estimatedMrrCents: input.estimatedMrr, expectedCloseDate: input.expectedCloseDate },
      });
      await writeCrmAudit({
        actorUserId: actor.userId, action: "OPPORTUNITY_UPDATED", entityType: "CrmOpportunity", entityId: opportunityId, prospectId: opp.prospectId,
        after: { urgency: input.urgency, estimatedPlan: input.estimatedPlan, estimatedMrrCents: input.estimatedMrr },
      }, tx);
      await recomputeOpportunityScores(tx, opp.prospectId);
    });
    refresh(opp.prospectId);
    return {};
  });
}

/** Human override of a computed score. The computed value and its breakdown stay visible; clearing restores them. */
export async function overrideOpportunityScore(opportunityId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const opp = await scopedOpportunity(actor, opportunityId);
    const input = scoreOverrideSchema.parse(Object.fromEntries(form));
    const now = new Date();
    await db.$transaction(async (tx) => {
      const data = input.kind === "fit"
        ? { fitScoreOverride: input.value, fitOverrideReason: input.value === null ? null : input.reason }
        : { intentScoreOverride: input.value, intentOverrideReason: input.value === null ? null : input.reason };
      await tx.crmOpportunity.update({ where: { id: opportunityId }, data: { ...data, overriddenByUserId: actor.userId, overriddenAt: now } });
      await tx.crmActivity.create({ data: { prospectId: opp.prospectId, opportunityId, type: "SYSTEM", authorUserId: actor.userId, body: input.reason, metadata: { event: "SCORE_OVERRIDDEN", kind: input.kind, value: input.value } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "SCORE_OVERRIDDEN", entityType: "CrmOpportunity", entityId: opportunityId, prospectId: opp.prospectId, after: { kind: input.kind, value: input.value } }, tx);
    });
    refresh(opp.prospectId);
    return {};
  });
}

/** Moves a prospect (and its open opportunity + open tasks) to another seller. Managers within their team, Super Admin anywhere. */
export async function assignProspect(prospectId: string, staffId: string | null, moveOpenTasks = true) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const p = await requireScopedProspect(actor, prospectId);
    const target = await resolveAssignee(actor, staffId || null);
    if (p.assignedStaffId === target) return {};
    // Initial acquisition (no current owner) respects sales mode + territory; an explicit transfer of an owned prospect does not.
    if (target && !p.assignedStaffId) {
      const loc = await db.crmProspect.findUniqueOrThrow({ where: { id: prospectId }, select: { province: true, city: true, postalCode: true } });
      await assertAcquisition(target, loc, { id: prospectId, assignedStaffId: null });
    }
    await db.$transaction(async (tx) => {
      await tx.crmProspect.update({ where: { id: prospectId }, data: { assignedStaffId: target } });
      await tx.crmOpportunity.updateMany({ where: { prospectId, stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, data: { assignedStaffId: target } });
      if (moveOpenTasks) await tx.crmTask.updateMany({ where: { prospectId, status: "OPEN", assignedStaffId: p.assignedStaffId }, data: { assignedStaffId: target } });
      await tx.crmActivity.create({ data: { prospectId, type: "ASSIGNMENT", authorUserId: actor.userId, metadata: { from: p.assignedStaffId, to: target } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ASSIGNED", entityType: "CrmProspect", entityId: prospectId, prospectId, before: { assignedStaffId: p.assignedStaffId }, after: { assignedStaffId: target } }, tx);
    });
    refresh(prospectId);
    return {};
  });
}

/**
 * STABLE CONTRACT (Agent 3): link a technical SalesDemo to the commercial opportunity it serves.
 * Only the demo's creator scope and the opportunity's owner scope may link. SalesDemo.status stays technical;
 * this never changes the pipeline stage.
 */
export async function linkSalesDemoToOpportunity(demoId: string, opportunityId: string) {
  const actor = await requireCrmActor("prepare_demo");
  return crmAction(async () => {
    const opp = await scopedOpportunity(actor, opportunityId);
    const demo = await db.salesDemo.findUnique({ where: { id: demoId }, select: { id: true, createdByUserId: true, crmOpportunityId: true } });
    if (!demo || !canAccessDemoCreator(actor, demo.createdByUserId)) throw new CrmError("NOT_FOUND");
    if (demo.crmOpportunityId && demo.crmOpportunityId !== opportunityId) throw new CrmError("DEMO_ALREADY_LINKED");
    await db.$transaction(async (tx) => {
      await tx.salesDemo.update({ where: { id: demoId }, data: { crmOpportunityId: opportunityId } });
      await tx.crmActivity.create({ data: { prospectId: opp.prospectId, opportunityId, type: "DEMO", authorUserId: actor.userId, metadata: { event: "DEMO_PREPARED", demoId } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "DEMO_LINKED", entityType: "SalesDemo", entityId: demoId, prospectId: opp.prospectId, metadata: { opportunityId } }, tx);
      await recomputeOpportunityScores(tx, opp.prospectId);
    });
    refresh(opp.prospectId);
    return {};
  });
}
