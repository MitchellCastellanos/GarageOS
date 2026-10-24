# Signup attribution (PR #203): pre-approval validation, 2026-10-23

Scope: draft PR #203 (`analytics-v2/signup-attribution`, migration `20261106090000_signup_attribution`), after merging `origin/main` (clean merge, no conflicts). Everything below ran against a **local scratch PostgreSQL 16** (port 54395, databases `garageos_scratch_test` / `garageos_shadow_test` / `garageos_replay_test`, deleted afterwards). Nothing connected to Neon, production or any provider. The production-side checks (existing data, lock queue on the live `Shop` table, deploy) are the lead's.

## Results

| # | Item | Result |
|---|---|---|
| 1 | Migration is one additive CREATE TABLE (+ 2 indexes + 1 FK); full chain applies; zero drift; locks and rollback documented | PASS |
| 2 | Flag OFF by default: nothing written and the table is not even queried; DNT/GPC write nothing with the flag on | PASS |
| 3 | Ordinary signup EN and FR, flag OFF vs ON: same response, identical Shop/User/Subscription rows; trial/onboarding/Stripe untouched | PASS |
| 4 | Google sign-up path | PASS (separate code path, unchanged, not attributed) |
| 5 | Failed attribution writes never fail signup (table really missing, double submit/replay, DB error, payload-free logs) | PASS |
| 6 | Hand-off validation drops invalid / personal-looking values; stored fields minimal | PASS after 4 hardening fixes (below) |
| 7 | Read path Super Admin only, aggregates only, cells under 5 folded | PASS |
| 8 | `shopId` UNIQUE holds under concurrent inserts | PASS |
| 9 | tsc, eslint, build, `npm test`, all DB suites, CI | PASS locally (numbers below); CI status in the PR |
| 10 | PR description "Production migration facts" | done (PR body), PR stays DRAFT |

## 1. Migration

File: `prisma/migrations/20261106090000_signup_attribution/migration.sql`. Its complete DDL is exactly four statements, nothing else (no ALTER of an existing table except the FK addition on the **new** table, no DROP, no INSERT/UPDATE/DELETE, no backfill):

```sql
CREATE TABLE "garageos"."SignupAttribution" (id TEXT PK, createdAt TIMESTAMP(3) DEFAULT now, shopId TEXT NOT NULL, landingPath/locale/channel/pageType/utmSource/utmMedium/utmCampaign/referrerHost TEXT NOT NULL DEFAULT .., ctaId TEXT NULL, CONSTRAINT "SignupAttribution_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SignupAttribution_shopId_key" ON "garageos"."SignupAttribution"("shopId");
CREATE INDEX "SignupAttribution_createdAt_idx" ON "garageos"."SignupAttribution"("createdAt");
ALTER TABLE "garageos"."SignupAttribution" ADD CONSTRAINT "SignupAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Evidence:

- Full chain: `prisma migrate deploy` on an empty database applied all 82 migrations ("All migrations have been successfully applied"); `prisma migrate status`: "Database schema is up to date".
- Drift: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` (with `datasource.shadowDatabaseUrl` pointing at the scratch shadow database; Prisma 7 takes it from the config, there is no `--shadow-database-url` flag) printed "No difference detected", exit 0. Second check, live scratch database vs schema (`--from-config-datasource`): "No difference detected".
- Locks (measured with `pg_locks` inside a transaction running the exact migration file, then rolled back):
  - `SignupAttribution` (new table): ACCESS EXCLUSIVE (create), SHARE (unique/plain index build), SHARE ROW EXCLUSIVE (FK add). Nobody can be using a table that did not exist a moment ago.
  - **`Shop` (existing): ROW SHARE + ACCESS SHARE and SHARE ROW EXCLUSIVE** (the FK add takes SHARE ROW EXCLUSIVE on the referenced table). SHARE ROW EXCLUSIVE conflicts with every write lock (ROW EXCLUSIVE, so INSERT/UPDATE/DELETE on `Shop`), but not with reads (SELECT, SELECT FOR SHARE). It is held until the end of the migration script (transaction end).
  - Duration: the FK validation scans the *referencing* table, which is new and empty, so there is no scan of `Shop`, no table rewrite and no index build on any existing table. Total time for all four statements on the scratch database: about 2.7 ms for the script (psql `\timing`: CREATE TABLE 0.8 ms, two index builds under 1 ms each, ALTER TABLE 1.9 ms). The cost does not grow with the number of rows in `Shop`.
  - Residual risk (to weigh on the real database, not testable here): `ALTER TABLE` must *wait* for the SHARE ROW EXCLUSIVE lock if some other transaction currently holds a write lock on `Shop` (a signup, a settings save, a long-running job); while it waits, new writes to `Shop` queue behind it. This is a few milliseconds when `Shop` transactions are short; it would only matter if a long transaction touching `Shop` is open at deploy time. No `lock_timeout` is set by `scripts/deploy-migrations.mjs`.
