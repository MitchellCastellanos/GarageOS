# GarageOS V1 — Product Completion Plan

> **SOURCE OF TRUTH.** This document is the execution contract for closing GarageOS V1 before the first commercial door-to-door sales push.
>
> `docs/feature-gap.md`, `docs/roadmap.md`, `docs/subscription-plans.md` and `docs/public-product-surface-gap.md` remain useful historical/detail references, but when scope, priority, packaging or completion status conflicts, **this document wins**.
>
> Rule: once every launch block below is DONE and the final audit passes, stop adding V1 features and sell the product. New ideas go to post-launch backlog unless they block safe operation or a real sale.

## Commercial model

| Plan | Monthly | Annual | Positioning |
| --- | ---: | ---: | --- |
| Core | $199 CAD | $1,990 CAD | Run your shop |
| Pro | $299 CAD | $2,990 CAD | Run, automate and grow your shop — primary / Most Popular |
| Complete | $449 CAD | $4,490 CAD | Multi-location and high-volume / complex operations |

Annual pricing = 10 months for 12 months. Prices are CAD plus applicable taxes.

There is **no Founding Shops / Founding Partner pricing or permanent promotional tier**. Do not reintroduce it in product, docs or marketing.

Complete's reason to exist is organizational complexity: multi-location, centralized administration, consolidated/location-level reporting, larger allowances, migration/onboarding service and advanced controls. Do not manufacture arbitrary locks merely to differentiate Complete.

Additional Complete/Multi-Shop locations are currently intended at **$199 CAD/month/location**; automated Stripe quantity billing remains pending and this price must be reconfirmed before that block ships.

## Trial and conversion contract

Target flow:

**Create account → verify email → onboarding → choose Core/Pro/Complete + monthly/annual → enter payment method → Stripe 14-day trial → Today $0 → show exact first charge date and amount → finish onboarding → use GarageOS → automatic paid subscription.**

Requirements:
- Trial is 14 days and should be prominent across acquisition/signup.
- Customer chooses the plan they are actually trialing; no permanent assumption that every new shop trials Pro.
- Payment method is collected before the trial is activated/completed.
- Confirmation must show **Today: $0** and **Due {date}: {amount} CAD + tax**.
- Trial banners/countdown must use the selected plan and upcoming billing date/amount.
- PAST_DUE may retain access during Stripe retry grace.
- Expired unpaid, UNPAID and CANCELED accounts become **RESTRICTED**, not free Core.
- Restricted accounts can authenticate, view existing data, reach Billing, fix payment and reasonably export data, but cannot continue normal operational writes.
- A missing Subscription row is an error/recovery state, not a free Core plan.

## Packaging contract

| Capability | Core | Pro | Complete |
| --- | --- | --- | --- |
| Customers, vehicles, appointments, booking | Included | Included | Included |
| Estimates, approvals, Work Orders | Included | Included | Included |
| Invoices, payments, receipts, vehicle history | Included | Included | Included |
| Job status + Ready for Pickup | Included | Included | Included |
| DVI | Basic | Advanced | Advanced |
| DVI photos/media + reusable templates | — | Included | Included |
| Maintenance reminders | Basic | Advanced | Advanced |
| Branded email | Included | Included | Included |
| SMS allowance | 300 provisional | 1,000 provisional | 2,500 provisional |
| Two-way SMS with GarageOS-provisioned dedicated number | Included | Included | Included |
| Campaigns / CRM messaging | — | Included | Included |
| Inventory | — | Included | Included |
| Automatic inventory consumption | — | Included | Included |
| Tire Storage | — | Included | Included |
| Booking/shop page | Classic/basic branding | Advanced | Advanced |
| Custom domain + sender identity | — | Included | Included |
| Reports | Basic | Advanced | Advanced + multi-location |
| Accounting Light | — | Included | Advanced controls |
| QuickBooks Online | — | Included | Included |
| Permissions | Basic | Advanced | Advanced |
| Data import | Basic self-service | Full | Full |
| Assisted migration | Paid/assisted separately | Onboarding offer/service as defined | Standard included |
| Users | 3 | Unlimited | Unlimited |
| Locations | 1 | 1 | Multi-Shop capable |
| Centralized administration / consolidated reporting | — | — | Included with Multi-Shop |
| Assisted onboarding / support | Self-service | Assisted + priority | White-glove + priority |
| Customer Portal when built | Included | Included | Included |

