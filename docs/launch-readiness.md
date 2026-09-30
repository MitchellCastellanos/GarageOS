# GarageOS — Launch Readiness (source of truth on launch day)

**Verdict: CODE GO — PROVIDER VALIDATION REQUIRED.**
The repository contains no known P0/P1 defect. GarageOS must **not** take its first paying customer until the
items marked *REQUIRED BEFORE FIRST CUSTOMER* below are done (all are configuration/validation outside the repo).

- Audit date: 2026-09-30 · Branch `claude/launch-hardening-final` (base `origin/main` = `2bfef2e`, unchanged during the audit).
- Master plan: `docs/product-completion-plan.md` (Blocks 15/16). Runbook: `docs/operations-runbook.md`.

## Automated quality gates (final run)

| Gate | Result |
| --- | --- |
| `npm test` (unit/mocked) | **378 / 378 pass** |
| `npm run test:integration` (real PostgreSQL 16, real server actions) | **36 / 36 pass** (129 cross-tenant attacks, roles × plans × restricted, concurrency, import stress, portal, Multi-Shop, core workflow) |
| `prisma validate` | valid |
| Fresh PostgreSQL, all migrations from zero | applied cleanly (46 migrations) |
| Schema diff (`migrate diff` DB → schema.prisma) | **empty** (the old `Shop.billingEmail` drift is closed) |
| `tsc --noEmit` | **0 errors** (was 9) |
| `next build` (production, type-checking now ON — `ignoreBuildErrors` removed) | passes |
| `eslint` | **0 errors**, 51 warnings (46 unused-variable, 4 react-hooks/incompatible-library for react-hook-form `watch`, 1 alt-text on a react-pdf `<Image>`) — all harmless |

Real-DB suites: `GARAGEOS_INTEGRATION_DB=1 DATABASE_URL=<disposable migrated db> npm run test:integration`.

## Provider validation status (never collapse these)

| Provider | Code-tested (mocks) | Sandbox / test-provider verified | Production verified |
| --- | --- | --- | --- |
| Stripe | Yes — lifecycle, webhooks (idempotency, stale events, duplicate subscription), price guard | **Partially:** the exact Checkout parameter set (14-day trial, card required, `trial_settings`, CAD, automatic tax, address/tax-id collection) was accepted by the Stripe **test-mode** sandbox and produced a $0-today session. **Not** exercised: completing checkout with a card, webhook delivery to the deployed URL, trial→active, failed payment → PAST_DUE → RESTRICTED → recovery (needs a browser + test clock). | No |
| Twilio | Yes (signature validation, callbacks, allowances, overage, reconciliation) | **No** (no credentials in the audit environment) | No |
| Resend | Yes (send, webhook signature, suppressions, fallback) | **No** | No |
| QuickBooks Online | Yes (fake Intuit: OAuth state, token rotation, idempotency, mappings) | **No** | No |

## REQUIRED BEFORE FIRST CUSTOMER

