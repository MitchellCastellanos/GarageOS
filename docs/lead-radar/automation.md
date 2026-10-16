# Lead Radar automation by approved policy

Human approval of a **policy**, human review of **exceptions**.

**Deployment status:** this code and migration `20261016090000` are deployed to Production (PR #127). Everything shipped **OFF** and the deployment altered no production data. As of this writing the owner has only run a read-only V1 qualification *preview*; **no policy is active, automation is off, no prospect was imported/assigned by automation, and no email was sent.** Qualification V2 (PR #128, [qualification-v2.md](qualification-v2.md)) adds options to the same engine; V1 behaviour and its fingerprint are unchanged.

## 1. Verified audit findings (current `main`, PR #126)

| # | Finding | Status |
|---|---|---|
| 1 | Review was per-candidate-id (≤200/batch); import only of APPROVED rows through `applyImportBatch` with `FOR UPDATE SKIP LOCKED`. Not scalable. | VERIFIED IN CODE |
| 2 | Imports left prospects UNASSIGNED and created **no contact** (the business email stays on the prospect). An imported Overture email can never become a sendable address without a human adding a contact + CASL evidence. | VERIFIED IN CODE (+ DB test) |
| 3 | The existing assignment engine already supports FIELD **and** REMOTE for one seller (`salesMode=FIELD` may also acquire REMOTE-held prospects), coverage, pause switch and `maxActiveLeads`. No second engine needed. Missing: per-lane caps/reporting, language fit, allow-list, capacity-vs-no-seller reasons. | CORRECTED (founder FIELD+REMOTE needs no redesign) |
| 4 | Super Admin and Sales Rep are separate identities; auto-assignment only considers ACTIVE `SALES_REP` staff — never the Super Admin. | VERIFIED IN CODE |
| 5 | Send policy already enforces kill switch, identity/domain, suppression, DNC, unsubscribe footer, daily cap and a CASL basis; published-address bases need structured evidence **and a second person's approval**. Reply/unsubscribe/booking stop enrollments. | VERIFIED IN CODE + existing DB suites |
| 6 | `inboundVerifiedAt` (reply path proven by a real round trip) was only a *warning* for manual sends. | CORRECTED — mandatory for pilot enrollments |
| 7 | Default sequence templates carry the seller's booking link; a seller without an enabled booking page pauses every step. | FOUND BY TEST — now an eligibility reason |
| 8 | One nationwide plan is already supported (385 row groups ≈ 364 MB < 800 cap); staging is idempotent per `(source, sourceRecordId)` so overlapping plans cannot duplicate candidates. | VERIFIED IN CODE |
| 9 | Vercel crons are daily; the repo already uses a GitHub Actions caller for the sales worker. | VERIFIED |
| 10 | Production data, Resend/Vercel/Neon state, real sender identities, CASL legal position. | **NOT VERIFIED** (no production read access; legal review required) |

## 2. Architecture decisions

* **Policy** (`CrmLeadPolicy`): immutable, versioned, hash-bound. Activation needs a preview of the *exact* rules (≤24 h old); one ACTIVE policy (DB partial unique index). Inputs are only existing signals (licence, tier, match state, chain signal, staging quality flags, territory) — **no invented confidence/completeness threshold**. Ambiguous matches, branches, unknown categories and source-change-after-approval are *always* human; disallowed licences, excluded tier and unusable records are *always* blocked. Human decisions are never changed by a policy.
* **Queues are the tables**: qualification, import, assignment and eligibility select "work not yet done" in bounded pages with `SKIP LOCKED`; interrupted runs resume by construction. Single-runner lease, two switches (live discovery **and** automation), per-stage switches, audit. Poison records are isolated by one-at-a-time retry and parked `FAILED`; retried only if source facts change.
* **Import** reuses `applyImportBatch` (new options only).
* **Assignment** extends `planAssignments` (lane caps, language, `CAPACITY_EXHAUSTED`/`LANGUAGE_MISMATCH`) and shares one apply function with the manual preview→confirm flow. Explicit Super Admin allow-list; only Lead-Radar-imported prospects; lane recorded in `assignmentMode`. Untouched prospects may be returned when a seller becomes unavailable (opt-in); engaged work never moves.
* **Outreach eligibility** is advice, never permission: needs an emailable contact, a *reviewed* CASL basis, a ready sender of the **assigned seller**, decided EN/FR, no suppression/DNC, not a FIELD-held cold contact. Pilot enrollment re-assesses live, runs the full send policy, first-touch only.
* **No new paid infrastructure.** Extraction stays local: `scripts/lead-radar/Run-LeadRadarExtraction.ps1`.

## 3. Operator runbook

1. **Extract nationally (founder's PC).** Lead Radar → new run, all provinces (acknowledge large scope; overlap warning shown) → download `plan.json` → `.\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan plan.json` → upload `manifest.json` + `records.ndjson` → *Finish run*. Refresh = same scope on a newer release.
2. **Policy.** Lead Radar → Automation → *New policy draft* → **Preview** → **Activate**. A new version re-evaluates pending candidates without re-extraction.
3. **Sellers.** Set mode, caps, languages in the assignment screen; sender identity ACTIVE, reply path verified, booking enabled. In Automation tick **the founder's Sales Rep account** (FIELD, no coverage restriction ⇒ FIELD + REMOTE). Add brother/wife (REMOTE) later the same way.
4. **Turn on** (needs an active policy). Runs every 15 min (GitHub Actions) / daily (Vercel). *Run one cycle now* and *Pause* are available.
5. **Review exceptions only** via the dashboard links (candidates lane/reason filters).
6. **Outreach.** Sellers add contacts and CASL evidence in the existing flow (second person approves published-address evidence). Pilot: ACTIVE sequence, small caps, company-wide sending on, *Start pilot*. Measure in stage 6.

## 4. Owner-gated (NOT done by engineering)

Activate a policy; turn automation on; name sellers; start the pilot; enable company-wide sending; set GitHub secrets `SALES_CRON_SECRET`/`SALES_CRON_BASE_URL` for the 15-minute caller; legal sign-off of CASL basis rules (product controls, **not legal advice**); other provinces. No production data was read, imported, assigned or emailed.

## 5. GO / NO-GO

* **GO**: the read-only V1 preview has been run (924 AUTO_ELIGIBLE / 1,103 HUMAN_REVIEW / 7 BLOCKED of 2,034 evaluated); next, compare V1 vs V2 read-only, choose a policy, then policy activation + automation ON with the founder as sole seller (CRM import + assignment only, no email).
* **NO-GO** for automated email until: legal review; founder sender ACTIVE with verified reply round trip and booking page; contacts with approved evidence; sequence + caps agreed. FIELD-held (Greater Montréal) prospects are never automated cold contacts by design.

## 6. Known limits

Eligibility re-assessed every 6 h or when contacts/bases change. Preview scans ≤60k rows / 40 s and flags truncation. UI verified by build + headless render at 1280 and 390 px only.

## 7. CRM-only activation checklist (no email)
1. Policy panel: activate the chosen policy (preview ≤24 h old is required).
2. Sellers: founder **Sales Rep** account allow-listed (never the Super Admin account); lane caps and languages set.
3. Leave stage 5 (eligibility) off or on as wished, **leave the pilot OFF** and `CrmCommsSettings.sendingEnabled` OFF. Import and assignment never email anyone.
4. Cron needs `CRON_SECRET` in Vercel and GitHub secrets `SALES_CRON_SECRET` / `SALES_CRON_BASE_URL` for the 15-minute caller; otherwise only the daily Vercel cron and *Run one cycle now* run it.
5. Verify: run history on the dashboard (counts per stage, errors), imported prospects appear in the CRM unassigned→assigned to the allow-listed seller, exceptions list by lane/reason.

## Addendum — eligibility gates (CRM quality audit)
Assignment (manual preview and Lead Radar automation share `buildAssignmentProposals`) only proposes prospects whose repair fit is `VERIFIED_REPAIR` (or unclassified hand-entered). Import rejects clearly non-repair candidates durably and stamps the fit. See [crm-cleanup.md](crm-cleanup.md).
**Production automation status is Not verified:** the Lead Radar tables are not readable by engineering and the Vercel Hobby plan keeps runtime logs for one hour, so the last successful cron run, stalled jobs and the master switch state could not be observed. Known structure (code): daily Vercel cron `/api/webhooks/cron/lead-radar` 12:45 UTC + GitHub Actions every 15 min on weekdays 11–23 UTC (needs repo secrets `SALES_CRON_SECRET`, `SALES_CRON_BASE_URL`; whether they are set is unverified); the endpoint does nothing unless live discovery (`LEAD_RADAR_ENABLED` + DB switch) **and** automation are ON with an ACTIVE policy. Qualification, CRM import, assignment, outreach-eligibility assessment and sending are separate stages/switches; sending (`sendingEnabled`) and the pilot are separate again and were not touched. ~~Extraction still requires the founder's PC~~ — superseded (national engine, 2026-10-16): province extraction runs on a scheduled GitHub Actions worker (`lead-radar-extract.yml`) for runs a Super Admin queued; the automatic CRM import can be limited to chosen provinces (`importProvinces`, empty = all); a blocking run-quality verdict keeps a run out of qualification. Unchanged and still **Not verified** in production: master switch state, last cron run, secrets presence. See [national-engine.md](national-engine.md).
