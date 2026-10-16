import "server-only";
import type { Prisma } from "@prisma/client";
import { can, type PlatformSalesActor } from "@/domain/sales-crm/access";
import type { AddressParts } from "@/domain/sales-crm/geocoding";
import {
  OVERTURE_LOCATION_PROVIDER, SOURCE_LOCATION_ACCURACY, decideSourceLocation, locationCoverage, type LocationCoverage, type SourceLocationDecision, type SourceLocationSkip,
} from "@/domain/sales-crm/source-location";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { isProductionEnvironment } from "@/lib/sales-crm/geocoder";

// Locating CRM prospects from the SOURCE point Lead Radar already holds (zero provider cost, zero network).
//  · At import: `locateFromSource` runs inside the import transaction for each prospect the import created or linked.
//  · Backlog: `runSourceLocationBackfill` (Super Admin; dry-run by default) walks imported candidates in keyset pages.
// It writes ONLY `CrmProspectLocation`. It never touches assignment, outreach eligibility, sending bases, contacts or the prospect row itself.

type Client = Prisma.TransactionClient | typeof db;
export type SourceLocateResult = SourceLocationDecision & { written: boolean };

export interface LocateInput {
  prospect: AddressParts & { id: string };
  point: { lat: number | null | undefined; lng: number | null | undefined };
  /** Omit only for a prospect created from this very source record in the same step. */
  sourceAddress?: AddressParts | null;
}

/** Decides and (unless `dryRun`) writes one position. Idempotent: a second call finds a usable position and skips. Race-safe without throwing inside a transaction. */
export async function locateFromSource(client: Client, input: LocateInput, opts: { now?: Date; dryRun?: boolean } = {}): Promise<SourceLocateResult> {
  const now = opts.now ?? new Date();
  const existing = await client.crmProspectLocation.findUnique({ where: { prospectId: input.prospect.id } });
  const decision = decideSourceLocation({ source: input.point, prospect: input.prospect, sourceAddress: input.sourceAddress, existing, now, production: isProductionEnvironment() });
  if (decision.action === "SKIP" || opts.dryRun) return { ...decision, written: false };

  const data = {
    status: "GEOCODED" as const, provider: OVERTURE_LOCATION_PROVIDER, addressFingerprint: decision.fingerprint, latitude: decision.lat, longitude: decision.lng,
    accuracy: SOURCE_LOCATION_ACCURACY, confidence: null, failureCode: null, geocodedAt: now, lastAttemptAt: now, verifiedAt: null, verifiedByUserId: null,
  };
  let written: boolean;
  if (!existing) written = (await client.crmProspectLocation.createMany({ data: [{ prospectId: input.prospect.id, attempts: 0, ...data }], skipDuplicates: true })).count === 1;
  // Compare-and-set on updatedAt: if a geocoder batch touched the row since we read it, we lose the race and change nothing.
  else written = (await client.crmProspectLocation.updateMany({ where: { prospectId: input.prospect.id, updatedAt: existing.updatedAt }, data })).count === 1;
  return written ? { ...decision, written } : { action: "SKIP", reason: "ALREADY_LOCATED", written: false };
}

// ── Super Admin backfill ──────────────────────────────────────────────────────────────────────────────────────────────
export const BACKFILL_PAGE_DEFAULT = 200;
export const BACKFILL_PAGE_MAX = 500;
const SAMPLE_LIMIT = 10;

function requireSuperAdmin(actor: PlatformSalesActor) {
  if (!actor.all || !can(actor, "manage_geocoding")) throw new Error("SALES_FORBIDDEN");
}

export type BackfillSkip = SourceLocationSkip | "PROSPECT_NOT_ELIGIBLE" | "PROSPECT_MISSING";
export interface BackfillReport {
  dryRun: boolean;
  /** Candidates examined in THIS page. */
  scanned: number;
  /** Would be written (dry-run) / were written (apply). */
  located: number;
  skipped: Partial<Record<BackfillSkip, number>>;
  /** Pass back as `cursor` to continue; null when the walk is finished. */
  nextCursor: string | null;
  done: boolean;
  /** Prospect ids only (no business data), first few that were / would be located. */
  sampleProspectIds: string[];
}

