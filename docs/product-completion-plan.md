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

### 3 — Inventory → Work Order consumption — DONE (2026-09-30)

Pro+ (`inventory.manage`, enforced in `createWorkOrder` / `updateWorkOrder`; Core keeps free-text PART lines). A PART line on a Work Order can now be linked to a stocked part (`WorkOrderLine.partId`; picker in the WO form shows on-hand quantity).

- **Model**: consumption is **reconciled, not incremental** (`src/lib/inventory-consumption.ts`, pure deltas in `src/domain/inventory-consumption.ts`). For each (work order, part) the ledger's net (`InventoryMovement.workOrderId`) is the amount already deducted; delta = Σ line quantities − already deducted. So saving twice, editing quantity, swapping parts or removing a line always ends consistent — no double consumption, corrections are `RETURN` movements, consumption is `CONSUMED`.
- **Transactions/concurrency**: create/update/cancel/delete run in one `$transaction` with the WO row locked (`SELECT … FOR UPDATE`); decrement is an atomic conditional `updateMany(quantityOnHand ≥ delta)` so two orders can never spend the same stock. Insufficient stock → typed `InsufficientStockError` → whole save rolled back with a localized message (same "no negative stock" rule as manual movements). Whole quantities only for stocked lines.
- **Lifecycle**: cancelling a WO (`updateWorkOrderStatus → CANCELLED`) and deleting one release everything it consumed; invoicing does **not** touch stock (invoice lines carry no `partId`, so no double consumption); quote-derived WOs have no stocked links unless edited.
- **Tenant/restricted**: parts validated against `shopId`; all writes via `getWritableShopId()`.
- **Migration**: `20260930110000_work_order_parts` (additive columns/indexes/FKs `ON DELETE SET NULL`).
- **Tests**: `tests/inventory-consumption.test.ts` (idempotent re-save, qty up/down, remove, swap part, insufficient stock, shared stock across WOs, release on cancel/delete, tenant isolation, fractional qty).
- Not in V1 (by design): purchase orders/suppliers, reservations before approval, consumption from direct invoices.

### 4 — Tire Storage — DONE (2026-09-30)

Pro+ (`tireStorage.manage`, PRO in `src/config/entitlements.ts`), enforced server-side in every write in `src/actions/tire-storage.ts` (`getWritableShopId()` + `checkEntitlement`); reads return nothing/`null` for Core (Pro shops that lapse keep *view* via `canView`, like Inventory).

- **Model**: `TireStorageSet` (client, optional vehicle, season WINTER/SUMMER/ALL_SEASON, brand/model, normalised size `225/45R17`, quantity, condition NEW/GOOD/FAIR/WORN, with-rims, storage location, status STORED/CHECKED_OUT, checked-in/out dates, notes) + `TireStorageEvent` history (CHECK_IN / CHECK_OUT / MOVED with location, note, user).
- **Workflow**: check in (`/admin/tire-storage/new`, prefilled from customer/vehicle pages) → move location → check out (note) → check back in (season swap, new location). Transitions are atomic conditional updates (`status` in the `where`) so double clicks/races can't check out twice; client and vehicle ownership are validated against the shop (vehicle must belong to the client).
- **UI**: `/admin/tire-storage` list with search (customer, phone, plate, vehicle, size, brand, location) + status/season filters, detail with history and actions, edit form, "Tire storage" section on customer and vehicle detail pages, sidebar entry (lock icon + upgrade CTA for Core), EN/FR.
- **Migration**: `20260930120000_tire_storage` (additive; client FK is RESTRICT — a customer with tire sets can't be deleted until they're removed, consistent with work orders/invoices; vehicle FK SET NULL).
- **Tests**: `tests/tire-storage.test.ts` (real actions through the new `tests/helpers/action-harness.ts` — size normalisation, Pro check-in, Core refused, restricted shop refused, foreign client/vehicle, check-out/check-in/move state machine + history, tenant isolation, read gating).
- Not built: printed labels/QR (skipped to keep the block small), deleting tire sets (history is kept; check out instead).

**Test infrastructure added**: `tests/helpers/{action-harness,stub-auth,stub-next,db-mock}.ts` let node:test import real server actions with a fake session (`setSession`) and a patched `db`. Later blocks (and Block 15) should reuse them.

