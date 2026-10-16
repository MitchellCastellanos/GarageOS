import "server-only";
import type { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { usableLocation } from "@/domain/sales-crm/geocoding";
import {
  CANADA_BBOX, FEW_POINTS, MAP_STATUSES, MAX_POINTS, POINT_ZOOM, bboxOfRadius, clusterPoints, mapStatusOf, normalizePostalQuery, withinRadius,
  type Bbox, type Cluster, type MapPointDto, type MapStatus,
} from "@/domain/sales-crm/field-map";
import { stopBlock } from "@/domain/sales-crm/field-route";
import { OPEN_STAGES } from "@/domain/sales-crm/pipeline";
import { resolveTerritory } from "@/domain/sales-crm/territory";
import { db } from "@/lib/db";
import { coverageOk, requirePlanner } from "@/lib/sales-crm/field-route-service";
import { isProductionEnvironment } from "@/lib/sales-crm/geocoder";
import { resolveLocationStates } from "@/lib/sales-crm/location-service";
import { CrmError } from "@/lib/sales-crm/prospects";
import { loadTerritoryRules } from "@/lib/sales-crm/territory";

// Viewport-based territory map. Nothing here caps the map at the route size (25): the server returns every located prospect of the
// seller's authorized book inside the viewport — as individual markers when few, otherwise as grid clusters with exact counts.

/** Safety ceiling on rows read for ONE viewport (a seller's whole book is far below it; above it the response says `truncated`). */
const ROW_CEILING = 8000;
const CHUNK = 2000;

export type { MapPointDto };
export interface ViewportInput { bbox: Bbox; zoom: number; statuses: readonly MapStatus[]; q?: string }
export interface ViewportResult {
  mode: "points" | "clusters";
  points: MapPointDto[];
  clusters: Cluster[];
  /** inView: located prospects in the viewport before the status/text filter; matching: after; byStatus: counts of inView. */
  counts: { inView: number; matching: number; byStatus: Record<MapStatus, number>; truncated: boolean };
}

type Located = MapPointDto;

const emptyCounts = (): Record<MapStatus, number> => Object.fromEntries(MAP_STATUSES.map((s) => [s, 0])) as Record<MapStatus, number>;

/** Prospects a FIELD seller may see on the map: own book only (never a manager's team or the pool), active, not DNC/merged/archived. */
const bookWhere = (staffId: string): Prisma.CrmProspectWhereInput => ({ assignedStaffId: staffId, status: "ACTIVE", doNotContact: false, mergedIntoId: null, archivedAt: null });

async function statusFacts(ids: readonly string[]) {
  const lastVisit = new Map<string, string>(), openTasks = new Map<string, number>(), activities = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [visits, tasks, acts] = await Promise.all([
      db.crmActivity.findMany({ where: { prospectId: { in: chunk }, type: "FIELD_VISIT", fieldVisitOutcome: { not: null } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], distinct: ["prospectId"], select: { prospectId: true, fieldVisitOutcome: true } }),
      db.crmTask.groupBy({ by: ["prospectId"], where: { prospectId: { in: chunk }, status: "OPEN" }, _count: true }),
      db.crmActivity.groupBy({ by: ["prospectId"], where: { prospectId: { in: chunk } }, _count: true }),
    ]);
    for (const v of visits) if (v.fieldVisitOutcome) lastVisit.set(v.prospectId, v.fieldVisitOutcome);
    for (const t of tasks) openTasks.set(t.prospectId, t._count);
    for (const a of acts) activities.set(a.prospectId, a._count);
  }
  return { lastVisit, openTasks, activities };
}

const bestStage = (opps: { stage: string }[]): string | null => {
  if (opps.some((o) => o.stage === "WON")) return "WON";
  const open = opps.find((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));
  return open?.stage ?? opps[0]?.stage ?? null;
};

/** Every located prospect of the seller's book inside `bbox`, with its derived CRM status. Coordinates must belong to the CURRENT address. */
async function locatedInBbox(actor: PlatformSalesActor, bbox: Bbox, q: string | undefined, now: Date): Promise<{ rows: Located[]; truncated: boolean }> {
  const staffId = requirePlanner(actor);
  const where: Prisma.CrmProspectWhereInput = {
    ...bookWhere(staffId),
    ...(q ? { name: { contains: q.slice(0, 80), mode: "insensitive" as const } } : {}),
    location: { is: { status: { in: ["GEOCODED", "VERIFIED"] }, latitude: { gte: bbox.south, lte: bbox.north }, longitude: { gte: bbox.west, lte: bbox.east } } },
  };
  const rows = await db.crmProspect.findMany({
    where, take: ROW_CEILING + 1, orderBy: { id: "asc" },
    select: { id: true, name: true, address: true, city: true, province: true, postalCode: true, location: true, opportunities: { select: { stage: true }, orderBy: { stageChangedAt: "desc" } } },
  });
  const truncated = rows.length > ROW_CEILING;
  const rules = await loadTerritoryRules();
  const production = isProductionEnvironment();
  const keys = actor.coverageTerritoryKeys ?? [];
  const usable: typeof rows = [];
  const pos = new Map<string, { lat: number; lng: number }>();
  for (const r of rows.slice(0, ROW_CEILING)) {
    const u = usableLocation(r.location, r, now, { production });
    if (!u.usable) continue;
    if (keys.length) { const rule = resolveTerritory(rules, r); if (rule && !keys.includes(rule.key)) continue; }
    usable.push(r); pos.set(r.id, u);
  }
  const f = await statusFacts(usable.map((r) => r.id));
  return {
    truncated,
    rows: usable.map((r) => ({
      id: r.id, name: r.name, city: r.city, lat: pos.get(r.id)!.lat, lng: pos.get(r.id)!.lng,
      status: mapStatusOf({ stage: bestStage(r.opportunities), lastVisitOutcome: f.lastVisit.get(r.id) ?? null, openTaskCount: f.openTasks.get(r.id) ?? 0, activityCount: f.activities.get(r.id) ?? 0 }),
    })),
  };
}

