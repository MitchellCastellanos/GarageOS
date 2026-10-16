# Controlled national rollout plan (nothing here is launched automatically)

Facts vs estimates: **Verified** = observed in code/tests/deployments. **Estimate** = reasoning from measured Overture footer hints (release `2026-09-23.1`, upper bounds), population scaling and the Québec pilot; no extraction outside Québec has been run. **Owner-only** = needs the Super Admin/owner.

## 1. Recommended order and the Ontario question

Workload hints (Parquet footers, upper bounds; **Verified** measurements in `EXTRACTION_HINTS`): ON 287 row groups / 251 MB · QC 47 / 71 · BC 44 / 38 · AB 27 / 23 · MB 16 / 13 · SK 10 / 8 · NS 9 / 15 · NB 8 / 13 · NL 11 / 20 · PE 3 / 5 · NU 79 / 84 · NT 17 / 16 · YT 2 / 2 (whole of Canada ≈ 385 / 364 MB, one province per run is the plan).

Expected size (**Estimate**: Québec staged 10,466 candidates across all automotive categories for 8.9 M people; scaled by population, same category mix): ON ≈ 15–19 k · BC ≈ 6–7 k · AB ≈ 5–6 k · MB/SK ≈ 1.5–2.5 k each · NS/NB ≈ 1–2 k each · NL/PE/territories < 1 k each. Coordinate coverage is a property of Overture points (≈ 100 % expected, **gate-enforced** at ≥ 80 %); language: ON/BC/AB/Prairies EN, NB bilingual, QC FR; email-enrichment potential tracks business density and website presence (not measured).

| # | Province | Role | Why |
|---|---|---|---|
| 1 | **Alberta (canary)** | validate the worker, gate, dashboard and import scope end to end | smallest workload that is still a real, mixed urban/rural, all-REMOTE, English-only province (23 MB, ≈ 5 k candidates ≈ an afternoon to inspect). No Québec bounding-box overlap, no FIELD territory, no language ambiguity. |
| 2 | **Ontario** | first scale-up and biggest prize | ≈ 40 % of Canada's population and the largest REMOTE pool, English. Validated recommendation: **yes first after the canary, not as the canary** — it is 11× Alberta's footer workload, its bounding box contains US border rows (Detroit/Buffalo — filtered by address country, tested) and Québec's Outaouais, and its review/import volume would hide a defect in the first run. |
| 3 | British Columbia | | second-largest English market, small workload (38 MB). |
| 4 | Manitoba, Saskatchewan | batch of small Prairies runs, one at a time | cheap, low risk. |
| 5 | Nova Scotia, New Brunswick (bilingual: needs the language-decision step), Newfoundland and Labrador, PEI | | smaller markets; NB needs FR/EN decisions per contact. |
| 6 | Yukon, NT, Nunavut | last | tiny volumes; Nunavut's bounding box is large (79 row groups) for little data. |
| — | Québec outside Greater Montréal | already extracted; REMOTE import is governed by the import scope | no new extraction needed. |

> Operational detail, real rehearsal numbers, owner click-paths and stop conditions: [alberta-canary-runbook.md](alberta-canary-runbook.md) (it supersedes the threshold table below where they differ).

## 2. Canary: exact steps (Alberta)

**Prerequisites (owner-only; none verified in production by engineering):**
1. GitHub repository secrets `SALES_CRON_SECRET` (= Vercel `CRON_SECRET`) and `SALES_CRON_BASE_URL` (`https://www.garage-os.ca`) exist; the workflow `Lead Radar discovery worker` is enabled (GitHub → Actions). Run it once manually: expected log "nothing to do".
2. Live discovery ON (Lead Radar settings + `LEAD_RADAR_ENABLED=1`). Automation state: whatever it is today. **Decide step 6 first.**
3. Seller setup for REMOTE (Sales Rep allow-list, lane caps) exactly as in the handoff §4 — only needed if assignment will run.

