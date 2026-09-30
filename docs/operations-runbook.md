# GarageOS — Minimum operations runbook (V1)

Facts from the repository (nothing here assumes infrastructure that isn't in the code): Next.js on Vercel; PostgreSQL via
`DATABASE_URL`/`DIRECT_URL` (Prisma, `garageos` schema; the code is written for Supabase-style hosted Postgres with SSL); Supabase
Storage for files; Stripe, Twilio, Resend, QuickBooks Online as providers; Vercel Cron (`vercel.json`): `/api/webhooks/cron` 08:00 UTC,
`/api/webhooks/cron/campaigns` 09:00, `/api/webhooks/cron/quickbooks` 10:00 — all need `Authorization: Bearer $CRON_SECRET`.

## Database backup and restore
- The repo does **not** define backups; they come from the database host. Before the first customer: identify the host, confirm
  automatic daily backups (and PITR if available), and **restore one backup into a scratch database and run
  `npx prisma migrate status` + a login** to prove it works. Record the retention period.
- Manual backup: `pg_dump --format=custom --no-owner "$DIRECT_URL" > garageos-$(date +%F).dump` (store off-platform, encrypted).
- Restore: create an empty DB, `pg_restore --no-owner -d <new-url> garageos-….dump`, point `DATABASE_URL`/`DIRECT_URL` at it, redeploy.
- Supabase Storage files are separate from the DB backup — enable bucket backup/replication or accept that files (logos, DVI photos, receipts) are not covered.
- Keep a copy of `INTEGRATIONS_ENCRYPTION_KEY` (lost key = QuickBooks tokens unreadable; shops must reconnect) and `NEXTAUTH_SECRET`.

## Migrations and rollback
- `npm run build` runs `prisma migrate deploy` first; a failing migration fails the build and the previous deployment keeps serving.
- Take a backup before any deploy that contains a migration. Migrations are additive/forward-compatible: the previous code keeps working
  against the new schema, so **rollback = promote the previous Vercel deployment** (do not try to reverse SQL).
- Never rename an applied migration folder (it re-runs). After a P3009 (failed migration) use `prisma migrate resolve` (see the
  historical notes in `scripts/deploy-migrations.mjs`).
- Verify drift any time: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` should print an empty migration.

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
