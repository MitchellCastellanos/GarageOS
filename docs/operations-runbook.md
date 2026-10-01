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

**Restore procedure**
- DB: create an empty Postgres → `pg_restore --no-owner -d <new-url> garageos-YYYY-MM-DD.dump` → `npx prisma migrate status` (must report up to date) → point `DATABASE_URL`/`DIRECT_URL`/`DATABASE_URL_POOLED` at it in Vercel → redeploy. Provider restores (Supabase dashboard/PITR) take the project offline while running.
- Storage: re-upload the copied files into the same bucket names and **same paths** (paths are the keys stored in the DB). Private buckets must be created private (`accounting`, `communications`); `public-assets` public.
- After any restore: log in, open an invoice download link, a DVI photo and a Portal PDF.

**Restore test (evidence)**
- Frequency: once before the first paying customer, then every quarter and after any provider/plan change.
- Done when: a scratch database restored from the latest backup passes `prisma migrate status`, row counts of `Shop`/`Client`/`Invoice` match the source within the backup window, and 3 sampled storage objects open byte-identical (`sha256`).
- Retain: date, backup file name + sha256, who ran it, counts, result, time taken — one line in `docs/compliance/incident-register.md`-style log or a dated note in this file. Delete the scratch database afterwards.

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
