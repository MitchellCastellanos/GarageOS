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

## 7. Readiness findings (2026-10-17 audit)
* **Refreshing the 2,084 staged Québec candidates cannot create duplicate CRM prospects.** Candidates are unique per `(source, sourceRecordId)`; a refresh run updates only `sourceLatitude/sourceLongitude` on existing rows (Verified: `prospect-source-location-db`), CRM import dedupes with `classifyAgainstPool`, and imported/excluded candidates are never re-imported. Excluded or rejected candidates keep their decision.
* **Vercel Production environment (names only; values are encrypted and were not read):** `GEOCODING_PROVIDER`, `MAPBOX_GEOCODING_ENABLED`, `MAPBOX_GEOCODING_TOKEN` (sensitive), `GEOCODING_MAX_REQUESTS_HARD_CAP`, `MAP_PROVIDER`, `MAPBOX_PUBLIC_TOKEN`, `MAPBOX_MAP_STYLE`, `LEAD_RADAR_ENABLED`, `CRON_SECRET` all **exist** in Production. Earlier documents said the Mapbox geocoding switches were unset; **that is not verified and the variables exist.** Whether paid geocoding can actually spend depends on their values **and** on the database gates (Settings → Geocoding: `enabled` and a request budget > 0, default 0). **Owner action:** open Settings → Geocoding and confirm it shows *disabled* / budget 0 before any run; if you do not intend to spend, set `MAPBOX_GEOCODING_ENABLED=false` in Vercel.
* **New diagnostics:** Lead Radar → CRM cleanup → *FIELD readiness funnel* reports staged candidates (with/without source position, per import state), imported-but-staged-without-position (needs the refresh run), CRM prospects in FIELD territories by repair fit, assigned vs unassigned, with/without a map position, and *source position available but not applied*. The Field Planner summary reports prospects hidden as excluded and under review.
* Order of operations recommended: cleanup (so excluded records are not positioned or assigned) → refresh run → geocoding dry run → apply.

## 8. Why the free backfill read 0 positions (root cause, 2026-10-17)
* **Failing stage: the extractor (geometry → record), not upload, staging, the database or the backfill.**
* **Evidence.** Reading real Overture release 2026-09-23.1 (Montréal-area row group, 3,351 places): `bbox` is `struct<xmin,xmax,ymin,ymax: double>` whose values are float32 widened to double, so a point's `xmax − xmin` is one float32 step (e.g. `−74.17697143554688` vs `−74.17696380615234`, Δ = 7.6e-6). Extractor 1.1.0's `source_point()` required Δ ≤ 1e-6 and therefore returned `None` for **3,351 of 3,351** places (1.2.0: 3,351 of 3,351 accepted). The unit tests used exact-equal bbox fixtures, which real data never produces, so they passed. Consequence: every record in the October 16 NDJSON had `geo: null`, staging stored no point (nothing to reject), the run completed normally, and the backfill correctly examined 0 candidates.
* **Eliminated.** Migration: the app reads/writes `sourceLatitude/Longitude` on every staging chunk (Prisma selects all columns), so a missing column would have failed every chunk — and the page shows "0", not an error; Settings → Geocoding now reads the columns and `_prisma_migrations` directly (*Database check*) so this is verified in one click rather than inferred. Server parsing (`record.ts`) and refresh of existing candidates (`staging.ts`): covered by DB tests with realistic points. Backfill filters: only `importedProspectId`, `sourceLatitude`, `licenseOk` and prospect eligibility — no assignment/import precondition beyond the candidate being imported.
* **Not the shard-reuse trap — but a latent one, now closed.** The extractor reuses finished shards (`*.done`) in the same output folder; shards written by an older extractor would have been merged into a "new" file with a fresh 1.x manifest. Shard names now include the extractor version.
* **Recovery.** Uploaded chunks are not retained and contained no positions, so replay is impossible; positions exist only in Overture. Recovery without re-running the extraction on the founder's PC: `overture_extract.py --points-only` (run here, against the same release) produced `points.ndjson`; the Super Admin *Refresh positions* panel attaches them to existing candidates (preview → apply, idempotent, ≤ 5,000 lines per call, candidates only).
* **Guards added.** Extractor 1.2.0 refuses to write a file in which no record has a point and records `recordsWithPoint` in the manifest; staging counts records carrying a point / accepted / stored on new vs existing candidates and names every rejection (`POINT_MISSING`, `POINT_OUT_OF_CANADA`, `POINT_OUT_OF_PROVINCE`); the run page shows the counters and a red banner for a completed run with none; migration `20261019090000_run_point_diagnostics` (additive).