Core operational records are never transaction-metered. SMS and future direct-cost services may use allowances/overages.

## Execution rules

Each implementation block must follow:

**Audit → design against this contract → implement server enforcement first → UI → tests → run checks → update this document → commit.**

An agent/session may own one block without needing previous chat history. It must read this file and relevant repo code first. It must not expand scope silently.

Status legend:
- **DONE** — usable end-to-end and no remaining V1 work in this block.
- **PARTIAL** — meaningful implementation exists but acceptance criteria are not complete.
- **TODO** — not implemented to the V1 contract.
- **VALIDATE** — feature exists; launch-grade verification remains.

## Completion blocks

### 0 — Commercial/docs/trial acquisition quick wins — DONE (2026-09-29)
Owner: ChatGPT direct repo pass.

Completed:
- Public/reference pricing changed to Core $199/$1,990, Pro $299/$2,990, Complete $449/$4,490.
- Pro remains Most Popular.
- Complete marketing positioning changed toward multi-location/high-volume operations.
- Founding Shops marketing block removed and Founding offer removed from subscription plan docs.
- Public pricing CTAs now lead with a 14-day free trial.
- Acquisition/signup copy now emphasizes 14-day free trial and $0 today.
- Internal trial-expiry/banner copy no longer hardcodes a Pro trial assumption.
- Stale legacy Starter/Pro/Business price values in the marketing locale source were neutralized so they cannot accidentally revive the old $39/$79/$129 packaging.
- This master plan created as the execution source of truth.

Still intentionally **not** counted here: actual selected-plan + card-on-file trial lifecycle. That is Block 1.

### 1 — Subscription lifecycle + onboarding checkout — DONE (2026-09-29, code-complete; needs the manual Stripe configuration below) — P0

Implemented end-to-end. The onboarding wizard now has a **Plan & payment** step (step 6; Share/finish is step 7).

**State model** (`src/domain/subscription-state.ts`, pure and unit-tested; `src/lib/subscription.ts` resolver):
- DB `SubscriptionStatus` gained `AWAITING_PLAN`; `Subscription.plan` is nullable (null until chosen); `status` has no DB default.
- Derived access state: `SETUP_REQUIRED | TRIALING | ACTIVE | PAST_DUE | RESTRICTED`. `EffectiveSubscription.plan` = plan granting entitlements *now* (null when no access); `subscribedPlan` = chosen/paid plan; `canWrite`, `nextCharge`, `trialEligible`, `hasStripeSubscription`, `subscriptionMissing`.
- **No free tier**: expired trial, CANCELED, UNPAID, INCOMPLETE and a missing Subscription row → RESTRICTED (plan null), never Core. PAST_DUE keeps the plan during Stripe retries. A Stripe-backed trial gets a 48 h webhook-lag grace after `trialEndsAt` before restricting; a legacy no-card trial restricts at expiry.
- `can()` = entitled *now*; `canView()` = may *show* existing data (uses the subscribed plan; used for Inventory/Campaigns pages and nav locks). Never authorize a write with `canView`.

**Signup**: email, Google and `/platform` createShop all create Shop (+ OWNER) + Subscription(`AWAITING_PLAN`) in **one transaction** (`createPendingSubscription`); `createDefaultSubscription`/"default Pro trial" is gone. Email signup keeps verification; Google keeps trusting Google's verified email. A failed transaction creates nothing (Google sign-in is refused).