### 5 — Reports & Analytics — DONE (2026-09-30) — P0

Audit: before this block only the dashboard had revenue tiles/6-month chart (client-side-ish, paid-invoice totals) — no Reports area, no date ranges, no exports, no receivables, no work-order/quote/customer/inventory reporting.

**Model** (`src/domain/reports.ts` pure, `src/lib/reports-service.ts` queries, `src/lib/reports-export.ts` CSV, `src/actions/reports.ts` authz, UI `/admin/reports`):
- Entitlement `reports.advanced` (PRO). **Core** = basic Overview only (this month / last month / last 30 days: paid revenue + daily series, outstanding total, work orders opened/open now, new customers) — no custom ranges, no other reports, no export. **Pro/Complete** = Sales (totals/tax/ARO, series by day/week/month auto-picked, by payment method, labour/parts/other, top items), Receivables (aging buckets + oldest unpaid), Jobs & quotes (work orders by status, completed, avg days to complete, open now; quotes by status, approval rate, value sent/accepted), Customers (new, active, returning, retention, top customers), Inventory (low stock, stock value at cost, units used), every preset + custom range (max 731 days) and **CSV export** for each report.
- **Authorization is server-side and central** (`buildContext` in the action): `reports.view` for anything; `financial.view` additionally for Sales/Receivables, and money fields inside Overview/Customers/Jobs/Inventory are `null` without it (no revenue leak). Plan is checked with `canView` — a restricted Pro shop keeps read-only reports and export (Block 1: data access, not a write); a missing subscription row gets nothing. Blocked requests are rejected **before** any data query.
- **Tenant isolation**: the shop always comes from the session; every query filters `shopId IN (scope.shopIds)`. Dates are shop-timezone days (`Shop.timezone`), revenue is counted on `paidAt` (same as the dashboard).
- Aggregation is server-side (grouped counts/aggregates where Prisma can; narrow column selects bucketed in Node for series) — the browser only receives aggregates. CSV cells are formula-injection-safe (`=+-@` prefixed) with UTF-8 BOM.
- **Complete foundation**: the service takes `shopIds[]` and Sales returns `byLocation`; the action passes only the active shop today. Cross-location scope resolution/UI is Block 12.
- Nav: Reports under Finance (hidden without `reports.view`), ES falls back to EN like other newer dictionaries.
- **Tests**: `tests/reports.test.ts` (range/timezone/presets, buckets, aging, CSV safety, tenant isolation, permissions incl. delegated `reports.view` without `financial.view`, Core vs Pro, restricted Pro, missing subscription, invalid ranges, exports, KPIs).
- Not built (deliberate): scheduled/emailed reports, charts beyond simple bars, per-mechanic productivity, location comparison UI/consolidation (Block 12). Days-to-complete uses `updatedAt` of completed/invoiced work orders (no completion timestamp exists).

### 6 — DVI Basic vs Advanced — DONE (2026-09-30)

Existing Inspection → InspectionItem → InspectionPhoto flow untouched for Core (standard 10-point checklist, condition, notes, custom items, "create estimate from findings", work-order/vehicle links, unlimited records).

Advanced (Pro/Complete) entitlement keys, all in `src/config/entitlements.ts` and enforced server-side (`checkEntitlement`, which also refuses restricted shops):
- `dvi.photos` — `uploadInspectionPhoto` refuses Core. Existing photos stay *visible* for a shop that lapses (`canView`); uploading needs the plan.
- `dvi.templates` — reusable `InspectionTemplate` (name + ordered items) managed at `/admin/inspections/templates`; `createInspection({ templateId })` replaces the standard checklist (template must belong to the shop; Core with a `templateId` is rejected without creating anything).
- `dvi.customerReport` — `shareInspectionReport` / `unshareInspectionReport` create/revoke an opaque token; public mobile-friendly report at `/inspection/[token]` (EN/FR by customer language: findings first, photos, full checklist; `noindex`). The public page re-checks the shop's plan on every view, so a Core/restricted shop's old links stop working.
- UI reads `getInspectionCapabilities()`; Core sees a compact upgrade prompt instead of the photo buttons, and the share panel shows the locked notice.
- **Migration**: `20260930130000_dvi_advanced` (additive: `InspectionTemplate`, `Inspection.shareToken`).
- **Tests**: `tests/dvi.test.ts` (Core default checklist vs Pro template, cross-shop template, photo gate, capabilities incl. restricted Pro, template CRUD gating/dedupe, share token idempotency and scoping, public report 404s/plan re-check).
- Not built: emailing/SMS-ing the report link from GarageOS (copy link only), per-template item conditions, photo annotations.

