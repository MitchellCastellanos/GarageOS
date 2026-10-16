# Owner runbook — position the prospects from Overture coordinates

> **UPDATE 2026-10-17 — read this first.** The October 16 refresh uploaded **no coordinates**. Root cause: extractor 1.1.0 rejected every place (bbox tolerance 1e-6 vs Overture's float32 bbox, ~7.6e-6) — proven on the real release, see [geolocation.md §8](geolocation.md). The uploaded records were not kept (chunks are staged and discarded) and never contained positions, so they cannot be replayed. **You do NOT need to run the extraction again.** Use the small position file instead:
> 1. Download `points.ndjson` (sent with the fix; 20,475 Québec places, 1.6 MB; made from Overture release 2026-09-23.1 with extractor 1.2.0; sha256 `5a482db5…6a75`). No extraction on your PC.
> 2. Settings → Geocoding → **Source positions: diagnostics and refresh** → *Load diagnostics* (it reads the database directly: columns, migrations, candidates with/without positions, last run verdict).
> 3. Choose the file → **Preview file** (writes nothing). Expect thousands of "matched" and a few skipped (not staged / outside province).
> 4. **Apply to candidates** (attaches positions to the EXISTING staged candidates only; no prospects, no assignment, no paid request).
> 5. Same page → **Positions from Lead Radar (free)** → *Preview (dry run)*: it must now examine candidates (it read 0 before) and show positions to write. Review the skip reasons, then *Apply next page* until finished.
> 6. Field Planner: the "On the map" counter rises and markers appear.
> Future refresh runs (extractor 1.2.0+) carry positions; the run page shows *records carrying a position / accepted / written on new / written on existing* and a red banner if a completed run carried none. The sections below describe the original procedure; extractor ≥ 1.2.0 is required for any new extraction (older versions lose every position and 1.2.0 refuses to write a coordinate-less file).

# (Original procedure) refresh Québec release 2026-09-23.1 and position the prospects (Windows PowerShell)

Nothing below has been run by engineering. Each step that touches production data is yours to run.

## 0. State verified by engineering (2026-10-16)
| Check | Result | Evidence |
|---|---|---|
| Latest production deployment READY | **Verified** | Vercel `dpl_BgpVNbcpiYB1t8byTKdH2pt3Wd3r`, commit `94cec88` (PR #129), state READY, target production |
| Aliased | **Verified** | aliases `www.garage-os.ca`, `garage-os.ca`, `aliasError: null` |
| Migration `20261017090000_prospect_source_coordinates` applied | **Inferred, not directly observed** | `npm run build` runs `deploy-migrations.mjs` (`prisma migrate deploy`, build aborts on failure) before `next build`; the build completed and deployed. The middle of the build log is truncated in the API, so the "Migrations applied successfully" line itself was not seen. Confirm below. |
| Extractor 1.1.0 available | **Verified in repo** | `EXTRACTOR_VERSION = "1.1.0"` in `scripts/lead-radar/overture_extract.py` |
| Source-coordinate path | **Verified by tests** | extractor `geo` → `record.ts` (Canada + province box, not in content fingerprint) → `sourceLatitude/Longitude` on staging → `locateFromSource()` at import → `CrmProspectLocation`; `tests/prospect-source-location-db.test.ts` (17 pass) |
| Geocoding page: dry-run + resumable backfill | **Verified by tests** | Settings → Geocoding → "Positions from Lead Radar (free)": *Preview (dry run)* writes nothing; *Apply next page* uses a keyset cursor (≤ 1,000 candidates/click) and is idempotent |
| Paid Mapbox fallback disabled | **Verified in code** | needs env `GEOCODING_PROVIDER=mapbox` + `MAPBOX_GEOCODING_ENABLED=true` + DB `enabled` + request budget > 0; none are set by engineering. The new map services never call a provider (asserted by `tests/mapbox-geocoding.test.ts`). Whether those env vars are unset on Vercel is **Not verified** (secrets are not readable by engineering). |

To confirm the migration yourself (read-only): Supabase SQL editor →
`select migration_name, finished_at from _prisma_migrations order by started_at desc limit 3;` — expect `20261017090000_prospect_source_coordinates` with a `finished_at`.

## 1. Create the refresh run (browser)
Lead Radar → **New run** → province **QC**, same categories/groups as the original run, release **2026-09-23.1** → *Create*. On the run page click **Download plan** and save `plan.json` (e.g. in `Downloads`). Staging is idempotent: the refresh changes **only** `sourceLatitude/sourceLongitude` on existing candidates (no requalification, no approval change, no new imports). The overlap warning is advisory.

## 2. Run the extractor (Windows PowerShell)
```powershell
# one-time: Python 3.11+ from https://www.python.org/downloads/ (tick "Add to PATH"), then open a NEW PowerShell window
cd $HOME\GarageOS            # your clone; run `git pull` first so scripts\lead-radar is at extractor 1.1.0
git pull

# optional sanity check: reads Parquet footers only, prints the estimated workload
.\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan $HOME\Downloads\plan.json -DryRun

# the real extraction (creates .venv on first run; restartable — re-run the same command after an interruption)
.\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan $HOME\Downloads\plan.json
```
If PowerShell refuses to run the script: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` (this window only), then repeat. The script prints the output folder and exactly which two files to upload: `manifest.json` and `records.ndjson`. It holds no credentials and contacts only the public Overture bucket. Check the printed extractor version is **1.1.0**.

## 3. Upload and finish (browser)
Run page → upload `manifest.json` + `records.ndjson` (verified, resumable chunks) → **Finish run**.

## 4. Dry run, then Apply
1. Settings → **Geocoding** → "Positions from Lead Radar (free)" → **Preview (dry run)**. Nothing is written and no audit row is created. Read: positions to write, skip reasons (`OUT_OF_PROVINCE`, `ADDRESS_MISMATCH`, `INSUFFICIENT_ADDRESS`…), coverage tiles. Send the numbers back before continuing.
2. If accepted: **Apply next page** repeatedly until it reads "Finished" (≤ 1,000 candidates per click; resumable; repeating is harmless).
3. Field Planner (`/platform/sales/field/new`) as the FIELD seller: the "On the map" counter should jump; spot-check ~10 pins against real shops.
4. Mapbox for the remainder stays **off** (CAD 0). Enabling it needs your explicit decision (see `docs/mapbox-geocoding.md`).