**Checkout / Stripe** (`src/actions/billing.ts`, `src/lib/stripe.ts`, `src/lib/stripe-sync.ts`):
- Stripe Checkout (subscription mode) with `payment_method_collection: "always"`, `trial_period_days: 14` for the *selected* plan, `trial_settings.end_behavior.missing_payment_method: "cancel"`, automatic tax, CAD. Price is server-mapped from `STRIPE_PRICE_<PLAN>_<INTERVAL>`; the client only sends plan+interval (validated). Card data never touches GarageOS.
- Trial eligibility is server-decided (`decideTrialPlan`): fresh 14 days only for a shop that never had a Stripe subscription; legacy no-card trial keeps its own end date; returning/canceled shops are billed immediately (no infinite trials).
- Duplicate prevention: a shop with a live Stripe subscription cannot open another Checkout (uses the portal); Stripe Customer is created once per shop (idempotency key) and stored before Checkout; Checkout creation uses a per-shop/plan/interval idempotency key; a second live subscription arriving via webhook is cancelled in Stripe; stale events from an old subscription are ignored; an event whose Customer differs from the shop's stored Customer is refused.
- Return from Checkout: `confirmCheckoutAction` retrieves the session, requires `client_reference_id` == the caller's subscription-owner shop, and syncs immediately (no waiting for the webhook).
- Webhook (`/api/stripe/webhook`): signature verified; idempotent per `event.id` (new table `StripeWebhookEvent`, marker removed if the handler fails so Stripe retries); subscription events re-read the live subscription from Stripe so out-of-order deliveries cannot regress state. `trialing→active` (conversion), `past_due`, `unpaid`, `canceled` all map through `mapStripeStatus`.
- `updateStripeSubscriptionPrice` now targets the PLAN item (not `items.data[0]`, which could be the SMS-overage item).

**Onboarding**: `StepPlan` (plan cards, monthly/yearly, "Today: $0", "Due {date}: {amount} CAD + tax", auto-billing notice, secure-payment note) → Stripe → back to step 6 with confirmation summary. `completeOnboarding` refuses (server-side) unless the shop has a card-backed trial/active subscription (`PLAN_REQUIRED` sends the owner back to step 6). Additional locations (short flow) inherit the organization's subscription and skip the step. Dates/amounts come from `quoteTrialStart` / `PLAN_PRICING_CAD` (server-trusted config; the UI value is informational only).

**Trial UI**: layout banner (`SubscriptionBanner`) shows selected plan, days left, first charge date + amount (or "add a payment method" for legacy no-card trials), escalating tone (info >7 d, blue ≤7 d, amber ≤2 d), red for past-due/restricted. Topbar plan badge, Billing card (plan, status, interval, trial end, next payment, payment problem, cancellation, portal, reactivate) and onboarding finish step are all dynamic; nothing hardcodes "Pro trial" or dates.

**Restricted mode (server-side)**: `requireWriteAccess` / `assertShopWritable` / `getWritableShopId()` (`src/lib/subscription.ts`, `src/lib/shop-context.ts`); a blocked owner is redirected to Billing (`&restricted=1`). Applied to every mutating action in appointments, clients, vehicles, work orders, quotes, invoices (incl. payments/send), inspections (+photos), inventory, reminders, cash drawer, inbox reply/compose/archive, document upload; entitlement-gated writes (`checkEntitlement`) also fail for restricted shops; cron jobs skip restricted shops (service/appointment reminders, campaigns) via `createOperatingChecker`. Reads, auth, Billing, portal and exports remain available. **Rule for future blocks: new operational server actions must call `getWritableShopId()` (not `getShopId()`).**

Deliberately not gated (owner-level configuration, not shop operation): `settings.ts`, `booking-settings.ts`, `booking-page.ts`, `users.ts`, `locations.ts` (entitlement-gated already), `domains.ts` (entitlement-gated), support messages, staff notification preferences. Public customer-facing endpoints (online booking `/api/book/*`, quote approval, invoice/quote public links) still work for restricted shops — revisit in Block 15 if a restricted shop should stop accepting new online bookings.

