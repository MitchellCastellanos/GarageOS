# Testing and CI baseline

Last verified: 2026-10-22 on `main` after PRs #179–#183 (Node 22.22, npm 10.9).

## Commands

| What | Command | Notes |
|---|---|---|
| Install | `npm ci` | `postinstall` runs `prisma generate` and copies the MapLibre worker. |
| Prisma schema | `npx prisma validate` | Needs `DATABASE_URL` set to any placeholder; nothing connects. |
| Types | `npm run typecheck` | **Needs a bigger heap**: `NODE_OPTIONS=--max-old-space-size=6144`. With Node's default (~2 GB) `tsc` aborts out of memory. ~75 s. |
| Lint | `npm run lint` | 0 errors, ~1,100 warnings (known backlog; warnings do not fail). ~70 s with the larger heap. |
| Production build | `npx next build` | Placeholder env only (below). ~2 min. Do **not** use `npm run build` locally: it also runs `scripts/deploy-migrations.mjs`. |
| Tests | `npm test` (= `tsx --test tests/*.test.ts`) | 1,216 tests, ~50 s. Run **after** a build so the rendered-HTML SEO suites execute. |

Placeholder environment for build and tests (nothing connects to anything):

```
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
NEXTAUTH_SECRET=ci-placeholder-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
# build only:
NEXTAUTH_URL=http://localhost:3000
```

`NEXTAUTH_URL` must be **unset when running the tests**: with it defined, `tests/auth-claims.test.ts` (two end-to-end cases that pass a plain `Request` to the Auth.js handler) fails with `Cannot destructure property 'href' of 'req.nextUrl'`.

Never put a production or shared database URL in these variables.

## Expected skips

`npm test` reports about 32 skipped tests after a build (one per database suite, 31 today, plus the integration gate). They are legitimate and listed in `scripts/ci/check-skips.mjs`:

- **Database suites** (`tests/*-db.test.ts`, 31 suites, 408 tests): they skip unless `GARAGEOS_CRM_TEST_DB_URL` points at a local **scratch** PostgreSQL. They are not run by the lightweight `verify` job; the separate `db-tests` workflow runs them (next section).
- **`tests/integration/*`**: only through `npm run test:integration`, which is fail-closed against anything but the authorised Neon preview database (see `docs/integration-testing.md`). Never part of CI.
- **Rendered SEO suites** (`seo-rendered`, `seo-fr-wave1`, `features-pages`) skip with "run `next build` first". In CI they must **not** skip: the build runs before the tests and `check-skips.mjs` fails the job if they do.

## Database suites (`*-db.test.ts`) against a disposable PostgreSQL

Each suite checks `GARAGEOS_CRM_TEST_DB_URL` itself and only runs for host `localhost`/`127.0.0.1` with a database name containing `replay|test|scratch`; it then points `DATABASE_URL`/`DIRECT_URL` at it. Suites do **not** create the schema: apply the repo migrations first (they create the `garageos` schema). Migrations need only `DATABASE_URL`/`DIRECT_URL` (`prisma.config.ts`).

**Run each suite in its own fresh database.** Run together in one database (e.g. `tsx --test tests/*-db.test.ts`) 87 of 408 tests fail, because the suites share global state (pools, queues, "latest version" rows, counters) and break each other. Every suite passes alone in a clean database. `scripts/ci/run-db-tests.mjs` does this: it copies the migrated database with `CREATE DATABASE ... TEMPLATE` for each suite and drops the copy afterwards (the template itself is never written to).

Local (needs PostgreSQL 16 server tools and the `psql` client; no Docker required):

```
# 1. a throwaway server (any port/data dir; trust auth is fine on 127.0.0.1)
initdb -D /tmp/pgscratch -A trust -U postgres
pg_ctl -D /tmp/pgscratch -o "-p 54329 -c listen_addresses=127.0.0.1 -c fsync=off" -w start
createdb -h 127.0.0.1 -p 54329 -U postgres garageos_scratch_test

# 2. schema = repo migrations
export GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_scratch_test
DATABASE_URL=$GARAGEOS_CRM_TEST_DB_URL DIRECT_URL=$GARAGEOS_CRM_TEST_DB_URL npx prisma migrate deploy

# 3. run (placeholders only; NEXTAUTH_URL must stay unset; ~5 min)
export NODE_OPTIONS=--max-old-space-size=6144 DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci NEXTAUTH_SECRET=x NEXT_PUBLIC_APP_URL=http://localhost:3000
node scripts/ci/assert-scratch-db.mjs
node scripts/ci/run-db-tests.mjs --log db-test-output.log            # all suites
node scripts/ci/run-db-tests.mjs --log db-test-output.log voice-hold  # name filter
node scripts/ci/check-skips.mjs --strict db-test-output.log          # fails on any skip
```

