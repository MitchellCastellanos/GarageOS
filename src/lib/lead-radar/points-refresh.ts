import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { checkSourceCoordinates, type SourceCoordinateIssue } from "@/domain/sales-crm/source-location";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

// Source-position refresh and diagnostics. The positions of Overture places only exist in the Overture release, never in GarageOS: an extraction that lost them
// (see overture_extract.py 1.2.0, float32 bbox) cannot be repaired from the uploaded run, because chunks are staged and discarded. This is the small, safe path
// that does NOT re-run the full extraction: a Super Admin uploads a compact `points.ndjson` ({id, lat, lng} per place, produced by `overture_extract.py --points-only`
// for the same release) and GarageOS attaches the point to the EXISTING candidates, nothing else.
//   · writes only CrmDiscoveryCandidate.sourceLatitude/sourceLongitude (+ updatedAt): never lastRunId, facts, fingerprint, review/qualification/import state;
//   · creates no candidate and no prospect (an id that is not staged is only counted);
//   · validates every point with the same Canada/province plausibility check as staging;
//   · idempotent (an unchanged point is not rewritten), bounded per call, preview first, audited with counts only.

export const POINTS_MAX_LINES = 5000;
export const POINTS_MAX_BYTES = 1_000_000;
const SAME = 1e-7;

export type PointSkip = SourceCoordinateIssue | "MALFORMED" | "NOT_STAGED" | "UNCHANGED";
export interface PointsReport {
  dryRun: boolean; lines: number; matched: number; wouldUpdate: number; updated: number;
  skipped: Partial<Record<PointSkip, number>>;
  /** Of the candidates that get (or would get) a point: already imported into the CRM — i.e. the ones the free backfill can now place. */
  importedAmongUpdated: number;
}

interface Parsed { id: string; lat: number; lng: number }

function parseLine(raw: string): Parsed | null {
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const r = o as { id?: unknown; lat?: unknown; lng?: unknown; geo?: { lat?: unknown; lng?: unknown } | null };
  const lat = r.lat ?? r.geo?.lat, lng = r.lng ?? r.geo?.lng;
  if (typeof r.id !== "string" || r.id.length < 8 || r.id.length > 80 || typeof lat !== "number" || typeof lng !== "number") return null;
  return { id: r.id, lat, lng };
}

export async function refreshSourcePoints(actor: PlatformSalesActor, text: string, opts: { apply: boolean }): Promise<PointsReport> {
  if (!actor.all) throw new Error("SALES_FORBIDDEN");
  if (Buffer.byteLength(text, "utf8") > POINTS_MAX_BYTES) throw new CrmError("CHUNK_TOO_LARGE");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > POINTS_MAX_LINES) throw new CrmError("CHUNK_TOO_LARGE");
  const rep: PointsReport = { dryRun: !opts.apply, lines: lines.length, matched: 0, wouldUpdate: 0, updated: 0, skipped: {}, importedAmongUpdated: 0 };
  const skip = (r: PointSkip) => { rep.skipped[r] = (rep.skipped[r] ?? 0) + 1; };

  const byId = new Map<string, Parsed>();
  for (const l of lines) { const p = parseLine(l); if (!p) skip("MALFORMED"); else byId.set(p.id, p); } // the same id twice: last wins
  if (!byId.size) return rep;
  const cands = await db.crmDiscoveryCandidate.findMany({
    where: { source: "OVERTURE", sourceRecordId: { in: [...byId.keys()] } },
    select: { id: true, sourceRecordId: true, province: true, sourceLatitude: true, sourceLongitude: true, importedProspectId: true },
  });
  const staged = new Set(cands.map((c) => c.sourceRecordId));
  for (const id of byId.keys()) if (!staged.has(id)) skip("NOT_STAGED");

  const ids: string[] = [], lats: number[] = [], lngs: number[] = [];
  for (const c of cands) {
    const p = byId.get(c.sourceRecordId)!;
    rep.matched++;
    const ok = checkSourceCoordinates(p.lat, p.lng, c.province);
    if (!ok.ok) { skip(ok.issue); continue; }
    const lat = Math.round(p.lat * 1e7) / 1e7, lng = Math.round(p.lng * 1e7) / 1e7;
    if (c.sourceLatitude !== null && c.sourceLongitude !== null && Math.abs(c.sourceLatitude - lat) < SAME && Math.abs(c.sourceLongitude - lng) < SAME) { skip("UNCHANGED"); continue; }
    rep.wouldUpdate++;
    if (c.importedProspectId) rep.importedAmongUpdated++;
    ids.push(c.id); lats.push(lat); lngs.push(lng);
  }
  if (opts.apply && ids.length) {
    // One statement; the WHERE re-checks "still different", so a concurrent identical refresh updates nothing twice.
    const n = await db.$executeRaw(Prisma.sql`
      UPDATE "garageos"."CrmDiscoveryCandidate" c SET "sourceLatitude" = v.lat, "sourceLongitude" = v.lng, "updatedAt" = now()
      FROM unnest(${ids}::text[], ${lats}::float8[], ${lngs}::float8[]) AS v(id, lat, lng)
      WHERE c."id" = v.id AND (c."sourceLatitude" IS DISTINCT FROM v.lat OR c."sourceLongitude" IS DISTINCT FROM v.lng)`);
    rep.updated = n;
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_POINTS_REFRESHED", entityType: "CrmDiscoveryCandidate", metadata: { lines: rep.lines, matched: rep.matched, updated: n, importedAmongUpdated: rep.importedAmongUpdated, skipped: rep.skipped } });
  }
  return rep;
}