/** One map refresh: every prospect in the viewport, as markers (few) or clusters (many), plus honest counts. */
export async function loadViewport(actor: PlatformSalesActor, input: ViewportInput, now = new Date()): Promise<ViewportResult> {
  const { rows, truncated } = await locatedInBbox(actor, input.bbox, input.q, now);
  const byStatus = emptyCounts();
  for (const r of rows) byStatus[r.status]++;
  const allowed = new Set(input.statuses.length ? input.statuses : MAP_STATUSES);
  const matching = rows.filter((r) => allowed.has(r.status));
  const counts = { inView: rows.length, matching: matching.length, byStatus, truncated };
  // Individual markers when zoomed in (or only a handful are in view) and the payload stays small; clusters with exact counts otherwise.
  if (matching.length <= MAX_POINTS && (input.zoom >= POINT_ZOOM || matching.length <= FEW_POINTS)) return { mode: "points", points: matching, clusters: [], counts };
  return { mode: "clusters", points: [], clusters: clusterPoints(matching, input.zoom), counts };
}

export interface NearbyResult { points: (MapPointDto & { distanceM: number })[]; totalInRadius: number; unlocated: { total: number; byCoverage: Record<string, number> } }

/** Nearest located prospects to a point the seller chose (GPS fix with consent, a typed place…); never tracks the seller. */
export async function loadNearby(actor: PlatformSalesActor, center: { lat: number; lng: number }, radiusM: number, statuses: readonly MapStatus[], limit = 50, now = new Date()): Promise<NearbyResult> {
  if (!(center.lat >= CANADA_BBOX.south && center.lat <= CANADA_BBOX.north && center.lng >= CANADA_BBOX.west && center.lng <= CANADA_BBOX.east)) throw new CrmError("INVALID");
  const { rows } = await locatedInBbox(actor, bboxOfRadius(center, radiusM), undefined, now);
  const allowed = new Set(statuses.length ? statuses : MAP_STATUSES);
  const near = withinRadius(rows.filter((r) => allowed.has(r.status)), center, radiusM);
  return { points: near.slice(0, Math.min(limit, 100)).map(({ distanceM, ...p }) => ({ ...p, distanceM: Math.round(distanceM) })), totalInRadius: near.length, unlocated: await unlocatedCounts(actor, now) };
}

async function unlocatedCounts(actor: PlatformSalesActor, now: Date) {
  const s = await territorySummary(actor, now);
  return { total: s.total - s.located, byCoverage: { PENDING: s.coverage.PENDING, AMBIGUOUS_FAILED: s.coverage.AMBIGUOUS_FAILED, INSUFFICIENT_ADDRESS: s.coverage.INSUFFICIENT_ADDRESS } };
}

export interface TerritorySummary {
  /** Eligible prospects in the seller's authorized book (active, not DNC). */
  total: number; located: number;
  coverage: Record<"LOCATED" | "PENDING" | "AMBIGUOUS_FAILED" | "INSUFFICIENT_ADDRESS", number>;
  /** A short list of prospects the map cannot place yet (so the seller knows which ones are missing and why). */
  unlocatedSample: { id: string; name: string; city: string | null; address: string | null; coverage: string }[];
}

export async function territorySummary(actor: PlatformSalesActor, now = new Date()): Promise<TerritorySummary> {
  const staffId = requirePlanner(actor);
  const rows = await db.crmProspect.findMany({ where: bookWhere(staffId), select: { id: true, name: true, address: true, city: true, province: true, postalCode: true }, orderBy: [{ city: "asc" }, { name: "asc" }], take: 30000 });
  const [rules, states] = await Promise.all([loadTerritoryRules(), resolveLocationStates(rows, now)]);
  const coverage = { LOCATED: 0, PENDING: 0, AMBIGUOUS_FAILED: 0, INSUFFICIENT_ADDRESS: 0 };
  const sample: TerritorySummary["unlocatedSample"] = [];
  let total = 0;
  for (const r of rows) {
    if (!(await coverageOk(actor, r, rules))) continue;
    total++;
    const st = states.get(r.id)!;
    coverage[st.coverage]++;
    if (!st.location.usable && sample.length < 50) sample.push({ id: r.id, name: r.name, city: r.city, address: r.address, coverage: st.coverage });
  }
  return { total, located: coverage.LOCATED, coverage, unlocatedSample: sample };
}