- Rollback (tested on the scratch database): `DROP TABLE "garageos"."SignupAttribution";` then remove the bookkeeping row `DELETE FROM _prisma_migrations WHERE migration_name = '20261106090000_signup_attribution';` and revert the code/migration folder. Note: `prisma migrate resolve --rolled-back` does **not** work here: it fails with P3012 ("cannot be rolled back because it is not in a failed state") because the migration succeeded. Without deleting the row (and the folder) a later `migrate deploy` either sees it as applied (table dropped but row present = drift) or re-applies it (row deleted, folder still present: the table is recreated, verified). Leaving the unused table in place is also safe. No other table references it; dropping it loses only attribution rows. The code tolerates the table being missing (item 5).

## 2. Flag OFF by default

`ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` must be exactly `"true"`. Tests (`tests/signup-attribution-validation-db.test.ts`, `tests/signup-attribution.test.ts`):

- Flag unset, signup with a full hand-off: 303 to verify-email-sent, user created, **no Prisma method of the attribution model is called** (all methods wrapped by a spy), and, with the table renamed away (really missing), **no `[signup-attribution]` error is logged** (a single query would have failed and logged). Both prove the table is not even queried.
- Flag on + `DNT: 1` and flag on + `Sec-GPC: 1`: signup works, 0 rows written.
- Also changed in this validation: with the flag off the route no longer reads the hand-off at all, so a validation-error redirect carries only `?error=` exactly as before (previously it echoed the validated hand-off even when off).

Observation (not a failure): the three marketing links (`/get-started`, two on `/demo`) now always carry `?from=…&lang=…&lp=…&cta=…` in their `href`, also with the flag off. These are public page slugs and a CTA id, no personal data; the signup page ignores them with the flag off. If "zero change when off" must also cover the public HTML, the links would need to be gated by a build-time flag; flagged for the owner, left as is.

## 3. Ordinary signup, EN and FR, flag OFF vs ON

New regression test (per locale): two signups with identical data except email/shop name, one with the flag off and one on (full hand-off). It scrubs ids, timestamps, slug and the unique values, then `deepEqual`s the redirect (status + location), the `Shop` row, the `User` row (bcrypt hash asserted present) and the `Subscription` rows. Result: identical in EN and FR; the only difference is the single `SignupAttribution` row when ON (locale `en`/`fr`, channel `email`). At signup the subscription is `AWAITING_PLAN`, `plan` null, no Stripe customer: there is no trial and no Stripe call in the signup route (the 14-day trial is card-backed and starts later at Stripe Checkout in onboarding, outside this PR; the PR diff touches nothing there, and `trialEndsAt` is null in both rows). Existing suites that pass in the full run: `stripe.test.ts`, `subscription-lifecycle.test.ts`, `subscription-state.test.ts`, `auth-claims.test.ts`, plus the DB suites for billing/subscriptions/onboarding (all 33 DB suites green).

## 4. Google sign-up

Google sign-up does not go through the signup route: it is the `signIn` callback in `src/lib/auth.ts` (own `shop.create` + `user.create` + `createPendingSubscription`). This PR does not modify that file and the callback has no hand-off (an OAuth round trip carries no form post). New test calls the real callback with `{provider:"google"}` and the flag ON: returns true, OWNER user with verified email, subscription `AWAITING_PLAN`, **no attribution row, no error, no attribution log**, and a returning Google user still signs in. Google sign-ups are therefore not attributed (documented follow-up).

## 5. Failure modes