**Execution:**
1. *National readiness* page → set **Automatic import scope** to `AB` only → Save. (From now on the automation cannot import from any other province, even from stale approved Québec/Ontario candidates; they show as deferred.)
2. Same page → Alberta card → **Queue extraction** → confirm. (Owner approval checkpoint **C1**.)
3. GitHub → Actions → *Lead Radar discovery worker* → **Run workflow** (or wait ≤ 2 h). Expected: install ≈ 1 min, extraction ≈ 2–10 min, upload ≈ 1–3 min.
4. Open the run page: quality panel must read **"Quality checks passed"**. Alberta card → `PROCESSING` while qualification/import are pending, `READY` only when nothing is deferred.
5. **Checkpoint C2 (before any import): audit sample.** Candidates → province AB: 50 random *verified repair*, 50 *excluded*, 25 *human review* (filters exist). Accept only if the thresholds below hold.
6. Only if C2 passes, **C3**: let the automation take it (or import manually in batches of ≤ 200): confirm an ACTIVE policy and automation ON (CRM-only, pilot OFF, sending OFF). Run one cycle (*Run one cycle now*). Verify on the dashboard: prospects created with coordinates, FIELD = 0, all REMOTE, Super Admin never an assignee, `CrmAuditEvent` `LEAD_RADAR_*`.
7. Widen the scope (add `ON`, …) one province at a time, repeating 2–6 with a shorter C2 sample (25/25/10).

**Resource expectations (Estimate):** Actions minutes ≈ 10–20 per Alberta run; storage: none retained (cache ≤ ~100 MB); Vercel: only short chunk requests (≈ 5 k records / 250 = 20 requests); database growth ≈ 5 k candidate rows.

**Quality thresholds (go / no-go for C2, all must hold):**
| Metric | Threshold |
|---|---|
| Run quality verdict | `OK` (no acknowledgement needed) |
| Positions valid / staged | ≥ 95 % (gate floor is 80 %) |
| Unexpected rejections / received (everything except `OUT_OF_SCOPE_PROVINCE` and `OUTSIDE_CANADA`, which are expected: the extraction bounding box is deliberately generous and contains neighbouring provinces/states) | ≤ 2 % |
| Duplicates / staged | ≤ 3 % |
| Sampled *verified repair* that are real repair businesses | ≥ 90 % (≥ 45 of 50) |
| Sampled *excluded* that are wrongly excluded | ≤ 10 % (≤ 5 of 50) — any pattern of false exclusion is a classifier bug to fix before widening |
| Human-review share of staged | informational; > 50 % ⇒ investigate category mapping before widening |
| After import: prospects with coordinates / prospects | ≥ 95 % |
| Import failures (`FAILED`) | 0 poison records (isolated ones are expected and reported) |
| Assignments to Super Admin / FIELD-lane leakage | 0 / 0 |

**Pause and rollback controls (all exist):** per-province *Pause* (no claim, no schedule) · cancel the run (staged candidates kept) · automation *Pause* (master switch) · import scope (shrink to one province or an unused one) · live discovery OFF (stops the worker endpoint). Data rollback is non-destructive by design: staged candidates are evidence and stay; wrongly imported prospects are handled with the existing CRM cleanup tool (archive/decision, never silent deletion); the owner decides each bulk action. Code rollback: Vercel instant rollback (migrations are additive).

**Recovery procedure:** `STOPPED_BY_GATE` → open the run: re-extract (queue again) or acknowledge with a written reason if the result is expected · `EXTRACTION_FAILED` (3 attempts exhausted) → read the failure code on the card (`EXTRACTOR_EXIT_n`, `WORKER_STALLED`, `NETWORK`…), fix, queue again; the cached shards make the retry cheap · `PROCESSING` forever → card lists the cause (automation OFF, imports failing, awaiting qualification).

## 3. Owner approval checkpoints (summary)
**C0** set GitHub secrets & enable workflow · **C1** queue the canary province · **C2** accept the audit sample · **C3** allow import/assignment for the province · **C4** widen scope per province · **C5** any auto-refresh opt-in (`autoRefresh`) · **C6** (separate, later) anything outreach-related.
