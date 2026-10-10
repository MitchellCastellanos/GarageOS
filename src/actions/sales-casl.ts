"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { canApproveEvidence, canRejectEvidence } from "@/domain/sales-crm/casl-evidence";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";

const BASIS_SELECT = {
  id: true, kind: true, reviewStatus: true, recordedByUserId: true, evidenceType: true, sourceUrl: true, capturedAt: true, supportingFacts: true, roleRelevance: true,
  publishedConditionsConfirmed: true, revokedAt: true, contact: { select: { id: true, prospectId: true, prospect: { select: { assignedStaffId: true } } } },
} satisfies Prisma.CrmSendingBasisSelect;

/**
 * Takes a row lock on the PROSPECT, then re-reads the basis and the prospect's CURRENT owner inside the transaction.
 * A concurrent reassignment (which UPDATEs the same prospect row) therefore either commits before we look — and the
 * team check below sees the new owner — or waits until our decision commits. Authorization is never judged on stale data.
 */
async function lockedBasis(tx: Prisma.TransactionClient, basisId: string) {
  const head = await tx.crmSendingBasis.findUnique({ where: { id: basisId }, select: { contact: { select: { prospectId: true } } } });
  if (!head) throw new CrmError("NOT_FOUND");
  await tx.$queryRaw`SELECT id FROM "garageos"."CrmProspect" WHERE id = ${head.contact.prospectId} FOR UPDATE`;
  const b = await tx.crmSendingBasis.findUnique({ where: { id: basisId }, select: BASIS_SELECT });
  if (!b) throw new CrmError("NOT_FOUND");
  return b;
}
const deny = (code: string) => new CrmError(code === "OUT_OF_TEAM" ? "NOT_FOUND" : `CASL_${code}`);

type Decision = { kind: "APPROVE"; note: string | null } | { kind: "REJECT"; reason: string };

async function decide(actor: PlatformSalesActor, basisId: string, d: Decision) {
  const out = await db.$transaction(async (tx) => {
    const b = await lockedBasis(tx, basisId);
    const owner = b.contact.prospect.assignedStaffId;
    if (b.revokedAt) throw new CrmError("CASL_NOT_PENDING");
    let selfReviewed = false;
    if (d.kind === "APPROVE") {
      const a = canApproveEvidence(actor, b, owner);
      if (!a.allowed) throw deny(a.code);
      selfReviewed = a.selfApproved;
    } else {
      const r = canRejectEvidence(actor, b, owner);
      if (!r.allowed) throw deny(r.code);
      selfReviewed = r.selfRejected;
    }
    // Compare-and-set on status AND on the owner we just authorised against.
    const upd = await tx.crmSendingBasis.updateMany({
      where: { id: basisId, reviewStatus: "PENDING_REVIEW", revokedAt: null, contact: { prospect: { assignedStaffId: owner } } },
      data: d.kind === "APPROVE"
        ? { reviewStatus: "APPROVED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: d.note }
        : { reviewStatus: "REJECTED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: d.reason },
    });
    if (upd.count !== 1) throw new CrmError("CASL_NOT_PENDING");
    await writeCrmAudit({
      actorUserId: actor.userId, action: d.kind === "APPROVE" ? "SENDING_BASIS_APPROVED" : "SENDING_BASIS_REJECTED", entityType: "CrmSendingBasis", entityId: basisId, prospectId: b.contact.prospectId,
      metadata: { kind: b.kind, [d.kind === "APPROVE" ? "selfApproved" : "selfRejected"]: selfReviewed, recordedByUserId: b.recordedByUserId, ownerStaffId: owner },
    }, tx);
    return b.contact.prospectId;
  });
  revalidatePath(PLATFORM.salesEvidence);
  revalidatePath(PLATFORM.salesProspect(out));
}

/**
 * Approves structured CASL evidence. Sales Manager: only for prospects owned inside their team at the moment of the
 * decision; Super Admin: global. Nobody except a Super Admin approves evidence they recorded (audited as `selfApproved`).
 * Approval makes the basis usable by the EXISTING send policy — it does not send, enrol or schedule anything.
 */
export async function approveSendingBasis(basisId: string, note?: string) {
  const actor = await requireCrmActor("approve_casl_evidence");
  return crmAction(async () => { await decide(actor, basisId, { kind: "APPROVE", note: (note ?? "").trim().slice(0, 500) || null }); return {}; });
}

/** Rejection needs the same review authority as approval (team scope, no self-review) but NOT complete evidence, and a reason. */
export async function rejectSendingBasis(basisId: string, reason: string) {
  const actor = await requireCrmActor("approve_casl_evidence");
  return crmAction(async () => {
    const clean = (reason ?? "").trim().slice(0, 500);
    if (clean.length < 5) throw new CrmError("NOTE_REQUIRED");
    await decide(actor, basisId, { kind: "REJECT", reason: clean });
    return {};
  });
}
