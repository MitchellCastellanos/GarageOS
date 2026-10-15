import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { PROVINCE_CODES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { db } from "@/lib/db";

const STALE_DAYS = 90;

export async function leadRadarOverview(actor: PlatformSalesActor, opts: { province?: string } = {}) {
  const [byReview, byMatch, byImport, byTier, total, lastRun, runs, provRows, importedUnassigned] = await Promise.all([
    db.crmDiscoveryCandidate.groupBy({ by: ["reviewState"], _count: { _all: true } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["matchState"], where: { importState: "NOT_IMPORTED" }, _count: { _all: true } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["importState"], _count: { _all: true } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["tier"], _count: { _all: true } }),
    db.crmDiscoveryCandidate.count(),
    db.crmDiscoveryRun.findFirst({ where: { status: "COMPLETED" }, orderBy: { finishedAt: "desc" }, select: { id: true, sourceRelease: true, finishedAt: true } }),
    db.crmDiscoveryRun.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.crmDiscoveryCandidate.groupBy({ by: ["province", "reviewState", "importState", "tier"], _count: { _all: true } }),
    db.crmProspect.count({ where: { AND: [assignedScopeWhere(actor), { assignedStaffId: null, status: "ACTIVE", importBatch: { sourceKey: LEAD_RADAR_SOURCE_KEY } }] } }),
  ]);
  const n = (rows: ({ _count: { _all: number } } & object)[], key: string, v: string) => rows.find((r) => (r as Record<string, unknown>)[key] === v)?._count._all ?? 0;
  const counts = {
    total,
    pendingReview: n(byReview, "reviewState", "PENDING"), approved: n(byReview, "reviewState", "APPROVED"), rejected: n(byReview, "reviewState", "REJECTED"),
    newProspects: n(byMatch, "matchState", "NEW") + n(byMatch, "matchState", "BRANCH_OF_EXISTING"), existingMatches: n(byMatch, "matchState", "EXISTING_STRONG"), ambiguous: n(byMatch, "matchState", "AMBIGUOUS"),
    created: n(byImport, "importState", "CREATED"), linked: n(byImport, "importState", "LINKED"), sentToReview: n(byImport, "importState", "SENT_TO_REVIEW"), failed: n(byImport, "importState", "FAILED"),
    primary: n(byTier, "tier", "PRIMARY"), importedUnassigned,
  };
  type Cov = { province: string; total: number; primary: number; pending: number; approved: number; imported: number };
  const cov = new Map<string, Cov>();
  for (const r of provRows) {
    const k = r.province ?? "??";
    const c = cov.get(k) ?? { province: k, total: 0, primary: 0, pending: 0, approved: 0, imported: 0 };
    const x = r._count._all;
    c.total += x;
    if (r.tier === "PRIMARY") c.primary += x;
    if (r.reviewState === "PENDING") c.pending += x;
    if (r.reviewState === "APPROVED") c.approved += x;
    if (["CREATED", "LINKED", "SENT_TO_REVIEW"].includes(r.importState)) c.imported += x;
    cov.set(k, c);
  }
  const lastByProv = await db.$queryRaw<{ province: string; last: Date }[]>`
    SELECT "province", MAX("updatedAt") AS last FROM "garageos"."CrmDiscoveryCandidate" WHERE "province" IS NOT NULL GROUP BY "province"`;
  const lastMap = new Map(lastByProv.map((r) => [r.province, r.last]));
  const staleBefore = Date.now() - STALE_DAYS * 86_400_000;
  const provinces = PROVINCE_CODES.map((code) => {
    const c = cov.get(code) ?? { province: code, total: 0, primary: 0, pending: 0, approved: 0, imported: 0 };
    const last = lastMap.get(code) ?? null;
    return { ...c, province: code as ProvinceCode, lastSeen: last, gap: c.total === 0 ? ("NEVER" as const) : last && last.getTime() < staleBefore ? ("STALE" as const) : null };
  });
  const prov = opts.province && (PROVINCE_CODES as readonly string[]).includes(opts.province) ? opts.province : null;
  const [cities, territories] = await Promise.all([
    db.crmDiscoveryCandidate.groupBy({ by: ["city"], where: prov ? { province: prov } : {}, _count: { _all: true }, orderBy: { _count: { city: "desc" } }, take: 15 }),
    db.crmDiscoveryCandidate.groupBy({ by: ["territoryKey"], _count: { _all: true }, orderBy: { _count: { territoryKey: "desc" } }, take: 15 }),
  ]);
  const handoff = await db.crmImportBatch.findMany({
    where: { sourceKey: LEAD_RADAR_SOURCE_KEY, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 5,
    select: { id: true, completedAt: true, createdCount: true, skippedCount: true, summary: true },
  });
  const handoffRows = await Promise.all(handoff.map(async (b) => {
    const [unassigned, sample] = await Promise.all([
      db.crmProspect.count({ where: { AND: [assignedScopeWhere(actor), { importBatchId: b.id, assignedStaffId: null, status: "ACTIVE" }] } }),
      db.crmProspect.findMany({ where: { AND: [assignedScopeWhere(actor), { importBatchId: b.id }] }, select: { id: true, name: true, city: true, territoryKey: true, territoryState: true, assignedStaffId: true }, take: 8, orderBy: { id: "asc" } }),
    ]);
    const result = (b.summary as { result?: { linked?: number; review?: number } } | null)?.result ?? {};
    return { id: b.id, completedAt: b.completedAt, created: b.createdCount, linked: result.linked ?? 0, review: result.review ?? 0, skipped: b.skippedCount, unassigned, sample };
  }));
  return {
    counts, provinces, province: prov, cities: cities.map((c) => ({ city: c.city ?? "—", count: c._count._all })),
    territories: territories.map((t) => ({ key: t.territoryKey ?? "—", count: t._count._all })),
    lastExtraction: lastRun, runs: runs.map((r) => ({ id: r.id, status: r.status, release: r.sourceRelease, scope: r.scope as { provinces: string[]; groups: string[] }, received: r.receivedRecords, expected: r.expectedRecords, stagedNew: r.stagedNew, rejected: r.rejectedRecords, createdAt: r.createdAt, finishedAt: r.finishedAt, diagnostics: r.diagnostics as { code: string; count: number }[] })),
    handoff: handoffRows,
  };
}
export type LeadRadarOverview = Awaited<ReturnType<typeof leadRadarOverview>>;
