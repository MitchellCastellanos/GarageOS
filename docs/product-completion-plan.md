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

### 1 — Subscription lifecycle + onboarding checkout — TODO — P0
Best owner: dedicated Claude agent/session.

Build the target trial/conversion contract above.

Acceptance criteria:
- New email and Google signups cannot silently create an unpaid forever-Core account.
- During onboarding owner selects plan and billing interval.
- Stripe collects payment method and creates/links the 14-day trial for that selected plan.
- UI displays Today $0 and dynamically calculated due date/amount before confirmation.
- Entitlements during trial match selected plan.
- Trial banners show selected plan, days remaining and next charge information.
- Successful trial charge becomes ACTIVE without manual intervention.
- PAST_DUE grace works; terminal nonpayment becomes RESTRICTED.
- Restricted mode is enforced server-side for operational writes.
- Missing Subscription is repaired/restricted, never treated as complimentary Core.
- Tests cover email signup, Google signup, each plan trial, success, retry/past_due, canceled/unpaid, missing subscription and recovery.

### 2 — Data Import / Migration — TODO — P0
Best owner: Claude.

CSV/Excel customers, vehicles and inventory; mapping, validation, preview, error reporting, safe import and tenant isolation.

Core: basic self-service. Pro/Complete: full import tooling. Complete includes standard assisted migration service operationally.

Acceptance: a real shop can bring a non-trivial existing customer/vehicle dataset into GarageOS without manual re-entry.

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
- Stripe webhook and subscription E2E;
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

**Block 1 is the next implementation handoff.** Give the agent this document and ask it to audit the existing signup/onboarding/Stripe/subscription code against Block 1, make a short final implementation plan, then implement it end-to-end with tests and update this file before committing.
