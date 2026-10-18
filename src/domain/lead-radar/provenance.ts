// Email-level Overture provenance (pure). Overture's `sources[]` is a per-property attribution list: each item names the JSON-pointer `property` it covers ("" = the whole place),
// the `dataset` that supplied it, the dataset's `license`, the dataset-specific `record_id`, and the source record's `update_time`. We keep ONLY these normalised fields.
//
// What this proves and what it does not:
//   · A source item whose property points at /emails (or /emails/N for THIS address) is EMAIL-level provenance: it says which dataset supplied that address.
//   · An item at the root ("") or at other properties is PLACE-level provenance: it says where the business record came from, NOT where an individual address came from.
//   · A dataset or provider is an aggregator, not the original publisher. Neither level shows that the recipient published the address or authorised its publication, so
//     provenance by itself NEVER supports a CASL basis (see casl-evidence-engine.ts). It is kept for audit, rediscovery and to decide where to look for real evidence.
// Nothing is invented: a missing field stays null, and the raw record is never stored.
import { z } from "zod";

export const MAX_SOURCE_ITEMS = 30;
export const MAX_STORED_ITEMS = 6;

export const sourceItemSchema = z.object({
  property: z.string().max(120).nullish(),
  dataset: z.string().max(80).nullish(),
  license: z.string().max(60).nullish(),
  recordId: z.string().max(120).nullish(),
  updateTime: z.string().max(40).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});
export type SourceItem = { property: string; dataset: string | null; license: string | null; recordId: string | null; updateTime: string | null; confidence: number | null };

export type ProvenanceScope = "EMAIL" | "PLACE" | "NONE";

export interface EmailProvenance {
  /** EMAIL: a source item names this address. PLACE: only place-level items exist. NONE: the record carried no source items at all. */
  scope: ProvenanceScope;
  placeId: string;
  release: string | null;
  email: string;
  items: SourceItem[];
  /** Always false: a dataset/provider is not the original publisher, and no field in Overture says who published an address. */
  originalPublisherKnown: false;
}

const norm = (v: string | null | undefined): string | null => { const t = (v ?? "").trim(); return t ? t : null; };

export function normaliseSourceItems(raw: readonly z.infer<typeof sourceItemSchema>[] | null | undefined): SourceItem[] {
  return (raw ?? []).slice(0, MAX_SOURCE_ITEMS).map((s) => ({
    property: (s.property ?? "").trim(), dataset: norm(s.dataset), license: norm(s.license), recordId: norm(s.recordId), updateTime: norm(s.updateTime), confidence: s.confidence ?? null,
  }));
}

/** Does this JSON-pointer property cover the address at `index` of the place's email list? */
export function pointsAtEmail(property: string, index: number): boolean {
  if (property === "/emails") return true;
  const m = /^\/emails\/(\d+)(\/.*)?$/.exec(property);
  return !!m && Number(m[1]) === index;
}

/**
 * Provenance of ONE picked address. `emails` is the place's address list in source order (so the pointer index can be matched); `email` is the normalised pick.
 * Stored items are bounded and email-level when they exist; otherwise only the root/place-level items are kept (clearly labelled by `scope`).
 */
export function emailProvenanceOf(args: { placeId: string; release?: string | null; email: string; emailIndex: number; items: readonly SourceItem[] }): EmailProvenance {
  const direct = args.items.filter((i) => pointsAtEmail(i.property, args.emailIndex));
  const place = args.items.filter((i) => i.property === "" || !i.property.startsWith("/emails"));
  const scope: ProvenanceScope = direct.length ? "EMAIL" : place.length ? "PLACE" : "NONE";
  const chosen = (scope === "EMAIL" ? direct : scope === "PLACE" ? place : []).slice(0, MAX_STORED_ITEMS);
  return { scope, placeId: args.placeId, release: args.release ?? null, email: args.email, items: chosen, originalPublisherKnown: false };
}

/** Datasets that aggregate or republish third-party data. Informational (shown with the evidence); no dataset is ever treated as the recipient's own publication. */
const AGGREGATORS = new Set(["meta", "microsoft", "foursquare", "alltheplaces", "allthe places", "alltheplaces", "yelp", "google", "msft"]);
export const isAggregatorDataset = (d: string | null | undefined): boolean => AGGREGATORS.has((d ?? "").toLowerCase().replace(/[^a-z]/g, ""));