### 7 — Maintenance reminders Basic vs Advanced — DONE (2026-09-30)

**Core (Basic, unchanged)**: manual reminders per vehicle (service, due date/mileage, notes), "Send now" by email, daily cron email 7 days before the due date (manual reminders only, `ruleId: null`), dismiss, status tabs. Restricted shops don't send (existing `createOperatingChecker`).

**Pro/Complete (Advanced)** — `reminders.automation` (PRO, `src/config/entitlements.ts`), enforced server-side:
- **Recurring service-driven rules** (`ReminderRule`, `/admin/reminders/rules`): name + keyword matched (case/accent-insensitive) against the completed work order's lines + repeat interval (months, required because sending is date-driven) + optional km/miles (shown on the reminder) + lead days (0–90).
- **Automation**: `updateWorkOrderStatus → COMPLETED` calls `createRemindersForCompletedWorkOrder` (Pro only; failures never block the status change). One reminder per (rule, work order) — unique key makes retries idempotent; a new one for the same rule+vehicle dismisses the previous pending one. Auto reminders show an "Auto" badge.
- **Delivery**: cron (`/api/webhooks/cron`) → `deliverDueAutomatedReminders`: sends from `remindAt` (due − lead days) using the customer's notify preference (`resolveNotifyChannelPlan`: SMS first with email fallback, or both) through the existing communications stack (`sendServiceReminderSms`, purpose `REMINDER`; `sendReminderEmail`); skips restricted shops and shops that lost the plan; ignores reminders > 45 days stale; marks SENT with a `status: PENDING` guard.
- **Campaign integration**: new segment `SERVICE_DUE` (clients with a pending/sent reminder due within N days or overdue), reusing the campaigns consent filters; campaigns remain Pro (`communications.campaigns`).
- **Migration**: `20260930140000_reminder_rules` (additive: `ReminderRule`, `ServiceReminder.ruleId/workOrderId/remindAt` + unique `(ruleId, workOrderId)`).
- **Tests**: `tests/reminders.test.ts` (matching, date math, validation, Core refused / Pro CRUD scoped / restricted redirect, auto-creation idempotency and replacement, Core skip, cron skips, segment validation + shop scoping).
- Known gaps (not blockers): the cron's actual SMS/email send path for automated reminders is covered by the shared, already-tested comms helpers but has no dedicated end-to-end test (Block 11/15 real-provider validation); mileage is informational only (no odometer tracking); no per-rule channel override.
- **Manual**: none (the existing daily cron `/api/webhooks/cron` runs the new step; `CRON_SECRET` unchanged). Shops provisioned before this change get the `REMINDER` SMS route on their next sender-identity provisioning; sending does not depend on it.

### 8 — Roles & permissions — DONE (2026-09-30)

**Model** (`src/domain/permissions.ts`, pure): three roles in every plan — OWNER (everything), MECHANIC (operates the whole job flow incl. invoicing/payments/inventory/DVI; no accounting/reports/campaigns/import/config), VIEWER (read customers + invoices only, no writes). Permissions: `ops.write` (baseline for ANY operational write), `customers.view/write`, `invoices.view/write`, `payments.write`, `inventory.write`, `dvi.write`, `financial.view`, `reports.view`, `campaigns.manage`, `import.run`, `settings.manage` (never delegable).