**Migration**: `prisma/migrations/20260929120000_subscription_lifecycle` (adds `AWAITING_PLAN`, makes `plan` nullable, drops `status` default, creates `StripeWebhookEvent`). Existing rows are untouched (grandfathered Complete/ACTIVE shops stay ACTIVE without Stripe; legacy Pro TRIALING no-card rows keep running until `trialEndsAt`, then RESTRICTED).

**Tests**: `tests/subscription-state.test.ts` (pure state model: every status, trial dates/amounts for all 6 plan/interval combos, trial eligibility, Stripe sync decisions) and `tests/subscription-lifecycle.test.ts` (email + Google signup atomicity, onboarding-state resolver, missing row, multi-location resolution, restricted write enforcement, per-plan trial entitlements, Checkout parameters, customer reuse, sync of every plan/interval, conversion/past_due/unpaid/canceled, duplicate subscription cancel, stale events, cross-customer refusal, webhook idempotency + retry, billing recovery, checkout confirmation ownership, cron guard). Stripe/DB are mocked in the existing repo style — **no live Stripe test has been run**.

#### MANUAL CONFIGURATION (Mitchell — cannot be done from the repo)
1. **Stripe Prices (CAD)**: create six recurring Prices matching `PLAN_PRICING_CAD` (Core 199/1,990, Pro 299/2,990, Complete 449/4,490; monthly / yearly) — **no trial configured on the Price itself** (the trial comes from Checkout) — and set env `STRIPE_PRICE_CORE_MONTHLY`, `…_CORE_YEARLY`, `…_PRO_MONTHLY`, `…_PRO_YEARLY`, `…_COMPLETE_MONTHLY`, `…_COMPLETE_YEARLY`. The amounts shown in the UI come from `PLAN_PRICING_CAD`, not from Stripe — they must match.
2. **Webhook endpoint** `<NEXT_PUBLIC_APP_URL>/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`; also `STRIPE_SECRET_KEY`.
3. **Stripe Tax**: enable Stripe Tax and register Canada/Quebec (GST/QST) — Checkout uses `automatic_tax` and requires a billing address.
4. **Smart Retries / failed payment settings** (Billing → Subscriptions and emails): set retry schedule and choose *what happens when retries are exhausted* = **cancel the subscription** or **mark unpaid** — both end in RESTRICTED. Enable customer emails for failed payments/upcoming renewals as desired.
5. **Customer portal** (Settings → Billing → Customer portal): enable payment-method update, invoice history, cancel subscription; optionally plan switching among the six Prices.
6. **Existing SMS overage** (`STRIPE_SMS_OVERAGE_PRICE_ID`) unchanged; if set, it is added as a 2nd line item at Checkout.
7. Run the migration (`npm run build` applies it via `scripts/deploy-migrations.mjs`).
8. Do one live test-mode pass (Block 15/16): signup → plan → test card `4242…` → trial → advance the test clock past trial end → confirm ACTIVE; repeat with card `4000 0000 0000 0341` (charge fails) → PAST_DUE → RESTRICTED → fix card → ACTIVE.

Known limits / follow-ups (not blockers): additional-location Stripe quantity billing remains Block 12; Stripe `trial_end` must be ≥48 h ahead so a legacy trial with <48 h left is bumped to 48 h at Checkout; a Stripe-backed trial whose conversion webhook never arrives restricts 48 h after trial end (self-heals on the next event/portal action).

### 2 — Data Import / Migration — DONE (2026-09-30)

Self-service import at **/admin/import** (Settings-independent page, nav: Customers group → "Import data"; owner-only).