- **Table really missing** (`ALTER TABLE … RENAME` in the scratch database): signup returns the normal redirect, user + shop + subscription exist, exactly one log line `[signup-attribution] not recorded: <ErrorClass>`; no log line (including Prisma's own error log) contains the landing path, utm values, referrer, IP or email.
- **DB error (FK violation, nonexistent shop)**: `captureSignupAttribution` returns false, one payload-free log line. Prisma's built-in `prisma:error` log (enabled in `src/lib/db.ts`) prints a source code frame and the constraint name only, never the inserted values (asserted).
- **Unique violation / double submit / replay**: the insert is `createMany({ skipDuplicates })` = `ON CONFLICT ("shopId") DO NOTHING`, so a conflict is not an error. A second submit of the same email gets the normal "email taken" redirect and leaves exactly one row with the first touch's values; a later `captureSignupAttribution` replay for the same shop is a no-op and does not update.

## 6. Validation of hand-off values and stored fields

Stored fields (model `SignupAttribution`): `id, createdAt, shopId, landingPath, locale, channel, pageType, ctaId, utmSource, utmMedium, utmCampaign, referrerHost`. No email, IP, user agent, visitor hash or free text (asserted by test on both the model and the record builder).

Tested bad values for `from/lang/cta/utm_*/referrer`: emails, formatted and unformatted phone numbers, absolute and protocol-relative URLs, `javascript:`, a JWT, a Stripe-style key, a 32-hex id, an IPv4, markup, path traversal. Landing paths: query strings and fragments are cut; private prefixes (`/admin/*`, `/api/*`, `/portal/<token>`) are dropped; legitimate long blog slugs survive.

Four gaps found in the PR as opened, fixed in commit `6a1653e` (each has a failing-then-passing assertion in `tests/signup-attribution-privacy.test.ts`):

1. `lp` accepted path segments shaped like an email or phone number (`/a@b.com`, `/514-555-0199`): now dropped (`looksPersonal`).
2. `referrerHost` accepted `514-555-0199`, IP literals, single-label hosts and token-like labels: now requires a dotted hostname with an alphabetic TLD, no personal-looking text, and no 16+ character label mixing letters and digits.
3. `utm_*` accepted a JWT because the dots split it below the 24-character token rule: the check now also runs with dots/spaces removed.
4. `utm_*` accepted an IPv4 literal: now dropped.

Known, accepted by the analytics contract (not changed): `utm_*` may contain letters, digits (no runs of 7+), spaces and `_ . - +`, up to 40 characters, so a short human-readable campaign name such as `free text with spaces` is stored. That is the contract's allowlist; no email, phone, URL or token shape gets through.

## 7. Read path

`getSignupAttributionSummary` calls `requireSuperAdmin()` before any query. Tested: shop OWNER, MECHANIC, VIEWER and anonymous are redirected away (NEXT_REDIRECT, nothing read); SUPER_ADMIN gets counts only (`total`, by channel / pageType / locale / cta), buckets under 5 folded into `__other__` (6 kept, 2 folded in the test), no `shopId`/`landingPath` in the output. It is not wired to any screen yet.

## 8. Duplicate attribution / concurrency

`SignupAttribution_shopId_key` is a UNIQUE index (asserted from `pg_indexes`). Eight concurrent plain `create` calls for the same shop: exactly 1 fulfilled, 7 rejected with Prisma `P2002`, 1 row. The production write path (`skipDuplicates`) turns the same race into a silent no-op (also tested with 4 concurrent calls).

## 9. Runs (local, Node 22.22)

- `npm run typecheck` (tsc): 0 errors. `npm run lint`: 0 errors (1,143 warnings, the known backlog).
- `npx next build` (placeholder env): OK.
- `npm test` after the build, without `NEXTAUTH_URL`: 1,287 tests, 1,253 pass, 0 fail, 34 skipped (the DB suites and the integration gate).
- All DB suites via `scripts/ci/run-db-tests.mjs` (one database copy per suite, fresh template): **33 suites, 429 tests, 429 pass, 0 fail, 0 skipped**, including `signup-attribution-db` (11) and the new `signup-attribution-validation-db` (10).
- Note: `signup-attribution-db` is not idempotent in a reused database (its read-path test counts rows in a fixed 2032 window, so a second run in the same database sees extra rows). It passes in CI because each suite gets a fresh copy. Also, the two attribution DB suites must not run concurrently in one database (the new one renames the table for the missing-table cases); `run-db-tests.mjs` runs them sequentially in separate copies.

## Not testable here (lead / owner)

- Behaviour of the `ALTER TABLE` lock wait on the real production `Shop` table under live traffic.
- The Vercel build running `scripts/deploy-migrations.mjs` against Neon.
- Legal review of the privacy notice (the flag stays off until then).