export interface PlaceResult { label: string; center: { lat: number; lng: number }; bbox: Bbox; count: number }

/**
 * Free place search over the seller's OWN located prospects (postal code / FSA, city, street or neighbourhood text): returns the
 * area they cover. No paid geocoder is called; a place with none of the seller's prospects returns null and the UI says so.
 */
export async function searchPlace(actor: PlatformSalesActor, query: string, now = new Date()): Promise<PlaceResult | null> {
  const staffId = requirePlanner(actor);
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return null;
  const postal = normalizePostalQuery(q);
  const text = { contains: q, mode: "insensitive" as const };
  const or: Prisma.CrmProspectWhereInput[] = postal ? [{ postalCode: { startsWith: postal.slice(0, 3), mode: "insensitive" } }] : [{ city: text }, { address: text }, { postalCode: { startsWith: q.replace(/\s+/g, ""), mode: "insensitive" } }];
  const rows = await db.crmProspect.findMany({
    where: { ...bookWhere(staffId), OR: or, location: { is: { status: { in: ["GEOCODED", "VERIFIED"] } } } },
    select: { id: true, address: true, city: true, province: true, postalCode: true, location: true }, take: 500,
  });
  const production = isProductionEnvironment();
  const pts = rows.flatMap((r) => { const u = usableLocation(r.location, r, now, { production }); return u.usable ? [{ lat: u.lat, lng: u.lng }] : []; });
  if (!pts.length) return null;
  const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
  const pad = 0.004;
  return {
    label: q, center: { lat, lng }, count: pts.length,
    bbox: { west: Math.min(...pts.map((p) => p.lng)) - pad, east: Math.max(...pts.map((p) => p.lng)) + pad, south: Math.min(...pts.map((p) => p.lat)) - pad, north: Math.max(...pts.map((p) => p.lat)) + pad },
  };
}

export interface MapProspectDetail {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; lat: number | null; lng: number | null; status: MapStatus;
  lastVisit: { outcome: string; at: string } | null; nextTask: { title: string; dueAt: string } | null;
  /** The seller's pending stop for this prospect in the IN_PROGRESS route (so a result can be recorded in place), if any. */
  activeStopId: string | null; blocked: string | null;
}

/** Details for the tapped marker. Same ownership rule as everything else: another seller's prospect is indistinguishable from a missing one. */
export async function getMapProspect(actor: PlatformSalesActor, prospectId: string, now = new Date()): Promise<MapProspectDetail> {
  const staffId = requirePlanner(actor);
  const p = await db.crmProspect.findFirst({
    where: { id: prospectId, assignedStaffId: staffId },
    select: { id: true, name: true, address: true, city: true, province: true, postalCode: true, phone: true, status: true, archivedAt: true, mergedIntoId: true, doNotContact: true, assignedStaffId: true, location: true, opportunities: { select: { stage: true }, orderBy: { stageChangedAt: "desc" } } },
  });
  if (!p) throw new CrmError("NOT_FOUND");
  const [f, visit, task, stop] = await Promise.all([
    statusFacts([p.id]),
    db.crmActivity.findFirst({ where: { prospectId: p.id, type: "FIELD_VISIT", fieldVisitOutcome: { not: null } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], select: { fieldVisitOutcome: true, occurredAt: true } }),
    db.crmTask.findFirst({ where: { prospectId: p.id, status: "OPEN" }, orderBy: { dueAt: "asc" }, select: { title: true, dueAt: true } }),
    db.crmFieldRouteStop.findFirst({ where: { prospectId: p.id, status: "PENDING", route: { ownerStaffId: staffId, status: "IN_PROGRESS" } }, select: { id: true } }),
  ]);
  const u = usableLocation(p.location, p, now, { production: isProductionEnvironment() });
  return {
    id: p.id, name: p.name, address: [p.address, p.city].filter(Boolean).join(", ") || null, city: p.city, phone: p.phone, lat: u.usable ? u.lat : null, lng: u.usable ? u.lng : null,
    status: mapStatusOf({ stage: bestStage(p.opportunities), lastVisitOutcome: f.lastVisit.get(p.id) ?? null, openTaskCount: f.openTasks.get(p.id) ?? 0, activityCount: f.activities.get(p.id) ?? 0 }),
    lastVisit: visit?.fieldVisitOutcome ? { outcome: visit.fieldVisitOutcome, at: visit.occurredAt.toISOString() } : null,
    nextTask: task ? { title: task.title, dueAt: task.dueAt.toISOString() } : null,
    activeStopId: stop?.id ?? null, blocked: stopBlock(p, staffId),
  };
}
