# Remote handoff — Garage Laurent seed + asset attachment

Date: 2026-10-07. Branch: `launch-agent-6/demo-journey-handoff` (based on `launch-agent-6/demo-journey`, PR #81).

This picks up where `docs/demo-journey/validation.md` left off: the `/demo` page, catalog, components and
capture tooling were already committed on `launch-agent-6/demo-journey`. What was still **local and
uncommitted** on the original laptop — the seed script itself, the attach-images script, its tests, the
`package.json` entries, and the six raw marketing photos — is committed here instead, so a different
computer can continue without re-doing any of it.

Nothing here depends on the original laptop's paths. `scripts/marketing/attach-garage-laurent-assets.ts`
resolves the `Garage Laurent/` folder relative to its own file location (`import.meta.url`), not an
absolute path, and the seed script takes everything through environment variables.

## What's in this branch

| File | Purpose |
| --- | --- |
| `scripts/seed-marketing-garage-laurent.ts` | Idempotent seed for the `marketing-garage-laurent-v1` dataset (see `docs/marketing-garage-laurent-seed.md`) |
| `scripts/marketing/attach-garage-laurent-assets.ts` | Uploads the 6 photos below and links them to the seeded shop/inspection |
| `scripts/marketing/garage-laurent-dataset.ts` | Pure data/plan module (already on `launch-agent-6/demo-journey`) — both scripts above import it |
| `tests/marketing-garage-laurent.test.ts` | Pure unit tests for the dataset module (10 tests, no DB) |
| `docs/marketing-garage-laurent-seed.md` | Full seed runbook: commands, guarantees, verification record from the original run |
| `Garage Laurent/*.png` | The 6 raw marketing photos (logo, exterior, workshop, tire, brake, campaign banner) |
| `docs/demo-journey/garage-laurent-assets-manifest.json` | SHA-256 + dimensions for each photo above, so any machine can confirm a Storage upload matches without re-uploading |
| `package.json` | Adds `seed:marketing-garage-laurent` and `attach:marketing-garage-laurent-assets` npm scripts |

No `.env` files, passwords, tokens, or service-role keys are included anywhere in this branch.

## 1. Recreate the dataset on a fresh dev database

Requirements: Node (this was built/tested on Node 24, npm 11), a local or dedicated-preview PostgreSQL
instance, this repo checked out with dependencies installed (`npm install`).

```bash
# Point at a local Postgres (never neondb, never the shared integration DB garageos_replay)
export DATABASE_URL="postgresql://<user>:<pass>@localhost:<port>/<db>"
npm run db:generate
npm run db:deploy          # applies committed migrations

# First run only — sets the owner's password (min 8 chars). Never read back, never committed.
export DEMO_OWNER_PASSWORD="<pick a demo password>"

# 1) Dry run first — prints exact counts, writes nothing (rolls back the transaction)
npm run seed:marketing-garage-laurent -- --dry-run

# 2) Real run. --access-file writes portal/inspection/approval links to a file OUTSIDE the repo.
npm run seed:marketing-garage-laurent -- --access-file=../gl-access-links.json
```

On Windows PowerShell, set the env vars with `$env:DATABASE_URL = "..."` / `$env:DEMO_OWNER_PASSWORD = "..."`
in the current session instead of `export`.

Full guarantees, idempotency behavior, and the manifest of every seeded scenario (which client/invoice/quote
maps to which id) are in `docs/marketing-garage-laurent-seed.md` — read it before touching the DB, it also
explains the `--allow-remote` guard if you ever point this at a non-localhost URL (dedicated preview branch
only, still never production).

Re-running the seed is safe: it only creates rows that don't already exist by id (`mkt-gl-v1-…` prefix) and
never deletes or overwrites business data, so UI changes you made in between (e.g. approving a quote) are
preserved.

## 2. Reuse the existing images (no need to regenerate them)

The six photos under `Garage Laurent/` are already final — don't regenerate or re-prompt for them. Verify
you have the right files before attaching (useful if copying over cloud storage, zip, etc. where bytes can
get corrupted or re-encoded):

```bash
# bash/macOS/Linux
sha256sum "Garage Laurent"/*.png
# PowerShell
Get-ChildItem "Garage Laurent" -Filter *.png | Get-FileHash -Algorithm SHA256
```

Compare against `docs/demo-journey/garage-laurent-assets-manifest.json`. A matching hash means the file is
byte-identical regardless of machine or path.

Then attach them to the seeded shop/inspection:

```bash
# Storage credentials: either export them, or drop them in .env.production.local at repo root
# (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — see loadStorageEnv() in the script.
# These are never read from DATABASE_URL and the script touches no fiscal/invoice data.

npm run attach:marketing-garage-laurent-assets -- --dry-run   # validates, converts, hashes — writes nothing
npm run attach:marketing-garage-laurent-assets                # uploads + links (only if Storage is configured)
```

The script is content-addressed: it hashes each file against what's already in Storage/DB and skips
re-uploading anything that already matches, so running it again (even from a different machine pointed at
the same Storage bucket) is a no-op for assets already attached.

## 3. Continue the `/demo` capture plan

The capture/build tooling (`scripts/demo-journey/*.mjs`, the asset catalog, components, and the
"assets pending" `/demo` page) is already on `launch-agent-6/demo-journey` — this branch doesn't duplicate
it. Once steps 1–2 above give you a working seeded DB with images attached:

1. Read `docs/demo-journey-implementation-plan.md` (the full brief: all 25 asset names, routes, viewport
   sizes, locale rules) and `docs/demo-journey/README.md` (the step-by-step tooling runbook) end to end
   before capturing anything.
2. `docs/demo-journey/validation.md` records the exact state the previous session stopped at: **tooling
   done, 0 of 25 real captures produced**, blocked by a local-Postgres-only issue on the original machine
   (Windows error 487 / shared-memory collision — specific to that laptop's Postgres process, not a repo or
   code issue). A fresh machine should not hit that; if it does, it's an OS/Postgres-install problem to
   solve locally, not something to patch around in the repo.
3. Run `DEMO_OWNER_PASSWORD=… DEMO_ACCESS_FILE=<path to the --access-file from step 1> node scripts/demo-journey/capture.mjs`
   once the DB answers — expect to need to adjust selectors/waits since this script was written but never
   successfully run end-to-end against a live app.
4. Follow `docs/demo-journey/README.md` steps 3–7 (document renders, `prepare-assets.mjs`,
   `build-messages.ts`, `qa-demo-page.mjs`, secret audit, manifest + validation update).

## What was NOT done here

- No Postgres setup, startup or repair — the environment-specific blocker from the previous session is left
  for whoever has hands on the new machine's Postgres install.
- No screenshots/captures were taken.
- No secrets, `.env` files, or passwords were committed or discovered uncommitted; checked explicitly before
  this handoff (`git status`, this document's own secret-audit pass over the new files).

## Checks run before this handoff

- `git status` / `git stash list` confirmed `claude --teleport`'s failed stash left **nothing stashed** —
  all pending work was still present as plain uncommitted changes, not recovered from a stash.
- Reviewed every uncommitted file by hand for hardcoded absolute paths and secrets: none found. The attach
  script resolves its asset folder relative to its own source file, not the laptop's path.
- See the PR description for the exact repo checks (typecheck/tests/lint) run on this branch.
