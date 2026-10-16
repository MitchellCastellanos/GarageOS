# Lead Radar — handoff for the next agent

Read this first. Then [geolocation.md](geolocation.md) (prospect map positions), [automation.md](automation.md), [qualification-v2.md](qualification-v2.md), [runbook.md](runbook.md), [licensing-and-compliance.md](licensing-and-compliance.md).
Legend: **Completed** (done in code/deploy) · **Verified** (checked by tests/build/Vercel) · **Pending owner action** · **Pending legal review** · **Not verified** (never observed).

## 0. Operating rules that still apply
Engineering may merge/deploy verified code and docs. Engineering may **not**: delete/reset production data; activate a policy; enable automation; import or reassign production prospects; activate campaigns or send commercial email; change paid plans or the CAD 25/month cap; bypass eligibility/CASL checks; invent identities, consent evidence or credentials. Never print secrets. Every one of these is an **owner action** performed in the Super Admin UI.

## 1. Current production state
| Item | Status |
|---|---|
| PR #126 foundation (merge `ba9bb2512328f52259c4a26166c60b934a7e8bba`) | Completed, deployed. |
| PR #127 automation (merge `2e57e10`), migration `20261016090000_lead_radar_automation` | Completed; migration applied to Production by the Vercel Production build (additive: enums, 4 tables, columns, CHECKs, partial unique index). Verified (deployment READY). |
| PR #128 Qualification V2 + read-only comparison | Merged and deployed (merge commit and deployment recorded in the final session report / `git log` on `main`). No schema change. |
| Active qualification policy | **None.** The owner ran one *preview* only. |
| `CrmLeadAutomation` (singleton) | Created OFF: enabled=false, pilot off, release off, no sellers allow-listed. |
| Live discovery (`LEAD_RADAR_ENABLED` + DB switch) | Owner-controlled; not touched by engineering. |
| Company-wide sending (`CrmCommsSettings.sendingEnabled`) | Not touched; must stay OFF until the pilot is approved. |
| Emails sent / prospects imported by automation / assignments by automation | **None.** |
Secrets involved (names only): `CRON_SECRET` (Vercel), GitHub Actions secrets `SALES_CRON_SECRET`, `SALES_CRON_BASE_URL`. Whether they are set is **Not verified**.
Operations NOT performed in any session: production data reads (engineering has no DB access), policy creation/activation, automation enable, cron probing on production (Vercel deployment protection blocks unauthenticated calls; cron auth is covered by tests), seller allow-listing, sender setup, CASL evidence entry, sending.

## 2. Québec pilot facts (observed by the owner, V1 only)
* Overture release `2026-09-23.1`; run: 14,525 records read → **2,084 candidates staged** (2,028 new, 37 existing, 19 ambiguous; 1,312 primary tier).
* First V1 qualification preview: **2,034 evaluated** (the other **50 were handled manually by the owner**; not investigated further) → **924 AUTO_ELIGIBLE · 1,103 HUMAN_REVIEW · 7 BLOCKED**, 0 outside scope.
* Main HUMAN_REVIEW reasons (overlapping): secondary category 580, low confidence 333, questionable category 189, chain 156, branch 57, incomplete address 37, links to existing 28, no phone/website 21, ambiguous CRM match 19, no street/postal 12, no phone/address 7, region missing 1.
* These are **V1 counts, not V2 results.** V2 numbers do not exist yet.

