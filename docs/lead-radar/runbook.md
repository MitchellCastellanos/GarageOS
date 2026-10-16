# Lead Radar — activation runbook

**Status:** the foundation (migration `20261015090000`) and automation (migration `20261016090000`) are deployed to Production. The owner has run the Québec extraction (2,084 candidates staged) and one read-only V1 qualification preview. **Automation, policy activation, pilot and email are OFF** and are performed only by the owner. For automation operations see [automation.md](automation.md); for the policy comparison see [qualification-v2.md](qualification-v2.md); for the current state and next steps see [NEXT_AGENT_HANDOFF.md](NEXT_AGENT_HANDOFF.md).

## Environment
| Variable | Where | Purpose |
|---|---|---|
| `LEAD_RADAR_ENABLED=1` | Vercel (server) | Environment switch. Without it no run can be created/ingested and no budget can be reserved. **Unset by default.** |
| *(none)* | extractor machine | The extractor needs **no credentials** and no database access. |

Plus the database switch (Lead Radar page → Settings → "Enable live discovery"). Both must be on. No new paid infrastructure is required.

## Production migration (already applied; kept for reference)
1. The migration `20261015090000_lead_radar_foundation` is **additive only** (7 enums, 4 tables, 5 CHECK constraints; no existing table/row is touched).
2. It ships through the normal Vercel Production build (`scripts/deploy-migrations.mjs`, see `docs/db-migrations.md`). Merge → deploy applies it. **Do not merge/deploy without authorization.**
3. Rollback: the application can be rolled back at any time (old code ignores the tables). To remove the feature entirely: `DROP TABLE` the four `CrmDiscovery*` tables and the 7 enums (nothing else references them; imported prospects keep their `importBatchId`/observations).
4. After deploy with the env switch **unset**, `/platform/sales/lead-radar` is visible to Super Admin only and everything is inert.

> **Since the national engine (PRs #133–#137) routine extraction no longer needs a PC:** queue a province on `/platform/sales/lead-radar/national`; the GitHub Actions worker does the rest. See [national-engine.md](national-engine.md) §6 and the canary procedure in [national-rollout-plan.md](national-rollout-plan.md). The manual procedure below remains a supported fallback.

## First controlled extraction (recommended: one metro or one province, never national first)
1. Production: set `LEAD_RADAR_ENABLED=1`; as Super Admin open **Lead Radar**, tick *Enable live discovery*, keep the budget at CAD 25 (nothing will be spent: open data), leave "managers may review" off for now.
2. *Start a discovery job*: choose **Québec**, category groups *Repair* (+ *Body/glass* if wanted), optionally cities (e.g. `Montréal, Laval, Longueuil`). Press **Preview workload** (QC ≈ 47 row groups / ≤71 MB), then **Create run**.
3. Open the run → **Download plan** (`plan.json`).
4. On your own machine:
   ```bash
   python3 -m venv .venv && . .venv/bin/activate
   pip install -r scripts/lead-radar/requirements.txt
   python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out --dry-run   # footers only: shows row groups/MB
   python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out
   npx tsx scripts/lead-radar/profile.ts out/records.ndjson QC                              # optional offline quality report
   ```
   The run is restartable (re-run the same command) and deterministic (same plan + release ⇒ same SHA-256).
5. On the run page choose `manifest.json` + `records.ndjson` → **Start upload**. The browser verifies the SHA-256 and record count against the manifest *before* sending anything, uploads 250-record chunks, retries a failed chunk, and resumes from the last confirmed chunk after an interruption (Cancel / Resume buttons).
6. **Candidate review**: filter (province, city, tier, category, match, completeness…), tick candidates, **Approve** or **Reject** (batches ≤200, idempotent). Licence-blocked and excluded rows cannot be approved.
7. **Import approved** → prospects are created **unassigned** (or linked/held for duplicate review). Nothing is assigned, emailed or scheduled.
8. **Assignment**: use the existing `Prospects → Assignment` preview; confirm explicitly. FIELD/REMOTE rules, territory windows and seller capacity apply exactly as before. The Lead Radar *CRM handoff* panel links to it.
9. Review the audit trail (`LEAD_RADAR_*` rows in `CrmAuditEvent`).

Only after a clean pilot should a nationwide plan (acknowledgement checkbox) be considered; it transfers ≈364 MB on your machine.

## Troubleshooting
* *"A chunk is missing"* → press Start upload again; it resumes from the last confirmed chunk.
* *"manifest was produced from a different plan"* → re-download this run's plan and re-extract.
* A stuck budget reservation (only possible with a future paid adapter) → Super Admin → Budget → Release.

## Recovery quick reference (automation)
* **Pause everything**: Automation page → *Pause* (or switch off live discovery). The tick exits at once; no data changes.
* **Stuck lease**: expires by itself (`leaseUntil`); the next tick takes over. Never edit the lease by hand.
* **Failed candidates** (`FAILED` import): inspect the reason on the Automation dashboard; they are retried only if their source facts change; a human can approve/import them manually.
* **Wrong policy activated**: create/preview/activate the previous rules again as a new version; candidates re-qualify; human decisions and already-imported prospects are never undone automatically.
* **Wrongly assigned prospects**: use the existing assignment screens; automation never moves engaged work.
* **Rollback of code**: Vercel instant rollback is safe; the additive schema is ignored by older code.
