# GarageOS subscription plans and future feature gates

> **Status:** commercial packaging approved for the finished GarageOS product. The plans are presented publicly now, but runtime subscription enforcement is intentionally **not implemented yet**.
>
> This document is the product source of truth for future billing and feature-gate work. Do not infer entitlements from the old placeholder pricing that previously existed in the marketing site.

## Principles

GarageOS should sell a complete shop-management system at every tier. The lower tier must not feel like a demo, and the product should not meter the shop's core operational records.

- Currency: **CAD**, plus applicable taxes.
- Core shop transactions should remain unlimited: customers, vehicles, appointments, estimates, work orders, invoices and DVI records.
- Gate higher-value automation, operational complexity, communications usage and organization-level functionality instead of basic transaction volume.
- Email can generally feel included. Services with direct marginal cost — especially SMS, AI, unusually high storage or external paid services — may use allowances and overages.
- Pro and Complete should not charge per user. Adoption across the shop is part of the product value.
- Customer-facing communications must stay centered on the shop's own brand. Customers should not need to install a GarageOS app to receive approvals, confirmations, status updates, invoices or reminders.
- The Customer Portal, once built, is a Core capability rather than a premium-only gate.

## Public pricing

| Plan | Monthly | Annual | Included users | Included locations |
| --- | ---: | ---: | ---: | ---: |
| Core | $149 CAD | $1,490 CAD | 3 | 1 |
| Pro | $249 CAD | $2,490 CAD | Unlimited | 1 |
| Complete | $399 CAD | $3,990 CAD | Unlimited | 1 |

Annual pricing is intentionally equivalent to paying for 10 months and receiving 12 months of service.

### Multi-Shop

Multi-location organizations use **Complete** as the base plan.

- Additional location: **$199 CAD/month/location**.
- Future annual multi-location pricing may mirror the same two-month annual discount, but should be explicitly defined when multi-location billing is implemented.
- Multi-Shop should unlock centralized administration, cross-location access controls and consolidated reporting rather than requiring every location to purchase an unrelated standalone subscription.

## Founding Shops launch offer

For the first **25 eligible founding shops**:

- GarageOS Pro: **$149 CAD/month for the first 12 months**.
- Regular Pro price after the introductory period: **$249 CAD/month**.
- $0 setup fee.
- Assisted onboarding included.
- Standard data migration included.
- Optional founding annual price: **$1,490 CAD for the first year**, then the regular annual Pro price of $2,490 CAD.

The founding offer is an acquisition promotion, not a separate permanent subscription tier.

## Entitlement matrix

Legend:

- **Included** — available in the plan.
- **Advanced** — included with the more capable version of the feature.
- **Allowance** — feature is included but may have usage limits because GarageOS incurs direct marginal cost.
- **Add-on** — separately priced capability.
- **Future** — planned entitlement; do not gate or market as generally available until the underlying feature exists.

| Capability | Core | Pro | Complete |
| --- | --- | --- | --- |
| Customers & vehicles | Included | Included | Included |
| Appointments & scheduling | Included | Included | Included |
| Public online booking | Included | Included | Included |
| Service catalog / canned jobs | Included | Included | Included |
| Estimates / quotes | Included | Included | Included |
| Customer approvals / e-signatures | Included | Included | Included |
| Work Orders | Included | Included | Included |
| Parts & labour on jobs | Included | Included | Included |
| Invoices / receipts / payment records | Included | Included | Included |
| Vehicle / service history | Included | Included | Included |
| Vehicle / job status | Included | Included | Included |
| Ready-for-pickup notifications | Included | Included | Included |
| Basic DVI | Included | Advanced | Advanced |
| DVI photos / media / reusable templates | — | Included | Included |
| Basic maintenance reminders | Included | Advanced | Advanced |
| Branded email communications | Included | Included | Included |
| SMS notifications | Allowance (300 segments/mo, provisional) + overage at $0.05 CAD/segment | Larger allowance (1,000, provisional) + overage | Largest allowance (2,500, provisional) + overage |
| Two-way SMS (dedicated shop number, provisioned by GarageOS) | Included | Included | Included |
| Customer Portal | Future / Included | Future / Included | Future / Included |
| Shop branding on customer documents | Included | Included | Included |
| Hosted GarageOS booking/shop page (Classic template, logo, brand color, 2 shop photos, real services/icons/featured) | Included | Included | Included |
| Branded shop landing/site (advanced booking page customization: Modern/Bold/Minimal templates + typography presets) | — | Included | Included |
| Custom domain | — | Included | Included |
| Custom sender / email identity | — | Included | Included |
| Campaigns / CRM messaging | — | Included | Included |
| Inventory & parts tracking | — | Included | Included |
| Automatic inventory consumption / movements | — | Included | Included |
| Tire Storage | — | Included | Included |
| Basic dashboard / reporting | Included | Included | Included |
| Advanced reports & analytics | — | Included | Advanced |
| Export tools | Basic | Included | Included |
| Accounting Light | — | Included | Advanced |
| QuickBooks Online sync | — | Included | Included |
| Basic roles / permissions | Included | Included | Included |
| Advanced permissions | — | Included | Included |
| Data import tools | Basic / assisted where offered | Included | Included |
| Standard data migration service | Paid if assisted | Launch/onboarding offer as applicable | Included |
| API access | — | — | Future |
| Advanced integrations | — | Selected | Included / future |
| Priority support | — | Included | Included |
| Assisted onboarding | — | Included | Included |
| White-glove onboarding | — | — | Included |
| Users | 3 | Unlimited | Unlimited |
| Locations | 1 | 1 | 1 + Multi-Shop add-on |
| Centralized multi-location administration | — | — | Add-on / Included with Multi-Shop |
| Consolidated multi-location reporting | — | — | Add-on / Included with Multi-Shop |

