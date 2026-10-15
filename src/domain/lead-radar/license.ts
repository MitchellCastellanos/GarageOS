// National Lead Radar — source licence policy (pure). A candidate is importable only when EVERY upstream source record behind it
// carries a licence on the allow-list. Anything unknown, missing or share-alike is blocked: "data available" ≠ "data usable".
//
// Observed on Overture release 2026-09-23.1 (Montréal + Calgary, 5,294 automotive records): CDLA-Permissive-2.0 (Overture, Meta,
// Microsoft, DAC), Apache-2.0 (Foursquare), CC0-1.0 (AllThePlaces). OpenStreetMap (ODbL-1.0) is NOT enabled: ODbL share-alike
// obligations are handled separately and require an owner/legal decision (see docs/lead-radar/licensing.md).

export const ALLOWED_LICENSES = ["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0", "MIT", "BSD-3-Clause", "CC-BY-4.0"] as const;
const ALLOWED = new Set<string>(ALLOWED_LICENSES.map((l) => l.toLowerCase()));
/** Licences that need attribution to be shown/kept with the data. */
const ATTRIBUTION_REQUIRED = new Set(["cc-by-4.0", "apache-2.0", "cdla-permissive-2.0"]);
/** Dataset names that are OpenStreetMap-derived, whatever licence string they carry. */
const OSM_DATASET = /(^|[^a-z])(osm|openstreetmap)([^a-z]|$)/i;

export interface SourceRef { dataset?: string | null; license?: string | null }
export type LicenseBlock = "NO_SOURCES" | "LICENSE_MISSING" | "LICENSE_NOT_ALLOWED" | "OSM_ODBL_DISABLED";
export interface LicenseVerdict { ok: boolean; blocks: LicenseBlock[]; licenses: string[]; datasets: string[]; attributionRequired: boolean }

export function evaluateLicenses(sources: readonly SourceRef[]): LicenseVerdict {
  const blocks = new Set<LicenseBlock>();
  const licenses = new Set<string>(), datasets = new Set<string>();
  if (!sources.length) blocks.add("NO_SOURCES");
  let attribution = false;
  for (const s of sources) {
    const lic = (s.license ?? "").trim(), ds = (s.dataset ?? "").trim();
    if (ds) datasets.add(ds.slice(0, 60));
    if (OSM_DATASET.test(ds) || /odbl/i.test(lic)) { blocks.add("OSM_ODBL_DISABLED"); if (lic) licenses.add(lic.slice(0, 40)); continue; }
    if (!lic) { blocks.add("LICENSE_MISSING"); continue; }
    licenses.add(lic.slice(0, 40));
    if (!ALLOWED.has(lic.toLowerCase())) blocks.add("LICENSE_NOT_ALLOWED");
    if (ATTRIBUTION_REQUIRED.has(lic.toLowerCase())) attribution = true;
  }
  return { ok: blocks.size === 0, blocks: [...blocks].sort(), licenses: [...licenses].sort(), datasets: [...datasets].sort(), attributionRequired: attribution };
}

/**
 * Which provider fields GarageOS may persist. Overture (permissive licences) → business facts. Google Places: only the place id
 * (Google's terms restrict caching other content), so it is registered here but no Google adapter persists anything else.
 */
export const PROVIDER_POLICY = {
  OVERTURE: { enabled: true, persist: ["id", "name", "address", "phone", "website", "email", "category", "confidence", "licenses", "datasets"] },
  CSV: { enabled: true, persist: ["*"] /* owner-supplied: governed by the lawfulSourceNote the importer already requires */ },
  OSM: { enabled: false, persist: [] as string[], reason: "ODbL share-alike not accepted yet" },
  GOOGLE_PLACES: { enabled: false, persist: ["id"], reason: "No live adapter; terms restrict storing content other than place ids" },
} as const;
export type ProviderKey = keyof typeof PROVIDER_POLICY;

export const OVERTURE_ATTRIBUTION = "Business data © Overture Maps Foundation and its source contributors (see licences recorded per candidate).";
