import "server-only";
import { SYNTHETIC_PROVIDER, addressFingerprint, syntheticCoordinates, type AddressParts, type GeocodeResult } from "@/domain/sales-crm/geocoding";
import { MAPBOX_FORWARD_URL, MAPBOX_PROVIDER_KEY, mapboxForwardParams, mapboxResponseToResult } from "@/domain/sales-crm/mapbox-geocoding";

/**
 * Provider abstraction. The planner only ever talks to this interface. Providers:
 *  - "synthetic": deterministic test fixtures (refused in production);
 *  - "mapbox": Mapbox Geocoding API v6 with Permanent Geocoding (`permanent=true`), the only mode whose results may be stored.
 *    It is reachable ONLY through the Super Admin geocoding service (explicit, budget-guarded, never on page load or deployment).
 */
export interface GeocodeProvider {
  key: string;
  geocode(query: string, address: AddressParts, signal: AbortSignal): Promise<GeocodeResult>;
}

export type GeocodingMode = "DISABLED" | "SYNTHETIC" | "PENDING_CONFIGURATION" | "LIVE";
export interface GeocodingStatus {
  mode: GeocodingMode;
  /** True only when Mapbox is selected, its server token is present AND the environment switch is on. The owner budget (database) is a further gate. */
  live: boolean;
  /** Machine-readable reason shown (localized) in the UI. */
  reason: "NO_PROVIDER_CONFIGURED" | "SYNTHETIC_TEST_ONLY" | "PROVIDER_NOT_IMPLEMENTED" | "SYNTHETIC_FORBIDDEN_IN_PRODUCTION" | "MISSING_CREDENTIALS" | "DISABLED_BY_ENV" | "LIVE_ADMIN_ONLY";
}

export const DEFAULT_MAX_REQUESTS_HARD_CAP = 500;
/** Absolute ceiling on the owner-set budget. Env-controlled so raising it is a deliberate deployment decision. */
export function maxRequestsHardCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.GEOCODING_MAX_REQUESTS_HARD_CAP ?? "", 10);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 100_000) : DEFAULT_MAX_REQUESTS_HARD_CAP;
}

const mapboxToken = (env: NodeJS.ProcessEnv) => (env.MAPBOX_GEOCODING_TOKEN ?? "").trim();
/** Mapbox secret tokens start with "sk."; a public "pk." token is accepted too, but only a URL-unrestricted secret token is meant here. */
const validMapboxToken = (t: string) => /^(sk|pk)\.[A-Za-z0-9_.-]{20,}$/.test(t);

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
  if (choice === "mapbox") {
    if (!validMapboxToken(mapboxToken(env))) return { mode: "PENDING_CONFIGURATION", live: false, reason: "MISSING_CREDENTIALS" };
    if ((env.MAPBOX_GEOCODING_ENABLED ?? "").trim().toLowerCase() !== "true") return { mode: "DISABLED", live: false, reason: "DISABLED_BY_ENV" };
    return { mode: "LIVE", live: true, reason: "LIVE_ADMIN_ONLY" };
  }
  // Any other value names a provider that is not implemented.
  return { mode: "PENDING_CONFIGURATION", live: false, reason: "PROVIDER_NOT_IMPLEMENTED" };
}

/**
 * Mapbox v6 forward geocoder with Permanent Geocoding. The token is read from the server environment only; it is placed in the
 * request URL (Mapbox's scheme) but never logged, never returned and never included in an error. `fetchImpl` is injectable so tests
 * never touch the network.
 */
export function createMapboxProvider(token: string, fetchImpl: typeof fetch = fetch): GeocodeProvider {
  return {
    key: MAPBOX_PROVIDER_KEY,
    async geocode(query, address, signal) {
      const params = mapboxForwardParams(query);
      params.set("access_token", token);
      let res: Response;
      try { res = await fetchImpl(`${MAPBOX_FORWARD_URL}?${params.toString()}`, { signal, cache: "no-store", headers: { accept: "application/json" } }); }
      catch { return { kind: "ERROR", code: signal.aborted ? "TIMEOUT" : "PROVIDER_ERROR" }; }
      let body: unknown = null;
      try { body = await res.json(); } catch { body = null; }
      const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      return mapboxResponseToResult(res.status, body, address, Number.isFinite(retryAfter) ? retryAfter : undefined);
    },
  };
}

/** The live provider, or null unless Mapbox is fully configured and switched on. ONLY the Super Admin geocoding service uses this. */
export function liveGeocoder(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): GeocodeProvider | null {
  return geocodingStatus(env).mode === "LIVE" ? createMapboxProvider(mapboxToken(env), fetchImpl) : null;
}

/** The provider the SELLER-facing "locate" button may call: synthetic fixtures only (never a paid provider), or null. */
export function activeGeocoder(): GeocodeProvider | null {
  return geocodingStatus().mode === "SYNTHETIC" ? syntheticProvider : null;
}

export const isProductionEnvironment = isProduction;
