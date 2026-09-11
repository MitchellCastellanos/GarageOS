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

Behavior:

- If neither `DIRECT_URL` nor `DATABASE_URL` is set (local `next build`
  without a `.env`, or a build environment without DB access), the script
  logs a message and exits `0` — the build is not blocked.
- If a connection string is present, it runs `prisma migrate deploy` and
  fails the build if the migration fails, so a broken migration can't reach
  production silently.
- Like the Prisma CLI elsewhere in this project, it prefers `DIRECT_URL`
  (a non-pooled connection, required by Neon for migrations) and falls back
  to `DATABASE_URL`.

## Adding a new migration

```
npm run db:migrate   # prisma migrate dev — creates + applies locally, updates the client
```

Commit the generated `prisma/migrations/<timestamp>_<name>/` folder. The
next deploy applies it automatically — nothing else to do.

## Running it manually

`npm run db:deploy` (`prisma migrate deploy`) still works for a manual
apply (e.g. against a fresh database before the first deploy, or to
recover if a deploy's migration step needs to be re-run).
