import "server-only";
import { Prisma } from "@prisma/client";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { db } from "@/lib/db";

export const FIT_BACKFILL_PAGE = 500;

export interface FitBackfillTally { classified: number; pages: number; VERIFIED_REPAIR: number; HUMAN_REVIEW: number; EXCLUDED: number }

/**
 * Derives `repairFit` for staged candidates that have none (rows staged before the national engine). Pure derivation from stored facts with the ONE shared assessor:
 * it writes only the three derived columns, never review/import/qualification state, so it is safe to run unattended. Bounded pages; the queue is the NULL column itself.
 */
export async function backfillCandidateFit(opts: { deadline: number; maxPages?: number }): Promise<FitBackfillTally> {
  const t: FitBackfillTally = { classified: 0, pages: 0, VERIFIED_REPAIR: 0, HUMAN_REVIEW: 0, EXCLUDED: 0 };
  for (let page = 0; page < (opts.maxPages ?? 200) && Date.now() < opts.deadline; page++) {
    const rows = await db.crmDiscoveryCandidate.findMany({
      where: { repairFit: null }, orderBy: { id: "asc" }, take: FIT_BACKFILL_PAGE,
      select: { id: true, name: true, taxonomyPrimary: true, classReasons: true },
    });
    if (!rows.length) break;
    const groups = new Map<string, { ids: string[]; fit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED"; reasons: string[] }>();
    for (const r of rows) {
      const f = assessRepairFit({ name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons });
      const key = JSON.stringify([f.fit, f.reasons]);
      const g = groups.get(key) ?? { ids: [], fit: f.fit, reasons: f.reasons as string[] };
      g.ids.push(r.id); groups.set(key, g);
      t[f.fit]++;
    }
    const now = new Date();
    for (const g of groups.values()) await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: g.ids }, repairFit: null }, data: { repairFit: g.fit, repairFitReasons: g.reasons, repairFitAt: now } });
    t.classified += rows.length; t.pages++;
    if (rows.length < FIT_BACKFILL_PAGE) break;
  }
  return t;
}

/** Candidate counts per province and fit (null fit = not classified yet), for the readiness dashboard. */
export async function fitCountsByProvince() {
  return db.$queryRaw<{ province: string | null; fit: string | null; n: bigint }[]>(Prisma.sql`
    SELECT "province", "repairFit"::text AS fit, COUNT(*) AS n FROM "garageos"."CrmDiscoveryCandidate" WHERE "duplicateOfCandidateId" IS NULL GROUP BY 1, 2`);
}
