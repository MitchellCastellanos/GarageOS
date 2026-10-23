# Handoff: Analytics v2 + SEO/Resources workstream (2026-10-23)

Audience: the next Claude Code agent and the owner. Facts are marked **verified** (checked against GitHub, Vercel or Neon on the date shown) or **not verified**. No secret values appear here, only variable names.

## 1. Executive summary

- The SEO + Resources roadmap was audited, reconciled and executed: ChatGPT's PRs #179–#183 were reviewed, corrected and merged; a test baseline and two CI jobs exist; security tasks SEC-04/05/06/07 and the Analytics v2 server side are in production.
- Analytics v2 is live in production with: channel / page-type classification of page views, a hardened `/api/track` endpoint, a retention engine (dry-run only), and new real-data panels in `/platform/analytics` (Super Admin only).
- Three things are deliberately **OFF** and must stay off until the owner decides: CTA click collection (`ANALYTICS_CTA_ENABLED`), signup attribution (`ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED`), real retention deletes (`ANALYTICS_RETENTION_APPLY`).
- **PR #203 (SignupAttribution, new table) is NOT merged.** It needs explicit owner approval and a fresh Neon recovery point first (section 5).
- The "missing page views" investigation concluded that the pipeline works (incognito visit on 2026-10-23 produced rows); the normal-profile miss is unexplained (hypothesis: blocker extension or DNT/GPC). See `docs/analytics-production-verification.md`.

## 2. Pull requests handled (actual merge SHAs)

Merge method is "merge commit". All SHAs verified from GitHub at merge time.

| PR | Subject | Merge SHA |
|---|---|---|
| #179 | LANG-03: ordres de travail in sales calling guide (ChatGPT) | 16b9743 |
| #180 | QA-01: single h1 / main landmark on login/signup (ChatGPT) | c08b84c |
| #183 | DOC-02 partial: Resend tracking checklist, retention decision (ChatGPT) | 4ab8b35 |
| #184 | OPS-01 + DOC-01: node_modules symlink fix, CI `verify`, testing baseline | 191f46e |
| #181 | QA-05: Help approval history/reminder claims corrected (ChatGPT) | d9c59d7 |
| #182 | SEO-07: watch pages noindex, unverified video date removed (ChatGPT) | 5f484e3 |
| #185 | SEC-04: retention engine, deletion OFF | c2ce8df |
| #186 | SEC-05: HMAC-keyed daily visitor hash | 881c438 |
| #188 | Analytics v2 (1/6): event vocabulary and classification | cf91d40 |
| #187 | SEC-06: `/api/track` protection | 68211c6 |
| #189 | SEC-07: tokenised `/watch` URLs out of Referer/caches/indexes | ed1cdc5 |
| #191 | QA-04: DB-backed suites on disposable PostgreSQL (`db-tests`) | 56053fc |
| #193 | Docs: SEO backlog reconciliation | 3595fd7 |
| #194 | CI: keep a verdict for every push to main | e2cc7d8 |
| #190 | Analytics v2 (2/6): additive migration `20261105090000_analytics_v2_events` (applied to production) | b85a5bd |
| #192 | Analytics v2 (3/6): server tracking, channel/pageType, CTA endpoint | 6d88fb7 |
| #195 | QA-06: rendered-HTML internal link audit | ecd57ee |
| #196 | Docs: PERF-01 investigation (#103) | 46dbc44 |
| #199 | QA-02: Help articles verified/fixed | bbb9afa |
| #198 | PERF-01: `src/proxy.ts` loaded, host lookup fails open | 0bd1f60 |
| #202 | CNT-09: contextual internal links | a50911b |
| #197 | Analytics v2 (PR-D): retention covers AnalyticsEvent | ff29b59b32af4ddcf2c48e390b0098c13edae1a9 |
| #200 | Analytics v2 (PR-C): dormant CTA instrumentation, OFF | edbf84268caaccdb6c7e175a9675c9f737fae42f |
| #201 | Analytics v2 (PR-P): real-data panels, no schema change | f5f2afc83d2f751f9c79b32676bb2029c3fb3450 |
| #204 | Help Center: menu name "Quotes" | 7c84ab40d971d9f4b4a160858993db9adcdfd695 |
| docs PR | handoff + runbooks (this file) | see PR page |

Not merged: **#203** (draft, awaits owner), #47 (obsolete, close), #42, #82, #86 (to review; not touched).

## 3. Production deployment status

