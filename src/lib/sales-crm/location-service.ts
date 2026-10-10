import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { addressFingerprint, decideLocation, geocodeQuery, usableLocation, type Usable } from "@/domain/sales-crm/geocoding";
import { db } from "@/lib/db";
import { activeGeocoder, geocodingStatus, isProductionEnvironment } from "@/lib/sales-crm/geocoder";
import { CrmError } from "@/lib/sales-crm/prospects";
import { checkRateLimit } from "@/lib/rate-limit";

export const MAX_GEOCODE_BATCH = 25;
const GEOCODE_PER_HOUR = 100;
const ERROR_RETRY_MS = 10 * 60_000;
const PROVIDER_TIMEOUT_MS = 8_000;

export type GeocodeOutcome = "GEOCODED" | "CACHED" | "AMBIGUOUS" | "INVALID" | "MISSING_ADDRESS" | "ERROR" | "PROVIDER_DISABLED" | "RATE_LIMITED" | "NOT_ELIGIBLE";
export interface GeocodeItemResult { prospectId: string; outcome: GeocodeOutcome }

const ADDRESS_SELECT = { id: true, address: true, city: true, province: true, postalCode: true, status: true, doNotContact: true, mergedIntoId: true, archivedAt: true, assignedStaffId: true } as const;

/**
 * Resolves (or refreshes) the stored position of the actor's OWN assigned prospects. Safe by construction:
 *  - nothing is geocoded unless a provider is configured (none is live today → PROVIDER_DISABLED, rows untouched);
 *  - only the actor's own, active, non-DNC prospects are processed, at most 25 per call, rate-limited per seller;
 *  - an unchanged address with a decisive stored answer is served from the cache (no provider call);
 *  - coordinates are written only for a decisive provider answer; every other outcome stores NULL coordinates.
 */
export async function geocodeOwnProspects(actor: PlatformSalesActor, prospectIds: readonly string[], now = new Date()): Promise<GeocodeItemResult[]> {
  if (!actor.staffId) throw new CrmError("NOT_FOUND");
  const ids = [...new Set(prospectIds)].slice(0, MAX_GEOCODE_BATCH);
  const rows = await db.crmProspect.findMany({ where: { id: { in: ids }, assignedStaffId: actor.staffId }, select: ADDRESS_SELECT });
  const existing = await db.crmProspectLocation.findMany({ where: { prospectId: { in: rows.map((r) => r.id) } } });
  const locByProspect = new Map(existing.map((l) => [l.prospectId, l]));
  const provider = activeGeocoder();
  const out: GeocodeItemResult[] = ids.filter((i) => !rows.some((r) => r.id === i)).map((prospectId) => ({ prospectId, outcome: "NOT_ELIGIBLE" as const }));

  for (const p of rows) {
    if (p.status !== "ACTIVE" || p.doNotContact || p.mergedIntoId || p.archivedAt) { out.push({ prospectId: p.id, outcome: "NOT_ELIGIBLE" }); continue; }
    const fp = addressFingerprint(p), query = geocodeQuery(p), prior = locByProspect.get(p.id);
    if (!query) {
      await upsertLocation(p.id, { status: "MISSING_ADDRESS", provider: "none", addressFingerprint: fp, failureCode: "MISSING_ADDRESS" }, now);
      out.push({ prospectId: p.id, outcome: "MISSING_ADDRESS" }); continue;
    }
    // Cache: same address and a decisive, still-valid answer (or a recent transient error) → no provider call.
    if (prior && prior.addressFingerprint === fp) {
      const fresh = usableLocation(prior, p, now, { production: isProductionEnvironment() });
      if (fresh.usable || prior.status === "AMBIGUOUS" || prior.status === "INVALID") { out.push({ prospectId: p.id, outcome: "CACHED" }); continue; }
      if (prior.status === "ERROR" && now.getTime() - prior.lastAttemptAt.getTime() < ERROR_RETRY_MS) { out.push({ prospectId: p.id, outcome: "CACHED" }); continue; }
    }
    if (!provider) { out.push({ prospectId: p.id, outcome: "PROVIDER_DISABLED" }); continue; }
    const rl = await checkRateLimit({ key: `field-geocode:${actor.staffId}`, limit: GEOCODE_PER_HOUR, windowSec: 3600 }, now);
    if (!rl.allowed) { out.push({ prospectId: p.id, outcome: "RATE_LIMITED" }); continue; }

    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
    let result;
    try { result = await provider.geocode(query, p, ctl.signal); }
    catch { result = { kind: "ERROR", code: ctl.signal.aborted ? "TIMEOUT" : "PROVIDER_ERROR" } as const; }
    finally { clearTimeout(timer); }

    const d = decideLocation(result);
    if (d.status === "GEOCODED") {
      await upsertLocation(p.id, { status: "GEOCODED", provider: provider.key, addressFingerprint: fp, latitude: d.lat, longitude: d.lng, accuracy: d.accuracy, confidence: d.confidence, geocodedAt: now, failureCode: null }, now);
      out.push({ prospectId: p.id, outcome: "GEOCODED" });
    } else {
      await upsertLocation(p.id, { status: d.status, provider: provider.key, addressFingerprint: fp, failureCode: d.failureCode }, now);
      out.push({ prospectId: p.id, outcome: d.status });
    }
  }
  return out;
}

type LocationWrite = {
  status: "GEOCODED" | "AMBIGUOUS" | "INVALID" | "MISSING_ADDRESS" | "ERROR"; provider: string; addressFingerprint: string;
  latitude?: number; longitude?: number; accuracy?: "ROOFTOP" | "RANGE" | "STREET" | "POSTAL_CODE" | "CITY"; confidence?: number | null; geocodedAt?: Date; failureCode?: string | null;
};
async function upsertLocation(prospectId: string, w: LocationWrite, now: Date) {
  // Coordinates are replaced wholesale: any non-success clears the previous position so a stale one can never survive an address change.
  const data = {
    status: w.status, provider: w.provider, addressFingerprint: w.addressFingerprint,
    latitude: w.latitude ?? null, longitude: w.longitude ?? null, accuracy: w.accuracy ?? null, confidence: w.confidence ?? null,
    geocodedAt: w.geocodedAt ?? null, failureCode: w.failureCode ?? null, lastAttemptAt: now, verifiedAt: null, verifiedByUserId: null,
  };
  await db.crmProspectLocation.upsert({ where: { prospectId }, create: { prospectId, attempts: 1, ...data }, update: { ...data, attempts: { increment: 1 } } });
}

/** Usable position (or the reason there is none) for each prospect, judged against its CURRENT address. */
export async function resolveLocations(prospects: readonly { id: string; address: string | null; city: string | null; province: string | null; postalCode: string | null }[], now = new Date()): Promise<Map<string, Usable>> {
  const locs = await db.crmProspectLocation.findMany({ where: { prospectId: { in: prospects.map((p) => p.id) } } });
  const byId = new Map(locs.map((l) => [l.prospectId, l]));
  const production = isProductionEnvironment();
  return new Map(prospects.map((p) => [p.id, usableLocation(byId.get(p.id) ?? null, p, now, { production })]));
}

export { geocodingStatus };
