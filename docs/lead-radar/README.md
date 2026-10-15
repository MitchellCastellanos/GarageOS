# GarageOS National Lead Radar

Canada-wide discovery of automotive repair businesses → human review → the existing Sales CRM. **Live acquisition is disabled by default.**

```
Overture release (public Parquet) ──► local extractor (scripts/lead-radar, pyarrow, bounded, deterministic)
        │  plan.json (from the app)              │ records.ndjson + manifest.json
        ▼                                        ▼
   Discovery run ◄── chunked, verified, resumable upload (250 records/request) ── browser
        ▼
   Staging: normalise · whitelist · geo (13 provinces/territories) · classify · licence check · CRM dedupe · territory
        ▼
   CrmDiscoveryCandidate  ──(human approve/reject)──►  import  ──►  existing import transaction (applyImportBatch)
                                                                         ▼
                                              unassigned CrmProspect · observations (provenance) · duplicate-review queue
                                                                         ▼
                                  existing assignment preview ──(manager confirms)──► sellers · Field Planner
```

* Verification audit & real Overture measurements: [verification-audit.md](verification-audit.md)
* Licensing, attribution, CASL: [licensing-and-compliance.md](licensing-and-compliance.md)
* Budget (CAD 25 shared cap): [budget.md](budget.md)
* Activation / first extraction / rollback: [runbook.md](runbook.md)

## Code map
| Area | Files |
|---|---|
| Schema | `prisma/migrations/20261015090000_lead_radar_foundation`, models `CrmDiscoveryRun/Candidate/BudgetLedger/Settings` |
| Pure domain | `src/domain/lead-radar/{geo,taxonomy,license,record,scope,bridge,budget,access}.ts` |
| Server | `src/lib/lead-radar/{settings,access,budget,runs,staging,candidates,import-service,overview}.ts`, `src/actions/lead-radar.ts` |
| Shared import | `applyImportBatch` / `loadPlanInputs` in `src/lib/sales-crm/lead-engine.ts` (extracted from the CSV action; CSV behaviour unchanged) |
| Extractor | `scripts/lead-radar/{overture_extract.py,test_extract.py,profile.ts,requirements.txt}` |
| UI (EN/FR) | `/platform/sales/lead-radar`, `/candidates`, `/runs/[id]`; `src/components/lead-radar/*`; `src/lib/admin-locale/lead-radar.ts` |
| Tests | `tests/lead-radar-domain.test.ts`, `tests/lead-radar-db.test.ts` (real PostgreSQL), `scripts/lead-radar/test_extract.py` |

## Design decisions
* **No second CRM / territory engine / assignment logic.** Territory = `classifyTerritory`; dedupe = `classifyAgainstPool`; import = the shared transaction; assignment = untouched.
* **Approval is a database invariant** (CHECK: imported ⇒ approved; approved ⇒ licence ok and not excluded) as well as an API rule.
* **Independence is never asserted.** Candidates show "chain signal" / "no chain signal (independence not verified)".
* **Permissions:** Super Admin = everything (`manage_lead_radar`, `review_lead_radar`). Sales Manager = review/approve/import **only while the Super Admin switch "managers may review" is on** (default off; no static permission change). Reps and tenant users: none. All checks are server-side.
* **Repeated releases:** one candidate per `(source, GERS id)`; a rejection survives; an approval is withdrawn if the facts or licence verdict change; an imported candidate is only flagged `changedSinceImport` — the CRM record is never overwritten.
* **Bounded/safe by construction:** chunk ≤300 records/1.5 MB; extractor host-allowlisted; no network calls in server code.

## Screenshots (local scratch DB seeded through the app's own actions from the real Overture sample; contact fields blurred)
`screenshots/01-overview-en.png`, `02-candidates-en.png`, `03-imported-en.png`, `04-run-en.png` and the French equivalents `05`-`08`.
