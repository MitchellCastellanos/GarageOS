# National Lead Radar engine — how a province moves from source to CRM

Pipeline (each stage is a table, resumable and idempotent):

`Overture discovery → source preservation (raw evidence kept) → normalisation → repair-fit classification → deduplication → coordinate validation → run quality gate → qualification → guarded CRM import → territory assignment → readiness reporting`

Do not confuse the populations: **raw records** (extractor output) ≠ **staged candidates** (`CrmDiscoveryCandidate`) ≠ **CRM prospects** (`CrmProspect`) ≠ **assigned prospects**. Every count in the product names which one it is.

## 1. Clean from the first extraction (what changed vs. the Montréal pilot)

| Montréal needed… | Now |
|---|---|
| a cleanup after import because irrelevant businesses got in | `repairFit` is computed **at staging** by the one shared assessor (`domain/lead-radar/repair-fit.ts`) and stored on the candidate (`repairFit`, `repairFitReasons`). EXCLUDED candidates are blocked at qualification, bulk approval and import (PR #131 gates, unchanged). Candidates staged before the engine are classified by the tick's `classify` stage (derived columns only). |
| a coordinate recovery after import | Extractor 1.3.0 + staging validate Canada/province consistency per record; valid points are stored on the candidate and carried into `CrmProspectLocation` by the import. |
| duplicates when the source re-keyed a business | `duplicateOfCandidateId` (see §3). |
| noticing a bad run by eye | **Run quality gate** (§2). A run that lost its coordinates, read nothing or was mostly rejected is `FAILED`, not `COMPLETED`. |

## 2. Run quality gate (`domain/lead-radar/run-quality.ts`, applied in `completeRun`)

Verdicts (stored in `CrmDiscoveryRun.qualityVerdict` + `qualityDetail`, shown on the run page):

| Verdict | Meaning | Blocks? |
|---|---|---|
| `OK` | counters consistent, ≥ 80 % of staged records carry a valid position | no |
| `ZERO_RESULTS_LEGIT` | 0 records, but the extractor reports it examined rows | no (warning) |
| `EXTRACTION_EMPTY_SUSPECT` | 0 records and no proof rows were read (extractor/plan failure) | **yes** |
| `NO_COORDINATES` | records arrived, none carried a position (the Montréal float32 bug) | **yes** |
| `ALL_COORDINATES_REJECTED` | positions present, every one failed the Canada/province check | **yes** |
| `LOW_COORDINATE_COVERAGE` | < 80 % of staged records carry a valid position (≥ 20 staged) | **yes** |
| `HIGH_REJECTION` | > 50 % of records rejected by validation (≥ 20 received) | **yes** |
| `COUNT_MISMATCH` | records received ≠ manifest count | **yes** |

A blocking verdict sets the run to `FAILED` (`errorCode = verdict`). Qualification/import only read candidates whose `lastRun` is `COMPLETED`, so nothing from a failed run reaches the CRM. Raw candidates are **kept** (evidence). Only a Super Admin can release such a run (`acknowledgeDiscoveryRunQuality`, written reason ≥ 10 characters, audited `LEAD_RADAR_RUN_QUALITY_ACKNOWLEDGED`). Counters shown per run: records received · carrying a position · valid positions · invalid positions · without a position · coverage; plus per-reason diagnostics (`POINT_OUT_OF_CANADA`, `POINT_OUT_OF_PROVINCE`, `POINT_MISSING`).

Extractor 1.3.0 additionally writes per-shard counters (survive a resume), refuses a shard set that read zero rows, and reports `recordsWithPoint`/`pointsMissing` in the manifest. Python tests build a Parquet file with the **real Overture column types (float32 bbox)**; the NDJSON it emits is the fixture the TypeScript contract test stages (`tests/fixtures/lead-radar/overture-records.ndjson`, regenerate with `UPDATE_FIXTURE=1 python3 -m unittest scripts/lead-radar/test_extract.py`).

## 3. Deduplication

* Same source record across releases/plans: unique `(source, sourceRecordId)` → update, never a second row (human decisions and exclusions preserved; an APPROVED candidate whose facts changed goes back to a human).
* Candidate vs CRM: `classifyAgainstPool` (unchanged): EXISTING_STRONG links, AMBIGUOUS goes to a human, ownership/DNC/activities are never touched.
* **Candidate vs candidate (new):** when a *new* source id is the same business as a staged candidate (same normalised name **and** the same physical place, or same name+city with a unique phone/domain — the CRM's conservative classifier), the new row is staged with `duplicateOfCandidateId = original` (chains collapse to the root). A duplicate is evidence only: outside the qualification pool, `reviewDiscoveryCandidates` refuses to approve it (`blockedDuplicate`), and the importer's claim query skips it. Same name in two provinces/cities, or the same address with a different name, is **not** linked.

## 4. Where the gates live (all must stay)
`poolWhere` (qualification pool: COMPLETED run, no duplicate) · `qualifyPending` SQL · `reviewCandidates` (licence, tier, fit, duplicate) · `importApprovedCandidates` SQL + fit gate · `importStage` queue.

## 5. Validation evidence
`tests/lead-radar-national-db.test.ts` (14 tests, real PostgreSQL): Québec initial and repeated extraction, Ontario/BC/YT, cross-province same-name, mixed-service/EV/car-wash/bicycle/parts/ambiguous names, missing and out-of-province positions, float32 points, gate verdicts and acknowledgement, re-keyed duplicates, excluded business reappearing with changed facts, owned CRM prospect, interrupted/resumed ingestion, first-import position carry-over, fit backfill. `tests/lead-radar-run-quality.test.ts`, `scripts/lead-radar/test_extract.py`.
