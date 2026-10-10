"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import type { ImportCandidate } from "@/domain/sales-crm/import";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { enrichFromCandidate } from "@/lib/sales-crm/lead-engine";
import { CrmError, createProspectRecord, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { assertAcquisition } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { normalizeEmail } from "@/domain/sales-crm/normalize";

export type DuplicateDecision = "LINK" | "DISTINCT" | "DISMISS";

/**
 * Decides an ambiguous match.
 *  LINK     same business → the observation is attached to the existing prospect (empty fields enriched, nothing overwritten);
 *  DISTINCT different branch → a NEW prospect is created from the source row (never a merge);
 *  DISMISS  not a usable lead → nothing is created.
 * The decider must be able to open the existing prospect; out-of-scope reviews cannot be decided (or even identified).
 * Exactly one decision is recorded (compare-and-set), so retries and double clicks are harmless.
 */
export async function decideDuplicateReview(reviewId: string, decision: DuplicateDecision, note?: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    if (!["LINK", "DISTINCT", "DISMISS"].includes(decision)) throw new CrmError("INVALID");
    const review = await db.crmDuplicateReview.findUnique({ where: { id: reviewId }, include: { observation: { select: { id: true, importBatchId: true } } } });
    if (!review) throw new CrmError("NOT_FOUND");
    await requireScopedProspect(actor, review.prospectId); // same "not found" an unauthorised user gets for any prospect
    if (review.status !== "PENDING") return { status: review.status, resultProspectId: review.resultProspectId, alreadyDecided: true };
    const c = review.pendingCandidate as unknown as ImportCandidate | null;
    if (!c && decision !== "DISMISS") throw new CrmError("REVIEW_NOT_DECIDABLE");
    const cleanNote = (note ?? "").trim().slice(0, 500) || null;
    const canPool = actor.all || actor.kind === "SALES_MANAGER";

    const out = await db.$transaction(async (tx) => {
      const status = decision === "LINK" ? "LINKED" : decision === "DISTINCT" ? "DISTINCT" : "DISMISSED";
      const claim = await tx.crmDuplicateReview.updateMany({ where: { id: reviewId, status: "PENDING" }, data: { status, decidedByUserId: actor.userId, decidedAt: new Date(), note: cleanNote, pendingCandidate: Prisma.DbNull } });
      if (claim.count !== 1) return { status: "ALREADY" as const, resultProspectId: null };
      let resultProspectId: string | null = null, conflicts: string[] = [];
      let outcome: "REVIEW_LINKED" | "REVIEW_CREATED" | "REVIEW_DISMISSED" = "REVIEW_DISMISSED";
      if (decision === "LINK") {
        const rules = await loadTerritoryRulesWith(tx);
        conflicts = (await enrichFromCandidate(tx, actor, review.prospectId, c!, rules)).conflicts;
        resultProspectId = review.prospectId; outcome = "REVIEW_LINKED";
      } else if (decision === "DISTINCT") {
        // The new branch is unassigned for managers/Super Admin; a seller can only create it for themselves (territory rules apply).
        const owner = canPool ? null : actor.staffId;
        if (owner) await assertAcquisition(owner, c!.prospect);
        else if (!canPool) throw new CrmError("ASSIGNMENT_FORBIDDEN");
        const created = await createProspectRecord(tx, actor, { ...c!.prospect, assignedStaffId: null }, owner, { importBatchId: review.observation.importBatchId ?? undefined, doNotContact: c!.doNotContact });
        if (c!.contact) {
          await tx.crmContact.create({
            data: {
              prospectId: created.prospectId, name: c!.contact.name, title: c!.contact.title, email: c!.contact.email, emailNormalized: normalizeEmail(c!.contact.email), phone: c!.contact.phone,
              isPrimary: true, isDecisionMaker: c!.contact.isDecisionMaker, preferredLanguage: c!.contact.preferredLanguage, doNotContact: c!.doNotContact,
            },
          });
        }
        resultProspectId = created.prospectId; outcome = "REVIEW_CREATED";
      }
      await tx.crmDuplicateReview.update({ where: { id: reviewId }, data: { resultProspectId } });
      await tx.crmSourceObservation.update({ where: { id: review.observationId }, data: { prospectId: resultProspectId, matchOutcome: outcome, conflicts } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "DUPLICATE_REVIEW_DECIDED", entityType: "CrmDuplicateReview", entityId: reviewId, prospectId: review.prospectId, metadata: { decision, resultProspectId } }, tx);
      return { status, resultProspectId };
    });
    if (out.status === "ALREADY") return { status: "DECIDED", resultProspectId: null, alreadyDecided: true };
    revalidatePath(PLATFORM.salesDuplicates);
    revalidatePath(PLATFORM.salesProspects);
    return { status: out.status, resultProspectId: out.resultProspectId, alreadyDecided: false };
  });
}