- **Entities**: customers, vehicles (each row carries its owner: email / phone / name; missing owners are created automatically, so one "customers + vehicles" export works), inventory (Pro+).
- **Files**: CSV (UTF-8 or Windows-1252, `,` `;` tab, quotes/BOM) and XLSX (`read-excel-file`, first sheet), ≤ 4 MB. Wizard: file → auto column mapping (EN/FR header synonyms, editable) → validate (nothing written) → row-level errors + duplicates + summary → confirm → result summary, "download rows with errors (CSV)", recent-import log.
- **Duplicates**: customers match by email → phone (last 10 digits) → name (only when the row has neither email nor phone); vehicles by owner + normalised plate or VIN; parts by SKU (case-insensitive), else name. Repeats inside the same file are skipped too. Strategy `skip` (default) or `update` (fills non-empty values only, never blanks data; inventory update never changes quantity).
- **Safety**: `src/actions/import.ts` = `requireOwner` + `getWritableShopId()` (restricted shops refused) + entitlement/limit check server-side; the file is re-parsed and **re-planned inside the transaction** at commit (the client preview is never trusted); all-or-nothing per file, invalid rows skipped and reported; every lookup/write scoped by `shopId` (vehicles via `client.shopId`); initial stock goes through the `InventoryMovement` RECEIVE ledger; `ImportRun` table logs each import (summary only).
- **Packaging** (`import.full`, PRO in `src/config/entitlements.ts`): Core = customers + vehicles, CSV/XLSX, ≤ 500 rows/file, duplicates `skip` only. Pro/Complete = also inventory, ≤ 10,000 rows/file, `update` strategy. Assisted migration for Complete stays an operational service (no tooling built).
- **Code**: `src/domain/import.ts` (pure parse/map/validate/plan), `src/lib/import-file.ts`, `src/lib/import-service.ts`, `src/actions/import.ts`, `src/components/import/ImportWizard.tsx`, `src/lib/admin-locale/import.ts` (EN/FR).
- **Migration**: `20260930100000_import_runs` (additive `ImportRun`).
- **Tests**: `tests/import.test.ts` (CSV/XLSX parsing, mapping, validation, dedupe incl. in-file, update semantics, Core vs Pro limits, tenant scoping, ledger receipts, transaction behaviour with mocked DB).
- Not built (by design): generic ETL, saved mappings, background/async jobs (10k rows fit one request), undo of an import.

### 3 — Inventory → Work Order consumption — PARTIAL — P0
Best owner: Claude.

Inventory and movement ledger already exist. Finish parts consumption from actual job/work/invoice flow with transactional movements and safe corrections.

Acceptance: using/adjusting a stocked part on a job produces correct inventory/ledger state without double consumption.

### 4 — Tire Storage — TODO — P0
Best owner: Claude.

Pro+. Tire sets per vehicle, season, dimensions, condition, physical storage location, notes and check-in/out. QR/labels only if low-cost after core flow is solid.

### 5 — Reports & Analytics — PARTIAL — P0
Best owner: Claude.

Core keeps useful basic dashboard/reporting. Pro gets a real Reports area with date filters, exports and useful shop KPIs such as revenue, jobs, ARO, approvals, labour/parts, customer activity/retention and inventory where data supports it. Complete adds location comparison/consolidation.

Do not build BI software.

### 6 — DVI Basic vs Advanced — PARTIAL — P1
Best owner: Claude.

Existing DVI is functional. Define/enforce:
- Core: standard checklist, condition and notes, unlimited records.
- Pro+: photos/media, reusable/custom templates and richer customer-facing inspection presentation where appropriate.

Add centralized entitlement keys and server gates.

### 7 — Maintenance reminders Basic vs Advanced — PARTIAL — P1
Best owner: Claude.

Existing reminders remain Core-capable. Pro+ adds meaningful automation/rules/recurring or service-driven workflows and campaign integration. Avoid building a giant CRM.

### 8 — Roles & permissions — PARTIAL — P1
Best owner: Claude.

