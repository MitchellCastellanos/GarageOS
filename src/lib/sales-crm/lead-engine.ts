import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { canAccessAssignedStaff } from "@/domain/sales-crm/access";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { snapshotOf, type ImportCandidate } from "@/domain/sales-crm/import";
import { normalizeBusinessName, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import type { TerritoryRule } from "@/domain/sales-crm/territory";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { addressColumns, applyDoNotContact, territoryColumns, type Tx } from "@/lib/sales-crm/prospects";

/**
 * Source data may ENRICH an existing prospect but never overwrites it: only fields that are currently empty are filled
 * (the address block is filled as a unit, and only when the prospect has no address at all). Fields where the source
 * disagrees are reported by NAME (never by value) so a human can look. Ownership, DNC, activities and opportunities
 * are untouched. Enrichment is skipped when the actor cannot access the prospect (the observation is still linked).
 */
export async function enrichFromCandidate(tx: Tx, actor: PlatformSalesActor, prospectId: string, c: ImportCandidate, rules: TerritoryRule[]): Promise<{ conflicts: string[]; enriched: string[] }> {
  const p = await tx.crmProspect.findUnique({ where: { id: prospectId } });
  if (!p) return { conflicts: [], enriched: [] };
  const conflicts: string[] = [], enriched: string[] = [];
  const data: Prisma.CrmProspectUpdateInput = {};
  const src = c.prospect;
  const canWrite = canAccessAssignedStaff(actor, p.assignedStaffId);

  const cmp = (field: string, mine: string | null | undefined, theirs: string | null | undefined, same: boolean) => {
    if (!theirs) return;
    if (!mine) return;
    if (!same) conflicts.push(field);
  };
  cmp("name", p.name, src.name, normalizeBusinessName(p.name) === c.keys.nameNormalized);
  cmp("website", p.website, src.website, websiteDomain(p.website) === c.keys.websiteDomain);
  cmp("phone", p.phone, src.phone, phoneDigits(p.phone) === c.keys.phoneDigits);
  cmp("email", p.email, src.email, normalizeEmail(p.email) === c.keys.email);
  const mineAddr = canonicalAddress(p);
  const hasAddress = !!(p.address || p.city || p.province || p.postalCode);
  if (hasAddress && (src.address || src.city || src.postalCode)) {
    if ((mineAddr.addressKey && c.keys.addressKey && mineAddr.addressKey !== c.keys.addressKey) || (mineAddr.postalKey && c.keys.postalKey && mineAddr.postalKey !== c.keys.postalKey) || (mineAddr.cityKey && c.keys.cityKey && mineAddr.cityKey !== c.keys.cityKey)) conflicts.push("address");
  }

  if (canWrite) {
    if (!p.website && src.website) { data.website = src.website; data.websiteDomain = websiteDomain(src.website); enriched.push("website"); }
    if (!p.phone && src.phone) { data.phone = src.phone; data.phoneDigits = phoneDigits(src.phone); enriched.push("phone"); }
    if (!p.email && src.email) { data.email = normalizeEmail(src.email); enriched.push("email"); }
    if (!hasAddress && (src.address || src.city || src.province || src.postalCode)) {
      Object.assign(data, { address: src.address, city: src.city, province: src.province, postalCode: src.postalCode, ...addressColumns(src), ...territoryColumns(rules, src) });
      enriched.push("address");
    }
    if (!p.industry && src.industry) { data.industry = src.industry; enriched.push("industry"); }
    if (!p.shopSize && src.shopSize) { data.shopSize = src.shopSize; enriched.push("shopSize"); }
    if (p.preferredLanguage === "UNKNOWN" && src.preferredLanguage !== "UNKNOWN") { data.preferredLanguage = src.preferredLanguage; enriched.push("preferredLanguage"); }
    if (enriched.length) {
      await tx.crmProspect.update({ where: { id: prospectId }, data });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ENRICHED", entityType: "CrmProspect", entityId: prospectId, prospectId, metadata: { fields: enriched, conflicts } }, tx);
    }
  }
  // An opt-out in the source is protective: it is propagated regardless of who may edit the prospect, and never reversed.
  if (c.doNotContact && !p.doNotContact) await applyDoNotContact(tx, actor, prospectId, "Source opt-out");
  return { conflicts, enriched };
}

export function observationData(args: {
  sourceKey: string; recordKey: string; fingerprint: string; observedAt: Date; batchId: string | null; sourceUrl: string | null; lawfulSourceNote: string | null;
  c: ImportCandidate; outcome: Prisma.CrmSourceObservationUncheckedCreateInput["matchOutcome"]; prospectId: string | null; reasons?: string[]; conflicts?: string[];
}): Prisma.CrmSourceObservationUncheckedCreateInput {
  return {
    sourceKey: args.sourceKey, recordKey: args.recordKey, externalId: args.c.externalId, contentFingerprint: args.fingerprint, observedAt: args.observedAt,
    importBatchId: args.batchId, rowNumber: args.c.rowNumber, sourceUrl: args.c.sourceUrl ?? args.sourceUrl, lawfulSourceNote: args.lawfulSourceNote,
    snapshot: snapshotOf(args.c) as Prisma.InputJsonValue, conflicts: args.conflicts ?? [], matchOutcome: args.outcome, matchReasons: args.reasons ?? [], prospectId: args.prospectId,
  };
}

