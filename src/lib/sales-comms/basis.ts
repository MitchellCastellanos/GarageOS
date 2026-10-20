import "server-only";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { suggestedBasisExpiry } from "@/domain/sales-comms/casl";
import { evidenceGaps, type EvidenceInput } from "@/domain/sales-crm/casl-evidence";
import { CASL_RULE_VERSION } from "@/domain/lead-radar/casl-evidence-engine";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";

/**
 * Records a documented sending basis for one contact (shared by the contact page form and the calling workspace). Structured evidence is mandatory; an incomplete record is refused.
 * A complete record is stored AUTO_SUPPORTED and, like every automated decision, authorises nothing until the owner activates the automated CASL policy.
 */
export async function recordBasisForContact(actor: PlatformSalesActor, v: EvidenceInput): Promise<{ basisId: string; prospectId: string }> {
  const c = await db.crmContact.findUnique({ where: { id: v.contactId }, select: { id: true, prospectId: true } });
  if (!c) throw new CrmError("NOT_FOUND");
  await requireScopedProspect(actor, c.prospectId);
  const now = new Date();
  const expiresAt = v.expiresAt ?? suggestedBasisExpiry(v.kind, now);
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new CrmError("INVALID");
  if (evidenceGaps({ ...v, evidenceType: v.evidenceType, publishedConditionsConfirmed: v.publishedConditionsConfirmed }).length) throw new CrmError("EVIDENCE_INCOMPLETE");
  const basis = await db.crmSendingBasis.create({
    data: {
      contactId: c.id, kind: v.kind, evidence: v.evidence, expiresAt, recordedByUserId: actor.userId,
      reviewStatus: "AUTO_SUPPORTED", ruleVersion: CASL_RULE_VERSION, evidenceType: v.evidenceType, sourceUrl: v.sourceUrl, capturedAt: v.capturedAt,
      supportingFacts: v.supportingFacts, roleRelevance: v.roleRelevance, publishedConditionsConfirmed: v.publishedConditionsConfirmed,
    },
    select: { id: true },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_RECORDED", entityType: "CrmSendingBasis", entityId: basis.id, prospectId: c.prospectId, metadata: { contactId: c.id, kind: v.kind, expiresAt: expiresAt?.toISOString() ?? null, reviewStatus: "AUTO_SUPPORTED", ruleVersion: CASL_RULE_VERSION, evidenceType: v.evidenceType } });
  return { basisId: basis.id, prospectId: c.prospectId };
}