Finish meaningful OWNER/MECHANIC/VIEWER separation. Core receives sane basic roles; Pro+ receives finer permissions around financials, reports, customers, invoices, DVI and configuration.

### 9 — Quebec/Canada fiscal normalization + Accounting Light — PARTIAL/TODO — P0/P1
Best owner: Claude in a dedicated block.

Normalize taxes/document snapshots and validate applicable Quebec/Canada behavior. Add operational accounting-light needs: payments, refunds/adjustments, sales summaries and exports.

No general ledger/full accounting product.

### 10 — QuickBooks Online — TODO — P1
Best owner: isolated Claude agent after Block 9.

Pro+. Sync/export only the clean accounting entities GarageOS owns. Do not build QuickBooks inside GarageOS.

### 11 — Communications production hardening — PARTIAL/VALIDATE — P0
Best owner: Claude.

Validate real Twilio provisioning/dedicated numbers, SMS allowances and Stripe overage meter, Resend/webhooks, sender/domain setup, retries/idempotency and failure behavior. Two-way SMS remains included when a GarageOS-provisioned dedicated number exists.

### 12 — Complete / Multi-Shop completion — PARTIAL — P1
Best owner: Claude.

Existing Organization/location/access foundations remain. Complete must deliver centralized administration, cross-location access, consolidated/location comparison reporting and operationally coherent Multi-Shop.

Wire additional-location Stripe billing/quantity after reconfirming $199/location pricing.

### 13 — Customer Portal — TODO — P2 / LAST FEATURE
Best owner: Claude after internal domains are stable.

Core+. Reuse existing appointments, vehicles/history, DVI, estimates/approvals and invoices/payments. Do not create parallel business logic.

### 14 — Public product surface closure — PARTIAL
Best owner: ChatGPT quick wins + Claude only where product/UI implementation is substantial.

After corresponding product blocks are DONE, update homepage, Features, Demo, Product/Quick Start, Help/Guides, Integrations and pricing comparison so marketing never claims a missing feature as currently available.

Also remove stale VIN references, unsupported traction/testimonial claims and old workflow descriptions; maintain EN/FR consistency.

### 15 — Launch hardening — VALIDATE — P0 before real customer data
Use dedicated audit sessions.

Required:
- tenant/shop isolation and ownership;
- auth and server-side entitlement/access enforcement;
- concurrency/idempotency;
- booking DST;
- backups/restore procedure;
- responsive/mobile;
- media ownership/uploads;
- Quebec/Canada fiscal tests;
- Stripe webhook and subscription E2E (live test-mode pass incl. Stripe test clocks — Block 1 is unit-tested with mocks only);
- real email/SMS E2E;
- import safety;
- Multi-Shop isolation;
- smoke/regression suite.

A green build alone is not launch readiness.

### 16 — Final GO/NO-GO audit — TODO
Use an audit-first agent that does not begin by implementing.

Must successfully exercise:

**signup → verify → select plan/payment → $0 trial → onboarding → import → customer → vehicle → appointment → DVI → estimate → approval → Work Order → parts → status → notification → invoice → payment → history → reminder → reporting → billing transition.**

Repeat entitlement/access checks for Core, Pro and Complete. Test Stripe trial completion and failed-payment/restricted recovery.

When all launch-critical blocks are DONE and this audit passes: **GO SELL GARAGEOS.**

## Explicitly outside V1

Do not delay first sales for:
- VIN lookup/scanning;
- Work Board/kanban;
- Purchase Orders/Suppliers;
- full accounting/general ledger;
- technician payroll/time clock;
- public API;
- speculative AI features;
- arbitrary enterprise features invented only to make Complete look larger.

These can be reconsidered from real customer demand after launch.

## Current next move

**Block 2 (Data Import / Migration) is the next implementation handoff.** Block 1 is code-complete; the manual Stripe configuration listed under it must be done before selling. Every new operational server action must use `getWritableShopId()` so restricted mode stays enforced.
