# Alberta canary — readiness, owner instructions, thresholds and stop conditions

**Nothing in this document has been executed in production.** Alberta is not queued, no province is opted into auto-refresh, the import scope is unchanged, nothing was imported or assigned, no email was sent.
Legend: **Verified** (observed today), **Rehearsed** (real Overture data, local scratch database, never production), **Estimate**, **Owner-only**.

## 1. Verified state (2026-10-16)
| Check | Result |
|---|---|
| PR #137 production deployment | **Verified**: `dpl_9QFnZsKctYEZpUVqFMEsfd8yucGB`, state READY, commit `a193bb2…` (merge of #137), aliased to `www.garage-os.ca` and `garage-os.ca`; the login page of that deployment shows `build: a193bb2`. |
| Migrations | **Verified/inferred**: the production build runs `prisma migrate deploy` before `next build` and aborts on failure; the build completed ("Deployment completed"), so `20261020…`–`20261023…` (additive) are applied. The migration log lines themselves were truncated in the log API; owner SQL check below. |
| `/platform/sales/lead-radar/national` | **Verified** deployed and gated: an unauthenticated request lands on `/admin/login`. Rendering for the Super Admin could not be observed (engineering has no session). |
| `POST /api/lead-radar/worker` | **Verified** deployed (`GET` → 405). Behaviour without/with wrong bearer is covered by DB tests (401). |
| Vercel Production env | **Verified (names/targets only)**: `CRON_SECRET` exists (type *sensitive*: its value can never be read back, by anyone), `LEAD_RADAR_ENABLED` exists (value not readable). |
| **GitHub Actions secrets** | **Verified problem**: the existing `Lead Radar automation worker` runs (all "success") log `SECRET:` and `BASE_URL:` **empty** → `SALES_CRON_SECRET` and `SALES_CRON_BASE_URL` are **not configured**; those runs only print "not configured; skipping". The 15-minute automation worker has therefore never reached the app (only the daily Vercel cron does). |
| Discovery worker workflow | **Verified** registered and `active` on `main`: `.github/workflows/lead-radar-extract.yml` ("Lead Radar discovery worker (province extraction)"). 0 runs so far. |

Owner SQL check (optional, Supabase/psql, read-only): `select migration_name from _prisma_migrations where migration_name >= '20261020' order by 1;` → expect `20261020090000_run_quality_and_candidate_fit`, `20261021090000_discovery_worker_and_province_state`, `20261022090000_discovered_contacts`, `20261023090000_automation_import_provinces` (the table may live in schema `garageos` or `public` depending on setup).

## 2. The worker's exact configuration
| Item | Value |
|---|---|
| Workflow file | `.github/workflows/lead-radar-extract.yml` |
| Triggers | `schedule` `17 */2 * * *` (UTC, default branch only) and `workflow_dispatch` (input **preflight**, default ON) |
| Permissions | `contents: read` only. No `GITHUB_TOKEN` write, no PR/fork trigger → untrusted code never runs with the secret. |
| Concurrency | one run at a time (`lead-radar-extract`, no cancel) |
| Secrets | `SALES_CRON_BASE_URL` (required) + `LEAD_RADAR_WORKER_SECRET` **or** `SALES_CRON_SECRET` (the dedicated one wins when both exist) |
| URL format | exactly `https://www.garage-os.ca` — https, **no trailing slash, no path**. The workflow rejects anything else, and reports a redirect (the apex `garage-os.ca` may redirect; a redirect would drop the POST). |
| Endpoint | `POST {BASE_URL}/api/lead-radar/worker`, `Authorization: Bearer <secret>`, JSON `{action: peek|claim|heartbeat|attach|chunk|complete|fail}` |
| Behaviour with nothing queued | `peek` → `{pending:false}` → the job ends in seconds; Python is not installed, nothing is extracted/uploaded, no run/candidate/prospect/assignment/audit row is created (**tested**: `lead-radar-worker-db` "scheduled check with NOTHING queued is inert"). |
| Behaviour when unconfigured | scheduled run: warning + exit 0 (nothing to do); **manual preflight: red failure** naming the missing secrets. |
| Behaviour on 401 / redirect / 5xx | job fails red with the cause (secret mismatch → 401). |
| Safety of the secret | passed only to the `peek` step and the worker step; **the extractor subprocess does not inherit it** (tested); logs never print it (GitHub masks it, the script never echoes it). |

