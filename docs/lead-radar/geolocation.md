# Lead Radar → Field Planner: automatic prospect geolocation

Legend: **Verified** (code + tests + local build) · **Estimate** (reasoned, not observed on production) · **Not verified** (never observed) · **Owner action** (needs the owner).
Production access note: engineering has no production database access. Every production number below is **Not verified**; the owner's screenshot (70 positioned / 225 hidden) is the only production observation.

## 1. Root cause of the 225 hidden prospects (Verified by reading the code)
1. **Overture does provide a position, and GarageOS threw it away.** Overture places are point features. The extractor already reads each row's `bbox` (for a point, `xmin = xmax`, `ymin = ymax`) to prune Parquet row groups, but `to_record()` whitelisted only name/taxonomy/address/phone/…, so the point never left the owner's PC. Record schema v1 had no coordinate field.
2. `CrmDiscoveryCandidate` (staging) had no coordinate columns, so even a point in the file would have had nowhere to live.
3. The import bridge builds the same CSV the Sales CRM importer reads (`IMPORT_HEADERS` has no lat/lng), and `applyImportBatch` only creates prospects. `CrmProspectLocation` — the only thing the Field Planner reads — was written **only** by the Mapbox geocoder (or a synthetic test provider, refused in production).
4. The Mapbox geocoder is correctly locked down: it needs the env switch **and** a DB `enabled` flag **and** an owner request budget (default 0), and it only ran when a Super Admin pressed a button. Nothing ran it for the Lead Radar prospects. Result: imported prospects never got a `CrmProspectLocation`, so `usableLocation()` returned `NONE` and the planner hid them ("hidden — no map position yet").
5. Why exactly 70 are positioned is **Not verified** (most likely earlier admin geocoding runs or prospects with positions entered before Lead Radar).

## 2. What was built (Verified: tsc, eslint 0 errors, 964 unit tests, 6 DB suites on scratch Postgres, `next build`)
| Layer | Change |
|---|---|
| Extractor `overture_extract.py` 1.1.0 | `source_point()`: emits `geo:{lat,lng}` only for a degenerate (point-like), finite, in-range bbox. Additive to schema v1. Python tests added. |
| Record normalisation `record.ts` | Optional `geo`; kept only if inside Canada **and** the prospect's province box; otherwise dropped (record still stages). **Not** part of `contentFingerprint`, so a refreshed point never re-opens an approval or re-qualifies. |
| Staging `staging.ts` + migration `20261017090000_prospect_source_coordinates` | `CrmDiscoveryCandidate.sourceLatitude/sourceLongitude` (nullable, both-or-neither, Canada-box CHECK). Additive, no data change. Refreshes imported candidates too (only these two columns). A run without a point never clears one. |
| Import `import-service.ts` | After a prospect is created/linked, `locateFromSource()` writes the position **inside the import transaction**. Free, no network. Counts in the import audit metadata (`positions`). |
| `domain/sales-crm/source-location.ts` | Pure rules: plausibility, address binding (fingerprint), trust order, idempotence, coverage buckets. |
| `lib/sales-crm/source-location-service.ts` | `locateFromSource`, `runSourceLocationBackfill` (Super Admin, **dry-run by default**, keyset pages ≤ 500, cursor), `locationCoverageSummary`. |
| Super Admin UI (Settings → Geocoding) | "Positions from Lead Radar (free)": coverage tiles, **Preview (dry run)**, **Apply next page**. |
| Lead Radar tick `automation.ts` | New `locate` stage → `autoGeocodeStep()`: the *paid* Mapbox fallback for assigned prospects the source could not locate. **Inert unless** Mapbox env is configured **and** a Super Admin enabled geocoding **and** budget remains (today: none of these). |
| Field Planner | Coverage indicator (Located / Locating automatically / Ambiguous or not found / Address incomplete) in EN+FR; routes, filters, optimiser unchanged. |

### Rules that protect data
* **Zero cost first.** A prospect with a usable source position is `READY` for the geocoder, so no request is ever spent on it.
* **Never downgrade.** Trust order: human `VERIFIED` (100) > Mapbox permanent (50) > Overture point (30). A source point is written only when there is no row, or the row is unusable (failed/ambiguous/invalid, address changed, expired, synthetic in production). It never replaces a usable row; a re-run is a no-op (compare-and-set on `updatedAt` if a geocoder batch races).
* **Never invent.** Missing point, outside Canada, outside the prospect's province box, incomplete address (needs a street with number + city or postal code), or a linked prospect whose address differs from the candidate's → skipped with a reason, no row written.
* **Provenance** is stored per row: `provider = overture-places-v1`, `accuracy = STREET` (never claimed ROOFTOP), `confidence = null`, `geocodedAt`. Mapbox rows keep their own provider/confidence/accuracy.
* **Boundaries.** Writes only `CrmProspectLocation`. No change to assignment, status, DNC, outreach eligibility, contacts, sending bases or the prospect row (asserted byte-for-byte in a DB test). The backfill needs `manage_geocoding` (Super Admin); sellers see only their own assigned prospects in the planner. Prospects that are inactive, archived, merged or DNC are skipped.
* **Licensing.** Overture's permissive licences (the same allow-list used for import) cover storing place data including geometry; `PROVIDER_POLICY.OVERTURE.persist` now lists `coordinates`. Candidates with `licenseOk = false` are never imported nor located. OSM/ODbL-derived sources stay disabled. Pending legal sign-off is the same as for the rest of Lead Radar.
* **Automatic paid step** is bounded: ≤ 25 requests per 15-minute tick, hard owner budget (≤ env hard cap 500 by default), reserved atomically *before* each request, failed lookups retried after 60 min and at most 3 attempts, rejected credentials switch geocoding **off** (fail closed), an empty run writes no audit row.

