// National Lead Radar — discovery scope & extraction plan (pure). The scope is what a Super Admin asks for; the plan is the
// deterministic, hash-addressed file the local extractor consumes, so extraction and ingestion can never drift apart.
import { createHash } from "node:crypto";
import { z } from "zod";
import { cityKey } from "@/domain/sales-crm/territory";
import { EXTRACTION_HINTS, PROVINCE_BBOX, PROVINCE_CODES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { CATEGORY_GROUPS, hierarchyForGroups, primariesForGroups } from "@/domain/lead-radar/taxonomy";

export const RELEASE_ID = /^\d{4}-\d{2}-\d{2}(\.\d{1,3})?$/;
export const MAX_SCOPE_CITIES = 50;

export const scopeSchema = z.object({
  provinces: z.array(z.enum(PROVINCE_CODES)).min(1).max(PROVINCE_CODES.length),
  /** Optional city allow-list (display names; matched on the same accent-insensitive key the CRM uses). Empty = whole province. */
  cities: z.array(z.string().trim().min(1).max(80)).max(MAX_SCOPE_CITIES).default([]),
  groups: z.array(z.enum(CATEGORY_GROUPS)).min(1).default(["REPAIR", "BODY_GLASS"]),
  /** Drop source records below this confidence (0–1) at extraction time. */
  minConfidence: z.number().min(0).max(1).default(0),
});
export type DiscoveryScope = z.infer<typeof scopeSchema>;

/** Canonical form: sorted, de-duplicated, city keys normalised. Equal intent ⇒ equal bytes ⇒ equal hash. */
export function canonicalScope(raw: unknown): DiscoveryScope {
  const s = scopeSchema.parse(raw);
  // One display name per city key; when several spellings collapse to the same key, the lexicographically smallest wins (order-independent).
  const byKey = new Map<string, string>();
  for (const c of s.cities) { const k = cityKey(c), v = c.trim(); if (k && (!byKey.has(k) || v < byKey.get(k)!)) byKey.set(k, v); }
  const cities = [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  return { provinces: [...new Set(s.provinces)].sort(), cities, groups: [...new Set(s.groups)].sort(), minConfidence: s.minConfidence };
}
export const planHashOf = (scope: DiscoveryScope) => createHash("sha256").update(JSON.stringify(scope)).digest("hex");

export interface ExtractionPlan {
  planVersion: 1;
  planHash: string;
  /** "latest" lets the extractor discover the newest release from the bucket; a pinned id reproduces an earlier extraction. */
  release: string;
  provinces: ProvinceCode[];
  bboxes: (readonly [number, number, number, number])[];
  cityKeys: string[];
  taxonomyPrimaries: string[];
  hierarchyAny: string[];
  minConfidence: number;
}
export function buildPlan(rawScope: unknown, release: string): ExtractionPlan {
  if (release !== "latest" && !RELEASE_ID.test(release)) throw new RangeError("INVALID_RELEASE");
  const scope = canonicalScope(rawScope);
  return {
    planVersion: 1, planHash: planHashOf(scope), release,
    provinces: scope.provinces, bboxes: scope.provinces.map((p) => PROVINCE_BBOX[p]),
    cityKeys: scope.cities.map(cityKey), taxonomyPrimaries: primariesForGroups(scope.groups), hierarchyAny: hierarchyForGroups(scope.groups),
    minConfidence: scope.minConfidence,
  };
}

/** Transfer the extractor will read (Parquet footers + the needed column chunks only), from measured hints. An upper bound. */
export function estimateWorkload(scope: DiscoveryScope): { rowGroups: number; megabytes: number; nationwide: boolean } {
  const all = scope.provinces.length === PROVINCE_CODES.length;
  if (all) return { rowGroups: EXTRACTION_HINTS.canada.rowGroups, megabytes: EXTRACTION_HINTS.canada.mb, nationwide: true };
  let rg = 0, mb = 0;
  for (const p of scope.provinces) { rg += EXTRACTION_HINTS.provinces[p].rowGroups; mb += EXTRACTION_HINTS.provinces[p].mb; }
  return { rowGroups: rg, megabytes: mb, nationwide: false };
}
/** A request is "significant" (owner approval gate #4) when it covers every province/territory or would read more than this. */
export const NATIONWIDE_MB_THRESHOLD = 300;

export const manifestSchema = z.object({
  extractor: z.string().max(60),
  extractorVersion: z.string().max(20),
  planHash: z.string().length(64),
  release: z.string().regex(RELEASE_ID),
  recordCount: z.number().int().min(0).max(2_000_000),
  fileSha256: z.string().length(64),
  generatedAt: z.string().max(40),
  stats: z.record(z.string().max(40), z.number()).default({}),
});
export type ExtractionManifest = z.infer<typeof manifestSchema>;