**Pro+ finer permissions** (`permissions.advanced`, PRO): the owner can grant/revoke the delegable permissions per user (`User.permissionGrants/permissionDenies`, stored as differences from the role default; changing a role clears them; owners can't be restricted). Overrides are ignored by the resolver on Core (e.g. after a downgrade), and re-read from the DB on every request (not in the JWT). UI: Settings → Team → per-member "Permissions" checklist (locked notice on Core); `setTeamMemberPermissions` is owner-only, entitlement-gated, tenant-scoped, sanitised.

**Enforcement (central, server-side)**: `src/lib/access.ts` (`getEffectivePermissions`, `requirePermissions`, `requirePagePermission`, `PermissionDeniedError`) behind `getShopId(permission?)` / `getWritableShopId(permission?)` in `src/lib/shop-context.ts` — **`getWritableShopId()` now also requires `ops.write`**, so every operational action that already used it (all of them, per Block 1) instantly refuses VIEWERs. Sweep: customers/vehicles (`customers.*`), invoices/payments (`invoices.*`, `payments.write`; WO/quote → invoice conversion needs `invoices.write`), cash drawer + accounting documents + invoice CSV export + dashboard revenue/analytics (`financial.view`), inventory (`inventory.write`), DVI incl. photos/templates/report links (`dvi.write`), campaigns (`campaigns.manage`), import (`import.run`), reminder rules (`settings.manage`), inbox writes (`ops.write`), invoice PDF (`invoices.view`) and payment-proof upload (`payments.write`) API routes. **Bug fixed**: `updateShopSettings`, `updateEtransferSettings`, `updateShopTaxLines`, `updateShopSlug`, `uploadShopLogo` had no role check (any staff user could call them) — now `settings.manage` (owner only). UI: sidebar hides entries the user can't use; pages redirect to the dashboard.
- Tenant/location boundaries unchanged (`shopId` comes from the session; permissions are resolved per active location's plan).
- **Migration**: `20260930150000_user_permissions` (additive columns, default `{}`).
- **Tests**: `tests/permissions.test.ts` (role matrix, override rules, VIEWER write refusal, MECHANIC vs finance/config, Core ignores overrides, Pro revoke/grant, non-delegable settings, API/page gating, team permission action scoping) + updated import test.
- Decisions/limits: shop settings, team, billing, domains, locations remain owner-only in every plan (not delegable in V1); `reports.view` is defined and delegable but the Reports area itself is Block 5; per-location roles for Complete/Multi-Shop are Block 12; the 3 built-in roles are not customisable/renameable (no IAM by design).

### 9 — Quebec/Canada fiscal normalization + Accounting Light — DONE (2026-09-30) — P0/P1

**Audit findings (before this block)**: invoices stored only a combined `taxRate`/`taxAmount`; the PDF re-derived the GST/QST breakdown and printed the tax registration from the shop's CURRENT `taxLines`/`taxId` (old invoices silently changed when settings changed); tax was rounded on the combined rate while the PDF itemised per-line rounding (could differ by a cent); payment methods were CARD/CASH only; `revertInvoiceToPending` deleted payment rows without checking the invoice was paid; cancel/revert erased payment history; `deleteInvoice` could delete a PAID invoice; no refunds, no audit trail, no tax/sales summaries or accountant exports.

**Fiscal model** (`src/domain/fiscal.ts` pure + `src/lib/fiscal.ts`):
- Every invoice (and quote) carries a **`taxSnapshot`** (`{v, source, exempt, lines:[{name, rate, amount}]}`), plus invoice-level **`taxRegistration`** (shop tax numbers at issue) and **`currency`**. PDF, screen, reports and summaries read the snapshot; changing `Shop.taxLines`/`taxId` never rewrites an issued document (settings UI now says so).
- Each tax is computed on the subtotal and rounded half-up **separately**; `taxAmount` = Σ rounded lines (Quebec: GST and QST both on the subtotal, no compounding). Configurable per shop (any Canadian province/none); a per-document rate is scaled across the shop's line names; rate 0 = exempt (recorded as `exempt`).
- Editing a pending invoice/quote with an unchanged rate keeps ITS OWN lines/registration/currency; quote→invoice conversion copies the quote's totals + snapshot (legacy quotes are only re-derived if the shop's current lines reproduce the stored tax exactly, else a generic "Tax" line). Work-order→invoice and inspection→quote use the same path.
- **Migration `20260930160000_fiscal_snapshots_refunds`** (additive; verified on a real Postgres 16 against seeded legacy data): new columns/tables/enum values + a **backfill** of every existing invoice: snapshot lines come from the shop's taxLines only when they reproduce the invoice exactly (Σ rates and Σ rounded amounts), otherwise a generic "Tax" line with the stored rate/amount (`source: backfill`/`backfill-generic`); `taxRegistration`/`currency` copied from the shop as of the migration (the only data available for legacy invoices).

**Payments / refunds / audit**:
- Payment methods: CARD, CASH, ETRANSFER, CHEQUE, OTHER (enum extended; mark-paid dialog's "Other / split" mode picks any method per entry; CARD/CASH modes still enforce pure entries). Payment must equal the invoice total (no partial payments in V1), amounts to the cent, and the pending→paid transition is claimed atomically (`persistInvoicePayment`: a double click / second tab can't duplicate payments).
- **Refunds** (`refundInvoice`, new delegable permission **`refunds.write`**, OWNER by default — a mechanic with `payments.write` still can't refund): full/partial on PAID invoices, method + required reason, capped at the refundable balance under a row lock, tax split per snapshot line (last refund closes the invoice exactly), cash refunds create a linked `CASH_OUT` in the cash drawer. Immutable `InvoiceRefund` rows; the invoice keeps its total/status/snapshot and shows refunds + net. Invoices with refunds can't be reverted, voided or deleted. Restricted (Block 1) shops can't refund.
- **Void/revert/delete normalized**: revert only works on paid invoices without refunds; void/revert record the removed payments in the audit log; delete is allowed only for never-issued invoices (draft/pending, never sent, no payments/refunds) — anything issued is voided instead.
- **`FinancialEvent`** append-only log (issued, edited [before/after totals], payment recorded/reversed, voided, deleted, refund [with tax split]) — recorded in every plan, inside the same transaction as the change.

**Accounting Light** (Pro+, entitlement `accounting.light`; `financial.view`; read-only access kept when restricted): `/admin/accounting` gets **Sales summary** (gross / refunds / net, payments received & refunds paid by method, outstanding), **Tax summary** (per-tax base, collected, refunded, net to remit — GST/QST), **Activity log** (paginated) with a choice of counting sales by **invoice date** (default; excludes voided/never-issued drafts) or **payment date**, and CSV exports: sales journal (one column per tax + registration), payments & refunds ledger (refunds negative), tax summary, activity log. Block 5 Sales/Overview and the dashboard revenue are now **net of refunds** and show tax collected per tax name. Core keeps invoicing, payments, refunds, cash drawer, and the invoice history/document tabs.
- **Tests**: `tests/fiscal.test.ts` (Quebec numbers/rounding, exempt/custom/no-tax, snapshot stability after settings change, edit/convert stability, refund tax allocation invariants, payment validation + idempotent persistence, refund/void/revert/delete rules, permissions, restricted, cross-shop, issue/edit events), `tests/accounting.test.ts` (netting, GST/QST split, bases, Core/permission/restricted, exports, tenant scoping, activity pagination).
- Not built (deliberate, post-launch): partial payments/deposits, customer-level tax-exempt flag (rate 0 per document today), credit notes/refund lines on the PDF, tax-rate effective-date tables, filing-period locks, general ledger/chart of accounts. Summaries are operational aids, not tax advice.

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

**Blocks 0–4 and 6–8 are DONE. The next implementation handoff is Block 5 (Reports & Analytics)** — then 9 (fiscal + Accounting Light), 11 (communications hardening), 12 (Complete/Multi-Shop), 10, 13, 14, 15, 16.

Rules every following block must respect:
- Operational writes go through `getWritableShopId(permission?)` (restricted-mode + `ops.write` baseline + optional fine permission); sensitive reads through `getShopId(permission)`; new Pro+ functionality through a key in `src/config/entitlements.ts` + `checkEntitlement`/`can`/`canView`. Reports (Block 5) should gate on the existing `reports.view` permission and a new entitlement key for Advanced; Reports must not leak revenue to users without `financial.view`.
- Tests for real server actions: reuse `tests/helpers/*` (`setSession`, `patchDb`, `mockSubscription`).
- Migrations added by Blocks 2–9 (all additive; Block 9 is `20260930160000_fiscal_snapshots_refunds`): `20260930100000_import_runs`, `…110000_work_order_parts`, `…120000_tire_storage`, `…130000_dvi_advanced`, `…140000_reminder_rules`, `…150000_user_permissions`.
- Still open from these blocks: live/real-provider validation (Block 15) of automated reminder SMS/email delivery, XLSX with real-world shop exports and large imports (10k rows in one request), Supabase photo storage; import error CSV is capped at the first 1,000 bad rows.
