# GarageOS — Minimum operations runbook (V1)

Facts from the repository (nothing here assumes infrastructure that isn't in the code): Next.js on Vercel; PostgreSQL via
`DATABASE_URL`/`DIRECT_URL` (Prisma, `garageos` schema; the code is written for Supabase-style hosted Postgres with SSL); Supabase
Storage for files; Stripe, Twilio, Resend, QuickBooks Online as providers; Vercel Cron (`vercel.json`): `/api/webhooks/cron` 08:00 UTC,
`/api/webhooks/cron/campaigns` 09:00, `/api/webhooks/cron/quickbooks` 10:00 — all need `Authorization: Bearer $CRON_SECRET`.

## Database and Storage backup and restore
*Facts behind this section: `docs/compliance/retention-destruction.md` (verified 2026-09-30). Status (updated 2026-10-02): the application DB is on Neon Free (6 h PITR) with an independent daily off-platform dump (below); the connected Supabase project is Free-plan and Storage-only (no managed backups) and Storage objects have no automated backup yet (prepared, see "Supabase Storage backup").* **Preview builds no longer touch the database** (`scripts/deploy-migrations.mjs` runs DB steps only for a Vercel Production build; local/CI and Preview are skipped — see `docs/db-migrations.md`).

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
- Not covered by this workflow: Supabase Storage objects — see "Supabase Storage backup" below.
- Health monitoring: see "Backup health monitoring" below (watchdog workflow + the one operator action still needed).

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

- **2026-10-02, Launch Agent 2 — off-platform logical backup drill (PASS).** Source: workflow run `db-backup` (GitHub Actions) → `daily/garageos-2026-10-02T024921Z.dump.age` in private R2 bucket `garageos-db-backups` (237,158 bytes; remote size verified against local). Operator downloaded and decrypted it with the offline age private key (proves key ↔ recipient match; decrypted size 236,910 bytes). Restored by Launch Agent 2 into a throwaway local `postgres:18.6` Docker container (isolated — no Neon/Production access): `pg_restore --exit-on-error` exit 0; 68 `garageos` tables, trigger `preserve_demo_communication_origin` and 105 foreign keys present; row counts `Shop` 2, `Client` 2, `Vehicle` 3, `Invoice` 3, `Subscription` 2, `CommunicationMessage` 27 (identical to the 2026-10-01 Neon-branch drill); `public._prisma_migrations` 53 rows, every one of the 50 repository migrations has a successful row (2 documented rolled-back rows + 1 old-name row remain, per `db-migrations.md`). Findings fixed: dump scope now includes `public._prisma_migrations`; the archive's `CREATE SCHEMA public` collides on restore, so `restore-drill.sh` filters it with `--use-list`. Container and decrypted dump deleted afterwards. Not run: literal `prisma migrate status` (verified by direct migration-table comparison instead). Elapsed restore time: under 1 minute for this data size; end-to-end including download/decrypt ≈ 10 min.

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

## Backup health monitoring (Launch Agent 3, 2026-10-02)
Facts (read 2026-10-02): the `db-backup` workflow succeeds on schedule (latest scheduled run green; GitHub started it ~6 h after the 06:17 UTC slot — scheduled runs can be delayed). The six `BACKUP_*` repo secrets exist; **`BACKUP_HEALTHCHECK_URL` is NOT configured** (`gh secret list`), so there is currently **no external dead-man's switch**. The repository is **public**: GitHub disables scheduled workflows after 60 days without repository activity, which would stop the backup silently.
- **Added (this PR, no credentials needed):** `.github/workflows/db-backup-watchdog.yml` — daily 18:47 UTC, lists the private bucket and **fails** (→ GitHub failure email to the repo owner) if the newest `daily/garageos-*.dump.age` is missing, tiny, or older than 30 h. It catches a job that "ran" but uploaded nothing, a revoked R2 token, a broken schedule. It lives in the same repo, so it shares the 60-day-inactivity weakness — keep committing (any commit resets the clock) and close the gap with the external ping below. Active only after this PR is merged to `main` (schedules run from the default branch); trigger it once with `gh workflow run db-backup-watchdog.yml` after merge and confirm green.
- **Operator action still required (needs the operator's account; not done):** create a free healthchecks.io (or equivalent) check — period 1 day, grace ~12 h, email alert to the operator — then `gh secret set BACKUP_HEALTHCHECK_URL` (paste the ping URL; never put it in chat or commits). The existing `Heartbeat` step in `db-backup.yml` pings it after each successful upload. Verify by running `gh workflow run db-backup.yml` and seeing the check turn green; verify the alert path with the provider's "test notification" or by pausing the check.
- Evidence rule: "backup monitored" is only true when **both** the watchdog is green after merge **and** the external check exists.

## Supabase Storage backup (Launch Agent 3, 2026-10-02)
**What is stored today (read-only SQL on `storage.objects`, project `saccjhinmeaoqoeuhljd`, 2026-10-02):** bucket `accounting` (private) — 5 objects, 8.2 MB, created 2026-09-13…09-29 (the 5 demo/test objects recorded in the storage-privacy docs); bucket `public-assets` (public) — 2 objects, 3.5 MB (two shop logos); bucket `communications` — no objects. No DVI photos, payment receipts, accounting documents or Inbox attachments exist yet. **Recoverability today:** the public logos can be re-uploaded by the shop; the `accounting` objects are test data; invoice client-package PDFs are regenerated from the database when the stored copy is missing (`/api/invoices/download/[token]` falls back to `buildInvoicePackageBuffer`).
**Is it launch-blocking? No — not at the current (zero-real-customer) usage.** It becomes necessary as soon as real shops upload objects that cannot be regenerated: DVI/inspection photos, payment-proof/receipt uploads, accounting documents, Inbox attachments, logos/booking photos. Decision: enable the automated storage backup **before the first paying shop starts using those features**; treat "first paying customer onboarded without it" as a launch-readiness regression.
**Prepared (inert, no cloud resources created):** `.github/workflows/storage-backup.yml` (weekly, Sundays 07:41 UTC + manual) → `scripts/backup-storage.ts` (read-only; now paginates past 1,000 entries and writes a `manifest.json` with size + sha256 per object) → tar → `age` (same public recipient as the DB backup) → private R2 bucket under `storage/`. It runs **only if** repo variable `STORAGE_BACKUP_ENABLED=true`.
**Operator steps to activate (credentials/cloud settings — not done):**
1. `gh secret set BACKUP_SUPABASE_URL` (project URL) and `gh secret set BACKUP_SUPABASE_SERVICE_ROLE_KEY` (service-role key: full-admin on the Storage project; GitHub exposes secrets only to workflows on the default branch, never to fork PRs).
2. Add an R2 lifecycle rule for prefix `storage/` (suggest 56 days) — the existing rule only covers `daily/`.
3. `gh variable set STORAGE_BACKUP_ENABLED --body true`, then `gh workflow run storage-backup.yml` and check the run + the object in R2.
4. Restore drill (once real objects exist): download + `age -d` + `tar -x`, compare `manifest.json` sha256 for 3 sampled objects, re-upload into the same bucket names and **same paths**; recreate `accounting`/`communications` **private** and `public-assets` public.

## Neon Free-plan limitations and compensating controls (documented, no plan change)
- **Point-in-time history:** 6 h (`history_retention_seconds: 21600`, read 2026-10-01). Anything older than 6 h cannot be recovered through Neon PITR.
- **Branch protection:** Production branch `protected: false` (read 2026-10-01). Destructive branch operations (delete, reset) are not guarded. Enabling it is reversible and does not affect `prisma migrate deploy` or normal traffic — operator action: Neon console → Branches → `production` → Protect (or the `neonctl` branch-protection subcommand; confirm exact syntax with `neonctl branches --help`). Not changed by this session (provider-console mutation).
- **Compensating controls now in place:** independent daily off-platform logical backup (private R2, age-encrypted, 30-day lifecycle, restore-drilled 2026-10-02: 68 tables / 105 FKs / all 50 migrations / trigger), least-privilege `backup_ro` role (SELECT only), watchdog freshness check, Neon branch-copy restore drill (2026-10-01), no migrations from Preview. Worst-case data loss (RPO): ≤ 24 h from the off-platform dump, ≤ 6 h inside the Neon window.
- Recommended before volume: raise the Free-plan PITR window to the maximum allowed (free, reversible) and revisit a paid Neon tier when the first customers are live.

## Incident, rollback and recovery playbooks (Launch Agent 3, 2026-10-02)
General rules: (1) one responsible operator (Mitchell) per incident; (2) stabilize first, diagnose second; (3) never edit `Subscription` rows by hand to grant access except a documented grandfather case; (4) if personal information may have been exposed, **also follow `docs/compliance/incident-response.md`** (Privacy Officer, incident register, serious-harm assessment); (5) after every action run the verification list for that scenario and note the result.

**1. Bad Vercel deploy (UI/runtime regression, 5xx)**
- Act: Vercel → Deployments → previous good Production deployment → *Promote to Production* (or `vercel rollback <deployment-url>`). Schema is forward-compatible (additive migrations), so old code runs on the new schema.
- Verify: `curl -s -o /dev/null -w "%{http_code}\n" https://www.garage-os.ca/` and `/pricing`, `/admin/login` → 200; log in as the owner; open Billing; Vercel runtime logs show no new 5xx; `curl -i https://www.garage-os.ca/api/webhooks/cron` still → 401 without the secret.
- Then fix forward on a branch; do not re-promote the bad deployment.

**2. Bad migration**
- A failing migration fails the Production build; the previous deployment keeps serving (nothing to roll back). Read the build log; `npx prisma migrate status` against the Production URL (operator machine, explicit confirmation) shows the failed row.
- P3009 / failed row: follow `docs/db-migrations.md` (`prisma migrate resolve`, manual and deliberate, never from the build script).
- A migration that **applied but is wrong**: do not reverse SQL; fix forward with a new migration. If data was damaged: Neon branch restore within 6 h (scenario 8) or the latest R2 dump (scenario 9) into a *new* database, then repoint.
- Before any deploy containing a migration: confirm today's `db-backup` run is green or run it (`gh workflow run db-backup.yml`).
- Verify: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` prints an empty migration.

**3. Stripe webhook failure (deliveries 4xx/5xx or silent)**
- Triage: Stripe Dashboard → Developers → Webhooks → the LIVE endpoint → Event deliveries. `400` = signature (wrong `STRIPE_WEBHOOK_SECRET` — roll the secret, update Vercel, redeploy); `500` = handler error (Vercel logs `[stripe webhook] error procesando …`; `STRIPE_EVENT_IN_PROGRESS` is the 5-minute lease and clears on retry); `404`/timeouts = deploy/URL problem (scenario 1).
- Recover: after fixing, **resend** failed events from the Dashboard (handler is idempotent per `event.id`; Stripe also retries for ~3 days). Customers can finish Checkout meanwhile: the return path (`confirmCheckoutAction`) syncs without the webhook.
- Tripwire: a log line `CRITICAL: suscripción cancelada por falta de pago` means the Stripe "Manage failed payments" setting is wrong (must be unpaid / leave past due, never cancel) — fix the setting immediately.
- Verify: new delivery is 2xx; the shop's `Subscription` row matches the Stripe subscription (status, plan, `currentPeriodEnd`); no duplicate subscription.

**4. Provider outage (Twilio, Resend, Pusher, Stripe, Supabase Storage, QuickBooks)**
- Per-provider behavior is in "Provider outages" above (SMS falls back to email, retries are idempotent, billing state is local). Confirm on the provider status page.
- Emergency stop for wrong/duplicate outbound messages: set `PROVIDER_SIDE_EFFECTS=disabled` in Vercel Production and redeploy (fail-closed; it silences **all** outbound effects including Stripe mutations); crons then report `providerSideEffects: "disabled"`. Re-enable deliberately and re-verify with one controlled message. Do not use it for a mere provider outage.
- Verify after recovery: one controlled test to an operator-owned number/mailbox; the next daily cron reconciles statuses and overage reports.

**5. Database outage (Neon unreachable / connection errors)**
- Triage: Neon status page + console (project `autumn-art-59701921`); symptoms are 5xx on authenticated routes while public marketing pages still render. Check `DATABASE_URL_POOLED` is set (the app prefers it).
- Act: wait for Neon if it is a platform incident (no data action). If the Production branch/project is lost or corrupted: scenario 8 (≤ 6 h) or 9 (R2 dump). **Never restore over Production in place.**
- Verify: login, `/admin`, cron returns 200 with the secret.

**6. Accidental Production configuration error (wrong/missing env var)**
- Act: Vercel → Project → Settings → Environment Variables → restore the previous value from the operator's secret store (Vercel keeps no old values) → **redeploy** (env changes reach only new deployments; rolling back a deployment alone does not restore an env var).
- Highest-risk variables: `PROVIDER_SIDE_EFFECTS` (must be `enabled` in Production, absent/`disabled` in Preview), `DATABASE_URL*` (Production Neon branch, never `preview`), `NEXTAUTH_SECRET` (changing it invalidates all sessions), `STRIPE_*` (all nine change together at the LIVE cutover; a mixed TEST/LIVE set fails closed at Checkout), `CRON_SECRET` (missing → cron routes 401), `INTEGRATIONS_ENCRYPTION_KEY` (not set in Production; do not set casually).
- Verify: the failing route; health pages; Vercel logs; for Stripe variables run `node scripts/stripe-live-provision.mjs verify` (read-only) once LIVE exists.

**7. Restricted billing-state recovery (a paying shop is RESTRICTED / PAST_DUE)**
- Understand the state first: `PAST_DUE` keeps the plan 48 h from the first observed `past_due` (`Subscription.pastDueSince`), then RESTRICTED (read-only); `UNPAID` / `CANCELED` / trial-expired / no row are RESTRICTED with no plan (never free Core).
- Normal recovery: the owner updates the card in Billing → Manage (Stripe Portal) and pays the open invoice → Stripe emits `customer.subscription.updated` → webhook → ACTIVE. The operator can also retry the invoice from the Stripe Dashboard.
- Verify: Billing card shows ACTIVE, `pastDueSince` null, write actions work. If the webhook is stuck, scenario 3. Do not edit the row by hand.

**8. Neon restore (≤ 6 h window) — branch-based, isolated**
- Create a restore branch at a point in time: `neonctl branches create --project-id autumn-art-59701921 --name restore-<yyyymmdd> --parent "production@<ISO-8601 UTC time before the incident>"` (confirm flags with `neonctl branches create --help`).
- Validate on the branch: `DATABASE_URL=<branch url> npx prisma migrate status` (up to date) and row counts for `Shop` / `Client` / `Invoice` / `Subscription`.
- Repoint: set `DATABASE_URL` and `DATABASE_URL_POOLED` (Production) to the branch endpoints in Vercel, redeploy, run the post-restore checks (login, an invoice download, a Portal PDF). Keep the old branch until the incident is closed; delete scratch branches afterwards.

**9. Restore from the off-platform dump (survives Neon account loss) and repoint**
- Download `daily/garageos-<ts>.dump.age` from R2 → `age -d -i <offline private key>` (key lives in the owner's password manager + offline copy only) → create an empty Postgres 18 (new Neon project/branch or any PG18) → `scripts/restore-drill.sh` (refuses non-empty targets and the shell's own DB URLs; filters the archived `CREATE SCHEMA public`) → `prisma migrate status` → set `DATABASE_URL` / `DATABASE_URL_POOLED` in Vercel Production, redeploy → post-restore checks. Delete the decrypted dump from local disk afterwards. Proven end to end on 2026-10-02 (PASS).
- Storage objects (if the Supabase project is also lost): restore from the `storage/` archive once the storage backup is active; until then objects are not recoverable.
- Responsible operator: Mitchell. After any restore record date, backup name + sha256, counts and time taken here and, if personal data was involved, in the incident register.

## Security token follow-ups (Launch Agent 3, 2026-10-02)
**Vercel protection-bypass token embedded in a Stripe TEST webhook URL.** What and where (value deliberately not recorded): Stripe **TEST** webhook endpoint `we_1ULaRPQwef5QpewGGj9uFM2w` ("GarageOS Preview Stripe TEST webhook", account `acct_1UGgimQwef5QpewG`) carries `?x-vercel-protection-bypass=<token>` in its URL, pointing at an old Preview branch alias. The token is the project's *Protection Bypass for Automation* secret (Vercel → Project → Settings → Deployment Protection). It is **not** in the repository (`git grep` clean). Exposure: anyone who can read that Stripe TEST endpoint can bypass Vercel SSO on Preview URLs of this project; Preview has isolated TEST data and no provider credentials, so impact is bounded, but treat the token as leaked.
**Not rotated in this session, deliberately:** rotation is a two-system change (Vercel secret + Stripe TEST endpoint URL). The task allowed Stripe TEST read-only, and regenerating the Vercel secret first would silently break the TEST webhook (and any other automation using the secret). Operator procedure (~5 min, in this order so nothing breaks unnoticed):
1. Decide whether the endpoint is still needed. It targets a stale branch alias, and a second TEST endpoint already points at `www.garage-os.ca`; if not needed, **delete the Stripe TEST endpoint** and go to step 3.
2. If still needed: Vercel → Protection Bypass for Automation → *add a new secret*; Stripe TEST → edit the endpoint URL to use the new secret on the **current** Preview alias.
3. Vercel → remove/regenerate the old bypass secret.
4. Verify: Stripe TEST → the endpoint → *Send test webhook* → HTTP 2xx (or 400 invalid-signature, which proves the request reached the app); a request to the Preview URL without the secret gets the Vercel SSO page / 401; Preview `STRIPE_TEST_MUTATIONS` stays `disabled`; `git grep` and CI logs for the old token (none expected); check any other automation (QA scripts, tools) that used the old secret.
**Invoice/public token expiry.** `Invoice.downloadToken` (192-bit random) has no expiry or rate limit — POST-LAUNCH (PIA §7 item 9); quote approval tokens already expire. No change made (schema + customer-link behavior change; low exploitability).
