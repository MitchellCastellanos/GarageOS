// Prospect locations that come from the SOURCE record (Overture Maps place point) instead of a paid geocoder — pure (no DB, no network).
// A source point is accepted only when it is plausible for the prospect's own province, belongs to the prospect's CURRENT address
// (fingerprint) and cannot displace a better position. Nothing is ever invented: every doubtful case is a SKIP with a reason.
import { PROVINCE_BBOX, isProvinceCode } from "@/domain/lead-radar/geo";
import { addressFingerprint, geocodeQuery, inCanada, usableLocation, type AddressParts, type GeocodeAccuracy, type LocationRow } from "@/domain/sales-crm/geocoding";
import { addressReviewReason, classifyForGeocoding, type QueueLocation } from "@/domain/sales-crm/mapbox-geocoding";

/** Provenance string stored in CrmProspectLocation.provider for positions taken from the Overture place point. */
export const OVERTURE_LOCATION_PROVIDER = "overture-places-v1";
/**
 * Overture places carry a point of unknown positional quality (building level for some contributors, street level for others), so it is
 * recorded as STREET — "good enough to navigate to the right block", never ROOFTOP — and with no provider confidence score.
 */
export const SOURCE_LOCATION_ACCURACY: GeocodeAccuracy = "STREET";

export type SourceCoordinateIssue = "NO_SOURCE_COORDINATES" | "OUT_OF_CANADA" | "OUT_OF_PROVINCE";

/** Is this point a believable position for a business whose province is `province`? Coarse by design (province boxes include border areas). */
export function checkSourceCoordinates(lat: number | null | undefined, lng: number | null | undefined, province: string | null | undefined): { ok: true } | { ok: false; issue: SourceCoordinateIssue } {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, issue: "NO_SOURCE_COORDINATES" };
  if (!inCanada(lat, lng)) return { ok: false, issue: "OUT_OF_CANADA" };
  if (isProvinceCode(province)) {
    const [minLng, minLat, maxLng, maxLat] = PROVINCE_BBOX[province];
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return { ok: false, issue: "OUT_OF_PROVINCE" };
  }
  return { ok: true };
}

/** How much a stored position can be trusted, higher wins. A human confirmation > a paid geocoder's decisive answer > a source point > test data. */
export function locationTrust(loc: { status: string; provider: string }): number {
  if (loc.status === "VERIFIED") return 100;
  if (loc.status !== "GEOCODED") return 0;
  if (loc.provider === OVERTURE_LOCATION_PROVIDER) return 30;
  if (loc.provider.startsWith("mapbox")) return 50;
  return 10;
}
export const SOURCE_LOCATION_TRUST = 30;

export type SourceLocationSkip =
  | SourceCoordinateIssue
  | "INSUFFICIENT_ADDRESS"
  /** The candidate's address is not the prospect's address (linked/merged record): its point would be a different place. */
  | "ADDRESS_MISMATCH"
  /** A usable position for the current address already exists (idempotent re-run, or a better one). */
  | "ALREADY_LOCATED"
  | "HIGHER_CONFIDENCE_EXISTS";

export type SourceLocationDecision =
  | { action: "WRITE"; lat: number; lng: number; fingerprint: string; replaces: "NOTHING" | "UNUSABLE" }
  | { action: "SKIP"; reason: SourceLocationSkip };

export interface SourceLocationInput {
  source: { lat: number | null | undefined; lng: number | null | undefined };
  /** The prospect's CURRENT address (what the position will be bound to). */
  prospect: AddressParts & { province?: string | null };
  /** The address the source record described. Omit only when the prospect was created from that very record in the same step. */
  sourceAddress?: AddressParts | null;
  existing: LocationRow | null;
  now: Date;
  production: boolean;
}

export function decideSourceLocation(i: SourceLocationInput): SourceLocationDecision {
  const sane = checkSourceCoordinates(i.source.lat, i.source.lng, i.prospect.province);
  if (!sane.ok) return { action: "SKIP", reason: sane.issue };
  if (!geocodeQuery(i.prospect)) return { action: "SKIP", reason: "INSUFFICIENT_ADDRESS" };
  const fingerprint = addressFingerprint(i.prospect);
  if (i.sourceAddress && addressFingerprint(i.sourceAddress) !== fingerprint) return { action: "SKIP", reason: "ADDRESS_MISMATCH" };
  if (i.existing) {
    const u = usableLocation(i.existing, i.prospect, i.now, { production: i.production });
    if (u.usable) return { action: "SKIP", reason: locationTrust(i.existing) > SOURCE_LOCATION_TRUST ? "HIGHER_CONFIDENCE_EXISTS" : "ALREADY_LOCATED" };
    return { action: "WRITE", lat: i.source.lat as number, lng: i.source.lng as number, fingerprint, replaces: "UNUSABLE" };
  }
  return { action: "WRITE", lat: i.source.lat as number, lng: i.source.lng as number, fingerprint, replaces: "NOTHING" };
}

// ── Field Planner coverage (what the seller sees) ──────────────────────────────────────────────────────────────────────
export type LocationCoverage = "LOCATED" | "PENDING" | "AMBIGUOUS_FAILED" | "INSUFFICIENT_ADDRESS";

/**
 * One of four buckets for a prospect, judged against its CURRENT address:
 *  LOCATED — has a usable map position; PENDING — will be located automatically (source point or geocoder not applied yet, or a retryable failure);
 *  AMBIGUOUS_FAILED — the geocoder could not decide / could not find it, or kept failing: needs the address corrected, no coordinates invented;
 *  INSUFFICIENT_ADDRESS — no street number / city or postal code to look up.
 */
export function locationCoverage(address: AddressParts, loc: QueueLocation | null, now: Date, opts: { production: boolean }): LocationCoverage {
  if (addressReviewReason(address)) return "INSUFFICIENT_ADDRESS";
  const c = classifyForGeocoding(address, loc, now, opts);
  switch (c.kind) {
    case "READY": return "LOCATED";
    case "INCOMPLETE": return "INSUFFICIENT_ADDRESS";
    case "REVIEW": return "AMBIGUOUS_FAILED";
    default: return "PENDING"; // TO_GEOCODE, ERROR_RETRY
  }
}