// ── Diagnostics (read-only) ──────────────────────────────────────────────────────────────────────────────────────────
export interface PointDiagnostics {
  database: { pointColumnsPresent: boolean; migrations: { name: string; finishedAt: string | null; rolledBack: boolean }[] | null; runDiagnosticsColumnsPresent: boolean };
  candidates: { total: number; withPoint: number; withoutPoint: number; imported: number; importedWithPoint: number; importedWithoutPoint: number; importedWithPointLicenseOk: number };
  lastRun: null | { id: string; release: string; status: string; extractorVersion: string | null; received: number; recordsWithPoint: number; pointsAccepted: number; pointsOnNew: number; pointsOnExisting: number; rejected: number; finishedAt: string | null; verdict: "POINTS_OK" | "NO_POINTS_IN_FILE" | "POINTS_REJECTED" | "OLD_RUN" };
}

/** Where coordinates are lost, from the database's own point of view. `migrations` is read straight from `_prisma_migrations` (null if that table is not readable). */
export async function pointDiagnostics(actor: PlatformSalesActor): Promise<PointDiagnostics> {
  if (!actor.all) throw new Error("SALES_FORBIDDEN");
  const cols = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'garageos'
      AND ((table_name = 'CrmDiscoveryCandidate' AND column_name IN ('sourceLatitude', 'sourceLongitude')) OR (table_name = 'CrmDiscoveryRun' AND column_name = 'recordsWithPoint'))`;
  const pointColumnsPresent = cols.filter((c) => c.table_name === "CrmDiscoveryCandidate").length === 2;
  const runDiagnosticsColumnsPresent = cols.some((c) => c.table_name === "CrmDiscoveryRun");
  let migrations: PointDiagnostics["database"]["migrations"] = null;
  try {
    const rows = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name IN ('20261017090000_prospect_source_coordinates', '20261018090000_prospect_repair_fit', '20261019090000_run_point_diagnostics') ORDER BY migration_name`;
    migrations = rows.map((r) => ({ name: r.migration_name, finishedAt: r.finished_at ? r.finished_at.toISOString() : null, rolledBack: !!r.rolled_back_at }));
  } catch { migrations = null; }
  const zero = { total: 0, withPoint: 0, withoutPoint: 0, imported: 0, importedWithPoint: 0, importedWithoutPoint: 0, importedWithPointLicenseOk: 0 };
  let candidates = zero;
  if (pointColumnsPresent) {
    const [total, withPoint, imported, importedWithPoint, importedWithPointLicenseOk] = await Promise.all([
      db.crmDiscoveryCandidate.count(), db.crmDiscoveryCandidate.count({ where: { sourceLatitude: { not: null } } }),
      db.crmDiscoveryCandidate.count({ where: { importedProspectId: { not: null } } }),
      db.crmDiscoveryCandidate.count({ where: { importedProspectId: { not: null }, sourceLatitude: { not: null } } }),
      db.crmDiscoveryCandidate.count({ where: { importedProspectId: { not: null }, sourceLatitude: { not: null }, licenseOk: true } }),
    ]);
    candidates = { total, withPoint, withoutPoint: total - withPoint, imported, importedWithPoint, importedWithoutPoint: imported - importedWithPoint, importedWithPointLicenseOk };
  }
  const since = migrations?.find((m) => m.name === "20261019090000_run_point_diagnostics" && m.finishedAt && !m.rolledBack)?.finishedAt;
  const accountingSince = since ? new Date(since) : null; // runs created before the counters existed carry zeros that mean "not measured"
  const run = await db.crmDiscoveryRun.findFirst({ where: { status: "COMPLETED" }, orderBy: { finishedAt: "desc" } });
  let lastRun: PointDiagnostics["lastRun"] = null;
  if (run) {
    const m = run.manifest as { extractorVersion?: string } | null;
    const r = run as unknown as { recordsWithPoint?: number; pointsAccepted?: number; pointsOnNew?: number; pointsOnExisting?: number };
    const withPoint = r.recordsWithPoint ?? 0, accepted = r.pointsAccepted ?? 0;
    lastRun = {
      id: run.id, release: run.sourceRelease, status: run.status, extractorVersion: m?.extractorVersion ?? null, received: run.receivedRecords, recordsWithPoint: withPoint, pointsAccepted: accepted,
      pointsOnNew: r.pointsOnNew ?? 0, pointsOnExisting: r.pointsOnExisting ?? 0, rejected: run.rejectedRecords, finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      // A run that finished before this accounting existed has no counters (all zero) — it is reported as such, never as a pass.
      verdict: !runDiagnosticsColumnsPresent || (run.receivedRecords > 0 && withPoint === 0 && accepted === 0 && !(accountingSince && run.createdAt >= accountingSince)) ? "OLD_RUN"
        : run.receivedRecords > 0 && withPoint === 0 ? "NO_POINTS_IN_FILE" : withPoint > 0 && accepted === 0 ? "POINTS_REJECTED" : "POINTS_OK",
    };
  }
  return { database: { pointColumnsPresent, migrations, runDiagnosticsColumnsPresent }, candidates, lastRun };
}