## 3. Qualification V2 (implemented, NOT active)
* Files: `src/domain/lead-radar/{business-type,policy-rules,qualification,qualification-hash,policy-compare}.ts`, `src/lib/lead-radar/compare.ts`, `src/actions/lead-radar-automation.ts` (`compareLeadPolicies`, Super Admin, read-only), `src/components/lead-radar/{PolicyPanel,PolicyComparePanel}.tsx`, `scripts/lead-radar/policy-report.ts`. Tests: `tests/lead-radar-qualification-v2.test.ts`, `tests/lead-radar-compare-db.test.ts`.
* Rules (`RECOMMENDED_V2_RULES`): `businessTypes=REPAIR_CAPABLE`, `nonTargetBusiness=BLOCK`, `genericService=NAME_EVIDENCE`, `lowConfidence=CORROBORATED`. Defaults equal V1; V2 option keys enter the rules hash only when non-default, so the V1 fingerprint `a3598feb…bd987` is unchanged (asserted by a test). Mandatory-human and blocked categories (ambiguous matches, branches, chains, licence, source change, thin data, dealers/customization/inspection, OEM-branded names) cannot be opened by any option (fuzz-tested).
* **How to get the real comparison (read-only):** sign in as Super Admin → `/platform/sales/lead-radar/automation` → *Compare policies (read-only)* → A = V1 defaults (or stored policy), B = Recommended V2 → Compare; optionally *Show business names*; download the `.md`. It reads up to 60,000 rows (keyset pages of 2,000, 45 s deadline) and writes nothing, not even audit rows. Alternative: `DATABASE_URL=<prod> npx tsx scripts/lead-radar/policy-report.ts --out ./policy-report [--include-names --selftest-readonly]` (one `BEGIN READ ONLY` transaction).
* **How to interpret:** look at *Movements and why* (every candidate that changes lane lists the reasons cleared/added), *By taxonomy category* (verifies the assumption that SECONDARY mixes real repair with dealers/parts/wash), low-confidence diagnostics (whether Overture `sources[].dataset` names truly identify independent contributors — **Not verified**), and the invariants block (must be all green). Treat the automatic rate as an output, not a target.
* Verified: unit/DB tests, tsc, eslint, build, Vercel Preview READY. **Not verified:** behaviour on the 2,034 real rows; keyword lists are conservative EN/FR heuristics, not exhaustive.

## 4. CRM automation (OFF) — activation steps for the owner
1. Compare V1 vs V2 (section 3). Decide.
2. Automation page → Policy panel → create draft (or *Fill the recommended V2*) → **Preview** → review → **Activate**. Preview must be ≤24 h old and match the rules hash.
3. Sellers: the founder has **two accounts** — Super Admin (never an assignment target, never a sender) and a Sales Rep account. Allow-list the **Sales Rep** account (mode FIELD, no coverage restriction ⇒ FIELD + REMOTE; set lane caps `maxActiveFieldLeads` / `maxActiveRemoteLeads`, `leadLanguages`). Brother/wife later: REMOTE-only Sales Rep accounts added the same way. Greater Montréal territory ⇒ FIELD lane; elsewhere REMOTE.
4. **CRM-only activation**: keep *pilot* OFF and company-wide sending OFF; switch automation ON. Import and assignment never email anyone. Cron: GitHub Actions `.github/workflows/lead-radar-cron.yml` every 15 min (needs the two GitHub secrets) + Vercel daily `45 12 * * *`; *Run one cycle now* works without either.
5. Verify the first cycle on the dashboard: run history (per-stage counts, `FAILED` count, lease), new unassigned→assigned `CrmProspect` rows (source Lead Radar, `autoAssignedAt`, `assignmentMode`), exceptions by lane/reason in Candidates, workload table per seller, `CrmAuditEvent` rows `LEAD_RADAR_*`. Errors: poison candidates are parked `FAILED` after isolated retries and retried only when source facts change.
Pause/recovery: see runbook "Recovery quick reference". Gate: nothing runs unless live discovery **and** automation are on and a policy is ACTIVE.

