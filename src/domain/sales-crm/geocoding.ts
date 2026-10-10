// Prospect location rules — pure (no DB, no network). Coordinates are never invented: a position exists only when a provider
// returned it with enough confidence, or a human verified it, and only for the exact address it was resolved for.
import { createHash } from "node:crypto";
import { postalKey, provinceCode } from "@/domain/sales-crm/territory";

export interface AddressParts { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }

const squash = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Canonical address text sent to a geocoder; null when there is nothing usable to resolve. A street alone (no city/postal) is not enough. */
export function geocodeQuery(a: AddressParts): string | null {
  const street = (a.address ?? "").trim(), city = (a.city ?? "").trim(), postal = postalKey(a.postalCode);
  if (!street || (!city && !postal)) return null;
  const prov = provinceCode(a.province) ?? (a.province ?? "").trim();
  return [street, city, prov, postal ? `${postal.slice(0, 3)} ${postal.slice(3)}`.trim() : "", "Canada"].filter(Boolean).join(", ");
}

/** Stable fingerprint of the address the coordinates belong to. Any change of street/city/province/postal code changes it. */
export function addressFingerprint(a: AddressParts): string {
  const key = [squash(a.address), squash(a.city), provinceCode(a.province) ?? squash(a.province), postalKey(a.postalCode)].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Rough Canada bounding box: a result outside it is a provider/parse error, not a position. */
export function inCanada(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 41.6 && lat <= 83.2 && lng >= -141.1 && lng <= -52.5;
}

export type GeocodeAccuracy = "ROOFTOP" | "RANGE" | "STREET" | "POSTAL_CODE" | "CITY";
export type GeocodeMatch = { lat: number; lng: number; accuracy: GeocodeAccuracy; confidence: number | null };
export type GeocodeResult =
  | { kind: "OK"; matches: GeocodeMatch[] }
  | { kind: "NOT_FOUND" }
  | { kind: "ERROR"; code: "RATE_LIMITED" | "PROVIDER_ERROR" | "TIMEOUT" | "DISABLED"; retryAfterMs?: number };

export const MIN_CONFIDENCE = 0.7;
/** Accuracy coarser than a street is not good enough to navigate to a shop door. */
const NAVIGABLE: readonly GeocodeAccuracy[] = ["ROOFTOP", "RANGE", "STREET"];

export type LocationDecision =
  | { status: "GEOCODED"; lat: number; lng: number; accuracy: GeocodeAccuracy; confidence: number | null }
  | { status: "AMBIGUOUS"; failureCode: string }
  | { status: "INVALID"; failureCode: string }
  | { status: "ERROR"; failureCode: string };

/** Turns a provider answer into a stored decision. Several distinct plausible matches, low confidence or coarse accuracy are never coordinates. */
export function decideLocation(r: GeocodeResult): LocationDecision {
  if (r.kind === "ERROR") return { status: "ERROR", failureCode: r.code };
  if (r.kind === "NOT_FOUND") return { status: "INVALID", failureCode: "NOT_FOUND" };
  const valid = r.matches.filter((m) => inCanada(m.lat, m.lng));
  if (!valid.length) return { status: "INVALID", failureCode: r.matches.length ? "OUTSIDE_CANADA" : "NOT_FOUND" };
  const best = [...valid].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  const rivals = valid.filter((m) => m !== best && distanceMeters(m, best) > 250 && (m.confidence ?? 0) >= (best.confidence ?? 0) - 0.1);
  if (rivals.length) return { status: "AMBIGUOUS", failureCode: "MULTIPLE_MATCHES" };
  if ((best.confidence ?? 1) < MIN_CONFIDENCE) return { status: "AMBIGUOUS", failureCode: "LOW_CONFIDENCE" };
  if (!NAVIGABLE.includes(best.accuracy)) return { status: "AMBIGUOUS", failureCode: "COARSE_ACCURACY" };
  return { status: "GEOCODED", lat: best.lat, lng: best.lng, accuracy: best.accuracy, confidence: best.confidence };
}

export interface LocationRow { status: string; latitude: number | null; longitude: number | null; addressFingerprint: string; geocodedAt: Date | null; provider: string }
export const COORDINATE_TTL_DAYS = 365;

export type Usable = { usable: true; lat: number; lng: number } | { usable: false; reason: "NONE" | "MISSING_ADDRESS" | "ADDRESS_CHANGED" | "STALE" | "AMBIGUOUS" | "INVALID" | "ERROR" | "SYNTHETIC_IN_PRODUCTION" };

/**
 * May this stored position be used to put the prospect on a route RIGHT NOW? It must belong to the prospect's CURRENT address
 * (fingerprint), be fresh, and — in production — not come from the synthetic test provider.
 */
export function usableLocation(loc: LocationRow | null, current: AddressParts, now: Date, opts: { production: boolean } = { production: false }): Usable {
  if (!geocodeQuery(current)) return { usable: false, reason: "MISSING_ADDRESS" };
  if (!loc) return { usable: false, reason: "NONE" };
  if (loc.addressFingerprint !== addressFingerprint(current)) return { usable: false, reason: "ADDRESS_CHANGED" };
  if (loc.status === "AMBIGUOUS") return { usable: false, reason: "AMBIGUOUS" };
  if (loc.status === "INVALID" || loc.status === "MISSING_ADDRESS") return { usable: false, reason: "INVALID" };
  if (loc.status === "ERROR") return { usable: false, reason: "ERROR" };
  if (loc.latitude === null || loc.longitude === null) return { usable: false, reason: "NONE" };
  if (opts.production && loc.provider === SYNTHETIC_PROVIDER) return { usable: false, reason: "SYNTHETIC_IN_PRODUCTION" };
  if (loc.status === "GEOCODED" && loc.geocodedAt && now.getTime() - loc.geocodedAt.getTime() > COORDINATE_TTL_DAYS * 86_400_000) return { usable: false, reason: "STALE" };
  return { usable: true, lat: loc.latitude, lng: loc.longitude };
}

export const SYNTHETIC_PROVIDER = "synthetic-test";

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Deterministic SYNTHETIC coordinates for fixtures only (never a real position): a hash of the address fingerprint placed on a
 * small grid around Montréal. It exists so the planner can be developed and tested without any geocoding provider.
 */
export function syntheticCoordinates(fingerprint: string): { lat: number; lng: number } {
  const n = (i: number) => parseInt(fingerprint.slice(i * 8, i * 8 + 8), 16) / 0xffffffff;
  return { lat: Math.round((45.35 + n(0) * 0.35) * 1e5) / 1e5, lng: Math.round((-74.0 + n(1) * 0.55) * 1e5) / 1e5 };
}