### Can the existing `SALES_CRON_SECRET` / `CRON_SECRET` be reused? (never print secret values)
* **Technically yes and by design** — the other two cron workers use the same pair, and the worker endpoint uses the same fail-closed constant-time bearer check.
* **But**: (a) the Vercel `CRON_SECRET` is *sensitive* (write-only), so you can only reuse it if you still have its value elsewhere (password manager). If you do not, you must set a **new** value in Vercel and redeploy; (b) putting `SALES_CRON_BASE_URL` + `SALES_CRON_SECRET` in GitHub also wakes the 15-minute automation worker and the 10-minute sales email worker (both are still gated by their own switches — automation OFF/`sendingEnabled` OFF — but they start calling production).
* **Recommendation (least privilege): create a dedicated `LEAD_RADAR_WORKER_SECRET`** (new random value) in Vercel Production **and** GitHub. It can only call the worker endpoint (queue-only runs), not the cron/email endpoints, and leaves `CRON_SECRET` and the other workers untouched. Reusing `CRON_SECRET` is acceptable if you prefer one secret.

## 3. Owner instructions — configure and enable (≈ 10 minutes) **Owner-only**
1. **Create the secret** (never paste it in chat/docs): in a terminal `openssl rand -hex 32` (or your password manager's generator, 32+ chars). Keep it in your password manager.
2. **Vercel** → https://vercel.com/mitchellcastellanos-projects/garage-os/settings/environment-variables → *Add New* → Key `LEAD_RADAR_WORKER_SECRET`, Value = the secret, Environment **Production only**, tick *Sensitive* → Save. Then https://vercel.com/mitchellcastellanos-projects/garage-os → *Deployments* → latest Production deployment → ⋯ → **Redeploy** (env changes only apply to new deployments).
3. **GitHub** → https://github.com/MitchellCastellanos/GarageOS/settings/secrets/actions → *New repository secret* ×2:
   * Name `LEAD_RADAR_WORKER_SECRET` — Secret: the same value.
   * Name `SALES_CRON_BASE_URL` — Secret: `https://www.garage-os.ca` (nothing after `.ca`).
   (If you prefer reuse instead of a dedicated secret: create/set `SALES_CRON_SECRET` = the value of Vercel `CRON_SECRET`, and understand the side effect in §2.)
4. **Enable Actions/workflow**: https://github.com/MitchellCastellanos/GarageOS/actions — the workflow list already shows *Lead Radar discovery worker (province extraction)* as active. If GitHub shows "Workflows aren't being run on this repository", click **Enable**. (Settings → Actions → General → *Allow all actions* must be on.) Scheduled workflows run only from `main` ✓; GitHub pauses scheduled runs after 60 days without repo activity (public repos).
5. **Preflight** (changes nothing): Actions → *Lead Radar discovery worker (province extraction)* → **Run workflow** → branch `main`, leave **preflight ✓** → Run. Open the run → *Summary*. Expected:
   * ✅ "Worker endpoint reachable and authenticated (HTTP 200)" and "Nothing is queued: no extraction, import or assignment will happen."
   * "Alberta dry-run": `release 2026-09-23.1`, `rowGroupsScanned 27`, `estimatedMB ≈ 82`, `rowsEmitted 0` (footers only).
   * ❌ 401 → the GitHub value differs from Vercel's (re-set both, redeploy). ❌ "Secrets not configured" → step 3. ❌ redirect → fix the URL.
6. **Private-repo minutes** (Estimate): empty 2-hourly checks ≈ 360 min/month; check https://github.com/settings/billing → *Actions*. Change the cron to `17 */6 * * *` to cut it to ≈ 120.
7. Confirm in GarageOS (Super Admin): Lead Radar settings show live discovery ON (database switch) — `LEAD_RADAR_ENABLED` exists in Production but its value is unreadable to engineering.

## 4. Rehearsal evidence (real Overture 2026-09-23.1, extractor 1.3.0, local scratch DB — **Rehearsed**)
Reproduce: `python3 scripts/lead-radar/overture_extract.py --plan scripts/lead-radar/plans/alberta-canary.json --out ./ab` then `GARAGEOS_CRM_TEST_DB_URL=<local scratch db> CANARY_DIR=./ab npx tsx --test tests/lead-radar-canary-rehearsal.test.ts` (writes `rehearsal-report.json` with counts and a 50/50/25 audit sample).
| Measure | Alberta result |
|---|---|
| Extraction time | 17 s on a laptop-class network, 27 row groups, 261,845 rows examined (estimated read 82 MB — higher than the 23 MB footer hint, which counted only needed columns) |
| Records delivered | 7,783, **all 7,783 with a valid source point** (the float32 fix works on real data); plan hash identical to the one the app issues |
| Worker protocol | 32 chunks; replay through claim → attach → chunks → complete; verdict **OK** |
| Rejected | 1,125: **1,124 `OUT_OF_SCOPE_PROVINCE`** (expected — the bounding box also covers BC/SK/NWT/Montana) + 1 invalid record (0.013 %) |
| Staged candidates | 6,595 (+ 63 duplicates kept as evidence = 0.95 %) |
| Position coverage | 6,595 / 6,595 = 100 % |
| Repair-fit at staging | VERIFIED_REPAIR 4,267 (64.7 %) · HUMAN_REVIEW 879 (13.3 %) · EXCLUDED 1,449 (22.0 %) · unclassified 0 |
| National card | `PROCESSING` (extraction done; qualification/import not run) — never `READY`; 0 prospects created |
| Classifier audit (my reading of business **names only**, no websites) | EXCLUDED sample of 50: ≈ 2 doubtful false exclusions (≈ 4 %). VERIFIED sample of 50: first pass ≈ 8–9 questionable (≈ 82–84 % plausible) → I tightened the shared classifier (industrial/oil-field/truck-body/powder-coating/truck-stop/registry names, pick-a-part yards, unmapped motorcycle codes now go to HUMAN_REVIEW or EXCLUDED; tests added) → second sample ≈ 6 questionable (≈ 88 %). **Still around the 90 % line — the real audit (C2) decides.** |

## 5. Quality thresholds and STOP conditions
Go/no-go **numbers** (all must hold at checkpoint C2, before any import). Any "STOP" action: set the province *Pause* (national page), cancel the run if still running, and if the automation is ON press *Pause* on the Automation page; staged candidates stay as evidence.
| Area | Threshold (go) | STOP if |
|---|---|---|
| Extraction / gate | run verdict `OK`; extraction completes within 3 worker attempts | any blocking verdict (`NO_COORDINATES`, `ALL_COORDINATES_REJECTED`, `LOW_COORDINATE_COVERAGE`, `HIGH_REJECTION`, `COUNT_MISMATCH`, `EXTRACTION_EMPTY_SUSPECT`) — do **not** acknowledge unless you can explain it; `WORKER_RETRIES_EXHAUSTED` |
| Unexpected rejections | ≤ 2 % of received (excluding `OUT_OF_SCOPE_PROVINCE`/`OUTSIDE_CANADA`, which are expected) | > 2 % or a new diagnostic code |
| Coordinates | ≥ 95 % of staged candidates with a valid position (gate floor 80 %) | < 95 % |
| Repair-fit (sample audit of 50 verified + 50 excluded + 25 review, random: filter Candidates → AB, "Verified repair"/"Excluded"/"Human review") | ≥ 90 % of sampled verified are real repair/maintenance/body businesses a seller could sell to; ≤ 10 % of sampled excluded are wrongly excluded | verified precision < 85 %, or a **repeating** false pattern (e.g. a whole category wrongly verified/excluded) — report it; the classifier is tuned before widening |
| Human review | informational; ≤ 25 % of staged | > 50 % (category mapping problem) |
| Duplicates | ≤ 3 % of staged | > 3 %, or a pair of **different** businesses linked as duplicates (check 10 random) |
| Unclassified candidates | 0 after one automation cycle | any remain after two cycles |
| CRM import (after C3, first cycle) | created + linked + review = approved; FAILED isolated ≤ 1 %; prospects with coordinates ≥ 95 %; every created prospect has `repairFit = VERIFIED_REPAIR` | any EXCLUDED prospect created; any prospect assigned to the Super Admin; any FIELD-lane assignment for Alberta; FAILED > 1 %; coordinates < 95 % |
| Scope | Automatic import scope shows `AB` only | scope empty/other while verifying |

## 6. The controlled canary (do not run before the owner decides)
0. Complete §3 (secrets + preflight green).
1. National page → **Automatic import scope** → tick **Alberta only** → Save. (This is the safety net: from now on the automation cannot import outside AB.)
2. National page → Alberta card → **Queue extraction** → confirm (checkpoint **C1**). Scope is *REPAIR + BODY_GLASS*, release "latest" (pinned to the run on first attach).
3. Actions → *Lead Radar discovery worker* → **Run workflow** → **untick preflight** → Run (or wait ≤ 2 h). Expected ≈ 5–15 min.
4. Verify extraction (§7), then run the C2 audit (§5). **Stop here** if any threshold fails.
5. Only after C2: **C3** — decide on automation (policy ACTIVE, automation ON for CRM-only, pilot OFF, sending OFF, Sales Rep allow-listed). Run one cycle. Verify the import rows and assignment (§7).

## 7. Extraction success is not downstream completion
| Level | Where to look | "Done" means | Not done means |
|---|---|---|---|
| 1 Extraction | GitHub run log ends "run … completed (verdict OK)"; run page → *Run quality gate* panel | status COMPLETED, verdict `OK` (or `ZERO_RESULTS_LEGIT`), counters add up | `FAILED` + verdict/`WORKER_RETRIES_EXHAUSTED`; worker exit code 2 = gate stop; 1 = failed attempt (retried automatically) |
| 2 Staging quality | national card (candidates, verified/review/excluded/duplicates, unclassified) | unclassified 0, duplicates ≤ 3 % | card stage `PROCESSING` with "Not classified yet" |
| 3 Qualification | Automation dashboard → qualification lanes / "awaiting evaluation"; national card "awaiting qualification" | awaiting 0 | automation OFF or no ACTIVE policy → card says so ("NO_AUTOMATION_PROGRESS") |
| 4 CRM import | national card: prospects, "approved, not yet imported", import failures; Automation → CRM handoff | approved-not-imported 0 (within the import scope) | deferred > 0; failures listed with codes |
| 5 Assignment | Automation dashboard → assignment/workload; national card "eligible, unassigned" vs "assigned" | eligible-unassigned 0 **or** an explained capacity/territory skip | `NO_CAPACITY`, `NO_ELIGIBLE_SELLERS_CONFIGURED`, caps reached |
| 6 Outreach | email funnel on the national page | not part of the canary | — |
The national card shows **READY only when levels 2–4 are finished with no failures**; level 5 is reported as its own numbers. A green GitHub run alone means level 1 only.

## 8. What still prevents automated email outreach
(Full plan: [email-outreach-readiness.md](email-outreach-readiness.md).) **Blocked today:**
* **Contact data**: only Overture's published email (sparse; coverage unmeasured — measure after the first cycle). No website enrichment, no MX check, no role/person confidence beyond flags, no language detection (language is never guessed).
* **Review UI** for discovered contacts does not exist yet (server action only).
* **CASL**: every address needs a reviewed sending basis with structured evidence (source URL, capture time, role relevance, no-"no-unsolicited" statement) **and** a second person's approval for published addresses — none exist. Rules and templates are *Pending legal review*. Published ≠ consent.
* **Sender**: founder's Sales Rep sender identity, approved domain with SPF/DKIM/DMARC, real inbound reply round-trip, booking page — *Pending owner action*; warm-up takes weeks.
* **Switches**: `sendingEnabled`, pilot, sequences are all OFF and stay OFF; FIELD territories (Greater Montréal/Laval/Rive-Sud) are never cold automated first contacts.
* **Québec language rules / bilingual compliant templates** and unsubscribe handling need legal sign-off.

## 9. GO / NO-GO
**GO** to start §3 (configuration + preflight): everything needed is deployed and verified, and it changes nothing.
**NO-GO** to queue Alberta until: the secrets exist and the preflight is green; the import scope is set to AB; you accept checkpoint C1. **NO-GO** to import until the C2 audit meets §5.