## Detailed plan intent

### Core — $149 CAD/month

**Positioning:** Everything a small independent shop needs to run day to day.

Core must support the complete operational loop:

customer / booking → vehicle → appointment → estimate → approval → Work Order → inspection / work → invoice → payment → history → maintenance reminder.

Core is intentionally not crippled. It should include basic DVI, basic reminders, customer status updates, branded emails, online booking and the future Customer Portal.

The main commercial constraints are:

- up to 3 users;
- one location;
- no advanced inventory/tire-storage stack;
- no advanced campaigns/CRM automation;
- no custom domain/sender identity package;
- no advanced accounting/integration package;
- smaller communication allowances.

### Pro — $249 CAD/month

**Positioning:** Run, automate and grow your entire shop.

Pro is the primary plan GarageOS should sell and should be marked **Most Popular**.

It adds:

- unlimited users;
- full DVI with media and reusable templates;
- inventory and automatic part movement;
- tire storage;
- advanced reminders;
- SMS notifications and campaigns;
- advanced reporting;
- advanced permissions;
- Accounting Light and QuickBooks Online sync;
- custom domain;
- configurable sender identity;
- branded shop website/landing experience;
- assisted onboarding;
- priority support.

Pro should represent the core GarageOS promise: **the whole independent shop in one platform**.

### Complete — $399 CAD/month

**Positioning:** Advanced control for high-volume and more complex operations.

Complete should not exist merely as Pro plus arbitrary locked features. It is for mature operations that need more governance, service and organizational complexity.

It adds or expands:

- advanced business analytics and controls;
- larger communication allowances;
- advanced integrations;
- future API access;
- standard migration included;
- white-glove onboarding;
- priority support;
- eligibility for Multi-Shop centralized administration and consolidated reporting.

## Features that should never be transaction-gated

Do **not** introduce pricing limits such as:

- number of customers;
- number of vehicles;
- number of appointments;
- number of estimates;
- number of Work Orders;
- number of invoices;
- number of DVI records;
- number of maintenance reminders stored.

Those are the core system of record and should become more valuable as the shop uses GarageOS more.

## Usage-metered services

The following may eventually require metering because GarageOS incurs direct cost:

- SMS sends (allowance + paid overage) — two-way SMS itself is included once a shop has a dedicated number, not metered separately;
- AI features;
- exceptionally high media/storage use;
- third-party paid API calls;
- optional external services.

Exact quotas and overage prices are **not yet approved**. Do not hard-code arbitrary quotas into product logic until provider costs and real shop usage are measured.

## Future implementation guidance

When subscription enforcement is built, do not scatter plan-name conditionals throughout the application.

Prefer a centralized entitlement layer with stable capability keys, for example:

```ts
can(shop, "inventory.manage")
can(shop, "dvi.advanced")
can(shop, "communications.sms")
can(shop, "communications.campaigns")
can(shop, "branding.customDomain")
can(shop, "accounting.quickbooks")
can(shop, "reports.advanced")
can(shop, "organization.multiLocation")
```

Suggested implementation shape:

1. Store the subscribed plan and billing status on the shop/account subscription domain.
2. Map plan → entitlements in one server-side configuration/module.
3. Enforce entitlements in server actions/API boundaries first; UI hiding alone is not security.
4. Expose entitlement state to the UI so unavailable features can show an upgrade affordance instead of failing mysteriously.
5. Keep usage allowances separate from boolean entitlements.
6. Make Multi-Shop organization/location limits explicit rather than inferring them from UI state.
7. Keep promotional billing (Founding Shops) separate from entitlements: Founding Pro has **Pro entitlements** with a temporary discounted price.
8. Add tests for every gate, especially cross-shop/multi-tenant isolation.

