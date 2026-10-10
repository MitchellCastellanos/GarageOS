# Automated database migrations

Migrations used to require someone manually running `npm run db:deploy`
against the production database after every schema change — that step was
missed after the initial migration in commit `14726ec`, leaving the
`garageos` schema uncreated and signup/login failing (P2021).

Migrations now run automatically as part of the build:

```
npm run build   # → prisma generate && node scripts/deploy-migrations.mjs && next build
```

`scripts/deploy-migrations.mjs` runs `prisma migrate deploy` (applying any
migration under `prisma/migrations/` that hasn't run yet) before `next
build`. Vercel runs `npm run build` on every deployment, so pushing a new
migration to `main` is enough — no manual step, no forgetting to run it.

Which environments may touch a database is decided by `scripts/lib/deploy-guard.mjs` (fail closed,
unit-tested in `tests/deploy-migrations-guard.test.ts`). The flow, when allowed, is:
`prisma migrate deploy` → sender-identity backfill → super-admin bootstrap.

| Context | Result |
|---|---|
| Vercel **Production** build (`VERCEL=1`, `VERCEL_ENV=production`) | Runs the steps. `DIRECT_URL` and `DATABASE_URL` (if both set) must point at the same endpoint, because migrate uses `DIRECT_URL`/`DATABASE_URL` while backfill/bootstrap use `DATABASE_URL`. |
| `VERCEL_ENV=production` **without** `VERCEL=1` | Refused (exit 1): Production migrations run only from the Vercel Production deploy. |
| Vercel **Preview / Development** | Skipped. Enabled only with `RUN_DB_STEPS_ON_PREVIEW=1` (not set anywhere today) and a dedicated database; a Production endpoint is refused. A `DIRECT_URL` does not bypass this. |
| **No `VERCEL_ENV`** (local machine, CI) | Skipped by default — a `DATABASE_URL` in the environment (for example from a developer's production env file) is **not** authorization. |
| Deliberate manual run | Needs `DEPLOY_MIGRATIONS_ALLOW_LOCAL=1` **and** `DEPLOY_MIGRATIONS_TARGET_ENDPOINT=<endpoint id>` matching the URL(s). Production endpoints are always refused, even if named. |

Other behavior:

- If a connection string is missing where a run is allowed, the script logs a message and exits `0`.
- It runs `prisma migrate deploy` and fails the build if the migration fails, so a broken migration can't reach production silently.
- Like the Prisma CLI elsewhere in this project, it prefers `DIRECT_URL` (a non-pooled connection, required by Neon for migrations) and falls back to `DATABASE_URL`.
- Logs never contain connection strings or credentials.

## Recent migrations
- `20261012090000_lead_engine_foundation` — Lead Engine: source observations, duplicate reviews, assignment runs, derived address/territory columns, structured CASL evidence + review status (existing bases stamped `LEGACY_UNREVIEWED`). Additive. See `docs/lead-engine-contracts.md`. Not applied to Production yet.
- `20261011090000_sales_video_attribution` — Sales video attribution: enum `CrmVideoEventType` + tables `CrmVideoLink`, `CrmVideoEvent`, `CrmVideoLinkMessage`. Additive only. See `docs/sales-video.md`. Not applied to Production yet.
- `20261009100000_sales_crm_foundation` — Sales CRM foundation (Agent 1): additive enums/tables, partial unique indexes, seeded needs taxonomy, nullable `SalesDemo.crmOpportunityId`. See `docs/sales-crm-agent-1-handoff.md`. Not applied to Production yet.
- `20261004100000_subscription_past_due_since` — adds nullable `Subscription.pastDueSince` (48 h PAST_DUE grace clock). Additive; existing PAST_DUE rows are backfilled to the migration time (fresh 48 h, no retroactive lockout; see `docs/provider-isolation.md` §4). Not applied to Production yet — it ships with the next Production deploy.

## Production migration history (audited read-only, 2026-09-30)

Production's `public._prisma_migrations` has 49 rows: 47 successful, 2 rolled back, 0 failed. Every one of the 46 current repository
migrations has a successful row with a matching checksum, and the live schema has **zero drift** from `prisma/schema.prisma` and from
a clean replay of the 46 migrations (catalog and Prisma comparison). The irregularities are historical and already resolved:

- `20260919120000_repair_shop_billing_email` failed once (unqualified table name), was marked rolled back, and then applied successfully.
- `20260926100000_add_appointment_events` failed once (type already existed, because the migration had been applied under an earlier name),
  was rolled back, and then recorded as applied.
- One old-name row, `20260922120000_add_appointment_events`, remains in history with no repository directory. `migrate deploy` ignores it.
- Three pairs of migrations were applied in a different order than their names sort (branch merge order); the resulting schema is identical.

These rows are intentionally preserved as historical evidence. **No Production cleanup or write is required for launch**, and none is planned.
The two legacy `migrate resolve` calls that used to sit in this script were removed after this verification; they had become no-ops on
Production and no other database ever had those failures. A clean replay from an empty database (`garageos_replay` on the Neon `preview`
branch) applies all 46 migrations and matches Production exactly.

New migrations must use a timestamp later than the newest existing directory (`20261003120000_…`), otherwise Prisma sees them as out of order.

## Adding a new migration

```
npm run db:migrate   # prisma migrate dev — creates + applies locally, updates the client
```

Commit the generated `prisma/migrations/<timestamp>_<name>/` folder. The
next deploy applies it automatically — nothing else to do.

## Running it manually

`npm run db:deploy` (`prisma migrate deploy`) applies migrations directly to whatever database the environment points at, bypassing the
guard above — use it only deliberately (for example against a fresh database). To run the full script (migrate + backfill + bootstrap) by
hand, use the manual opt-in in the table above against a non-Production database. Never run it against Production from a workstation.
