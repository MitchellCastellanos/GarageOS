# Release agent report, 2026-10-23 (Analytics v2 / SEO / privacy)

Facts are **verified** (checked on 2026-10-23 against GitHub, Neon production in read-only SELECTs, Vercel, or a scratch PostgreSQL) or labelled **hypothesis / not verified**. No production write was made. No flag was changed.

## 1. PR #203 (SignupAttribution): ready, awaiting owner approval

State: draft, **not merged**. Main was merged into its branch (`77601d9`, fast-forward push, no force). Two conflicts (`AcquisitionContent.tsx`, `DemoJourney.tsx`) came from #200; resolved by keeping `signupHandoffHref(...)` and the `data-cta` attributes of #200.

Verified on the merged head:
- Migration SQL reviewed: 4 statements (CREATE TABLE, UNIQUE index `shopId`, index `createdAt`, FK to `Shop` ON DELETE CASCADE). No ALTER/DROP/backfill of existing data. Only lock on an existing table: SHARE ROW EXCLUSIVE on `Shop` for milliseconds; `deploy-migrations.mjs` sets no `lock_timeout`.
- **Migration history is in `public._prisma_migrations`** (not `garageos._prisma_migrations`; the earlier docs were wrong, corrected below). Production Neon (project `autumn-art-59701921`, branch `br-long-mountain-aeo7kyj3`): 84 rows, 82 applied, 2 rolled back, 0 failed or in-flight. Latest is `20261105090000_analytics_v2_events`.
- `garageos."SignupAttribution"` does **not** exist in production.
- Pending set = exactly one migration (`20261106090000_signup_attribution`). Applied-but-not-in-repo: `20260922120000_add_appointment_events` (historical duplicate name, pre-existing, harmless to `migrate deploy`).
- `prisma validate` OK; `prisma migrate diff --from-config-datasource` against a DB built from all migrations: "No difference detected".
- `tsc` clean, eslint 0 errors (1,143 warnings backlog), `next build` OK, `npm test`: 1,314 tests, 1,278 pass, 0 fail, 36 skipped (DB suites without scratch DB). DB suites via `scripts/ci/run-db-tests.mjs` on PostgreSQL 16: **35 suites, 444 tests, 0 failed, 0 skipped**.
- Default OFF: collection requires `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED === "true"`; the signup page does not read the hand-off, the route does not read or echo it, and does not query the table when off (`tests/signup-attribution-validation-db.test.ts`: flag off writes and queries nothing, Shop/User/Subscription rows identical off vs on in EN and FR, Google sign-up untouched, missing table tolerated). Stripe/trial/onboarding code is not changed by the diff (only `signup/route.ts` returns `shop.id` from the transaction).
- Known, accepted: three marketing CTA links carry `?from=&lang=&lp=&cta=` (public slugs only) even with the flag off.
- Not verified: a live click-through of signup/onboarding/Stripe in a browser (sandbox cannot reach production or Stripe); covered by the tests above.

### Approval request (owner)
Approve merging #203 now? Merging applies one additive migration to production on the Vercel build; the flag stays OFF. Risk: low. Worst case is the build failing at `migrate deploy` (the previous deployment keeps serving).

### Exact deployment plan (after approval)
1. Create a fresh Neon branch from production head: name `backup-pre-signup-attribution-<YYYYMMDD-HHMM>`, parent `br-long-mountain-aeo7kyj3`, no auto-delete. Verify `describe_branch` shows it ready/`current_state` and run `SELECT count(*) FROM garageos."Shop"` on it equal to production. (The old `backup-pre-analytics-v2-20261022` is not a substitute.)
2. Re-check read-only: `SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY 1 DESC LIMIT 3;` and `SELECT to_regclass('garageos."SignupAttribution"');` (expect NULL).
3. Update #203's branch with main if main moved; wait for `verify` (and `db-tests`) green; merge with the merge-commit method.
4. Watch the Production deployment: READY; build log shows `Applying pending Prisma migrations` and `Migrations applied successfully`.
5. Verify: `SELECT migration_name, finished_at FROM public._prisma_migrations WHERE migration_name='20261106090000_signup_attribution';` (finished), `\d garageos."SignupAttribution"`, row count 0, `/admin/signup` returns 200, `/pricing` returns 200. Env var stays unset.
### Recovery
- Preferred (nothing else wrote the table): `DROP TABLE garageos."SignupAttribution"; DELETE FROM public._prisma_migrations WHERE migration_name='20261106090000_signup_attribution';` then revert the PR. (`migrate resolve --rolled-back` fails with P3012 after a successful apply.) Leaving the empty unused table is also safe.
- If the build fails mid-migration: the migration runs in a transaction; check `_prisma_migrations` for a failed row and `to_regclass`; the live deployment stays on the previous build.
- Disaster: restore from the fresh Neon branch.

