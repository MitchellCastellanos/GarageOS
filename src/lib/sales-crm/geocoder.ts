import "server-only";
import { SYNTHETIC_PROVIDER, addressFingerprint, syntheticCoordinates, type AddressParts, type GeocodeResult } from "@/domain/sales-crm/geocoding";

/**
 * Provider abstraction. The planner only ever talks to this interface, so the geocoder the owner eventually approves can be
 * plugged in without touching routes, stops or UI. NO live provider is implemented or activated: the owner has not chosen one,
 * approved its terms (storage/caching of results) or its budget.
 */
export interface GeocodeProvider {
  key: string;
  geocode(query: string, address: AddressParts, signal: AbortSignal): Promise<GeocodeResult>;
}

export type GeocodingMode = "DISABLED" | "SYNTHETIC" | "PENDING_CONFIGURATION";
export interface GeocodingStatus {
  mode: GeocodingMode;
  /** True only when a real (live) provider is configured, authorized for production data and implemented. Always false today. */
  live: boolean;
  /** Machine-readable reason shown (localized) in the UI. */
  reason: "NO_PROVIDER_CONFIGURED" | "SYNTHETIC_TEST_ONLY" | "PROVIDER_NOT_IMPLEMENTED" | "SYNTHETIC_FORBIDDEN_IN_PRODUCTION";
}

const isProduction = () => process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV && process.env.GARAGEOS_ENV !== "staging");

/** Deterministic fixtures: never a real position. Refused in production, regardless of configuration. */
const syntheticProvider: GeocodeProvider = {
  key: SYNTHETIC_PROVIDER,
  async geocode(_q, address) {
    const c = syntheticCoordinates(addressFingerprint(address));
    return { kind: "OK", matches: [{ lat: c.lat, lng: c.lng, accuracy: "ROOFTOP", confidence: 0.99 }] };
  },
};

export function geocodingStatus(env: NodeJS.ProcessEnv = process.env, production = isProduction()): GeocodingStatus {
  const choice = (env.GEOCODING_PROVIDER ?? "").trim().toLowerCase();
  if (!choice || choice === "none" || choice === "disabled") return { mode: "DISABLED", live: false, reason: "NO_PROVIDER_CONFIGURED" };
  if (choice === "synthetic") return production ? { mode: "DISABLED", live: false, reason: "SYNTHETIC_FORBIDDEN_IN_PRODUCTION" } : { mode: "SYNTHETIC", live: false, reason: "SYNTHETIC_TEST_ONLY" };
  // Any other value names a live provider that has not been approved/implemented yet.
  return { mode: "PENDING_CONFIGURATION", live: false, reason: "PROVIDER_NOT_IMPLEMENTED" };
}

/** The provider to call, or null when geocoding is not available (callers must then leave locations untouched). */
export function activeGeocoder(): GeocodeProvider | null {
  return geocodingStatus().mode === "SYNTHETIC" ? syntheticProvider : null;
}

export const isProductionEnvironment = isProduction;
