// Field Planner 2.0 map rules — pure (no DB, no Node imports): the seller-facing CRM status of a prospect, viewport validation,
// server-side grid clustering and radius filtering. The status is DERIVED from existing CRM data (opportunity stage, field-visit
// outcomes, open tasks, activity count); there is no parallel state to keep in sync.
import { distanceMeters } from "@/domain/sales-crm/geo";

export const MAP_STATUSES = ["PENDING", "NOT_VISITED", "ATTEMPTED", "FOLLOW_UP", "INTERESTED", "DEMO_SCHEDULED", "WON", "LOST"] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];
export const isMapStatus = (v: unknown): v is MapStatus => typeof v === "string" && (MAP_STATUSES as readonly string[]).includes(v);

/** Marker colours (also used for the legend). Chosen to stay distinguishable by lightness as well as hue. */
export const STATUS_COLOR: Record<MapStatus, string> = {
  PENDING: "#64748b", NOT_VISITED: "#94a3b8", ATTEMPTED: "#d97706", FOLLOW_UP: "#9333ea", INTERESTED: "#16a34a", DEMO_SCHEDULED: "#2563eb", WON: "#065f46", LOST: "#be123c",
};

export interface StatusFacts {
  /** Stage of the prospect's most relevant opportunity (open one preferred, else the latest closed), or null. */
  stage: string | null;
  /** Outcome of the most recent structured FIELD_VISIT, or null when the prospect was never visited. */
  lastVisitOutcome: string | null;
  openTaskCount: number;
  /** Any CRM activity at all (calls, emails, notes, visits). */
  activityCount: number;
}

const FOLLOW_UP_OUTCOMES = ["FOLLOW_UP_REQUIRED", "DECISION_MAKER_UNAVAILABLE"];
const LOST_OUTCOMES = ["NOT_INTERESTED", "CONTACT_REJECTED", "BUSINESS_CLOSED"];

/**
 * One mutually exclusive status per prospect, first match wins:
 *  WON → LOST → DEMO_SCHEDULED → INTERESTED → FOLLOW_UP → ATTEMPTED → NOT_VISITED → PENDING.
 *  NOT_VISITED: no field visit yet, but the CRM already holds other contact (call, email, note, stage beyond NEW).
 *  PENDING: never touched at all (no activity, stage NEW/none).
 * "Closing" outcomes (not interested, closed…) count as LOST even before the opportunity row moves, so the map never lags the visit.
 */
export function mapStatusOf(f: StatusFacts): MapStatus {
  const s = f.stage, o = f.lastVisitOutcome;
  if (s === "WON") return "WON";
  if (s === "LOST" || s === "UNQUALIFIED" || s === "DO_NOT_CONTACT" || (o && LOST_OUTCOMES.includes(o))) return "LOST";
  if (s === "DEMO_SCHEDULED" || s === "DEMO_COMPLETED" || s === "DECISION" || o === "DEMO_SCHEDULED") return "DEMO_SCHEDULED";
  if (s === "ENGAGED" || s === "QUALIFIED" || o === "INTERESTED" || o === "DEMO_DISCUSSED") return "INTERESTED";
  if (f.openTaskCount > 0 || (o && FOLLOW_UP_OUTCOMES.includes(o))) return "FOLLOW_UP";
  if (o) return "ATTEMPTED";
  if (s === "CONTACTED" || f.activityCount > 0) return "NOT_VISITED";
  return "PENDING";
}

export interface Bbox { west: number; south: number; east: number; north: number }

/** Validates a client-supplied viewport: finite, ordered, inside the Canada envelope (clamped), not absurdly large to ask for. */
export function parseBbox(raw: unknown): Bbox | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { west, south, east, north } = r as Record<string, number>;
  if (![west, south, east, north].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (west >= east || south >= north) return null;
  const b = { west: Math.max(west, -141.1), south: Math.max(south, 41.5), east: Math.min(east, -52), north: Math.min(north, 84) };
  return b.west < b.east && b.south < b.north ? b : null;
}

export const CANADA_BBOX: Bbox = { west: -141.1, south: 41.5, east: -52, north: 84 };

/** Zoom at which the server stops clustering and returns individual markers (as long as the result stays small enough). */
export const POINT_ZOOM = 14;
/** With this few matches in view, markers are shown at any zoom. */
export const FEW_POINTS = 40;
/** Hard ceiling of individual markers per response; above it the server clusters whatever the zoom. */
export const MAX_POINTS = 500;

export interface MapPointDto { id: string; name: string; city: string | null; lat: number; lng: number; status: MapStatus }
export interface GeoPoint { id: string; lat: number; lng: number }
export interface Cluster { lat: number; lng: number; count: number; ids: string[]; bbox: Bbox; statusCounts: Partial<Record<MapStatus, number>>; key: string }

/**
 * Deterministic square-grid clustering in lng/lat space. The cell size halves with every zoom level, so the number of clusters is
 * bounded (≈ viewport / cell) regardless of how many prospects exist. `ids` is capped so the payload stays small; `count` is exact.
 */
export function clusterPoints<T extends GeoPoint & { status: MapStatus }>(points: readonly T[], zoom: number, idCap = 12): Cluster[] {
  const cell = 360 / (256 * 2 ** Math.max(0, Math.min(22, zoom))) * 48; // ≈ 48 px at the given zoom
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const k = `${Math.floor(p.lng / cell)}:${Math.floor(p.lat / cell)}`;
    const g = cells.get(k); if (g) g.push(p); else cells.set(k, [p]);
  }
  const out: Cluster[] = [];
  for (const [key, g] of cells) {
    const statusCounts: Partial<Record<MapStatus, number>> = {};
    let lat = 0, lng = 0, west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (const p of g) {
      lat += p.lat; lng += p.lng; statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      west = Math.min(west, p.lng); east = Math.max(east, p.lng); south = Math.min(south, p.lat); north = Math.max(north, p.lat);
    }
    out.push({ lat: lat / g.length, lng: lng / g.length, count: g.length, ids: g.slice(0, idCap).map((p) => p.id), bbox: { west, south, east, north }, statusCounts, key });
  }
  return out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Keeps the points within `radiusM` of `center`, nearest first, with their distance. */
export function withinRadius<T extends GeoPoint>(points: readonly T[], center: { lat: number; lng: number }, radiusM: number): (T & { distanceM: number })[] {
  return points.map((p) => ({ ...p, distanceM: distanceMeters(center, p) })).filter((p) => p.distanceM <= radiusM).sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
}

/** Bounding box of a circle (for the cheap SQL pre-filter before the exact distance test). */
export function bboxOfRadius(center: { lat: number; lng: number }, radiusM: number): Bbox {
  const dLat = radiusM / 111_320, dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  return { west: center.lng - dLng, east: center.lng + dLng, south: center.lat - dLat, north: center.lat + dLat };
}

export const RADIUS_CHOICES_M = [1000, 2500, 5000, 10000, 25000] as const;
export const parseRadius = (v: unknown): number | null => (typeof v === "number" && (RADIUS_CHOICES_M as readonly number[]).includes(v) ? v : null);

/** Normalises a postal code / FSA for place search ("h3b 1a1" → "H3B 1A1" or "H3B"). */
export function normalizePostalQuery(q: string): string | null {
  const s = q.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]$/.test(s)) return s;
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3)}`;
  return null;
}