## 2. Production tracking (incognito yes, normal profile no)

Confirmed (read-only):
- Pipeline works: 3 `PageView` rows from the incognito visit (2026-10-23 13:49 UTC) with `channel=direct`, `pageType=commercial`. Production deployment `dpl_J3pkcUNwDFB2k9i4QVyaLF2qJ511` (main `f9443d9`) is READY.
- Volume is 1 to 4 rows/day in October (a burst of 47 on 10-10, which matches the sales campaign); none on 2026-10-22.
- `RateLimitBucket` `track-ip`: 11 buckets, 17 requests since the 08:00 purge. Windows end at 11:21, 13:16, 13:50 to 13:51 (the incognito test), 14:29, 14:57, 15:07, 15:14 UTC. Roughly 8 requests after the incognito test passed DNT/GPC, origin and size guards and produced **no** row.
- Code facts: guard order is DNT/GPC, Origin, size, rate limit, parse, then bot UA / path. A DNT/GPC drop or a blocked request leaves **no trace at all** (before the rate limiter), so "no row, no bucket" in the normal profile cannot distinguish a blocker from DNT/GPC. Beacon uses `navigator.sendBeacon('/api/track')` with an `application/json` Blob, same origin.
- Runtime logs: Hobby plan keeps 1 hour; nothing to read now.

Hypotheses (not proven): (a) content blocker matching `/api/track`; (b) DNT or GPC enabled in that profile (e.g. Brave, Firefox strict mode, a privacy extension); (c) the ~8 untraced later requests were bots (`BOT_UA` includes `bot|whatsapp|headlesschrome...`) or the owner's retests dropped by the bot filter. Not a production bug unless proven. No privacy control was weakened.

How to settle it (owner, 2 minutes), in the normal profile on `https://www.garage-os.ca/pricing`, console: `navigator.doNotTrack, navigator.globalPrivacyControl` (any `"1"`/`true` explains it), then DevTools Network, filter `track`: blocked by client ("ERR_BLOCKED_BY_CLIENT") = extension; 204 response yet no row = server-side drop (then run the section 5 `RateLimitBucket` query for a new bucket and send me the time). Only if an extension is confirmed is a neutral beacon path worth a PR.

## 3. Historical PageView privacy cleanup (SEC-01/02/03): analysed, not executed

Read-only counts on production (292 rows total, 2026-09-19 to 2026-10-23; 289 unclassified pre-v2):
| Family | Rows | Distinct paths | Dates | Notes |
|---|---|---|---|---|
| `/book/<slug>/manage/<token>` | 4 | 2 | 09-22 to 09-30 | 3 visitor hashes, no referrer, slug set |
| `/sales/<token>` | 1 | 1 | 10-10 | no referrer |
| `/sales-invite/<token>` | 1 | 1 | 10-10 | **one Google referrer** (host `google` family, not webmail) |
Total **6 rows**, all plain forms. No encoded/odd forms found (query for `%`, `?`, `#` added nothing). Token-shaped values in utm / shopSlug / referrerHost columns: 0. No portal, quote, inspection rows.

Findings: the exposure is tiny and internal (database, Super Admin panel, backups). The one Google-referred `/sales-invite` visit is the only external-looking signal; by the runbook decision table, check that invite is expired/used and consider re-issuing it; not proven to be an indexed URL (check Search Console for private URLs).

Sanitise, don't delete: `scripts/sql/pageview-token-sanitize.sql` strips only the token segment (`/book/<slug>/manage/<t>` becomes `/book/<slug>/manage`, `/sales-invite/<t>` becomes `/sales-invite`), keeps the visit, runs in one transaction with `lock_timeout 3s`, and aborts unless the changed count equals `-v expected=6`, no token-bearing path remains, and total rows are unchanged. Tested on a disposable PostgreSQL 16: wrong expected count aborts and changes nothing; correct run changes exactly the matching rows (`/quote-software`, `/book/x`, `/pricing`, `/fr/...` untouched); re-run with `expected=0` is a no-op. Dry-run count on production right now: 6.

Retention/legal: the rows are well within the 13-month retention; sanitising removes the sensitive element, deleting is not required. Backups taken earlier keep the tokens until they expire (R2 dump 30 days; Neon branch until deleted); tokens themselves expire in about 30 days. Legal view of keeping the sanitised rows: owner/counsel.

Approval-gated procedure: (1) fresh Neon branch `backup-pre-pageview-sanitize-<ts>`; (2) rerun the count (expect 6); (3) `psql "$DIRECT_URL" -v expected=6 -f scripts/sql/pageview-token-sanitize.sql`; (4) rerun the count (expect 0); (5) delete the temp branch once verified. Rollback: restore `PageView` rows from the Neon branch by `id` (`UPDATE ... SET path = b.path FROM branch b`), or accept (the original value is the secret being removed).

