import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { classifyAgainstPool } from "@/domain/sales-crm/dedupe";
import { isProvinceCode } from "@/domain/lead-radar/geo";
import { DEALER_MAKES, ICP_REGISTRY_VERSION } from "@/domain/lead-radar/icp-registry";
import { assessIcp, isIcpExclusion } from "@/domain/lead-radar/icp";
import { BY_CODE, CAPABILITY } from "@/domain/lead-radar/business-type";
import { emptyDetail, emptyIcp, isAmbiguousVerified, riskOf, type PreviewDetail, type RematchIcp } from "@/domain/lead-radar/icp-preview";
import { isSharedIdentityDomain } from "@/domain/sales-crm/shared-identity";
import { websiteDomain } from "@/domain/sales-crm/normalize";
import { assessRepairFit, nameSignals } from "@/domain/lead-radar/repair-fit";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { CrmError } from "@/lib/sales-crm/prospects";
import { matchKeyOf } from "@/lib/lead-radar/staging";

export const REMATCH_PAGE = 500;
export const REMATCH_MAX_PAGES = 4;

type RematchRow = { id: string; name: string; taxonomyPrimary: string | null; classReasons: string[]; repairFit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED" | null; nameNormalized: string; city: string | null; website: string | null; phone: string | null; address: string | null; postalCode: string | null; province: string | null; matchState: "NEW" | "EXISTING_STRONG" | "AMBIGUOUS" | "BRANCH_OF_EXISTING"; matchProspectId: string | null; reviewState: "PENDING" | "APPROVED" | "REJECTED"; repairFitReasons: string[] };

export type { RematchIcp };
export interface RematchResult { applied: boolean; examined: number; changed: number; transitions: Record<string, number>; nextCursor: string | null; icp: RematchIcp; /** Only when `detail` was requested (read-only preview). */ poolSize?: number; detail?: PreviewDetail }

/**
 * Re-evaluates, for STAGED NOT-YET-IMPORTED candidates, (a) the CRM match and (b) the stored repair-fit with the CURRENT rules (after the shared-identifier / classifier fixes),
 * without a new extraction. PREVIEW (apply=false) writes nothing. APPLY writes only derived columns of the candidate (matchState/matchProspectId/matchReasons/matchedAt,
 * repairFit/repairFitReasons/repairFitAt) and, exactly like a refreshed extraction does, clears the qualification verdict of a candidate whose match or fit moved so the active
 * policy re-evaluates it (and revokes a policy approval that no longer holds). It never touches review decisions,
 * prospects, ownership, DNC, activities or opportunities. Bounded: ≤ 2,000 candidates per call, resumable by cursor. Super Admin only; audited.
 */
export async function rematchCandidates(actor: PlatformSalesActor, opts: { province: string; apply: boolean; cursor?: string | null; /** Pages of REMATCH_PAGE per call (default REMATCH_MAX_PAGES). */ maxPages?: number; /** Collect per-candidate detail for the owner's review. Read-only only. */ detail?: boolean }): Promise<RematchResult> {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  if (!isProvinceCode(opts.province)) throw new CrmError("INVALID");
  if (opts.detail && opts.apply) throw new CrmError("INVALID"); // detail is a read-only preview feature
  const detail: PreviewDetail | null = opts.detail ? emptyDetail() : null;
  const icp: RematchIcp = emptyIcp(ICP_REGISTRY_VERSION);
  const out: RematchResult = { applied: opts.apply, examined: 0, changed: 0, transitions: {}, nextCursor: null, icp };
  let cursor: string | null = opts.cursor ?? null;
  const pages = Math.min(Math.max(opts.maxPages ?? REMATCH_MAX_PAGES, 1), REMATCH_MAX_PAGES);
  for (let page = 0; page < pages; page++) {
    const rows: RematchRow[] = await db.crmDiscoveryCandidate.findMany({
      where: { province: opts.province, importState: "NOT_IMPORTED", duplicateOfCandidateId: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" }, take: REMATCH_PAGE,
      select: { id: true, name: true, taxonomyPrimary: true, classReasons: true, repairFit: true, nameNormalized: true, city: true, website: true, phone: true, address: true, postalCode: true, province: true, matchState: true, matchProspectId: true, reviewState: true, repairFitReasons: true },
    });
    if (!rows.length) { cursor = null; break; }
    const keys = rows.map((r) => matchKeyOf(r as Parameters<typeof matchKeyOf>[0]));
    const pool = await loadMatchPool(keys);
    const now = new Date();
    const pendingMatch: { r: RematchRow; to: string; toId: string | null }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], cl = classifyAgainstPool(keys[i], pool);
      const next = cl.outcome === "STRONG" ? { matchState: "EXISTING_STRONG" as const, matchProspectId: cl.strong!.id, matchReasons: cl.strong!.reasons as string[] }
        : cl.outcome === "AMBIGUOUS" ? { matchState: "AMBIGUOUS" as const, matchProspectId: cl.ambiguous[0].id, matchReasons: [...new Set(cl.ambiguous.flatMap((a) => a.reasons))] as string[] }
        : cl.branchOf.length ? { matchState: "BRANCH_OF_EXISTING" as const, matchProspectId: cl.branchOf[0], matchReasons: [] as string[] }
        : { matchState: "NEW" as const, matchProspectId: null, matchReasons: [] as string[] };
      out.examined++;
      const fit = assessRepairFit({ name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons, website: r.website, city: r.city });
      const wasIcp = isIcpExclusion(r.repairFitReasons), nowIcp = isIcpExclusion(fit.reasons);
      if (fit.fit === "VERIFIED_REPAIR") icp.verifiedAfter++; else if (fit.fit === "EXCLUDED") icp.excludedAfter++; else { icp.remainingHumanReview++; for (const x of new Set(fit.reasons)) icp.remainingReviewByReason[x] = (icp.remainingReviewByReason[x] ?? 0) + 1; }
      if (r.reviewState !== "PENDING") { icp.protectedDecisions.examined++; if (fit.fit !== r.repairFit) icp.protectedDecisions.fitWouldChange++; if (r.reviewState === "APPROVED" && fit.fit === "EXCLUDED" && nowIcp) icp.protectedDecisions.approvedNowBlockedAtImport++; }
      if (nowIcp && !wasIcp) {
        icp.newlyExcluded++;
        if (fit.reasons.includes("ICP_EVIDENCE_DOMAIN_ONLY")) icp.newlyExcludedDomainOnly++;
        const cat = fit.reasons.find((x) => x.startsWith("ICP_") && !x.startsWith("ICP_BRAND_") && !x.startsWith("ICP_REGISTRY_") && !x.startsWith("ICP_EVIDENCE_"))?.slice(4) ?? "UNKNOWN";
        const brand = fit.reasons.find((x) => x.startsWith("ICP_BRAND_"))?.slice(10) ?? null;
        icp.newlyExcludedByCategory[cat] = (icp.newlyExcludedByCategory[cat] ?? 0) + 1;
        if (brand) icp.newlyExcludedByBrand[brand] = (icp.newlyExcludedByBrand[brand] ?? 0) + 1;
        if (icp.newlyExcludedExamples.length < 40) icp.newlyExcludedExamples.push({ name: r.name, city: r.city, brand });
        if (r.matchState === "EXISTING_STRONG") icp.crmMatchImpact.newlyExcludedWithCrmMatch++;
        else if (r.matchState === "AMBIGUOUS" || r.matchState === "BRANCH_OF_EXISTING") icp.crmMatchImpact.newlyExcludedAmbiguousOrBranch++;
      }
      if (fit.fit === "VERIFIED_REPAIR" && r.repairFit !== "VERIFIED_REPAIR") icp.newlyEligible++;
      if (detail) {
        const dom = websiteDomain(r.website) ?? null;
        const base = { id: r.id, name: r.name, city: r.city, category: r.taxonomyPrimary, domain: dom };
        if (nowIcp && !wasIcp) {
          const ic = assessIcp({ name: r.name, website: r.website, city: r.city, taxonomyPrimary: r.taxonomyPrimary });
          const flags: string[] = [];
          if (fit.reasons.includes("ICP_EVIDENCE_DOMAIN_ONLY")) flags.push("DOMAIN_ONLY");
          if (ic.weak) flags.push("WEAK_ALIAS");
          if (ic.evidence.includes("OEM_DEALER_PATTERN")) flags.push("DEALER_NAME_PATTERN");
          if (ic.evidence.includes("DEALER_WORDING")) flags.push("DEALER_WORDING");
          if (ic.ownName) flags.push("BRAND_PLUS_OWN_NAME");
          const brand = fit.reasons.find((x) => x.startsWith("ICP_BRAND_"))?.slice(10) ?? null;
          if (flags.includes("DOMAIN_ONLY")) detail.domainOnly.push({ id: r.id, name: r.name, city: r.city, domain: dom ?? "", brand, category: ic.category, reason: "ICP_EVIDENCE_DOMAIN_ONLY" });
          if (flags.length) detail.review.push({ ...base, kind: "QUESTIONABLE_EXCLUSION", risk: riskOf("QUESTIONABLE_EXCLUSION", flags), fit: fit.fit, brand, flags, reasons: fit.reasons.join(" ") });
        } else if (fit.fit === "EXCLUDED" && !nowIcp && r.repairFit !== "EXCLUDED" && !!r.taxonomyPrimary && CAPABILITY[BY_CODE[r.taxonomyPrimary]] === "REPAIR") {
          detail.review.push({ ...base, kind: "QUESTIONABLE_EXCLUSION", risk: "HIGH", fit: fit.fit, brand: null, flags: ["EXCLUDED_DESPITE_REPAIR_CATEGORY"], reasons: fit.reasons.join(" ") });
        }
        if (fit.fit === "VERIFIED_REPAIR") {
          const flags: string[] = [];
          if (r.classReasons.includes("CHAIN_NAME") || r.classReasons.includes("BRAND_LINKED")) flags.push("CHAIN_HINT");
          const lower = r.name.toLowerCase();
          if (dom && DEALER_MAKES.some((m) => !m.includes(" ") && m.length > 3 && dom.includes(m) && !lower.includes(m))) flags.push("MAKE_IN_DOMAIN");
          if (!nameSignals(r.name).repairWord) flags.push("NO_REPAIR_WORD");
          if (dom && isSharedIdentityDomain(dom)) flags.push("SHARED_DOMAIN");
          if (next.matchState !== "NEW") flags.push("MATCHES_CRM");
          if (isAmbiguousVerified(flags)) detail.review.push({ ...base, kind: "AMBIGUOUS_VERIFIED", risk: riskOf("AMBIGUOUS_VERIFIED", flags), fit: fit.fit, brand: null, flags, reasons: fit.reasons.join(" ") });
        }
        if (next.matchState !== r.matchState || next.matchProspectId !== r.matchProspectId) pendingMatch.push({ r, to: next.matchState, toId: next.matchProspectId });
      }
      const matchMoved = next.matchState !== r.matchState || next.matchProspectId !== r.matchProspectId, fitMoved = fit.fit !== r.repairFit;
      if (!matchMoved && !fitMoved) continue;
      out.changed++;
      if (matchMoved) { const key = `match:${r.matchState}->${next.matchState}`; out.transitions[key] = (out.transitions[key] ?? 0) + 1; }
      if (fitMoved) { const key = `fit:${r.repairFit ?? "NONE"}->${fit.fit}`; out.transitions[key] = (out.transitions[key] ?? 0) + 1; }
      if (opts.apply) {
        await db.crmDiscoveryCandidate.updateMany({
          // compare-and-set on the state we evaluated: a candidate imported or re-staged meanwhile is left alone
          where: { id: r.id, importState: "NOT_IMPORTED", matchState: r.matchState, matchProspectId: r.matchProspectId, repairFit: r.repairFit },
          data: { ...(matchMoved ? { ...next, matchedAt: now } : {}), ...(fitMoved ? { repairFit: fit.fit, repairFitReasons: fit.reasons as string[], repairFitAt: now } : {}), qualificationLane: null, qualificationPolicyVersion: null, qualifiedAt: null, qualificationReasons: [] },
        });
      }
    }
    if (detail && pendingMatch.length) {
      const ids = [...new Set(pendingMatch.flatMap((m) => [m.r.matchProspectId, m.toId]).filter((x): x is string => !!x))];
      const names = new Map((await db.crmProspect.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true } })).map((p) => [p.id, `${p.name}${p.city ? ` (${p.city})` : ""}`]));
      for (const m of pendingMatch) detail.matchChanges.push({ id: m.r.id, name: m.r.name, city: m.r.city, from: m.r.matchState, to: m.to, crmBefore: m.r.matchProspectId ? names.get(m.r.matchProspectId) ?? "(removed)" : null, crmAfter: m.toId ? names.get(m.toId) ?? "(removed)" : null });
    }
    cursor = rows.length === REMATCH_PAGE ? rows[rows.length - 1].id : null;
    if (!cursor) break;
  }
  out.nextCursor = cursor;
  if (detail) { out.detail = detail; out.poolSize = await db.crmDiscoveryCandidate.count({ where: { province: opts.province, importState: "NOT_IMPORTED", duplicateOfCandidateId: null } }); }
  if (opts.apply && out.changed > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_REMATCH", entityType: "CrmDiscoveryCandidate", metadata: { province: opts.province, examined: out.examined, changed: out.changed, transitions: out.transitions, icpNewlyExcluded: icp.newlyExcluded, icpRegistryVersion: icp.registryVersion } });
  return out;
}
