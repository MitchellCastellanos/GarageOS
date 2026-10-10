// Route ordering — pure and deterministic. Straight-line (great-circle) distance only: this is NOT driving distance and carries
// no traffic data. Nearest-neighbour builds the first order, 2-opt shortens it. Same input → same output, always.
import { distanceMeters } from "@/domain/sales-crm/geo";

export const MAX_ROUTE_STOPS = 25;
export interface RoutePoint { id: string; lat: number; lng: number }
export interface OptimizedRoute { order: string[]; distanceM: number }

const d = (a: RoutePoint, b: RoutePoint) => distanceMeters(a, b);

/** Length of the open path visiting `points` in the given order (no return leg). */
export function pathLengthM(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += d(points[i - 1], points[i]);
  return Math.round(total);
}

/** Order by `ids` (unknown ids are ignored); used to measure a manual order. */
export function lengthOfOrder(points: readonly RoutePoint[], ids: readonly string[]): number {
  const byId = new Map(points.map((p) => [p.id, p]));
  return pathLengthM(ids.map((i) => byId.get(i)).filter((p): p is RoutePoint => !!p));
}

/**
 * @param startId optional stop to visit first (e.g. the seller's first appointment or nearest to them). Without one, the
 *   north-western-most stop (max lat, then min lng, then id) starts the route so the result never depends on input order.
 */
export function optimizeRoute(points: readonly RoutePoint[], startId?: string | null): OptimizedRoute {
  if (points.length > MAX_ROUTE_STOPS) throw new RangeError(`A route supports at most ${MAX_ROUTE_STOPS} stops`);
  if (new Set(points.map((p) => p.id)).size !== points.length) throw new RangeError("Duplicate stop");
  const pts = [...points].sort((a, b) => a.id.localeCompare(b.id)); // canonical order → input order is irrelevant
  if (pts.length <= 2 && !startId) {
    const sorted = [...pts].sort((a, b) => b.lat - a.lat || a.lng - b.lng || a.id.localeCompare(b.id));
    return { order: sorted.map((p) => p.id), distanceM: pathLengthM(sorted) };
  }
  const first = (startId && pts.find((p) => p.id === startId)) || [...pts].sort((a, b) => b.lat - a.lat || a.lng - b.lng || a.id.localeCompare(b.id))[0];

  // nearest neighbour (ties → smaller id)
  const rest = pts.filter((p) => p !== first);
  const path: RoutePoint[] = [first];
  while (rest.length) {
    const last = path[path.length - 1];
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => { const dist = d(last, p); if (dist < bd - 1e-9 || (Math.abs(dist - bd) <= 1e-9 && p.id < rest[bi].id)) { bd = dist; bi = i; } });
    path.push(rest.splice(bi, 1)[0]);
  }

  // 2-opt on the open path with the first stop pinned (first improvement, bounded passes → terminates and is repeatable)
  let improved = true, guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) {
      for (let k = i + 1; k < path.length; k++) {
        const before = d(path[i - 1], path[i]) + (k + 1 < path.length ? d(path[k], path[k + 1]) : 0);
        const after = d(path[i - 1], path[k]) + (k + 1 < path.length ? d(path[i], path[k + 1]) : 0);
        if (after < before - 1e-6) {
          const seg = path.slice(i, k + 1).reverse();
          path.splice(i, k - i + 1, ...seg);
          improved = true;
        }
      }
    }
  }
  return { order: path.map((p) => p.id), distanceM: pathLengthM(path) };
}

/** Human label for an estimate. Always straight-line; the UI must say so. */
export function formatKm(distanceM: number): string {
  return distanceM < 950 ? `${Math.round(distanceM / 10) * 10} m` : `${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;
}