1. **Stripe Prices are wrong in the test sandbox.** The existing sandbox Prices are the *old* $149/$249/$399 (and $1,490/$2,490/$3,990) set. Create the six CAD Prices at **$199 / $1,990, $299 / $2,990, $449 / $4,490** (no trial on the Price; set tax behavior **exclusive** or configure the default in Stripe Tax settings) in both test and live modes and set `STRIPE_PRICE_{CORE,PRO,COMPLETE}_{MONTHLY,YEARLY}`. The app now **refuses to open Checkout** if a Price's amount/currency/interval disagrees with the quoted plan price (fail-closed).
2. **Stripe test-mode end-to-end pass** (procedure in `docs/product-completion-plan.md` → Block 1 manual config §8): card `4242…` trial → advance a **test clock** past 14 days → ACTIVE; card `4000 0000 0000 0341` → PAST_DUE → RESTRICTED → fix card → ACTIVE. Confirm the webhook endpoint (`/api/stripe/webhook`; events `checkout.session.completed`, `customer.subscription.created|updated|deleted`) shows 2xx deliveries, and set `STRIPE_WEBHOOK_SECRET` / `STRIPE_SECRET_KEY` (live) in Vercel. Register GST/QST in Stripe Tax.
3. **`CRON_SECRET`** (≥16 chars) in Vercel. Cron routes now fail closed without it.
4. **Database backups**: the application DB is on **Neon** (per Vercel build-log datasource line; plan/backup window not yet recorded — check the Neon console); the connected Supabase project is Free-plan and Storage-only; Supabase Free has no managed backups and no plan backs up Storage files. Identify the host, enable daily backups, run the weekly `scripts/backup-db.sh` / `scripts/backup-storage.ts`, and restore-test once (runbook: `docs/operations-runbook.md`). Don't onboard a paying shop on an unbacked database.
4b. **Preview must not use the production database/keys.** Proven: Preview builds ran migrations and the super-admin bootstrap against production (build guard added; runtime still shared). Variable-by-variable plan: `docs/compliance/subprocessors.md` → Environment separation. Give Preview its own DB and test-mode/sandbox provider values before real data exists.
5. **Support mailbox**: set `NEXT_PUBLIC_CONTACT_EMAIL` (default `hello@garageos.app` — confirm it exists and is monitored). Confirm the domains referenced in the product (`garage-os.ca` app domain, `garageos.com` footer link) are yours.
6. **Legal/compliance operations:** bilingual Terms/Privacy, Privacy Officer, governance, incident response/register, initial PIA/EFVP, CASL matrix and engineering rules are now in `docs/compliance/`. Before first paying customer, close the BLOCKER list in `docs/compliance/privacy-impact-assessment.md` §7 (DB host/region and residency decision, storage migration `--finalize`, Preview separation, backups), then the "before paid launch" items (DPAs, legal review, legal identity/address). External legal review remains recommended.
7. Required env for a working app: `DATABASE_URL`/`DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), `RESEND_API_KEY`, `EMAIL_MANAGED_DOMAIN` (SPF/DKIM verified), `PLATFORM_ADMIN_*`.

## REQUIRED BEFORE USING THAT FEATURE

- **SMS / two-way inbox**: Twilio env (`TWILIO_ACCOUNT_SID` root, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_BASE_URL` if origin differs), A2P 10DLC / toll-free verification, shared-number webhook by hand; send a real SMS and confirm DELIVERED, reply → Inbox, STOP/START.
- **SMS overage billing**: Stripe Billing Meter + metered Price → `STRIPE_SMS_OVERAGE_METER_EVENT_NAME`, `STRIPE_SMS_OVERAGE_PRICE_ID`; force an overage in test mode and confirm the meter event/invoice line.
- **Stripe failed-payment + Portal settings (annual plans)**: Billing → Manage failed payments must be *mark as unpaid* / *leave past due*, **never** *cancel* (an unpaid SMS-overage invoice would otherwise cancel a prepaid annual plan); Customer Portal must have *cancel* and *plan switching* OFF (cancellation is in GarageOS). With a test card that fails (`4000 0000 0000 0341`) and a Test Clock, confirm PAST_DUE → RESTRICTED (unpaid, subscription NOT canceled) → pay the open invoice → ACTIVE.
- **Email delivery status**: Resend webhook `<origin>/api/webhooks/resend` (`email.delivered|bounced|complained|failed`) + `RESEND_WEBHOOK_SECRET`; bounce a real address and confirm suppression + SMS fallback.
- **Tire Storage reminders / customer notices**: need the SMS/Resend items above; the reminders run inside the existing daily cron.
- **QuickBooks Online**: Intuit app + `QBO_CLIENT_ID/SECRET/ENVIRONMENT`, `INTEGRATIONS_ENCRYPTION_KEY` (back it up!), redirect URI; run a sandbox Canadian company end to end (invoice + payment + refund). **Quebec tax mapping**: the connection maps ONE tax code (plus a zero-rated code). This is correct only if the QBO company has a *combined* GST/QST code (the usual Quebec setup); per-tax (GST vs QST) mapping is not built. Whether that reproduces GarageOS totals cannot be known without a sandbox run — the sync raises a per-invoice warning when QBO's total differs. Treat as validation-required, not as a known bug.
- **Customer Portal by email**: confirm deliverability of the portal-link email (channel `WEB_CONTACT`).

## OPTIONAL / POST-LAUNCH

Uptime/error monitoring (Vercel logs + an external pinger), log drain, private storage bucket with signed URLs, security headers/CSP, sitemap/robots, French Guides/Blog, additional-location billing.

## Known accepted limitations (none is a P0/P1)

- **Additional-location billing is OFF** (`ADDITIONAL_LOCATION_BILLING_ENABLED=false`): extra Multi-Shop locations are free until the $199 CAD/location price is confirmed and the Stripe Price is wired. Do not advertise a per-location price.
- SMS allowances are provisional (Core 300 / Pro 1,000 / Complete 2,500 segments/month, UTC calendar month; two sends racing at the exact boundary can under-count overage by a segment or two, never over-bill).
- Uploads live in a **public** Supabase bucket under unguessable-but-unauthenticated URLs (`{shopId}/…`); only images/documents are accepted (MIME allow-list). SVG logos are still accepted.
- Settings/team/tax lines stay editable by a *restricted* owner (deliberate, non-operational).
- Public Guides/Blog remain English-only; navigation, pricing, legal, help, contact, about and changelog are bilingual.
- Import has no undo; assisted migration is a manual service; no partial payments; refunds show on invoice PDFs as "Refunded / Net paid" but there is no credit-note document.
- Email verification tokens are stored in plain form (256-bit random, single purpose).

## Rollback / recovery pointers

See `docs/operations-runbook.md`. Migrations run automatically in `npm run build` (`scripts/deploy-migrations.mjs`); every migration in this audit is additive except dropping the unused legacy `Shop.billingEmail` column. To roll back code, promote the previous Vercel deployment (schema is forward-compatible); to recover data, restore from the DB backup.
