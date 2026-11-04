# GarageOS SEO + Analytics: final closure record (2026-11-04)

Evidence levels used throughout: **[AUTO]** automated test run in this session; **[PROD-RO]** read-only check of production (Neon SELECT, Vercel API/fetch) in this session; **[CODE]** read from the code on `main` (15c0475); **[NOT DONE]** not verified, with the reason. Nothing here was written to production. No flag, DNS, billing or recovery branch was touched.

Companion document (privacy audit, activation runbook, French readiness, retention recommendation, decision package): `docs/analytics-closure-decision-package-2026-11-04.md`.

## 1. Work completed in this sprint

- Reconciled `main`: no commit since 2026-10-23 (`15c0475`, PR #208). Open PRs are only #42, #47, #82, #86 (all pre-existing, unrelated to this workstream, untouched).
- Re-ran the whole suite on a fresh `npm ci` + `next build`: **1,315 tests, 1,279 pass, 0 fail, 36 skipped** [AUTO]. The 36 skips are the DB suites without a scratch DB (the rendered-HTML SEO suites executed).
- Found and fixed one **date-dependent test** (`tests/reports.test.ts`, receivables CSV regex hard-coded an aging bucket that only held until ~2026-10-30). It failed on pristine `main` on 2026-11-04; the fix accepts any bucket. This is a test-only change.
- Ran the Analytics DB suites on a disposable PostgreSQL 16 built from all repo migrations (synthetic data only): `analytics-panels-db` 9, `analytics-retention-db` 6, `signup-attribution-db` 11, `signup-attribution-validation-db` 10, **36/36 pass** [AUTO]. This includes real deletion (`apply: true`) of synthetic rows older than the 13-month cutoff in both `PageView` and `AnalyticsEvent`: boundary and newer rows kept, idempotent, bounded per batch, resumable, audit rows carry counts and dates only.
- Audited privacy implementation against the 2026-10-23 draft notice (see decision package §1): the draft's facts hold; four gaps and one resolved item are listed there.
- Wrote the activation sequence with rollback, French indexing readiness, retention/recovery recommendation and one batched owner decision package.

## 2. PRs and merge SHAs

| PR | Subject | Merge SHA |
|---|---|---|
| (this sprint) test fix + docs | see PR page; no application code, no schema | recorded on merge |

All earlier merge SHAs (#179 to #208) are in `docs/handoffs/2026-10-23-analytics-seo-handoff.md` §2 and `2026-10-23-release-agent-report.md` §9 and were not re-derived. Latest earlier ones: #203 `207cc46` (SignupAttribution migration), #206 `2c35dcc` (hashed rate-limit ids), #207 `cfd95a1`, #208 `15c0475`.

## 3. Production deployment verification

- Latest production deployment `dpl_32pkJse18Zk9Ky4H6UsGmUzAGACP` = `main` `15c0475`, **READY**; the three previous production deployments (#203, #207, #206) are READY too [PROD-RO, Vercel API].
- `main` CI run for `15c0475`: success [PROD-RO, GitHub Actions].
- Live fetches via Vercel (the sandbox cannot reach the domain directly): `/robots.txt` 200, `/sitemap.xml` 200, `/pricing` 200 with one `<h1>`, canonical, OG tags, viewport; `/fr/tarifs` 200 with `lang="fr-CA"`, `noindex, follow`, own canonical, no hreflang [PROD-RO].
- Runtime errors, Lighthouse, Core Web Vitals, mobile rendering, broken-link crawl of the live site: **[NOT DONE]** this session (no direct network path to the domain, no Lighthouse run). Build-time coverage: rendered-HTML and internal-link suites (`seo-rendered`, `seo-fr-wave1`, `link-audit`, `features-pages`) pass [AUTO]. Last live crawl evidence is `docs/SEO_V1_FINAL_REPORT.md`.

## 4. Analytics activation state (production, 2026-11-04)

| Item | State |
|---|---|
| `ANALYTICS_HASH_SECRET` | set (Production and Preview, sensitive) [PROD-RO, name and type only] |
| `ANALYTICS_CTA_ENABLED` | **not present = OFF** |
| `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` | **not present = OFF** |
| `ANALYTICS_RETENTION_APPLY` | **not present = OFF** (cron dry-run daily) |
| `AnalyticsEvent` rows | 0 |
| `SignupAttribution` rows | 0 (table exists since #203) |
| `PageView` rows | 293 (4 classified by v2; last 2026-11-04 07:19 UTC) |

Both approval-gated collection flags remain OFF because no explicit owner authorisation exists in this conversation. **CTA and signup attribution are therefore NOT activated and the Phase 2 live tests (steps 1-6 of activation) have NOT been run.**

## 5. Privacy and legal status

- Nothing legal was changed or published. The EN/FR draft is `docs/privacy-notice-analytics-draft-2026-10-23.md`; the decision package lists the corrections it needs before publication and the statements that need counsel.
- The currently published `/privacy` already documents page-view analytics, a Privacy Officer, and provider transfers outside Québec/Canada. It does not mention DNT/GPC for page analytics or a retention period for analytics (decision package §1).

## 6. SEO and indexing status

- English sitemap: 43 URLs, no French, no private paths; robots disallows account, platform, API, portal, quote, inspection, sales and recovery paths [PROD-RO].
- Google Search Console / Bing Webmaster Tools: **[NOT DONE]**: no connector with access exists in this session. Owner action (verify domain, submit `https://www.garage-os.ca/sitemap.xml`, review coverage for any private URL) is listed in §9. **No claim of indexing is made.**
- French: 14 French route files exist. `/fr/tarifs` was confirmed `noindex` live [PROD-RO]; the other 13 are `noindex` by the route registry (`isIndexablePath`: only `frStatus: live` and not `frIndexable: false` can index, and only `/fr` is `live`, with `frIndexable: false`) and covered by `seo-fr-wave1` tests [CODE+AUTO], not fetched individually. None is in the sitemap; no hreflang. Indexing stays OFF (§9).

## 7. Database and retention status [PROD-RO]

- `public._prisma_migrations`: 85 rows, 83 applied, 2 rolled back (historical), 0 in flight; latest `20261106090000_signup_attribution`.
- Retention cron: one pair of audit rows per day through 2026-11-04 09:00 UTC, `PageView` and `AnalyticsEvent` separately, `dryRun=true`, 13 months, 0 candidates, 0 deleted, `remainingOverdue=0`, oldest remaining `PageView` 2026-09-19.
- Neon branches: `production`, `preview` (archived), and three recovery branches: `backup-pre-analytics-v2-20261022`, `br-super-water-aexovmvr`, `br-rapid-resonance-aeuusosk`. **None deleted.** The last two (and the first) still contain the six historical token-bearing `PageView` paths; recommendation in the decision package §4.

## 8. Security verification [PROD-RO unless noted]

- Historical token sanitisation holds: 0 `PageView` rows with a token segment in `/book/*/manage/`, `/sales/`, `/sales-invite/`, portal, quote, inspection, watch, recovery, activate-demo paths. 0 paths containing `?`, `#` or `%`. 16 rows `/watch/en` and `/watch/fr` are locale landing pages with no token.
- 1 row since the sanitisation date (2026-10-24); no new token path stored.
- `RateLimitBucket`: 1 bucket (`track-ip:` + hash); 0 ids containing an IPv4 or an `@` (the #206 fix is effective).
- All `visitorHash` values are 32 hex characters.
- `robots.txt` blocks private families; `/watch/*` is `noindex` by meta (PR #182/#189, CODE+AUTO).
- `/platform/analytics` and the attribution summary call `requireSuperAdmin()` before any query (CODE; `analytics-panels` tests AUTO). The owner confirmed the page renders.
- Google sign-up creates its shop in `src/lib/auth.ts` and is **not attributed** (CODE; documented in contract §10.5). With the flag ON, Google sign-ups would show as no row, so attribution would under-count; this is an owner decision, not a bug.

## 9. Remaining owner decisions (all gated; none treated as approved)

Batched with exact options in the decision package §6:
1. Privacy: legal review and publication of the analytics notice (EN/FR).
2. Enable `ANALYTICS_CTA_ENABLED`, then `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` (one at a time, after 1).
3. Enable `ANALYTICS_RETENTION_APPLY`.
4. Delete the three Neon recovery branches (when).
5. Search Console and Bing: verification and sitemap submission (owner account/DNS).
6. French indexing: native review + legal pages + go/no-go per pair.
7. Marketing wording Quote vs Estimate.
8. Whether Google sign-ups must be attributed.
9. Whether to make `db-tests` required (recommendation: not yet, see decision package §5).

## 10. Deferred enhancements (not release blockers)

Neutral beacon path rename; Product/Offer structured data for `/pricing`; Help Center live-UI walk (needs a logged-in session: `docs/help-article-verification-2026-10.md`); nine `Date.now() % 100000` phone fixtures; ~1,140 ESLint warnings backlog; copy follow-ups in the 2026-10-23 handoff §9.7; `pg` `sslmode` warning; PERF-01 / issue #103; stale PRs #42, #47, #82, #86.

## 11. Final acceptance checklist (exact)

Automated (done 2026-11-04, [AUTO]):
- [x] `next build` succeeds; `npm test` 1,315 tests, 0 fail.
- [x] Analytics/retention/attribution DB suites 36/36 on a disposable DB.

Read-only production (done 2026-11-04, [PROD-RO]):
- [x] Production deployment READY on `main` 15c0475; migrations healthy; retention dry-runs for both tables; flags OFF; sanitisation holds; rate-limit ids hashed; robots/sitemap correct; FR noindex.

Owner manual acceptance (**open**):
- [ ] Normal-profile tracking check on `/pricing` (DNT/GPC and blockers off): confirm one new `PageView` row.
- [ ] Log in and click through `/platform/analytics` (already confirmed to render) after any flag change.
- [ ] Help Center 5-item live-UI walk.
- [ ] Search Console + Bing: property verified, sitemap shows "Success", coverage free of private URLs.
- [ ] Authorise (or defer) each item in §9; after any authorisation, run the activation sequence and tick its checks in the decision package §2.
- [ ] Lighthouse mobile run on `/`, `/pricing`, `/features` from a networked machine (≥ 90 performance target is a goal, not a measured fact).

**Closure status: technical work that does not need approval is complete and verified. The workstream is NOT fully closed: items 1-8 in §9 and the open acceptance boxes are owner-blocked.**