## 3. Provider comparison (Estimate — pricing from third-party summaries of Mapbox's page; confirm on mapbox.com before approving spend)
| Option | Canadian addresses | Store results? | Cost | Status |
|---|---|---|---|---|
| **Overture source point** (this change) | Same dataset the prospect came from | Yes (permissive licence) | CAD 0 | **Implemented, active** |
| **Mapbox Geocoding v6 Permanent** (already integrated) | Good civic coverage | Yes, for the business's own use (`permanent=true`) | ≈ USD 5 / 1,000 requests, no free tier (temporary results are cheaper but may **not** be stored) | Implemented; **disabled** (env + DB + budget 0) |
| Statistics Canada Open Database of Addresses | Open Government Licence – Canada; 2021 municipal snapshot, coverage uneven, no confirmation Québec is complete | Yes | Free, but needs a bulk import + matcher | Not built — possible future zero-cost fallback |
| Google Geocoding | Excellent | Caching restricted (place ids only) | Paid | Rejected (terms) |
| Public Nominatim | — | — | — | **Not used** (usage policy forbids bulk geocoding) |

## 4. Coverage and cost (all Estimates)
* The 225 hidden prospects are Overture-imported, so each has a source point once its candidate is refreshed. Expected coverage after step 3 below: **≈ 95–98 %**. The remainder is mostly *incomplete address* (V1 preview counted 37 incomplete + 12 no street/postal among 2,034 candidates ≈ 2.4 %) or prospects that came from CSV/manual entry and have no candidate.
* Paid fallback if the owner chooses to run it: at most ≈ 5–15 prospects of the 225 → **≈ USD 0.03–0.08** (225 requests would be ≈ USD 1.13 worst case). Budget ceiling is owner-set.
* **Verified:** none of these numbers. The dry-run in §5 produces the real ones.

## 5. Rollout — exact owner steps (nothing below has been run in production)
1. **Merge → Vercel Production build applies the additive migration** (two nullable columns + CHECK + partial index). Safe with nothing else; the app works with no coordinates.
2. **Refresh the Québec candidates once** so older candidates receive their point: Lead Radar → New run, province **QC**, same groups, release `2026-09-23.1` (reproduces the earlier extraction; staging is idempotent) → on the founder's Windows PC `.\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan plan.json` (extractor now 1.1.0; `pip` deps unchanged) → upload → Finish run. This changes **only** `sourceLatitude/sourceLongitude` on existing candidates (no requalification, no approval change, no new imports). The overlap warning is advisory.
3. **Dry-run:** Settings → Geocoding → "Positions from Lead Radar (free)" → **Preview (dry run)**. Review: positions to write, skip reasons (`OUT_OF_PROVINCE`, `ADDRESS_MISMATCH`, `INSUFFICIENT_ADDRESS`…), coverage tiles. Nothing is written and no audit row is created. Send the numbers back before step 4.
4. **Apply** (only after the dry-run is accepted): click **Apply next page** until it reads "Finished" (≤ 1,000 candidates per click; resumable; repeating is harmless).
5. Open `/platform/sales/field/new` as a FIELD seller: the coverage chips should show the located prospects; spot-check ~10 pins against the real shops.
6. *(Optional, spends money — needs your explicit approval)* Mapbox for the remainder: follow `docs/mapbox-geocoding.md` (token, `GEOCODING_PROVIDER=mapbox`, `MAPBOX_GEOCODING_ENABLED=true`, then enable + set a small budget on the Geocoding page). Once enabled, the Lead Radar worker also processes new prospects automatically within that budget. Leave it off to stay at CAD 0.

New imports from now on are located at import time with no seller or admin interaction (once the extractor 1.1.0 is used for the extraction).

## 6. Not done / follow-ups
* Existing candidates hold no point until step 2 (the raw file was never kept) — this is the one manual extraction run.
* A source point for a prospect with **no street address** is not used (positions are bound to the address fingerprint); small loss (~1–2 %).
* Province boxes are coarse (border areas overlap); the check catches gross errors (wrong sign, other provinces), not a point 5 km off.
* Distance in the planner stays straight-line; routing/driving time is unchanged and out of scope.
