# National Lead Radar — focused verification audit

Performed 2026-10-15 against `main` @ `3c5c17a` (Merge PR #125). Everything below was **observed**, not assumed. Where a check was impossible from
the build sandbox, that is stated.

## 1. GarageOS architecture (confirmed, with corrections)

| Previously identified | Status on current `main` |
|---|---|
| `src/domain/sales-crm/dedupe.ts` | Exists, unchanged. `classifyAgainstPool` is branch-aware: STRONG only on name + same physical place; shared phone/domain/name alone is never proof (franchises). **Reused as-is.** |
| `src/domain/sales-crm/normalize.ts` | Exists. Name/phone/domain/website normalisers **reused**. |
| `src/domain/sales-crm/import.ts` | Exists. `parseProspectCsv`, `planImport`, fingerprints, `recordKeyOf`. **Reused** (Lead Radar emits the canonical CSV rows and runs them through it). |
| `src/lib/sales-crm/lead-engine.ts` | **Correction:** it was only `enrichFromCandidate` + `observationData` (76 lines). The transactional import logic lived inline in the `confirmProspectImport` server action. It is now extracted to `applyImportBatch` (same file) so the CSV wizard and Lead Radar share **one** import path. Behaviour unchanged: lead-engine/sales-crm DB suites were green before and after. |
| `src/lib/sales-crm/assignment.ts` + domain | Exists. `planAssignments` (least-loaded, coverage, `maxActiveLeads`, FIELD/REMOTE) and server preview → confirm with per-proposal revalidation. **Not touched.** |
| Prisma models | All eight exist (`CrmProspect`, `CrmImportBatch`, `CrmSourceObservation`, `CrmAssignmentRun`, `CrmTerritory`, `CrmProspectLocation`, `CrmGeocodingSettings`, `CrmSendingBasis`). Also relevant: `CrmDuplicateReview`, `CrmEmailSuppression`, `CrmAuditEvent`. |
| Newer code that supersedes earlier notes | `20261013090000_per_prospect_field_priority` (per-prospect FIELD windows replaced the territory-wide start date) and `20261014090000_mapbox_geocoding_controls` (atomic request budget; its `UPDATE … WHERE used < max` reservation was the pattern the Lead Radar ledger generalises). Latest migration before this work: `20261014090000`. |

Other verified behaviour that shaped the design: imports use `resolveAssignee(actor, null)` (only managers/Super Admin may hold the unassigned pool);
an imported row never creates a `CrmSendingBasis`, contact or message; enrichment only fills **empty** fields and propagates opt-outs; territory is
resolved with `classifyTerritory` (LOCAL / NATIONAL / UNRESOLVED — "Québec with no city" is UNRESOLVED and never auto-assigned); permissions are a
capability set per role (`capabilitiesFor`), tenant roles never grant sales access; audit rows go to `CrmAuditEvent` (string `action`, no migration
for new actions); each feature has its own typed EN/FR dictionary.

## 2. GABAN reference (read-only; `faa6a31`, 2026-09-15)

Confirmed: Google Places API (New) **Text Search**, one query per *category × broad city*, `maxResultsPerQuery: 20`, a field mask, a name-exclusion
list, `--dry-run`, Airtable upsert, website-opportunity scoring (`lib/scoring.mjs`: free-builder hosts, social-only hosts, PageSpeed signals).
Reused as *patterns only*: config-driven targets, a conservative exclusion list, dry-run-first, social-only-site detection (as "not a website").
Not copied: Airtable, PageSpeed, website scoring, mock-ups, proposals, non-automotive categories. The repository was not modified.

## 3. Overture Maps (measured 2026-10-15)

| # | Item | Result |
|---|---|---|
| 1 | Latest release | Bucket listing shows `2026-08-19.0`, `2026-09-23.0`, **`2026-09-23.1`** (used for all measurements). |
| 2 | Places availability | `release/2026-09-23.1/theme=places/type=place/` — 16 Parquet parts, 81,455,423 rows, 4,864 row groups. |
| 3 | STAC catalog | `stac.overturemaps.org` is **blocked from the build sandbox** (egress policy). The extractor tries STAC first and falls back to the public bucket listing (verified). STAC path unverified here. |
| 4 | GeoParquet / range reads | Verified: HTTPS range requests on the public S3 bucket; footers ≈0.7 s; row groups are spatially sorted and carry `bbox` statistics, so a metro extraction touches 9–12 of 4,864 row groups. |
| 5 | DuckDB | Installs (v1.5.6) but **`httpfs` cannot be downloaded** in the sandbox (`extensions.duckdb.org` blocked), so DuckDB-over-HTTP could not be verified. Adapted: the extractor uses `pyarrow` + `fsspec` HTTP range reads (verified end-to-end, deterministic, restartable). DuckDB remains a valid alternative on an unrestricted machine. |
| 6 | Canadian filtering | Bbox pruning (superset; includes some US rows) + per-record `addresses[0].country`/`region`/postal resolution in `domain/lead-radar/geo.ts`. Region text is dirty ("QC", "Qc", "Québec", null) — normalised; postal-letter fallback; NT/NU share postal letter X so X never decides alone. |
| 7–8 | Taxonomy | New `taxonomy.{primary,hierarchy,alternates}` (the old `categories` column is not in the schema). Repair/service under `travel_and_transportation/vehicle_service/*`; dealers `shopping/vehicle_dealer/*`; parts `shopping/specialty_store/vehicle_parts_store`. Observed codes are listed in `domain/lead-radar/taxonomy.ts`; unknown codes under `vehicle_service` become **AMBIGUOUS** (not dropped). The official taxonomy docs site was also blocked, so the code list is *observed*, not exhaustive. |
| 9 | Fields | `names`, `addresses[]`, `phones[]`, `websites[]`, `emails[]`, `socials[]`, `brand.wikidata`, `confidence`, `operating_status`, `basic_category`, `sources[]`. |
| 10 | Identifiers | `id` is the GERS id (UUID). Used as the stable key across releases; if a later release re-issues an id for the same place, address+name dedupe against the CRM still prevents a duplicate prospect. |
| 11 | Provenance | `sources[]` carries `dataset`, `license`, `update_time`, `record_id`, `confidence` per contributing source. We keep only `dataset` + `license`. |
| 12–13 | Licensing | See `licensing-and-compliance.md`. Observed per-record licences: CDLA-Permissive-2.0 (Overture, Meta, Microsoft, DAC), Apache-2.0 (Foursquare), CC0-1.0 (AllThePlaces). Every source entry in the 5,294 sampled automotive records carried a licence. The official licensing page was unreachable; conclusions rest on the per-record licence field and must be confirmed by the owner/counsel. |
| 15 | Performance | Metro sample (both cities, all 5 category groups): 21 row groups, 294,258 rows examined, 7,468 records, **15 s**, 92 MB estimated read. Re-run of the same plan = identical SHA-256; re-run into the same folder skips all 16 finished shards. |
| 16 | Contact coverage | Below. |

### Measured sample (release 2026-09-23.1, plan hash `c7375bdb…`, bounded metro boxes — **not** the province)

| | Greater Montréal box (QC) | Calgary box (AB) |
|---|---|---|
| Automotive-related records (all categories) | 4,926 | 2,540 |
| PRIMARY (repair, tires, brakes, transmission, oil, truck) | 2,136 | 1,008 |
| SECONDARY (body, glass, dealers, parts, wash, towing…) | 2,408 | 1,355 |
| AMBIGUOUS (generic `automotive_service`, unknown codes, OEM-branded) | 382 | 177 |
| **PRIMARY** with name / street / postal | 100 / 99.3 / 97.6 % | 100 / 98.5 / 97.8 % |
| **PRIMARY** with phone | 98.2 % | 98.3 % |
| **PRIMARY** with website (non-social) | 70.6 % | 85.3 % |
| **PRIMARY** with a published email | 52.2 % | 57.9 % |
| Phone **or** website | 98.7 % | 99.1 % |
| Chain/brand signal (PRIMARY) | 7.3 % | 13.8 % |
| Low source confidence (<0.5) | 14 % | 12.5 % |
| Duplicate indicators (names at same place / addresses with ≥2 businesses / phones shared / website hosts shared) | 69 / 343 / 223 / 295 | 38 / 268 / 98 / 202 |
| Licences | all permissive; 0 blocked | all permissive; 0 blocked |

Reading it: contact data is good enough to prospect by phone; email coverage is useful but **is not consent**; shared phones/hosts are mostly chains and
multi-tenant buildings (the branch-aware matcher exists for exactly this); roughly 3–6 % of records are near-duplicates inside the source.
These are two metro boxes, so **no national count is claimed**.

### National feasibility (computed from Parquet footers only — no data read)
Rows intersecting the Canadian bounding boxes: **385 of 4,864 row groups, ≈364 MB** of the needed columns (upper bound, includes border-area US rows).
Per province: QC 47 rg/71 MB, ON 287 rg/251 MB (includes US rows), AB 27/23, BC 44/38, others smaller (see `EXTRACTION_HINTS`). A nationwide run is minutes of
transfer on an ordinary connection and is **owner-gated** (acknowledgement required); it was not performed.

## 4. External services

| Service | Checked | Finding |
|---|---|---|
| GitHub | MCP tools | Available (this repo). GABAN attached read-only for inspection. |
| Vercel | MCP connected | Not queried for secrets. Serverless request limit (4.5 MB body, short timeouts) is why extraction is **not** run there; uploads are chunked at 250 records ≈ 0.2 MB. |
| Neon / PostgreSQL | env | No production credentials in the sandbox (by design). Local PostgreSQL 16 used; all 60 migrations (including the new one) replay cleanly from an empty database. |
| Mapbox | code | Existing geocoding budget (`CrmGeocodingSettings`) untouched; a static guard test forbids Lead Radar code from referencing it. |
| Storage / cron | code | No object storage needed: artifacts are local files uploaded in chunks. The existing daily cron is unused (no scheduled discovery). |
| Google Cloud / Places | env | No credentials; **no Google adapter is implemented** (see licensing). |
| Overture data | network | Reachable (public bucket). STAC and docs hosts blocked. |

## 5. Corrections to earlier assumptions
1. The Lead Engine's transaction was in an action file, not `lead-engine.ts` → extracted, not duplicated.
2. DuckDB-over-HTTP is not verifiable here → `pyarrow` range reads are the supported extractor.
3. Overture records carry **per-source licences**; "Overture = one licence" is not safe → per-record allow-list.
4. Emails exist on ~52–58 % of primary records, so the CASL separation is a real risk → flagged `EMAIL_UNVERIFIED`, never a sending basis.
5. `websites[]` frequently holds Facebook pages → not stored as a website.
6. Some `region` values are missing/dirty → postal fallback with explicit flags.

## 6. Blockers and owner decisions
* No blocker prevented implementation. **Not done on purpose (owner-gated):** any production migration/deployment, live activation, nationwide extraction, production imports.
* Decision needed: confirm the Overture licence reading with counsel (CDLA-Permissive-2.0 / Apache-2.0 attribution notices) before first production import.
* Decision needed: whether managers may review (`managersCanReview`, default off — changing seller permissions is gated).
* Decision needed before any Google adapter: Google Places content-storage terms and a verified price list.
