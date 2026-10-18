import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { SCREEN_VERSION, screenCandidate, type ScreenReason } from "@/domain/lead-radar/commercial-screen";
import { FIT_OVERRIDE_PREFIX } from "@/lib/lead-radar/import-service";
import { classifyTerritory, type TerritoryRule } from "@/domain/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

type Tx = Prisma.TransactionClient | typeof db;

export interface RejectionInput { sourceRecordId: string; reasons: readonly ScreenReason[]; fingerprint: string; province: string | null; release: string }

/**
 * Remembers WHY a business was not kept (one tombstone per source id, in one statement): the source id, the reason codes, the screen version and the content fingerprint —
 * nothing else, no business data. Idempotent: seeing the same id again only refreshes the release and the counter.
 */
export async function recordRejections(tx: Tx, rows: readonly RejectionInput[]): Promise<void> {
  if (!rows.length) return;
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "garageos"."CrmDiscoveryRejection" ("id","source","sourceRecordId","reasonCodes","screenVersion","fingerprint","province","firstSeenRelease","lastSeenRelease","seenCount","createdAt","updatedAt")
    SELECT gen_random_uuid()::text, 'OVERTURE'::"garageos"."CrmDiscoverySource", v.sid, string_to_array(v.rs, ','), ${SCREEN_VERSION}, v.fp, NULLIF(v.pv,''), v.rel, v.rel, 1, now(), now()
    FROM unnest(${rows.map((r) => r.sourceRecordId)}::text[], ${rows.map((r) => r.reasons.join(","))}::text[], ${rows.map((r) => r.fingerprint)}::text[], ${rows.map((r) => r.province ?? "")}::text[], ${rows.map((r) => r.release)}::text[]) AS v(sid, rs, fp, pv, rel)
    ON CONFLICT ("source","sourceRecordId") DO UPDATE SET "reasonCodes" = EXCLUDED."reasonCodes", "screenVersion" = EXCLUDED."screenVersion", "fingerprint" = EXCLUDED."fingerprint",
      "lastSeenRelease" = EXCLUDED."lastSeenRelease", "seenCount" = "garageos"."CrmDiscoveryRejection"."seenCount" + 1, "updatedAt" = now()`);
}

/** A business that passes the screen now is no longer excluded: its tombstone is removed (it is staged normally in the same transaction). Returns how many were reconsidered. */
export async function clearRejections(tx: Tx, sourceRecordIds: readonly string[]): Promise<number> {
  if (!sourceRecordIds.length) return 0;
  const r = await tx.crmDiscoveryRejection.deleteMany({ where: { source: "OVERTURE", sourceRecordId: { in: [...sourceRecordIds] } } });
  return r.count;
}

export interface PurgeTally { examined: number; purged: number; kept: number; reasons: Record<string, number> }

/**
 * Bounded cleanup of staging rows that can never be used: never reviewed by a person, never imported or linked to the CRM, not referenced as a duplicate original, no ICP override
 * — and the CURRENT screen rejects them. Each becomes a tombstone (so a later release that improves it is reconsidered) and the row is deleted. CRM prospects, contacts, bases,
 * suppressions and every audit record are untouched; a row that a person reviewed or that reached the CRM is never removed.
 */
export async function purgeUnusableCandidates(opts: { limit: number; deadline: number; rules?: TerritoryRule[] }): Promise<PurgeTally> {
  const t: PurgeTally = { examined: 0, purged: 0, kept: 0, reasons: {} };
  const rules = opts.rules ?? (await loadTerritoryRulesWith(db));
  const rows = await db.crmDiscoveryCandidate.findMany({
    where: {
      source: "OVERTURE", importState: "NOT_IMPORTED", reviewState: { in: ["PENDING", "REJECTED"] }, reviewedByUserId: null, icpOverride: false, importedProspectId: null, matchProspectId: null,
      // positive form: NOT over a nullable column would silently drop rows whose note is NULL (SQL three-valued logic)
      OR: [{ reviewNote: null }, { NOT: { reviewNote: { startsWith: FIT_OVERRIDE_PREFIX } } }],
    },
    orderBy: { id: "asc" }, take: opts.limit,
    select: { id: true, sourceRecordId: true, licenseOk: true, tier: true, name: true, taxonomyPrimary: true, classReasons: true, website: true, city: true, address: true, province: true, postalCode: true, phone: true, email: true, repairFitReasons: true, contentFingerprint: true, lastSeenRelease: true, qualityFlags: true },
  });
  const referenced = new Set((await db.crmDiscoveryCandidate.findMany({ where: { duplicateOfCandidateId: { in: rows.map((r) => r.id) } }, select: { duplicateOfCandidateId: true }, distinct: ["duplicateOfCandidateId"] })).map((r) => r.duplicateOfCandidateId));
  const toPurge: typeof rows = [];
  const tombs: RejectionInput[] = [];
  for (const c of rows) {
    if (Date.now() > opts.deadline) break;
    t.examined++;
    const fit = assessRepairFit({ name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, website: c.website, city: c.city, icpOverride: false, storedReasons: c.repairFitReasons });
    const territory = classifyTerritory(rules, { province: c.province, city: c.city, postalCode: c.postalCode }).state;
    const screen = screenCandidate({ licenseOk: c.licenseOk, tier: c.tier, fit: fit.fit, territory, address: c.address, city: c.city, postalCode: c.postalCode, phone: c.phone, email: c.email, operatingStatus: null });
    if (screen.lane || referenced.has(c.id)) { t.kept++; continue; }
    toPurge.push(c);
    tombs.push({ sourceRecordId: c.sourceRecordId, reasons: screen.reasons, fingerprint: c.contentFingerprint, province: c.province, release: c.lastSeenRelease });
    for (const r of screen.reasons) t.reasons[r] = (t.reasons[r] ?? 0) + 1;
  }
  if (!toPurge.length) return t;
  await db.$transaction(async (tx) => {
    await recordRejections(tx, tombs);
    const d = await tx.crmDiscoveryCandidate.deleteMany({ where: { id: { in: toPurge.map((c) => c.id) }, importState: "NOT_IMPORTED", reviewedByUserId: null, importedProspectId: null } });
    t.purged = d.count;
  }, { timeout: 30_000 });
  return t;
}
