import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { classifyAgainstPool } from "@/domain/sales-crm/dedupe";
import { isProvinceCode } from "@/domain/lead-radar/geo";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { CrmError } from "@/lib/sales-crm/prospects";
import { matchKeyOf } from "@/lib/lead-radar/staging";

export const REMATCH_PAGE = 500;
export const REMATCH_MAX_PAGES = 4;

type RematchRow = { id: string; name: string; taxonomyPrimary: string | null; classReasons: string[]; repairFit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED" | null; nameNormalized: string; city: string | null; website: string | null; phone: string | null; address: string | null; postalCode: string | null; province: string | null; matchState: "NEW" | "EXISTING_STRONG" | "AMBIGUOUS" | "BRANCH_OF_EXISTING"; matchProspectId: string | null };

export interface RematchResult { applied: boolean; examined: number; changed: number; transitions: Record<string, number>; nextCursor: string | null }

/**
 * Re-evaluates, for STAGED NOT-YET-IMPORTED candidates, (a) the CRM match and (b) the stored repair-fit with the CURRENT rules (after the shared-identifier / classifier fixes),
 * without a new extraction. PREVIEW (apply=false) writes nothing. APPLY writes only derived columns of the candidate (matchState/matchProspectId/matchReasons/matchedAt,
 * repairFit/repairFitReasons/repairFitAt) and, exactly like a refreshed extraction does, clears the qualification verdict of a candidate whose match or fit moved so the active
 * policy re-evaluates it (and revokes a policy approval that no longer holds). It never touches review decisions,
 * prospects, ownership, DNC, activities or opportunities. Bounded: ≤ 2,000 candidates per call, resumable by cursor. Super Admin only; audited.
 */
export async function rematchCandidates(actor: PlatformSalesActor, opts: { province: string; apply: boolean; cursor?: string | null }): Promise<RematchResult> {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  if (!isProvinceCode(opts.province)) throw new CrmError("INVALID");
  const out: RematchResult = { applied: opts.apply, examined: 0, changed: 0, transitions: {}, nextCursor: null };
  let cursor: string | null = opts.cursor ?? null;
  for (let page = 0; page < REMATCH_MAX_PAGES; page++) {
    const rows: RematchRow[] = await db.crmDiscoveryCandidate.findMany({
      where: { province: opts.province, importState: "NOT_IMPORTED", duplicateOfCandidateId: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" }, take: REMATCH_PAGE,
      select: { id: true, name: true, taxonomyPrimary: true, classReasons: true, repairFit: true, nameNormalized: true, city: true, website: true, phone: true, address: true, postalCode: true, province: true, matchState: true, matchProspectId: true },
    });
    if (!rows.length) { cursor = null; break; }
    const keys = rows.map((r) => matchKeyOf(r as Parameters<typeof matchKeyOf>[0]));
    const pool = await loadMatchPool(keys);
    const now = new Date();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], cl = classifyAgainstPool(keys[i], pool);
      const next = cl.outcome === "STRONG" ? { matchState: "EXISTING_STRONG" as const, matchProspectId: cl.strong!.id, matchReasons: cl.strong!.reasons as string[] }
        : cl.outcome === "AMBIGUOUS" ? { matchState: "AMBIGUOUS" as const, matchProspectId: cl.ambiguous[0].id, matchReasons: [...new Set(cl.ambiguous.flatMap((a) => a.reasons))] as string[] }
        : cl.branchOf.length ? { matchState: "BRANCH_OF_EXISTING" as const, matchProspectId: cl.branchOf[0], matchReasons: [] as string[] }
        : { matchState: "NEW" as const, matchProspectId: null, matchReasons: [] as string[] };
      out.examined++;
      const fit = assessRepairFit({ name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons });
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
    cursor = rows.length === REMATCH_PAGE ? rows[rows.length - 1].id : null;
    if (!cursor) break;
  }
  out.nextCursor = cursor;
  if (opts.apply && out.changed > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_REMATCH", entityType: "CrmDiscoveryCandidate", metadata: { province: opts.province, examined: out.examined, changed: out.changed, transitions: out.transitions } });
  return out;
}