- Every merge to `main` above produced a Vercel Production deployment that reached READY (verified per merge through the Vercel API). Latest verified: see the final report for READY confirmation of #201, #204 and the docs PR.
- Production build runs `prisma migrate deploy` (`scripts/deploy-migrations.mjs`). **Merging any PR that contains a migration applies it to production.** This is why #203 is held.
- Vercel runtime logs are kept ~1 hour on this plan; Web Analytics is not enabled.

## 4. Migrations applied

- `20261105090000_analytics_v2_events` (#190): `PageView.channel`/`pageType` (TEXT NOT NULL DEFAULT ''), enum `AnalyticsEventType`, table `AnalyticsEvent`. Applied to production, verified in Neon (2026-10-23). A Neon backup branch was taken beforehand.
- Neon history at that point: 83 migrations in repo, 81 applied, 2 rolled back (historical, pre-existing).
- #197, #200, #201, #202, #204: no schema change.

## 5. Migrations awaiting approval

`20261106090000_signup_attribution` (PR #203, draft).
- Effects: `CREATE TABLE garageos."SignupAttribution"`, UNIQUE index on `shopId`, index on `createdAt`, FK to `Shop` `ON DELETE CASCADE`. No change to existing tables' data. The FK briefly takes SHARE ROW EXCLUSIVE on `Shop` (milliseconds); `deploy-migrations.mjs` sets no `lock_timeout`.
- Verified by the agent: table does not exist in production; no unexpected pending migrations; `verify` and `db-tests` green on head `eeb0a61` (re-rebase on current `main` is required before merge); attribution writes are off by default (`ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED`); validation report: `docs/signup-attribution-validation-2026-10-23.md` (on #203's branch).
- Rollback: `DROP TABLE garageos."SignupAttribution"` and delete the row `20261106090000_signup_attribution` from `garageos._prisma_migrations`. (`prisma migrate resolve --rolled-back` fails with P3012 after a successful apply.)
- **Before approval:** create a *fresh* Neon recovery point from production immediately beforehand (new branch, or confirm PITR window; it is 6 h). The older backup branch is not a substitute.
- Do NOT merge #203 until the owner writes an explicit approval. After merge, flag stays OFF.

## 6. Neon backup branches and limitations

- `backup-pre-analytics-v2-20261022` (created 2026-10-23 01:43 UTC from production, project `autumn-art-59701921`, production branch `br-long-mountain-aeo7kyj3`). It predates #190 only; data written since is not in it.
- PITR window is 6 hours: it cannot restore anything older.
- No backup exists for #203 yet.
- SEC-01/02/03 (cleanup of tokens in historical `PageView` paths in Neon) was never executed; runbook: `docs/pageview-token-purge-runbook.md`. Needs owner approval and a backup first.

## 7. Environment variables (names and states only)

| Variable | State | Notes |
|---|---|---|
| `ANALYTICS_HASH_SECRET` | set in Production (≥ 32 chars) | Without it an ephemeral key is used and a warning is logged. |
| `ANALYTICS_CTA_ENABLED` | **unset / OFF** | Needs owner + privacy review; requires a redeploy to take effect. |
| `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` | **unset / OFF** | Only meaningful after #203 is merged. |
| `ANALYTICS_RETENTION_APPLY` | **unset / OFF** | Cron runs dry-run only; 13 months retention, 12-month floor. |
| `CRON_SECRET` (and other cron auth) | not inspected | Used by `vercel.json` crons, including 08:00 UTC rate-limit purge and 08:20 UTC retention. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | not verified | Needed for custom domains/subdomains. |

Values were never read or printed.

## 8. CI and test results

- `verify` (required check on `main`): prisma validate, `tsc`, eslint (0 errors, ~1,100 warnings backlog), `next build`, `npm test`, `scripts/ci/check-skips.mjs`. Green on every merged PR.
- `db-tests` (non-required): isolated Postgres 16, one fresh DB per suite; 31 suites, 408 tests at baseline plus new suites since; green on #197, #200, #201, #204 at merge. Local baseline 2026-10-22: 408 pass / 0 fail.
- `npm test` after #201: 1,279 tests, 0 fail, 33 skipped (database suites without a scratch DB).
- Commands and environment: `docs/testing.md`. Heap: `NODE_OPTIONS=--max-old-space-size=6144`; `NEXTAUTH_URL` only for build, unset for tests.
- Ruleset `Protect main` requires `verify` on an up-to-date branch → merge one PR at a time (`update_pull_request_branch`, wait for CI, merge).

## 9. Open bugs and risks

1. **Normal-profile page views not recorded** (owner test 2026-10-23): unexplained, hypothesis blocker extension / DNT/GPC. Procedure in `docs/analytics-production-verification.md`.
2. Volume is tiny (1–4 views/day), so dashboards will look thin; cells under 5 are folded by design.
3. DB test suites share global state; they pass only one-DB-per-suite. Nine suites use a `Date.now() % 100000` phone fixture that may flake (~20% when load-bearing); re-run a red `db-tests` once before investigating.
4. `RateLimitBucket.id` embeds the raw IP (purged daily at 08:00 UTC). Consider hashing.
5. PERF-01 / issue #103 not reproduced; needs production data.
6. Custom domains also need Vercel domain attachment, wildcard DNS and `NEXT_PUBLIC_ROOT_DOMAIN`; the proxy fails open on resolve timeout (1.5 s).
7. Minor copy follow-ups: `src/lib/feature-pages.ts:92` ("Needs attention" label), booking feature page says "requests", `missingSlugHint` setting hint, #203 marketing links carry hand-off params even with the flag off.
8. Help articles: a 5-item live-UI walk is still pending (`docs/help-article-verification-2026-10.md`).
9. A scratch PostgreSQL (port 54329, `/var/tmp/pgs`) from an agent may still run in the sandbox; harmless, local only.

## 10. Remaining tasks by priority

P0 (owner-gated)
- Decide on #203 (section 5).
- Run the controlled visit in the normal browser profile (extensions off) and report.

P1
- SEC-01/02/03 production cleanup of tokens in `PageView.path` (after backup, with approval).
- Privacy notice text for analytics (draft only; legal review before publishing). Nothing legal was published.
- SEO-01/02: Search Console and Bing verification/sitemaps (owner actions).

P2
- Enable CTA collection only after privacy review (set `ANALYTICS_CTA_ENABLED`, redeploy, watch `/platform/analytics`).
- Switch retention to apply after reviewing several dry-run audit rows (`PlatformAuditLog` action `ANALYTICS_RETENTION_RUN`).
- LANG-01/02: native-speaker and legal review; French indexing stays OFF.
- Quote vs Estimate naming decision (EN module is "Quotes"; FR "Devis" / "Ordre de travail").
- Neutral beacon path name if blockers are confirmed.
- Close #47; review #42, #82, #86.

P3
- Fix DB-suite isolation; harden phone fixtures; hash IP in `RateLimitBucket.id`; copy follow-ups in section 9.

## 11. Owner decisions required

1. Approve (or not) merging #203 and creating the fresh Neon recovery point.
2. Approve enabling `ANALYTICS_CTA_ENABLED` (and when).
3. Approve enabling `ANALYTICS_RETENTION_APPLY` and the 13-month period (legal review pending).
4. Approve SEC-01/02/03 production cleanup.
5. Quote vs Estimate naming.
6. Whether to add `db-tests` as a required check.
7. Whether to rename the beacon path.

## 12. Instructions for the next Claude Code agent

1. Read, in order: this file, `docs/SEO_FUTURE_BACKLOG.md` (Reconciliation table), `docs/analytics-v2-contract.md`, `docs/analytics-production-verification.md`, `docs/analytics-retention-runbook.md`, `docs/testing.md`.
2. Do not merge #203, set any of the three OFF variables, run SQL writes against production Neon, or change Resend/DNS/Vercel/Stripe without explicit owner approval in the current conversation.
3. Workflow per PR: branch from `main`, `NODE_OPTIONS=--max-old-space-size=6144`, `npx prisma validate && npm run typecheck && npm run lint && npx next build` (with NEXTAUTH_URL), then `npm test` with NEXTAUTH_URL unset. For DB-touching work run the scratch Postgres flow in `docs/testing.md`.
4. Merge one PR at a time: update branch, wait for `verify` (and `db-tests`), merge, then confirm the Production deployment is READY with the Vercel API. A migration in a PR is applied on merge.
5. Next Next.js 16 note: the proxy file must be `src/proxy.ts`; `tests/proxy-location.test.ts` guards it.
6. Terminology: FR "Devis" and "Ordre de travail"; never "bon de travail" or "soumission".
7. Start with the open items in section 10 P0/P1 that the owner unlocks. Do not start new features unprompted.
