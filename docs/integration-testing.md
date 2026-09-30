# Integration tests (real PostgreSQL)

`npm run test:integration` runs the real server actions against a **real database** with a fake session
(`tests/integration/*.test.ts`: tenant isolation, roles × plans, concurrency, import stress, portal, Multi-Shop, core workflow).

## Read this first

- **The suite writes test data and never cleans up.** One full run adds roughly 40,000 rows (shops, users,
  10,000-row customer/vehicle/part imports, invoices, inventory movements…). Data stays until someone resets the database deliberately.
- **It must only run against the authorized integration database** — the `garageos_replay` database on the Neon
  `preview` branch. It must never run against Production, the `neondb` reference copy, or a developer's real data.
- **Providers are not available.** Stripe, Twilio, Resend, Pusher, Telegram, Supabase, Google, QuickBooks and every other
  secret are removed from the test process. Code paths that would call them fail with "not configured" (and are logged);
  the tests that need a provider inject fakes.

## How it is protected

`npm run test:integration` → `scripts/run-integration.mjs` (Node, identical on Windows, macOS and Linux). Before any test starts it:

1. Requires an **explicit opt-in**: `GARAGEOS_INTEGRATION_DB=1` or `--yes-write-test-data`.
2. Reads the URL only from `GARAGEOS_INTEGRATION_DATABASE_URL` (or `--neon`, which fetches it through the authenticated
   `neonctl`). **`DATABASE_URL` is deliberately ignored** and never forwarded, so an inherited Production URL cannot be used.
3. Connects read-only and asks the **server** who it is (`neon.project_id`, `neon.branch_id`, `current_database()`), then
   requires all of: the authorized project, branch and database; a direct (non-pooler) Neon endpoint; not a Production
   branch; every repository migration applied; no failed, rolled-back, duplicate or unknown migration. Anything unknown fails closed.
4. Builds the child environment **from scratch**: OS variables, the verified `DATABASE_URL`, and the opt-in/verified
   markers. Provider and application secrets are never copied, even if the shell has them.
5. Starts `tsx --test --test-concurrency=1` itself (no shell globbing). `tests/integration/helpers.ts` refuses to run
   in real-DB mode unless the runner's verified-target marker is present, so `tsx --test tests/integration` with a hand-set
   `DATABASE_URL` cannot bypass the gates.

The rules live in one place, `scripts/lib/integration-guard.mjs` (`AUTHORIZED_TARGET`, `DENIED_BRANCH_IDS`, `evaluateTarget`,
`buildChildEnv`), and are unit-tested in `tests/integration-runner.test.ts` (Production branch, wrong project/branch/database,
missing opt-in, failed migration, provider leakage, …). To authorize a different database, change `AUTHORIZED_TARGET` in a reviewed commit.

## Running

```bash
# gates only, no tests (safe to run any time)
npm run test:integration -- --yes-write-test-data --neon --dry-run

# full suite (about 25 minutes)
npm run test:integration -- --yes-write-test-data --neon

# one file, or a name filter passed to node:test
npm run test:integration -- --yes-write-test-data --neon import.test.ts -- --test-name-pattern="XLSX"
```

PowerShell/cmd/bash all work the same way; to supply the URL yourself instead of `--neon`, set
`GARAGEOS_INTEGRATION_DATABASE_URL` (direct endpoint of `garageos_replay`) in the shell. Never commit or print it.

## Fixtures

The 10,000-row XLSX import test generates its workbook (`tests/helpers/xlsx-fixture.ts`, no extra dependency) in a private
temporary directory and removes only that directory afterwards. `tests/xlsx-fixture.test.ts` proves, without a database, that
the generated file is read back exactly by the application's own importer.

## Resetting the data

Nothing resets automatically. Clearing the test data means dropping/recreating `garageos_replay` (then re-running
`prisma migrate deploy` against it) — a destructive, deliberate step for the database owner; never automate it in the runner.
