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

## 6. Automated discovery worker (no PC, no PowerShell, no manual upload)

```
Super Admin queues a province  ─┐                                 (or opts a province into the schedule)
                                ▼
 CrmDiscoveryRun(execution=WORKER, PLANNED) ──claim(lease 10 min)──▶ GitHub Actions job (scripts/lead-radar/worker.py)
                                                                    │ extractor 1.3.0 (public Overture bucket, HTTP range reads)
   /api/lead-radar/worker  ◀── attach manifest · chunks (≤250 rec, resumable by sequence) · heartbeat · complete / fail
                                ▼
 run quality gate → COMPLETED | FAILED(verdict) → province state → qualification → guarded import → assignment (existing automation, unchanged)
```

* **Where it runs:** `.github/workflows/lead-radar-extract.yml`, every 2 hours + manual dispatch. Step 1 asks the app (`peek`) and exits in seconds when nothing is queued; Python is only installed when work exists. Nothing heavy runs in Vercel request handlers (the endpoint only validates and stages ≤ 300-record chunks, exactly like the existing manual upload).
* **Authorisation:** the worker can only execute a run a Super Admin **queued** (`queueDiscoveryRunForWorker`) or that the opt-in schedule created. A manually uploaded run is never claimable. It needs live discovery ON (database + `LEAD_RADAR_ENABLED=1`), the same bearer secret as the other cron workers (`CRON_SECRET` / GitHub secret `SALES_CRON_SECRET`, `SALES_CRON_BASE_URL`), and fails closed. Nationwide/large scopes still need the explicit acknowledgement when queued.
* **Checkpointing / resume:** finished extractor shards are kept in the cached work directory; the server stores `lastChunkSeq`; chunking is deterministic, so a new attempt re-attaches the manifest, learns where it stopped and sends only the missing chunks. Replays are no-ops, gaps are refused.
* **Retry / stall handling:** a lease expires 10 min after the last heartbeat (every chunk and a 2-minute timer heartbeat). A stalled or failed attempt counts once, backoff 5 min → 30 min → 2 h, **3 attempts**, then the run is `FAILED` (`WORKER_RETRIES_EXHAUSTED` or the reported code) and the province records the failure. A quality-gate stop is *not* retried (retrying cannot fix lost coordinates); it needs a person.
* **Release tracking:** the Lead Radar cron (`/api/webhooks/cron/lead-radar`, every 15 min + daily Vercel cron) runs `runDiscoveryMaintenance`: it reads the official STAC catalog (`stac.overturemaps.org`, fixed URL, 8 s timeout, release id validated), records a new release once in `CrmDiscoveryRelease`, recovers stalled runs, and **only for provinces a Super Admin opted in** queues ONE province run (REPAIR + BODY_GLASS) per newer release, never while another automatic run is in flight, never before the province's minimum interval (default 90 days), and not for 24 h after a failed automatic attempt. Default for every province: **off** (`CrmDiscoveryProvince.autoRefresh=false`). `paused=true` stops claims and scheduling for that province immediately.
* **Bounded resources:** one automatic run nationally at a time; one province per run; extractor batch of 6 row groups; `--max-row-groups 800`, `--max-records 600000`; chunks ≤ 1.5 MB.
* **GitHub Actions budget (estimate, not measured on this repo):** hosted runner minutes only. Private repos on the Free plan include 2,000 min/month: the empty 2-hourly check ≈ 360 billed min/month (1 min minimum per run); a province run ≈ 5–40 min (Ontario is the largest at ≈ 250 MB / 287 row groups per the measured hints). Job limit 6 h (we cap 5 h), ~14 GB disk, no artifacts stored, data transfer inbound only from the public Overture bucket. If the repository is public, minutes are free. Reduce the schedule to every 6 h (`17 */6 * * *`) to cut the idle cost to ≈ 120 min/month. No paid infrastructure is required or introduced.
* **Manual fallback is unchanged:** the PowerShell wrapper + upload still work for any run.

Tests: `tests/lead-radar-worker-policy.test.ts` (pure), `tests/lead-radar-worker-db.test.ts` (11 DB tests: auth fail-closed, claim/lease, interruption + resume, retry exhaustion, gate stop, pause, cancel, opt-in schedule, audit), `scripts/lead-radar/test_worker.py` (8 protocol tests against an in-memory fake server).
