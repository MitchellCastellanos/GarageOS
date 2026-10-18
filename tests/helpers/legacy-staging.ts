// Test helper: stages Overture-shaped records EXACTLY as the staging pipeline did BEFORE the early commercial screen existed (no screen, no tombstones). Used only by suites whose
// subject is a rule that must still work on rows that were staged earlier (policy comparison, qualification of old candidates, queue deferral). The product path (`stageChunk`) now
// screens first; its behaviour is tested in tests/casl-evidence-db.test.ts and tests/lead-radar-db.test.ts.
import { assessRepairFit } from "../../src/domain/lead-radar/repair-fit";
import { isIcpExclusion } from "../../src/domain/lead-radar/icp";
import { exclusionIdentityKey, tombstoneReasons, withTombstoneMarker } from "../../src/domain/lead-radar/icp-tombstone";
import { toCandidate } from "../../src/domain/lead-radar/record";
import { cityKey, classifyTerritory } from "../../src/domain/sales-crm/territory";
import { classifyAgainstPool } from "../../src/domain/sales-crm/dedupe";
import type { PrismaClient } from "@prisma/client";

export async function stageLegacy(db: PrismaClient, runId: string, records: readonly unknown[], release: string, provinces: readonly string[]): Promise<number> {
  const rows = await db.crmTerritory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const rules = rows.map((r) => ({ key: r.key, acquisition: r.acquisition, provinces: r.provinces, cities: r.cities, postalPrefixes: r.postalPrefixes, priorityDays: r.priorityDays, priorityStartedAt: r.priorityStartedAt, active: r.active, sortOrder: r.sortOrder }));
  // Exclusion tombstones are honoured exactly like the product does (same lookup, same decision), so an excluded/re-keyed/released business is staged the way it used to be.
  const { loadExclusions, decideFor } = await import("../../src/lib/lead-radar/exclusions");
  const { matchKeyOf } = await import("../../src/lib/lead-radar/staging");
  const { loadMatchPool } = await import("../../src/lib/sales-crm/lead-pool");
  let n = 0;
  for (const rec of records) {
    const r = toCandidate(rec, { provinces: [...provinces] }, { cityKeyOf: cityKey, release });
    if (!r.ok) continue;
    const c = r.candidate;
    const cls = classifyTerritory(rules, { province: c.province, city: c.city, postalCode: c.postalCode });
    const identityKey = exclusionIdentityKey({ nameNormalized: c.nameNormalized, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode });
    const tombs = await db.$transaction((tx) => loadExclusions(tx, [{ sourceRecordId: c.sourceRecordId, identityKey }]));
    const dec = decideFor(tombs, { sourceRecordId: c.sourceRecordId, identityKey });
    const icpOverride = dec.kind === "OVERRIDE";
    let fit = assessRepairFit({ name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, website: c.website, city: c.city, icpOverride, storedReasons: dec.kind === "EXCLUDE" ? tombstoneReasons(dec.tomb, dec.rekeyed) : null });
    if (!icpOverride && isIcpExclusion(fit.reasons)) fit = { ...fit, reasons: (dec.kind === "EXCLUDE" && dec.rekeyed && !fit.reasons.includes("ICP_TOMBSTONE_REKEYED") ? [...withTombstoneMarker(fit.reasons), "ICP_TOMBSTONE_REKEYED"] : withTombstoneMarker(fit.reasons)) as typeof fit.reasons };
    // CRM matching, exactly as staging computed it.
    const pool = await db.$transaction((tx) => loadMatchPool([matchKeyOf(c)], tx));
    const cl = classifyAgainstPool(matchKeyOf(c), pool);
    const match = cl.outcome === "STRONG" ? { matchState: "EXISTING_STRONG", matchProspectId: cl.strong!.id, matchReasons: cl.strong!.reasons }
      : cl.outcome === "AMBIGUOUS" ? { matchState: "AMBIGUOUS", matchProspectId: cl.ambiguous[0].id, matchReasons: [...new Set(cl.ambiguous.flatMap((a) => a.reasons))] }
      : cl.branchOf.length ? { matchState: "BRANCH_OF_EXISTING", matchProspectId: cl.branchOf[0], matchReasons: [] as string[] }
      : { matchState: "NEW", matchProspectId: null, matchReasons: [] as string[] };
    await db.crmDiscoveryCandidate.create({ data: {
      source: "OVERTURE", sourceRecordId: c.sourceRecordId, firstRunId: runId, lastRunId: runId, firstSeenRelease: release, lastSeenRelease: release,
      name: c.name, nameNormalized: c.nameNormalized, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode, phone: c.phone, website: c.website, email: c.email,
      territoryKey: cls.state === "LOCAL" ? cls.rule!.key : cls.state === "NATIONAL" ? "national" : "unresolved", taxonomyPrimary: c.taxonomyPrimary, tier: c.tier, industry: c.industry, classReasons: c.classReasons,
      chainSignal: c.chainSignal, sourceConfidence: c.sourceConfidence, completeness: c.completeness, qualityFlags: c.qualityFlags, licenses: c.licenses, datasets: c.datasets, licenseOk: c.licenseOk,
      contentFingerprint: c.contentFingerprint, sourceLatitude: c.sourceLatitude, sourceLongitude: c.sourceLongitude, repairFit: fit.fit, repairFitReasons: fit.reasons as string[], repairFitAt: new Date(), icpOverride, ...match, matchedAt: new Date(),
    } as never });
    n++;
  }
  return n;
}

/**
 * After a REAL ingestion, puts back (as legacy rows) the businesses the early screen tombstoned instead of staging, removes those tombstones and restores the run counters, so a suite
 * whose subject is a downstream rule sees the staging population exactly as the old pipeline produced it.
 */
export async function restoreLegacyRows(db: PrismaClient, runId: string, recs: readonly unknown[], provinces: readonly string[], release: string): Promise<number> {
  const objs = recs.filter((r): r is { id: string; geo?: { lat?: number | null } | null } => !!r && typeof r === "object" && "id" in (r as object));
  const tombs = await db.crmDiscoveryRejection.findMany({ where: { sourceRecordId: { in: objs.map((r) => r.id) } }, select: { sourceRecordId: true } });
  if (!tombs.length) return 0;
  const ids = new Set(tombs.map((t) => t.sourceRecordId));
  const back = objs.filter((r) => ids.has(r.id));
  const n = await stageLegacy(db, runId, back, release, provinces);
  await db.crmDiscoveryRejection.deleteMany({ where: { sourceRecordId: { in: [...ids] } } });
  const withPoint = back.filter((r) => r.geo && r.geo.lat !== null && r.geo.lat !== undefined).length;
  await db.crmDiscoveryRun.update({ where: { id: runId }, data: { stagedNew: { increment: n }, pointsOnNew: { increment: withPoint }, screenedRecords: { decrement: tombs.length } } });
  return n;
}