To reset the template after a schema change: drop and recreate `garageos_scratch_test`, then repeat step 2. A single suite can also be run directly (`npx tsx --test tests/voice-hold-db.test.ts`) against a freshly migrated database.

### CI: `db-tests` (`.github/workflows/db-tests.yml`)

Separate from `verify` (which is untouched and still skips these suites). Triggers: pull requests to `main` touching `prisma/**`, `src/**`, `tests/**`, `scripts/**`, `package*.json`, `prisma.config.ts` or the workflow file; `workflow_dispatch`; and a weekly cron (catches date-dependent failures). Steps: `postgres:16` service container with a throwaway password, `scripts/ci/assert-scratch-db.mjs` (refuses anything but a localhost/127.0.0.1 URL whose database name matches `replay|test|scratch`; `::1` is not accepted because the suites themselves reject it), `prisma migrate deploy`, `scripts/ci/run-db-tests.mjs` (sequential, one copy of the database per suite), then `check-skips.mjs --strict` (any skipped test fails the job). No secrets, no Neon, no provider variables.

It is **not** a required status check. Owner action: after a few green runs, add `db-tests` to the branch-protection rule for `main` if wanted.

### Expected result and known failures

Verified 2026-10-22 on `main` with PostgreSQL 16 (31 suites, 408 tests): **408 pass, 0 fail, 0 skipped.** There are no failing suites when each runs in a clean database, so nothing is excluded.

Pre-existing, not infrastructure bugs but test-isolation defects: the suites cannot share one database. Running `tsx --test tests/*-db.test.ts` against a single database fails 87/408 tests (casl-evidence, contact-readiness, lead-radar-*, outreach-readiness, repair-fit, sales-workspace(-email), seller-capabilities, source-points-refresh, voice-calling, voice-hold, work-lanes, lead-engine, prospect-source-location, all of which pass alone). Typical symptoms: `Cannot read properties of null (reading 'version')`, a row from another suite listed in a global pool, `LEAD_RADAR_DISABLED`. Issue-ready description: "DB suites leak global state (rows with global scope, feature flags, latest-version lookups) into each other; make each suite scope its queries to its own run id or clean up". Until then the runner's per-suite template copy is the supported way to run them. Found and fixed by this work: `lead-radar-contact-seeding-db` was flaky (~1 run in 5, failed once on the first GitHub run and 2 of 13 locally): its fixture phone number took a random leading digit from the clock, and a NANP exchange code cannot start with 0 or 1, so the phone-only record was discarded (`a phone-only REMOTE business is now staged, not discarded`) and the rest of the suite cascaded. The fixture now starts with 2 (30/30 consecutive local passes afterwards). Nine other suites use the same `Date.now() % 100000` phone pattern (lead-engine, lead-radar-automation/-compare/-national/-rollout, lead-radar, prospect-source-location, sales-crm, sales-identity); they have not been seen to fail but may carry the same ~20% risk when the phone becomes load-bearing, so a re-run of a red `db-tests` job is justified once before investigating.

The date-dependent `sales-comms-db` cases passed on the verification date; the weekly cron will surface any that regress.

`npm run test:integration` (Neon preview, `docs/integration-testing.md`) is a separate, manual, fail-closed process. It is unrelated to this job, never runs in CI, and `scripts/run-integration.mjs` / `scripts/lib/integration-guard.mjs` are unchanged.

## CI

`.github/workflows/ci.yml` runs on every pull request to `main` and on pushes to `main`:

1. `npm ci` (npm cache), `prisma validate`
2. `npm run typecheck`
3. `npm run lint` (errors fail)
4. `npx next build`
5. `npm test`, then `scripts/ci/check-skips.mjs` (fails on any skip that is not a database-gated suite)

It uses placeholder environment variables only: no secrets, no Neon, no providers.

### Branch protection (owner action)

In GitHub → Settings → Branches → rule for `main`, require the status check **`verify`** (job name in `ci.yml`) and keep "Require branches to be up to date" on. Vercel's own deployment check can stay as it is. Branch protection is not changed by the repository.

## Known state

- Type check: clean.
- Lint: 0 errors.
- Tests: all pass except the intentionally skipped suites above.
- Flaky: the Vercel Preview/CI build can fail while fetching the Oswald Google font; re-run the same job once, never push an empty commit.
- The repository must not track `node_modules` or Python bytecode; `.gitignore` covers `/node_modules`, `__pycache__/` and `*.pyc`. (A self-referencing `node_modules` symlink was committed once in #178 and broke local installs.)
