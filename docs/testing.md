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
| Tests | `npm test` (= `tsx --test tests/*.test.ts`) | ~1,200 tests, <1 min. Run **after** a build so the rendered-HTML SEO suites execute. |

Placeholder environment for build and tests (nothing connects to anything):

```
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
NEXTAUTH_SECRET=ci-placeholder-secret
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never put a production or shared database URL in these variables.

## Expected skips

`npm test` reports ~35 skipped tests. They are legitimate and listed in `scripts/ci/check-skips.mjs`:

- **Database suites** (`tests/*-db.test.ts`, 32 suites): they skip unless `GARAGEOS_CRM_TEST_DB_URL` points at a local **scratch** PostgreSQL. They are not run by the lightweight CI job.
- **`tests/integration/*`**: only through `npm run test:integration`, which is fail-closed against anything but the authorised Neon preview database (see `docs/integration-testing.md`). Never part of CI.
- **Rendered SEO suites** (`seo-rendered`, `seo-fr-wave1`, `features-pages`) skip with "run `next build` first". In CI they must **not** skip: the build runs before the tests and `check-skips.mjs` fails the job if they do.

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
