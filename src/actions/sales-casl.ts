"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canReviewEvidence } from "@/domain/sales-crm/casl-evidence";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";

async function loadForReview(basisId: string) {
  const b = await db.crmSendingBasis.findUnique({
    where: { id: basisId },
    select: {
      id: true, kind: true, reviewStatus: true, recordedByUserId: true, evidenceType: true, sourceUrl: true, capturedAt: true, supportingFacts: true, roleRelevance: true,
      publishedConditionsConfirmed: true, revokedAt: true, contact: { select: { id: true, prospectId: true, prospect: { select: { assignedStaffId: true } } } },
    },
  });
  if (!b) throw new CrmError("NOT_FOUND");
  return b;
}

/**
 * Approves structured CASL evidence. Sales Manager: only for prospects owned inside their team; Super Admin: global.
 * Nobody except a Super Admin approves evidence they recorded themselves (that case is audited as `selfApproved`).
 * Approval makes the basis usable by the EXISTING send policy — it does not send, enrol or schedule anything.
 */
export async function approveSendingBasis(basisId: string, note?: string) {
  const actor = await requireCrmActor("approve_casl_evidence");
  return crmAction(async () => {
    const b = await loadForReview(basisId);
    const d = canReviewEvidence(actor, b, b.contact.prospect.assignedStaffId);
    if (!d.allowed) throw new CrmError(d.code === "OUT_OF_TEAM" ? "NOT_FOUND" : `CASL_${d.code}`);
    if (b.revokedAt) throw new CrmError("CASL_NOT_PENDING");
    const cleanNote = (note ?? "").trim().slice(0, 500) || null;
    const r = await db.$transaction(async (tx) => {
      // Compare-and-set so two approvers (or a double click) produce exactly one decision.
      const upd = await tx.crmSendingBasis.updateMany({ where: { id: basisId, reviewStatus: "PENDING_REVIEW", revokedAt: null }, data: { reviewStatus: "APPROVED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: cleanNote } });
      if (upd.count !== 1) return false;
      await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_APPROVED", entityType: "CrmSendingBasis", entityId: basisId, prospectId: b.contact.prospectId, metadata: { kind: b.kind, selfApproved: d.selfApproved, recordedByUserId: b.recordedByUserId } }, tx);
      return true;
    });
    if (!r) throw new CrmError("CASL_NOT_PENDING");
    revalidatePath(PLATFORM.salesEvidence);
    revalidatePath(PLATFORM.salesProspect(b.contact.prospectId));
    return {};
  });
}

export async function rejectSendingBasis(basisId: string, reason: string) {
  const actor = await requireCrmActor("approve_casl_evidence");
  return crmAction(async () => {
    const clean = (reason ?? "").trim().slice(0, 500);
    if (clean.length < 5) throw new CrmError("NOTE_REQUIRED");
    const b = await loadForReview(basisId);
    // Rejection does not need complete evidence, but it follows the same authority and self-review rules.
    const d = canReviewEvidence(actor, { ...b, evidenceType: b.evidenceType ?? "OTHER", capturedAt: b.capturedAt ?? new Date(), supportingFacts: "x".repeat(20), roleRelevance: "x".repeat(10), sourceUrl: b.sourceUrl ?? "x", publishedConditionsConfirmed: true }, b.contact.prospect.assignedStaffId);
    if (!d.allowed) throw new CrmError(d.code === "OUT_OF_TEAM" ? "NOT_FOUND" : `CASL_${d.code}`);
    const r = await db.$transaction(async (tx) => {
      const upd = await tx.crmSendingBasis.updateMany({ where: { id: basisId, reviewStatus: "PENDING_REVIEW" }, data: { reviewStatus: "REJECTED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: clean } });
      if (upd.count !== 1) return false;
      await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_REJECTED", entityType: "CrmSendingBasis", entityId: basisId, prospectId: b.contact.prospectId, metadata: { kind: b.kind } }, tx);
      return true;
    });
    if (!r) throw new CrmError("CASL_NOT_PENDING");
    revalidatePath(PLATFORM.salesEvidence);
    revalidatePath(PLATFORM.salesProspect(b.contact.prospectId));
    return {};
  });
}
