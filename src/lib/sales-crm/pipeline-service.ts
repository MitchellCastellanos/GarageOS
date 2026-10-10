import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import type { PipelineStage } from "@/domain/sales-crm/pipeline";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, applyDoNotContact, recomputeOpportunityScores, touchProspect, type Tx } from "@/lib/sales-crm/prospects";

/**
 * The transactional core of an opportunity stage change, shared by the pipeline server action and the field-visit service so
 * the two can never drift: compare-and-set on the current stage, stage event, timeline entry, DNC propagation, audit, scoring.
 * The CALLER validates the transition (validateStageChange) and authorization before calling this inside its transaction.
 */
export async function moveOpportunityStage(tx: Tx, p: {
  actor: PlatformSalesActor; opportunityId: string; prospectId: string; from: PipelineStage; to: PipelineStage;
  note: string | null; lossReason?: string | null; now?: Date;
}) {
  const now = p.now ?? new Date();
  const terminal = p.to === "LOST" || p.to === "UNQUALIFIED" || p.to === "DO_NOT_CONTACT";
  // Compare-and-set on the current stage: two people moving the same card cannot both win.
  const moved = await tx.crmOpportunity.updateMany({
    where: { id: p.opportunityId, stage: p.from },
    data: { stage: p.to, stageChangedAt: now, ...(terminal ? { closedAt: now, closeNote: p.note, lossReason: p.to === "LOST" ? (p.lossReason as never) : null } : {}) },
  });
  if (moved.count !== 1) throw new CrmError("STALE_STAGE");
  await tx.crmStageEvent.create({ data: { opportunityId: p.opportunityId, fromStage: p.from, toStage: p.to, actorUserId: p.actor.userId, note: p.note } });
  await tx.crmActivity.create({
    data: { prospectId: p.prospectId, opportunityId: p.opportunityId, type: "STAGE_CHANGE", authorUserId: p.actor.userId, body: p.note, metadata: { from: p.from, to: p.to, lossReason: p.lossReason ?? null } },
  });
  if (p.to === "DO_NOT_CONTACT") await applyDoNotContact(tx, p.actor, p.prospectId, p.note);
  await writeCrmAudit({
    actorUserId: p.actor.userId, action: "STAGE_CHANGED", entityType: "CrmOpportunity", entityId: p.opportunityId, prospectId: p.prospectId,
    before: { stage: p.from }, after: { stage: p.to, lossReason: p.lossReason ?? null },
  }, tx);
  await touchProspect(tx, p.prospectId, now);
  await recomputeOpportunityScores(tx, p.prospectId);
}