## 5. Email / outreach (OFF; legal gate)
* Three different things: **import** (CRM row), **eligibility** (`CrmOutreachEligibility`: advice with reasons; not permission), **sending** (existing send policy, manual or pilot enrollment).
* Eligibility requires: an emailable **contact** (imports create none — the business email stays on the prospect), a **reviewed CASL basis** (`evaluateSendingBasis`; published-address bases need structured evidence **and a second person's approval**), a ready sender of the **assigned seller** (corporate identity, ACTIVE, domain approved, `inboundVerifiedAt` = real reply round trip), decided EN/FR, seller booking page enabled (default templates carry the booking link), no suppression/DNC/unsubscribe, not a FIELD-held cold contact.
* Sender ownership: all seller-owned mail goes from that seller's corporate sender; the Super Admin is never the sender. Configure the founder's Sales Rep sender and prove the reply round trip **Pending owner action**.
* Pilot (`enrollAutomated`): first-touch only, ACTIVE sequence, small daily/total caps, requires `CrmCommsSettings.sendingEnabled`, auto-pauses `REPLY_PATH_UNVERIFIED`. Unsubscribe/reply/booking stop enrollments. **No mass emailing is authorised.** CASL sign-off of the basis rules: **Pending legal review** (product controls, not legal advice).

## 6. National rollout
* Per-province extractions: new run for the province (or all, with the acknowledgement checkbox) → `plan.json` → on the founder's Windows PC `.\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan plan.json` (Python/pyarrow venv, no credentials, resumable, deterministic) → upload `manifest.json` + `records.ndjson` (verified, resumable chunks) → Finish run. Nationwide plan ≈ 385 row groups ≈ 364 MB < 800 cap.
* Cross-run dedupe: candidates are unique per `(source, sourceRecordId)`; overlapping plans cannot duplicate; CRM dedupe uses `classifyAgainstPool`; refresh on a newer release re-evaluates facts and withdraws stale approvals.
* Cost: open data, CAD 0; budget cap CAD 25 shared; no new paid infrastructure; do not change plans.
* Not verified: real coverage numbers outside Québec; extraction time on the owner's PC for national scope.

## 7. Prioritised checklist
| # | Item | Status | Where |
|---|---|---|---|
| 1 | Confirm latest `main` deployment READY and aliased to www.garage-os.ca, includes #128 | Verified at merge time (re-check) | Vercel |
| 2 | Run V1 vs Recommended V2 comparison on production | **Pending owner action** (Super Admin sign-in required) | Automation → Compare |
| 3 | Analyze results with the owner; recommend activate / adjust per option | Next agent | section 3 |
| 4 | Activate chosen policy (preview → activate) | **Pending owner action** | Policy panel |
| 5 | Allow-list founder Sales Rep (FIELD+REMOTE), caps, languages | **Pending owner action** | Automation controls |
| 6 | Set `CRON_SECRET` / GitHub secrets | **Pending owner action**; current state Not verified | Vercel / GitHub |
| 7 | Switch automation ON (CRM-only, pilot OFF), run one cycle, verify | **Pending owner action** then next agent verifies | Automation |
| 8 | Handle exceptions by lane/reason | Pending | Candidates filters |
| 9 | Other provinces extraction | Pending | Lead Radar → New run |
| 10 | Sender setup, reply round trip, booking page, contacts + CASL evidence | **Pending owner action** | Sales comms settings |
| 11 | Legal review of CASL basis rules | **Pending legal review** | — |
| 12 | Pilot (small, REMOTE) after 10–11 | Pending; not authorised yet | Automation → pilot |

## 8. First objectives for the next agent
1. Confirm PR #128 is deployed (`git log origin/main`, Vercel production READY).
2. Help the owner run the production comparison via the read-only UI (or CLI) and receive the report.
3. Analyze: movements, causes, category table, low-confidence diagnostics, invariants; recommend activate or adjust (tighten any option to `REVIEW`).
4. After the owner's approval, guide the CRM-only Québec activation (section 4) — the owner clicks; you verify.
5. Verify the first import/assignment cycle and exceptions.
6. Continue province extractions; later, with legal/sender prerequisites met, a compliant REMOTE pilot.

## 8b. Prospect geolocation (Field Planner) — see [geolocation.md](geolocation.md)
Overture's point was dropped by the extractor; it is now carried to staging (`sourceLatitude/Longitude`), to `CrmProspectLocation` at import, and by a Super Admin dry-run-first backfill (Settings → Geocoding). Paid Mapbox fallback exists but is **disabled** (no spend without owner approval). **Pending owner action:** refresh the QC candidates once with extractor 1.1.0, run the dry-run, review, then Apply. No production backfill has been run.

## 8c. Session 2026-10-16 (autonomous sales engine) — status
| Phase | Result |
|---|---|
| 0 Geolocation readiness | Production deployment `dpl_BgpVNbcpiYB1t8byTKdH2pt3Wd3r` (`94cec88`, #129) **Verified READY + aliased** (www.garage-os.ca, garage-os.ca). Migration `20261017090000…` **inferred applied** (build runs `migrate deploy` first and aborts on failure; log line itself not visible) — owner SQL check in [owner-runbook-geolocation.md](owner-runbook-geolocation.md). Extractor 1.1.0, source-point path, dry-run/resumable backfill: verified by code + tests. Mapbox paid fallback: disabled in code (needs env + DB flag + budget). Exact Windows PowerShell steps in the runbook. **No production extraction/backfill was run.** |
| 1 Field Planner 2.0 | PR #130 (see `docs/field-route-planner.md` → "Field Planner 2.0"): viewport map with server clustering (not limited by the 25-stop route), 8 derived CRM status filters + legend, nearby (one-shot GPS / free place search / radius), unlocated list, add/remove from map, in-place visit result via the existing transactional writer (idempotent; stop + activity + task + opportunity + marker). No migration. Merge/deploy status: see the final report in the PR. **Not verified:** live MapLibre rendering on a phone (no basemap token in the engineering environment). |
| 2 Continuous coverage | Audit: already present — per-`(source, sourceRecordId)` uniqueness, refresh on newer release re-evaluates facts (`changedSinceImport`, approvals withdrawn, CRM never overwritten), per-province coverage + `NEVER`/`STALE` (90 d) gap flags in `overview.ts`, resumable verified uploads, failed-candidate parking, shared CAD 25/month ledger. **Gaps (not built, need owner decisions):** scheduled/automatic extraction (extraction runs on the founder's PC by design — no server-side Overture job, no paid dependency), per-province release freshness vs newest Overture release. |
| 3 National remote | Audit: province-scoped plans, FIELD-exclusive Montréal/Laval/Rive-Sud vs REMOTE elsewhere, lane caps, REMOTE-only sellers excluded from FIELD, Super Admin never an assignment target — all in `automation.ts`/assignment engine with DB tests (`lead-radar-automation-db`: capacity, FIELD never to REMOTE, idempotency). Language: imports stay `UNKNOWN` (no reliable evidence in Overture); `resolveEffectiveLanguage` never defaults to French and eligibility requires a decided EN/FR → human review. Deliberately no language guessing from province/name. |
| 4 Outreach readiness | Audit: reply, meeting booking, opt-out, bounce/complaint and DNC all stop enrollments and cancel queued mail (`stopEnrollments`), dispatcher re-checks policy, eligibility needs a reviewed CASL basis + second-person approval for published addresses + verified reply path, pilot is first-touch only with caps. No code change needed; **everything remains OFF**. Owner prerequisites unchanged (section 5). |

**Pending owner actions (unchanged + new):** Québec refresh run + dry-run + Apply (runbook); phone check of Field Planner after deploy; V1/V2 comparison and activation (section 4); sender setup + real inbound reply round trip; CASL legal review; any national extraction.
""

## 9. Test and environment notes
`npx tsc --noEmit`, `npx eslint`, `npm test` (unit), DB suites need a scratch Postgres (`GARAGEOS_CRM_TEST_DB_URL`, one fresh DB per suite): `tests/prospect-source-location-db.test.ts` (17), `tests/lead-radar-db.test.ts`, `lead-radar-automation-db.test.ts` (27), `lead-radar-compare-db.test.ts` (5). Production migrations run only on Vercel Production builds (`scripts/deploy-migrations.mjs`).
