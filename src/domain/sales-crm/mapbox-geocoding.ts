// Mapbox Geocoding API v6 — pure request building and response interpretation (no network, no DB, no secrets).
// Results are only ever requested with `permanent=true` (Mapbox "Permanent Geocoding"), the only mode whose results may be stored.
import { canonicalAddress, isRoutableAddress } from "@/domain/sales-crm/address";
import { usableLocation, type AddressParts, type GeocodeAccuracy, type GeocodeMatch, type GeocodeResult, type LocationRow } from "@/domain/sales-crm/geocoding";

export const MAPBOX_PROVIDER_KEY = "mapbox-permanent-v6";
export const MAPBOX_FORWARD_URL = "https://api.mapbox.com/search/geocode/v6/forward";

/** Query string for one forward lookup. The token is appended by the caller (server side) and never logged. */
export function mapboxForwardParams(query: string): URLSearchParams {
  const p = new URLSearchParams();
  p.set("q", query);
  p.set("country", "ca");
  p.set("types", "address,street");
  p.set("limit", "3");
  p.set("autocomplete", "false");
  p.set("permanent", "true");
  return p;
}

const CONFIDENCE: Record<string, number> = { exact: 0.95, high: 0.85, medium: 0.6, low: 0.3 };

const ACCURACY: Record<string, GeocodeAccuracy> = {
  rooftop: "ROOFTOP", parcel: "ROOFTOP", point: "ROOFTOP", interpolated: "RANGE",
  // Anything vaguer than an interpolated street number is not good enough to navigate to a shop door → manual review.
  approximate: "POSTAL_CODE", intersection: "STREET",
};

interface MapboxFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    feature_type?: unknown;
    coordinates?: { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
    match_code?: Record<string, unknown>;
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Interprets one v6 feature against the address we asked about. Confidence is the provider's own `match_code.confidence`,
 * capped when a component we KNOW about (civic number, postal code, city) did not match: a fuzzy match on the wrong
 * street number must never become a coordinate.
 */
export function mapboxFeatureToMatch(f: MapboxFeature, asked: AddressParts): GeocodeMatch | null {
  const props = f.properties ?? {};
  const lat = num(props.coordinates?.latitude) ?? (Array.isArray(f.geometry?.coordinates) ? num((f.geometry!.coordinates as unknown[])[1]) : null);
  const lng = num(props.coordinates?.longitude) ?? (Array.isArray(f.geometry?.coordinates) ? num((f.geometry!.coordinates as unknown[])[0]) : null);
  if (lat === null || lng === null) return null;

  const mc = props.match_code ?? {};
  let confidence = mc.confidence === undefined ? 0.5 : CONFIDENCE[str(mc.confidence)] ?? 0.3;
  const want = canonicalAddress(asked);
  if (want.hasCivic && str(mc.address_number) !== "matched") confidence = Math.min(confidence, 0.5);
  if (want.postalKey && str(mc.postcode) === "unmatched") confidence = Math.min(confidence, 0.6);
  if (want.cityKey && str(mc.place) === "unmatched") confidence = Math.min(confidence, 0.6);
  if (str(mc.country) === "unmatched" || str(mc.region) === "unmatched") confidence = Math.min(confidence, 0.4);

  const acc = str(props.coordinates?.accuracy);
  let accuracy: GeocodeAccuracy = ACCURACY[acc] ?? (str(props.feature_type) === "street" ? "STREET" : "POSTAL_CODE");
  // A street-level feature when we asked for a numbered address means the civic number was not found.
  if (want.hasCivic && str(props.feature_type) === "street") accuracy = "STREET";
  return { lat, lng, accuracy, confidence };
}

/** Maps an HTTP status + parsed body to the provider-neutral result. `AUTH` and `RATE_LIMITED` abort a whole batch upstream. */
export function mapboxResponseToResult(status: number, body: unknown, asked: AddressParts, retryAfterSec?: number): GeocodeResult {
  if (status === 401 || status === 403) return { kind: "ERROR", code: "AUTH" };
  if (status === 429) return { kind: "ERROR", code: "RATE_LIMITED", retryAfterMs: retryAfterSec ? retryAfterSec * 1000 : undefined };
  if (status < 200 || status >= 300) return { kind: "ERROR", code: "PROVIDER_ERROR" };
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return { kind: "ERROR", code: "PROVIDER_ERROR" };
  const matches = features.map((f) => mapboxFeatureToMatch(f as MapboxFeature, asked)).filter((m): m is GeocodeMatch => !!m);
  return matches.length ? { kind: "OK", matches } : { kind: "NOT_FOUND" };
}

/** Is the address precise enough to spend a paid request on? A street without a civic number cannot locate a shop door. */
export function isGeocodableAddress(a: AddressParts): boolean {
  const c = canonicalAddress(a);
  return isRoutableAddress(c.quality) && c.hasCivic;
}

/** Why an address is NOT sent to the provider (shown in the manual-review list). null = it can be sent. */
export function addressReviewReason(a: AddressParts): "NO_STREET" | "NO_CIVIC_NUMBER" | "NO_CITY_OR_POSTAL" | null {
  const c = canonicalAddress(a);
  if (!c.street) return "NO_STREET";
  if (!c.hasCivic) return "NO_CIVIC_NUMBER";
  if (!c.cityKey && !c.postalKey) return "NO_CITY_OR_POSTAL";
  return null;
}

// ── Admin geocoding queue classification (pure) ────────────────────────────────────────────────────────────────────
export const MAX_GEOCODE_ATTEMPTS = 3;
export const TEST_BATCH_MAX = 5;
export const BATCH_MAX = 25;

export type QueueClass =
  | { kind: "READY" }
  /** Needs exactly one paid request: never located, address changed since, position older than the TTL, or a synthetic position in production. */
  | { kind: "TO_GEOCODE" }
  /** Transient provider failure with attempts left: only requested again on an explicit retry. */
  | { kind: "ERROR_RETRY" }
  /** Needs a human: the provider answer was ambiguous / low confidence / not found / repeatedly failing. No request is spent until the address changes or an admin retries. */
  | { kind: "REVIEW"; reason: "AMBIGUOUS" | "NOT_FOUND" | "ERROR_EXHAUSTED" }
  /** Not sent to the provider at all (no request spent). */
  | { kind: "INCOMPLETE"; reason: NonNullable<ReturnType<typeof addressReviewReason>> };

export interface QueueLocation extends LocationRow { attempts: number }

export function classifyForGeocoding(address: AddressParts, loc: QueueLocation | null, now: Date, opts: { production: boolean }): QueueClass {
  const incomplete = addressReviewReason(address);
  if (incomplete) return { kind: "INCOMPLETE", reason: incomplete };
  const u = usableLocation(loc, address, now, opts);
  if (u.usable) return { kind: "READY" };
  switch (u.reason) {
    case "AMBIGUOUS": return { kind: "REVIEW", reason: "AMBIGUOUS" };
    case "INVALID": return { kind: "REVIEW", reason: "NOT_FOUND" };
    case "ERROR": return (loc?.attempts ?? 0) < MAX_GEOCODE_ATTEMPTS ? { kind: "ERROR_RETRY" } : { kind: "REVIEW", reason: "ERROR_EXHAUSTED" };
    default: return { kind: "TO_GEOCODE" };
  }
}