export async function runSourceLocationBackfill(actor: PlatformSalesActor, opts: { dryRun?: boolean; limit?: number; cursor?: string | null; now?: Date } = {}): Promise<BackfillReport> {
  requireSuperAdmin(actor);
  const dryRun = opts.dryRun !== false; // dry-run unless explicitly turned off
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? BACKFILL_PAGE_DEFAULT)), BACKFILL_PAGE_MAX);
  const now = opts.now ?? new Date();
  const cands = await db.crmDiscoveryCandidate.findMany({
    where: { importedProspectId: { not: null }, sourceLatitude: { not: null }, sourceLongitude: { not: null }, licenseOk: true, ...(opts.cursor ? { id: { gt: opts.cursor } } : {}) },
    orderBy: { id: "asc" }, take: limit,
    select: { id: true, importedProspectId: true, sourceLatitude: true, sourceLongitude: true, address: true, city: true, province: true, postalCode: true },
  });
  const prospects = await db.crmProspect.findMany({
    where: { id: { in: cands.map((c) => c.importedProspectId!) } },
    select: { id: true, address: true, city: true, province: true, postalCode: true, status: true, doNotContact: true, mergedIntoId: true, archivedAt: true },
  });
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const report: BackfillReport = { dryRun, scanned: cands.length, located: 0, skipped: {}, nextCursor: null, done: cands.length < limit, sampleProspectIds: [] };
  const skip = (r: BackfillSkip) => { report.skipped[r] = (report.skipped[r] ?? 0) + 1; };

  for (const c of cands) {
    const p = byId.get(c.importedProspectId!);
    if (!p) { skip("PROSPECT_MISSING"); continue; }
    if (p.status !== "ACTIVE" || p.doNotContact || p.mergedIntoId || p.archivedAt) { skip("PROSPECT_NOT_ELIGIBLE"); continue; }
    const r = await locateFromSource(db, { prospect: p, point: { lat: c.sourceLatitude, lng: c.sourceLongitude }, sourceAddress: c }, { now, dryRun });
    if (r.action === "WRITE") { report.located++; if (report.sampleProspectIds.length < SAMPLE_LIMIT) report.sampleProspectIds.push(p.id); }
    else skip(r.reason);
  }
  report.nextCursor = report.done ? null : cands[cands.length - 1].id;
  if (!dryRun) {
    // Counts only — never addresses or coordinates.
    await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_LOCATION_BACKFILL", entityType: "CrmProspectLocation", metadata: { scanned: report.scanned, located: report.located, skipped: report.skipped, done: report.done } });
  }
  return report;
}

// ── Coverage summary (Super Admin diagnostics) ────────────────────────────────────────────────────────────────────────
const ELIGIBLE_WHERE = { status: "ACTIVE", doNotContact: false, mergedIntoId: null, archivedAt: null, assignedStaffId: { not: null } } as const;
export interface CoverageSummary { eligible: number; byCoverage: Record<LocationCoverage, number>; withSourcePointNotLocated: number; truncated: boolean }
const SUMMARY_LIMIT = 10_000;

/** Read-only: how many assigned, active prospects are located / pending / ambiguous-or-failed / insufficient. */
export async function locationCoverageSummary(actor: PlatformSalesActor, now = new Date()): Promise<CoverageSummary> {
  requireSuperAdmin(actor);
  const rows = await db.crmProspect.findMany({ where: ELIGIBLE_WHERE, select: { id: true, address: true, city: true, province: true, postalCode: true, location: true }, orderBy: { id: "asc" }, take: SUMMARY_LIMIT + 1 });
  const production = isProductionEnvironment();
  const byCoverage: Record<LocationCoverage, number> = { LOCATED: 0, PENDING: 0, AMBIGUOUS_FAILED: 0, INSUFFICIENT_ADDRESS: 0 };
  const notLocated: string[] = [];
  for (const r of rows.slice(0, SUMMARY_LIMIT)) {
    const c = locationCoverage(r, r.location, now, { production });
    byCoverage[c]++;
    if (c !== "LOCATED") notLocated.push(r.id);
  }
  const withSource = notLocated.length ? await db.crmDiscoveryCandidate.count({ where: { importedProspectId: { in: notLocated }, sourceLatitude: { not: null } } }) : 0;
  return { eligible: Math.min(rows.length, SUMMARY_LIMIT), byCoverage, withSourcePointNotLocated: withSource, truncated: rows.length > SUMMARY_LIMIT };
}
