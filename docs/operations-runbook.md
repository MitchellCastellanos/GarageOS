# GarageOS — Minimum operations runbook (V1)

Facts from the repository (nothing here assumes infrastructure that isn't in the code): Next.js on Vercel; PostgreSQL via
`DATABASE_URL`/`DIRECT_URL` (Prisma, `garageos` schema; the code is written for Supabase-style hosted Postgres with SSL); Supabase
Storage for files; Stripe, Twilio, Resend, QuickBooks Online as providers; Vercel Cron (`vercel.json`): `/api/webhooks/cron` 08:00 UTC,
`/api/webhooks/cron/campaigns` 09:00, `/api/webhooks/cron/quickbooks` 10:00 — all need `Authorization: Bearer $CRON_SECRET`.

## Database and Storage backup and restore
*Facts behind this section: `docs/compliance/retention-destruction.md` (verified 2026-09-30). Status today: the application DB is on Neon (backup plan not yet recorded), the connected Supabase project is Free-plan and Storage-only (no managed backups), and Storage objects have no backup.* **Preview builds no longer touch the database** (`scripts/deploy-migrations.mjs` runs DB steps only for a Vercel Production build; local/CI and Preview are skipped — see `docs/db-migrations.md`).

**What is (and is not) covered automatically**
| Data | Automatic coverage |
|---|---|
| App PostgreSQL (Neon) | Depends on the Neon plan — **record it from the Neon console**. |
| Supabase Storage objects (invoices, receipts, DVI photos, attachments, logos) | **None on any Supabase plan** (DB backups contain only object metadata). |
| Secrets/keys (`INTEGRATIONS_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`) | None — keep an offline copy in a password manager (lost key = QuickBooks tokens unreadable, sessions invalid). |

**Strategy (early-stage, minimal moving parts)**
1. Host-level daily backups on a paid tier (owner decision; PITR is optional and not needed at launch).
2. Independent **weekly** encrypted logical dump + storage copy, kept off-platform 4–8 weeks (retention is a recorded decision in `retention-destruction.md`): `DIRECT_URL=… ./scripts/backup-db.sh out/` and `npx tsx scripts/backup-storage.ts out/storage` (both read-only). Encrypt before uploading anywhere (`age`/`gpg`); never commit dumps.
3. Take a fresh dump before any deploy that contains a migration.

**Independent off-platform DB backup (Launch Agent 2 — workflow committed; ACTIVE only after operator setup below)**
- Schedule: `.github/workflows/db-backup.yml`, daily 06:17 UTC (+ manual `workflow_dispatch`). Flow: `pg_dump` (custom format, PG18 client) of schema `garageos` → archive validated (`pg_restore --list`, core tables present) → encrypted with `age` to a public recipient key → uploaded to a **private Cloudflare R2 bucket** → size verified via `head-object`. The runner never holds the age private key, so it cannot decrypt.
- Retention: R2 lifecycle rule deletes objects under `daily/` after 30 days. Neon PITR (currently 6 h, Free plan) is the first line; this dump is the second (survives Neon account loss).
- Credentials (GitHub repo secrets, never in chat/commits): `BACKUP_DATABASE_URL` (direct, non-pooled URL of a dedicated **SELECT-only** Neon role `backup_ro`), `BACKUP_AGE_RECIPIENT` (age *public* key), `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` (token scoped to this one bucket, Object Read & Write), `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, optional `BACKUP_HEALTHCHECK_URL`. The age **private** key lives only in the owner's password manager + one offline copy.
- Failure detection: a failed run emails the repo owner (GitHub default); the optional healthchecks.io ping alerts if no success arrives (also covers GitHub disabling schedules after 60 days of repo inactivity — public repos).
- RPO: ≤ 24 h for the off-platform copy (≤ 6 h via Neon PITR while the Neon project is healthy). RTO (realistic): Neon branch/PITR restore ≈ minutes; restore from R2 dump ≈ 30–60 min (download, decrypt, `pg_restore` into new Postgres, `prisma migrate status`, repoint Vercel env, redeploy). Owner: Mitchell (Privacy Officer / operator).
- Restore drill from R2: `age -d` → `scripts/restore-drill.sh` into an **isolated scratch Neon branch/database only** (the script refuses non-empty targets and targets equal to the shell's DB URLs). Never restore over Production.
- Not covered: Supabase Storage objects (`scripts/backup-storage.ts` is manual; separate decision).

**Restore procedure**
- DB: create an empty Postgres → `pg_restore --no-owner -d <new-url> garageos-YYYY-MM-DD.dump` → `npx prisma migrate status` (must report up to date) → point `DATABASE_URL`/`DIRECT_URL`/`DATABASE_URL_POOLED` at it in Vercel → redeploy. Provider restores (Supabase dashboard/PITR) take the project offline while running.
- Storage: re-upload the copied files into the same bucket names and **same paths** (paths are the keys stored in the DB). Private buckets must be created private (`accounting`, `communications`); `public-assets` public.
- After any restore: log in, open an invoice download link, a DVI photo and a Portal PDF.

**Restore test (evidence)**
- Frequency: once before the first paying customer, then every quarter and after any provider/plan change.
- Done when: a scratch database restored from the latest backup passes `prisma migrate status`, row counts of `Shop`/`Client`/`Invoice` match the source within the backup window, and 3 sampled storage objects open byte-identical (`sha256`).
- Retain: date, backup file name + sha256, who ran it, counts, result, time taken — one line in `docs/compliance/incident-register.md`-style log or a dated note in this file. Delete the scratch database afterwards.

**Restore drill log**

- **2026-10-01, Launch Agent 1 (neonctl, authenticated to the GarageOS Neon project `autumn-art-59701921`).** Method: Neon's own native restore mechanism — created a child branch (`restore-drill-20261001`) off the Production branch (`production` / `br-long-mountain-aeo7kyj3`), which is Neon's copy-on-write equivalent of "restore from backup into an isolated target" (no read/write ever touched Production; the parent branch is unaffected by creating or deleting a child). Result: `prisma migrate status` against the new branch reported "Database schema is up to date!" (50/50 migrations applied, matching Production exactly, zero drift). Row counts for `Shop`(2)/`Client`(2)/`Vehicle`(3)/`Invoice`(3)/`Appointment`(2)/`CommunicationMessage`(27)/`User`(3) were read successfully and are internally consistent with the retained Pichitos-Garage-only fixture state. Supabase Storage objects were **not** part of this drill (separate system, no backup on the current Free plan — see below). The scratch branch was deleted immediately after validation (`neonctl branches delete`); no credential from it was reused or retained. Time taken: under 5 minutes end to end (branch creation is near-instant on Neon). **This proves GarageOS's DB recovery mechanism works today for the "lost/corrupted database" scenario**, using Neon branching rather than the `pg_dump`/`pg_restore` procedure above — both are valid; branching is faster and provider-native, `pg_dump` is what survives a full Neon-account loss (see "off-platform backup" below).
- **Outstanding, requires operator**: a drill of the `pg_dump`/`pg_restore` off-platform path (`scripts/backup-db.sh`) and a Supabase Storage object restore have not been run — both need credentials/decisions (where encrypted dumps are stored, which bucket a test restore writes to) that this agent did not have authority to create unilaterally.

**Neon account facts (read 2026-10-01 via `neonctl`, authenticated session already present on the operator's machine — no credentials were requested or pasted into this conversation)**
- Org plan: **Free** (`neonctl orgs list` → `"plan": "free"`). Project `GarageOS` (`autumn-art-59701921`), region `aws-us-east-2` (Ohio), Postgres 18.
- `history_retention_seconds: 21600` → **6 hours** of point-in-time-restore window on the Production branch. This is the actual current PITR capability — materially shorter than the "check the Neon console" placeholder this document used to carry. Neon's Free plan allows configuring this up to 24 hours; Launch/paid plans allow more (7+ days) — **not changed by this agent** (a plan/console decision for the operator).
- **Production branch protection is still `protected: false`** (confirmed live via `neonctl branches list`, matching `docs/launch-readiness.md` #4c — this has not changed since 2026-09-30). Enabling it on Neon only restricts destructive branch-level operations (delete, reset-to-parent, compute-size limits) behind extra confirmation; it does **not** affect normal reads/writes or `prisma migrate deploy` from Vercel Production builds. This is a safe, reversible setting but is a provider-console mutation this agent did not make without operator authorization — see the launch-readiness note for the exact action needed.
- **Backup posture given the 6 h PITR window**: Neon's Free/Launch plans do not offer separate "daily snapshot" backups beyond the PITR window — recovery from anything older than 6 hours depends entirely on the off-platform logical dump (`scripts/backup-db.sh`), which is a **manual, not-yet-scheduled** script. Recommendation for the operator: either raise `history_retention_seconds` (free, instant, no plan change, console or `neonctl projects update`) to the Free-plan maximum, and/or schedule the weekly `backup-db.sh` dump to run automatically (e.g. a GitHub Actions scheduled workflow writing an encrypted dump to off-platform storage) before onboarding a paying shop. Neither change was made by this agent — both are provider/infrastructure decisions for the operator.

## Migrations and rollback
- `npm run build` runs `prisma migrate deploy` first; a failing migration fails the build and the previous deployment keeps serving.
- Take a backup before any deploy that contains a migration. Migrations are additive/forward-compatible: the previous code keeps working
  against the new schema, so **rollback = promote the previous Vercel deployment** (do not try to reverse SQL).
- Never rename an applied migration folder (it re-runs). After a P3009 (failed migration) use `prisma migrate resolve` (see the
  Production migration-history notes in `docs/db-migrations.md`; resolve manually and deliberately, never from the build script).
- Verify drift any time: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` should print an empty migration.

## Provider side effects are opt-in per environment
Outbound effects (SMS, email, Pusher events, Telegram, Twilio/Resend management, Stripe mutations, QuickBooks) only happen when `PROVIDER_SIDE_EFFECTS=enabled` is set — Production explicitly, **Preview never** (except a provider-specific controlled test; for Stripe TEST use `STRIPE_TEST_MUTATIONS=enabled` with a test key). If SMS/email/realtime silently stop in Production, check that variable first. Crons report `providerSideEffects: "disabled"` and skip outbound steps. `NEXTAUTH_SECRET` must be different per environment. Details: `docs/provider-isolation.md`.

## Provider outages
- **Stripe**: signed-in shops keep working (subscription state is stored locally). Webhooks are retried by Stripe and are idempotent
  per `event.id`; after an outage, resend failed events from the Stripe dashboard. New signups/upgrades can't reach Checkout until Stripe is back.
  The Billing return path re-syncs from Stripe (`confirmCheckoutAction`). Never grant access manually by editing `Subscription` unless it is a documented grandfather case.
- **Twilio**: SMS sends fail per message and fall back to email (SMS-first policy); statuses that never arrive are reconciled by the daily cron; overage reports retry daily.
- **Resend**: email sends fail and are recorded FAILED; automated reminders/campaigns retry on the next cron (idempotent — no duplicates). Webhook events are retried by Resend.
- **QuickBooks/Intuit**: sync errors back off (5 min → 24 h) per record; the shop is never blocked. `NEEDS_RECONNECT` → owner reconnects in Settings → QuickBooks.
- **Supabase Storage**: uploads fail with a message; documents/receipts/photos are unavailable until restored; core workflow continues.
- Every notification failure is logged (Vercel logs) and never blocks invoicing/Work Order/check-in actions (verified in the workflow integration test).

## Routine checks
- Vercel → cron logs each morning (three jobs). Stripe → Webhooks → recent deliveries all 2xx. Resend/Twilio dashboards for bounces/undelivered.
- Rate-limit table (`RateLimitBucket`) is purged by the daily cron.
- Rotate `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, provider keys if any leak is suspected (never commit secrets; `.env` is git-ignored).