## 4. Privacy notice draft
`docs/privacy-notice-analytics-draft-2026-10-23.md`: bilingual EN/FR **draft for owner/legal review, not published, no page changed**.

## 5. SEO / Help Center QA
- Help routes come from `src/app/(site)/help/[category]/[slug]/page.tsx` + `GUIDES` in `src/lib/marketing-resources.ts`. Sitemap (43 URLs, generated from `src/app/sitemap.ts`) lists 7 categories and 10 articles, e.g. `/help/getting-started/set-up-your-shop`, `/help/appointments/configure-online-booking`, `/help/estimates-and-invoices/estimate-to-invoice`, `/help/run-the-shop/work-orders`; plus blog `/blog/a-clearer-start-to-the-shop-day`, `/blog/estimates-customers-can-understand`, `/blog/useful-vehicle-history`. Marketing core: `/`, `/product`, `/features`, `/pricing`, `/features/{online-booking,digital-vehicle-inspections,quotes-and-approvals,sms-and-email}`, `/integrations`, `/demo`, `/get-started`, `/quick-start`, `/about`, `/contact`, `/privacy`, `/terms`, `/changelog`, `/resources`.
- **The sitemap contains no French URL**, consistent with French indexing OFF (rendered-HTML suites `seo-rendered`, `seo-fr-wave1`, `link-audit` pass in `npm test`).
- Quotes wording (source, EN): shop menu label `Quotes` (`src/lib/admin-locale/layout.ts`), FR `Devis`; Help now says "Open Quotes in the menu" (#204). Marketing prose still says "estimate", which is a naming decision for the owner. Not verified in the live UI (no login available to the agent).
- Owner actions for search engines (nothing done by the agent): verify `garage-os.ca` in Google Search Console (DNS TXT or HTML tag) and Bing Webmaster Tools (can import from GSC); submit `https://www.garage-os.ca/sitemap.xml`; check the Coverage report for any private URL (`/sales-invite`, `/book/*/manage`); keep FR out of sitemaps/hreflang until language and legal review is signed.

## 6. Analytics acceptance (/platform/analytics)
- Authorisation: page calls `requireSuperAdmin()` first (`page.tsx:13`); panel functions assume that gate.
- DB-backed suite `analytics-panels-db` (9 tests) passes on real PostgreSQL: visits, pseudonymous uniques, channel, page type, EN/FR split, date filters, CTA panel with collection OFF (empty state), historic unclassified rows (289 of 292 in production are `channel=''`, shown as unclassified), cells under 5 folded.
- Not verified in a browser against production data (needs a Super Admin session).
- Retention cron `/api/webhooks/cron/analytics-retention` (08:20 UTC): production audit shows a single run (2026-10-23 09:00 UTC): `dryRun=true`, 13 months, 0 candidates, 0 deleted; oldest row 2026-09-19. That run **predates #197**, so per-table audit rows (PageView + AnalyticsEvent) have not yet been seen in production: **check after the next run** (expect two `ANALYTICS_RETENTION_RUN` rows, `targetType` PageView and AnalyticsEvent, `dryRun=true`). `AnalyticsEvent` has 0 rows. `ANALYTICS_RETENTION_APPLY` unset.

## 7. Other security / engineering
- Raw IP in `RateLimitBucket.id`: confirmed (also raw emails for login/recovery limiters). Fixed in **PR #206** (keyed hash, limiter name kept, no schema change, tests added).
- DB fixture instability: all 35 DB suites passed first run once per fresh database, no flake observed; the nine `Date.now() % 100000` phone fixtures remain a latent risk (not changed).
- Custom-domain proxy readiness: not re-verified (needs Vercel domain attachment, wildcard DNS, `NEXT_PUBLIC_ROOT_DOMAIN` — all owner/infra); `tests/proxy-location.test.ts` passes.
- Copy follow-ups from the handoff (section 9 item 7) not changed (cosmetic).
- Docs correction: rollback SQL must use `public._prisma_migrations`.

## 8. Owner actions
1. Approve or defer #203 (section 1).
2. Approve or decline the PageView sanitisation (6 rows), and check the one Google-referred `/sales-invite` token.
3. Normal-profile tracking test (section 2).
4. Legal review of the privacy draft; decide when to enable `ANALYTICS_CTA_ENABLED` / `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` / `ANALYTICS_RETENTION_APPLY` (all remain OFF).
5. Search Console and Bing verification, sitemap submission; keep FR indexing off.
6. Quote vs Estimate marketing wording decision.