### Suggested entitlement keys

The exact names can change during implementation, but the concepts should stay stable:

- `users.limit`
- `locations.limit`
- `booking.public`
- `estimates.approvals`
- `workOrders.manage`
- `dvi.basic`
- `dvi.advanced`
- `communications.email`
- `communications.sms`
- `communications.twoWaySms`
- `communications.campaigns`
- `reminders.basic`
- `reminders.advanced`
- `inventory.manage`
- `inventory.autoConsumption`
- `tires.storage`
- `reports.basic`
- `reports.advanced`
- `accounting.light`
- `accounting.quickbooks`
- `branding.shopSite`
- `branding.customDomain`
- `branding.customSender`
- `permissions.advanced`
- `migration.selfServe`
- `migration.assisted`
- `integrations.advanced`
- `api.public`
- `organization.multiLocation`
- `organization.consolidatedReporting`
- `support.priority`
- `onboarding.assisted`
- `onboarding.whiteGlove`

## Current implementation status

- **Runtime entitlement gates are implemented** for the capabilities that
  already exist in the product: `inventory.manage`, `communications.campaigns`,
  `branding.customDomain`, `branding.customSender`, `organization.multiLocation`,
  `bookingPage.advancedDesign` (the implemented slice of `branding.shopSite`),
  plus the `users.limit` seat cap. Two-way SMS is implemented (see
  `docs/notifications.md`) but not yet plan-gated — every shop with a
  dedicated number can use it regardless of plan. Everything else still
  marked "Future" above (public API, QuickBooks sync, advanced reports/DVI,
  etc.) has no gate yet because the feature itself doesn't exist in code.
- `src/config/entitlements.ts` is the single source of truth for
  plan → capability mapping (`CAPABILITY_MIN_PLAN`) and per-plan numeric
  limits (`PLAN_LIMITS`). `src/lib/subscription.ts` resolves a shop's
  effective plan (`getEffectiveSubscription`, `can`, `requireEntitlement`/
  `checkEntitlement`) — trial expiry and multi-location organizations (which
  share one Subscription per org) are resolved there, never by comparing
  `plan === "..."` elsewhere.
- Enforcement exists at both layers per the guidance below: server actions
  reject a disallowed write (`src/actions/inventory.ts`, `campaigns.ts`,
  `domains.ts`, `communications-settings.ts`, `users.ts`, `locations.ts`),
  and the corresponding pages/components show an upgrade CTA
  (`src/components/billing/UpgradeCTA.tsx`) instead of silently failing —
  full-page for Inventory/Campaigns, inline for Domains/Sender
  identities/Team/Locations, plus a small lock badge on the gated nav items.
- Billing lives in Settings → Billing (`src/components/billing/BillingCard.tsx`,
  `src/actions/billing.ts`): current plan/status, a monthly/yearly plan
  picker that starts a Stripe Checkout session, and a "Manage billing" link
  to the Stripe customer portal.
- Stripe sync is a webhook at `src/app/api/stripe/webhook/route.ts`
  (`checkout.session.completed`, `customer.subscription.*`) plus
  `src/lib/stripe.ts`. See `.env.example` for the required `STRIPE_*`
  variables and the chat response that shipped alongside this change for the
  exact Dashboard configuration (products, prices, webhook, portal, CAD/tax
  settings).
- New shops (signup, Google sign-in, and platform-admin-created shops) start
  on a 14-day **Pro trial** (`createDefaultSubscription`). Shops that
  existed before this system shipped were grandfathered to **Complete/Active**
  in the backfill migration (`prisma/migrations/20260917153000_add_subscriptions`)
  so nothing already in use broke.
- Per-location metered billing for Multi-Shop ($199 CAD/month/location) is
  **not wired to Stripe yet** — `organization.multiLocation` gates *whether*
  a Complete-plan shop can add a second location at all, but adding
  locations does not yet adjust a Stripe subscription item's quantity. Do
  this next if/when Multi-Shop billing needs to be metered automatically.
- `src/lib/marketing-pricing.ts` is the public marketing pricing source for
  the homepage — it is copy only and intentionally separate from
  `PLAN_PRICING_CAD` in `src/config/entitlements.ts` (used for the in-app
  billing picker); keep both in sync by hand when prices change.

When product scope changes, update this document first or in the same PR as the entitlement change so marketing, billing and runtime gates cannot silently drift apart.
