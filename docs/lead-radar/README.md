# GarageOS National Lead Radar

> **Start here if you are a new agent: [NEXT_AGENT_HANDOFF.md](NEXT_AGENT_HANDOFF.md)** (production state, what is OFF, exact next actions).
>
> Automation by approved policy: [automation.md](automation.md) · Qualification policy V2 + read-only comparison: [qualification-v2.md](qualification-v2.md).

## Status (code deployed ≠ feature activated)
| Item | State |
|---|---|
| Foundation (PR #126) and automation (PR #127, migration `20261016090000`) | Merged and deployed to Production; migration applied (additive). |
| Qualification V2 + read-only comparison (PR #128) | Merged and deployed (see handoff for the commit). V2 is **a proposal**: it is not a stored/active policy. |
| Active qualification policy / automation / pilot / company-wide sending | **None activated by engineering.** Only the owner can do this (Super Admin UI). |
| Live acquisition switch (`LEAD_RADAR_ENABLED`) | Owner-controlled; used for the Québec extraction. |
| Emails to prospects | **None sent by this work.** No campaign is authorised. |

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
| Automation (PR #127) | `src/domain/lead-radar/{policy-rules,qualification,qualification-hash,outreach}.ts`, `src/lib/lead-radar/{policy,qualify,automation,eligibility,dashboard}.ts`, `src/actions/lead-radar-automation.ts`, `/platform/sales/lead-radar/automation`, cron `/api/webhooks/cron/lead-radar` |
| Qualification V2 + comparison (PR #128) | `src/domain/lead-radar/{business-type,policy-compare}.ts`, `src/lib/lead-radar/compare.ts`, `src/components/lead-radar/PolicyComparePanel.tsx`, `scripts/lead-radar/policy-report.ts` |
| Windows extraction | `scripts/lead-radar/Run-LeadRadarExtraction.ps1` |
| Tests | `tests/lead-radar-automation-domain.test.ts`, `tests/lead-radar-automation-db.test.ts`, `tests/lead-radar-qualification-v2.test.ts`, `tests/lead-radar-compare-db.test.ts`, `tests/lead-radar-domain.test.ts`, `tests/lead-radar-db.test.ts` (real PostgreSQL), `scripts/lead-radar/test_extract.py` |

## Design decisions
* **No second CRM / territory engine / assignment logic.** Territory = `classifyTerritory`; dedupe = `classifyAgainstPool`; import = the shared transaction; assignment = untouched.
* **Approval is a database invariant** (CHECK: imported ⇒ approved; approved ⇒ licence ok and not excluded) as well as an API rule.
* **Independence is never asserted.** Candidates show "chain signal" / "no chain signal (independence not verified)".
* **Permissions:** Super Admin = everything (`manage_lead_radar`, `review_lead_radar`). Sales Manager = review/approve/import **only while the Super Admin switch "managers may review" is on** (default off; no static permission change). Reps and tenant users: none. All checks are server-side.
* **Repeated releases:** one candidate per `(source, GERS id)`; a rejection survives; an approval is withdrawn if the facts or licence verdict change; an imported candidate is only flagged `changedSinceImport` — the CRM record is never overwritten.
* **Bounded/safe by construction:** chunk ≤300 records/1.5 MB; extractor host-allowlisted; no network calls in server code.

## Screenshots (local scratch DB seeded through the app's own actions from the real Overture sample; contact fields blurred)
`screenshots/01-overview-en.png`, `02-candidates-en.png`, `03-imported-en.png`, `04-run-en.png` and the French equivalents `05`-`08`.
