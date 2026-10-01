# GarageOS Sales Demo — Implementation Plan

> **Status:** Ready for implementation  
> **Target:** current `main`  
> **Purpose:** Handoff document for an implementation agent. Audit current code before editing, then build end-to-end. Preserve the product behavior below if newer repository architecture suggests different internal names.

## 1. Goal

Build a production-quality **Sales Demo Mode** for in-person GarageOS sales. A salesperson prepares a prospect's real shop with its business information, logo and optional photos, then walks the prospect through the **real GarageOS product**.

This is not a fake frontend or separate demo app. Reuse real onboarding, dashboard, clients, vehicles, appointments, quotes/approvals, work orders, DVI, invoices/PDFs, booking page, customer portal, tire storage, reports, entitlements, SMS and email.

The prospect experience should be: **"This is already my shop running on GarageOS."**

Billing is the boundary:
- no paid Stripe subscription while demoing;
- no demo MRR/customer count;
- no Stripe SMS-overage charges for demo messages;
- Stripe becomes real only during Demo → Customer conversion.

### Implementation scope and execution boundaries

This document is the complete implementation authority for Sales Demo Mode. An implementation agent should not need a separate planning conversation to determine product intent, scope, sequencing, or acceptance criteria. When repository reality conflicts with a suggested internal implementation detail, preserve the product behavior and security invariants in this document while adapting to the current architecture.

Implement in **three reviewable waves/PRs**, in order. Do not combine all three into one uncontrolled change:

**Wave 1 — Sales Demo foundation (blocks A–G)**
- schema/migration and SalesDemo domain helpers;
- platform Sales authorization;
- responsive Sales workspace and prospect creation;
- logo/photo capture, preparation and storage;
- demo impersonation/session and persistent toolbar;
- centralized demo-aware entitlement resolution;
- reuse of real onboarding with the explicit no-Stripe demo divergence.

Wave 1 is complete when an authorized SUPER_ADMIN can create a prospect demo from a phone, prepare branding, enter the real onboarding/product, select Core/Pro/Complete without Stripe, reach the real Dashboard, switch tiers and see the real entitlement gates respond. Normal signup/payment protection must remain unchanged.

**Wave 2 — Demo experience (blocks H–I plus Restart and Booking Page)**
- real SMS/email through the existing communication stack;
- central, durable exclusion of demo SMS from Stripe overage billing;
- optional explicitly-marked quick demo scenario;
- safe Restart semantics;
- real Booking Page behavior and tier fallback.

Do not begin Wave 2 until the repository's current communication/provider state has been audited. If Production-provider validation is being performed separately, implementation must not interfere with it or use real recipients without explicit authorization.

**Wave 3 — Conversion and completion (blocks J–O)**
- Convert to customer handoff;
- owner activation email/token and collision handling;
- direct final payment step using the existing Stripe path;
- idempotent Stripe-confirmed conversion to the same Shop;
- analytics exclusions and expiration;
- final responsive/accessibility pass;
- complete tests/build/migration/hostile QA.

A Wave 3 conversion is not complete merely because Checkout was created: Stripe-backed access must actually be confirmed through the existing billing lifecycle before the demo override disappears and the Shop becomes commercial.

**Out of scope for this feature**
- a separate fake demo application or duplicate feature matrix;
- a new billing/Stripe implementation;
- collecting cards or passwords by Sales;
- adding SALES to the tenant Role enum merely for this feature;
- automatic AI/logo APIs or a ChatGPT API integration;
- speculative AI extraction from prospect assets;
- redesigning unrelated GarageOS modules;
- weakening normal signup/onboarding/payment gates;
- broad provider refactors unrelated to the Sales Demo requirements.

Each wave must leave the repository in a valid, reviewable state and include tests for the security/billing invariants it introduces. Do not proceed by silently weakening an existing invariant just to make demo mode work.

## 2. Audit first

Before coding, inspect at minimum:

- `prisma/schema.prisma`
- `src/lib/auth.ts`, `permissions.ts`, `routes.ts`, `shop-context.ts`
- `src/lib/subscription.ts`, `src/config/entitlements.ts`, subscription-state domain code
- onboarding page/actions/wizard/steps, especially `StepPlan.tsx`
- billing actions, Stripe helpers/sync/webhooks
- platform routes/actions/chrome/navigation and impersonation
- settings, logo upload and storage
- Booking Page actions/lib/editor/public renderer
- email, SMS, communications outbox and notifications docs
- email verification/tokens/templates/routes
- invoice/PDF, quote approval, portal, DVI, tire storage, reports, inventory, multi-location
- platform analytics/MRR/churn/shop-count queries
- auth/subscription/onboarding/Stripe/SMS/tenant-isolation tests

Do not duplicate existing systems.

## 3. Existing architecture to preserve

Plans are `CORE | PRO | COMPLETE`. Entitlements are centralized in `src/config/entitlements.ts` and `src/lib/subscription.ts`. Existing `can()`, `canView()`, `requireEntitlement()`, `requireWriteAccess()`, etc. remain the source of truth.

Normal signup creates a Subscription with `AWAITING_PLAN` and no plan. Normal `completeOnboarding()` requires payment-backed access. **Do not weaken this globally.**

Current onboarding is roughly:
1. Business
2. Fiscal/logo
3. Services
4. Hours
5. Design
6. Plan/payment
7. Finish/share

Reuse the real wizard. Sales Demo gets an explicit, isolated exception rather than scattered `if (demo || paid)` checks.

## 4. Sales authorization

V1: `SUPER_ADMIN` can access `/platform/sales`.

Later GarageOS will have dedicated sales-only logins. Design a reusable platform-level authorization boundary such as `requireSalesActor()` so a future SALES platform permission can be added without rewriting the feature.

Do **not** blindly add SALES to the tenant `Role` enum; OWNER/MECHANIC/VIEWER are shop-level concepts.

## 5. SalesDemo domain

Prefer a dedicated model instead of stuffing sales state into Shop.

Suggested lifecycle:
- `PREPARING`
- `ACTIVE`
- `ACTIVATION_SENT`
- `AWAITING_PAYMENT`
- `CONVERTED`
- `EXPIRED`

Store at least:
- shop relation
- createdBy/sales actor
- prospect/contact name/email/phone/language
- current demo plan
- proposed final plan
- proposed billing interval
- status
- expiresAt
- activation/conversion timestamps
- created/updated timestamps

Add appropriate indexes/constraints. Deleting/expiring SalesDemo must **never cascade-delete a converted real Shop**.

## 6. Responsive Sales workspace

Create `/platform/sales` and add it to Platform navigation.

Show:
- New prospect demo
- active/recent demos
- state
- current/proposed plan
- age/timestamps
- Resume
- Resend activation when relevant
- converted state

This entire feature is **mobile-first operational UI**. Explicitly test/design around 375px, 430px, 768px, 1024px and 1440px. No horizontal overflow. French copy must fit. Touch targets and mobile keyboards matter.

## 7. Prepare prospect

Route such as `/platform/sales/new`.

Collect:
- shop name (required)
- address
- phone
- shop email
- contact name
- contact email
- preferred language

Brand assets:
- Logo: Take photo / Choose from device / Skip
- Storefront/cover: Take photo / Choose from device / Skip
- Interior/shop: Take photo / Choose from device / Skip

Use mobile camera capture where supported, but always keep normal device upload. Photos are optional; do not invent placeholders.

### Logo preparation

V1 should reliably support:
- preview
- crop
- rotate/straighten if practical
- normalized output
- replace/retry
- use original
- an optional **Prepare with ChatGPT** helper for difficult/low-quality/backgrounded logos.

GarageOS must **not** depend on an AI API for logo preparation. Do not add a ChatGPT/OpenAI integration, API key, server call or external background-removal dependency for this workflow. Normal upload and **Use original** must always work without ChatGPT.

The logo UI should offer a small helper such as **Prepare with ChatGPT** / **Copy ChatGPT prompt**. Explain that Sales should attach the original logo in ChatGPT with the copied prompt, then upload the resulting transparent PNG back into GarageOS. Copying the prompt is the entire integration.

The copied prompt must be stored as maintainable application copy/constant rather than assembled ad hoc in the component, and should preserve this intent:

```text
Prepare the attached business logo for use in GarageOS.

Preserve the logo's original design exactly. Do not redesign it, change the wording, replace the typography, alter the proportions, add effects, or invent missing elements.

Remove the background completely and return the logo as a clean PNG with a transparent background.

Requirements:
- transparent background
- preserve original colors
- preserve sharp edges and fine details
- remove halos, white borders, shadows, or background artifacts caused by the original image
- center the logo with reasonable transparent padding
- do not crop any part of the logo
- high-quality output suitable for a business website, invoices, booking pages, and application UI
- target approximately 2000 px on the longest side when the source quality permits
- PNG output
- do not place the logo on a mockup or colored background

If the source is low resolution, clean and enhance it conservatively without changing the actual logo design.

Return only the prepared logo image.
```

UX requirements for the helper:
- one-tap copy with visible copied/success feedback;
- concise instructions to attach the original logo and upload the returned PNG;
- usable on phone without blocking camera/device upload;
- EN/FR copy following existing localization conventions;
- no claim that GarageOS itself processed or generated the logo;
- no dependency on ChatGPT availability for completing the demo.

GarageOS should still validate and normalize the returned upload exactly like any other logo. Leave room for future AI extraction/background removal, but do not make V1 depend on it.

### Photos

Reuse current image/storage patterns and `sharp`:
- EXIF rotation
- max dimensions
- efficient WebP
- safe type/size validation

Map:
- cleaned logo → `logoUrl`
- storefront → `bookingCoverImageUrl`
- interior → `bookingShopImageUrl`

## 8. Start customer experience

Create the real Shop associated with SalesDemo and provision existing safe defaults/sender identities as appropriate.

Do not create a paid Stripe subscription.

Reuse current SUPER_ADMIN impersonation/session architecture. Keep the real platform identity recoverable and always provide Exit Demo.

## 9. Reuse real onboarding

Prepopulate Sales-collected business/branding data and run the real onboarding:
Business → Fiscal/branding → Services → Hours → Design.

Allow back/forward/revisit. Persist changes on the real Shop.

At Plan, Sales Demo diverges:

- normal shop: plan → Stripe;
- active authorized demo: select Core/Pro/Complete → continue without Stripe.

Implement an explicit Sales-demo completion path. Normal shops must remain unable to bypass payment.

## 10. Demo entitlements

The selected demo tier must exercise the **real entitlement system**.

Switching Core/Pro/Complete should make existing gates react naturally. Do not create a second feature matrix or hardcode individual pages.

Integrate centrally with effective subscription resolution, while keeping a demo semantically distinct from:
- paid
- Stripe-backed
- trial
- normal commercial ACTIVE subscription.

Audit downstream consumers before changing `EffectiveSubscription`.

## 11. Persistent Sales Demo toolbar

Inside an authorized active demo, show something like:

**SALES DEMO · Garage Dupont · Viewing: Pro ▾ · Restart · Convert to customer · Exit**

Requirements:
- only visible to authorized platform/Sales actor;
- responsive compact mobile treatment;
- does not cover mobile navigation/content;
- tier switch updates demo entitlements immediately;
- tier switch never calls Stripe, commercial `changeShopPlan()`, billing email, or subscription mutation.

## 12. Real communications

Demo must send **real SMS and real email** through the existing stack.

Preserve outbox, idempotency, delivery tracking, fallback, sender identities, rate limits, STOP/START and transactional rules.

Critical billing rule: **demo SMS must never create Stripe meter events/overage charges.**

Implement this at a central boundary. Demo SMS usage can still be measured internally. Ensure retries/background overage reconciliation cannot later bill messages that were sent while the shop was a demo—even after conversion.

Normal paid-shop SMS overage behavior must remain unchanged.

## 13. Optional quick demo scenario

Do not automatically seed fake data.

Offer **Load quick demo scenario** for a small coherent set such as client, vehicle, appointment, quote, work order, invoice, and optionally DVI/tire example.

Also allow empty/live demos using the prospect's real phone/email.

Synthetic records must carry an explicit seed/batch identity. Never infer fake records later by names/content.

## 14. Restart

Restart must not be generic destructive tenant deletion.

Preserve prospect identity and useful preparation assets (logo/photos). Reset only the intended demo/onboarding state. If real prospect-entered operational data might be destroyed, require explicit confirmation.

## 15. Booking Page

Use the real Booking Page renderer/configuration. No Sales-only renderer.

Show real branding, services, images and public page. Existing plan downgrade/fallback semantics must continue when switching demo tiers.

## 16. Convert Demo → Customer

Toolbar action: **Convert to customer**.

Responsive handoff form:
1. Owner name
2. Owner email
3. Final plan (default current demo plan)
4. Monthly / Annual
5. Concise summary of what stays
6. **Send activation link**

The salesperson does **not** collect the card and does **not** create a password.

After sending, demo state becomes `ACTIVATION_SENT`.

## 17. Owner activation email

Send an email in the quality/style of the existing verification flow:

**Your GarageOS is ready**

The shop has already been prepared. CTA: **Activate my GarageOS account**.

Use secure token principles already present in `email-verification.ts`, but use a dedicated activation domain/model/identifier if safer.

Requirements:
- cryptographically secure
- single use
- expiring
- bound to SalesDemo + intended owner email
- no cross-shop activation
- replay safe
- resend supported
- old links invalidated appropriately

Sales workspace needs **Resend activation**.

## 18. Owner/account collision handling

Respect `User.email` uniqueness.

Handle explicitly:
A. email does not exist  
B. email already belongs to intended shop  
C. email belongs to another shop/account  
D. email belongs to SUPER_ADMIN  
E. activation already consumed

Never silently reassign an existing user across shops.

On successful activation:
- create/link OWNER safely;
- mark owner email verified (the activation click proves ownership);
- bind owner to prepared Shop;
- move lifecycle to `AWAITING_PAYMENT`.

Do not send a second redundant email verification.

## 19. Activation → final payment only

After activation, **do not repeat onboarding**.

Take owner directly to the last commercial step: plan/payment.

Preselect the plan and Monthly/Annual choice sold by Sales.

UX:
**You're almost done**
Garage Dupont
**Pro — $299 CAD/month** (preselected)
**Start my GarageOS**

Then use the existing Stripe Checkout/billing implementation. Do not create a second Stripe path. Reuse current checkout, confirmation, webhook/sync and trial-eligibility rules.

## 20. Stripe success → Dashboard

After Stripe is truly confirmed:
- SalesDemo → `CONVERTED`
- demo entitlement override disappears permanently
- normal Subscription becomes sole entitlement source
- onboarding completion is finalized
- no Sales toolbar for owner
- redirect to `/admin/dashboard`
- keep the same Shop

Preserve branding, photos, booking configuration, services, hours, fiscal configuration and legitimate prospect-entered operational data.

Make finalization idempotent and safe whether webhook or browser confirmation arrives first.

## 21. Synthetic data cleanup

Never delete all demo operational data.

Only records explicitly created by **Load quick demo scenario** are eligible for automatic cleanup. Use the seed/batch identity. If relationship constraints make automatic cleanup unsafe, present an explicit conversion choice rather than guessing.

## 22. Awaiting conversion and expiration

If activation/payment is not completed, keep the lead visible:
- `ACTIVATION_SENT`
- `AWAITING_PAYMENT`
- Resume demo
- Resend activation

Do not count it as converted.

Store `expiresAt`. Expired demos must lose demo entitlement/access. Do not unexpectedly destroy an actively converting prospect. If destructive cleanup needs a future job, implement safe expiration/access now and document cleanup separately.

## 23. Commercial analytics

Audit platform overview/growth/MRR/churn/cohorts/shop counts.

Demo shops must not distort:
- MRR
- paying/active customer counts
- commercial signup cohorts
- churn/cancellations

Sales metrics may separately count demos created, activation sent, awaiting payment and converted.

## 24. Security

Every Sales action must server-validate:
- authenticated authorized platform actor
- SalesDemo ↔ Shop relationship
- impersonated Shop ↔ expected demo
- token ↔ expected demo/email
- plan enum
- billing interval
- redirects

Never trust browser-supplied `shopId`, `demoId`, plan, email or redirect.

OWNER/MECHANIC/VIEWER must not access Sales actions or change demo tier.

## 25. Responsive/accessibility requirements

Every new screen/component is intentionally responsive at 375/430/768/1024/1440px.

Pay special attention to:
- Sales workspace/cards
- create-demo form
- camera/upload controls
- logo editor
- image previews
- Sales toolbar
- plan switcher
- Convert modal/page
- activation/payment handoff
- long garage names
- French text
- fixed/sticky UI
- touch targets

No horizontal scrolling.

Preserve labels, keyboard access, focus states, accessible dialogs, alt text, contrast, disabled/loading states and non-hover alternatives.

## 26. Internationalization

Follow current GarageOS localization conventions. Owner-facing activation/payment must not become English-only if the surrounding flow supports FR/EN. Do not invent a new i18n framework.

## 27. Prisma/migrations

Use a new proper Prisma migration. Never edit an applied migration.

Validate relations, cascades, indexes, unique constraints, activation lifecycle and conversion lifecycle.

## 28. Tests

At minimum cover:

1. normal shop cannot bypass Stripe;
2. active demo gets selected tier entitlements;
3. Core → Pro → Complete changes gates;
4. expired demo loses demo access;
5. converted demo no longer uses demo override;
6. normal `completeOnboarding` protection remains;
7. demo completion requires Sales/platform authorization;
8. OWNER cannot modify demo tier;
9. demo SMS never reports Stripe overage;
10. normal paid SMS overage unchanged;
11. activation single-use;
12. activation expiry;
13. wrong shop/email activation rejected;
14. resend invalidates/replaces old token;
15. existing-user collisions safe;
16. successful Stripe conversion removes override;
17. converted shop retains configuration;
18. seed cleanup only touches marked synthetic data;
19. MRR excludes demos;
20. commercial metrics exclude demos where appropriate;
21. tenant isolation;
22. unauthorized `/platform/sales` rejected.

Run the repository's full validation suite, including `npm run check`, `npm run build`, tests and Prisma/migration validation.

## 29. Required implementation blocks

A. Schema + migration + Sales domain helpers  
B. Sales authorization + platform route/navigation  
C. Responsive workspace + create prospect  
D. Logo/photo capture/processing/storage  
E. Demo impersonation/session + toolbar  
F. Demo-aware entitlement resolution  
G. Demo onboarding divergence/no-Stripe plan step  
H. Real communications + SMS billing exclusion  
I. Quick scenario + seed tracking  
J. Convert form + activation email/token  
K. Owner activation + direct final payment step  
L. Stripe success → idempotent conversion → Dashboard  
M. Analytics exclusions + expiry  
N. Responsive/accessibility pass  
O. Tests/build/migration/final QA

## 30. Hostile QA checklist

Before completion verify:
- OWNER cannot call demo-plan action manually.
- Changing `demoId` cannot cross tenants.
- Expiration while open fails safely.
- Stripe success survives interrupted redirects.
- Webhook/browser confirmation order is irrelevant.
- Activation double-click is safe.
- Resent activation invalidates old link.
- Existing owner email conflicts are safe.
- Demo SMS overage retry never bills it later.
- Complete demo → Core purchase downgrades correctly.
- Booking Page fallback still works.
- Demo never appears in MRR/churn/customer counts.
- Deleting SalesDemo cannot delete converted Shop.
- Sales toolbar never appears to real customer.
- Normal onboarding still cannot bypass Stripe.
- 375px phone works with no overflow.
- Mobile camera upload works.
- Toolbar does not cover navigation.
- French copy does not break critical UI.

## 31. Definition of done

A SUPER_ADMIN can, from a phone:

1. Open `/platform/sales`.
2. Create prospect demo.
3. Enter shop/contact data.
4. Take/upload and prepare logo.
5. Optionally take storefront/interior photos.
6. Start real customer experience.
7. Walk real onboarding.
8. Select Pro without Stripe.
9. Enter real Dashboard.
10. Switch Core/Pro/Complete and see real gates change.
11. Create prospect as client.
12. Send real SMS and email/quote.
13. Show approval/work order/invoice.
14. Show branded real Booking Page.
15. Convert to customer.
16. Enter owner name/email + Pro Monthly.
17. Send activation.
18. Prospect receives **Your GarageOS is ready**.
19. Prospect activates; email becomes verified and OWNER is safely created/linked.
20. Prospect lands directly on final payment step with Pro Monthly preselected.
21. Prospect enters card in Stripe Checkout.
22. Stripe confirmation converts the same Shop.
23. Demo override disappears.
24. Prospect lands on `/admin/dashboard`.
25. Real configuration remains.
26. Synthetic seed data is safely handled.
27. Demo SMS generated no Stripe overage charge.
28. Normal billing/security behavior remains unchanged.
29. Entire flow works on phone, tablet and desktop.

## 32. Agent instructions

This file is the implementation handoff. Read it completely before editing. Do not ask for a separate product plan when the answer is already defined here.

Work only on the requested wave. For a Wave 1 assignment, implement **A–G only** and do not opportunistically begin H–O. For Wave 2 or Wave 3, likewise respect the boundaries above.

Do not stop after planning.

For the assigned wave: **audit current code → implement → create proper migration when required → add/update tests → run validation → hostile QA → report.**

Before editing, reconcile this document against current `main`. Reuse newer/safer repository patterns when they exist; internal names in this document are suggestions unless explicitly stated as product/security requirements. Do not duplicate existing systems.

Provider safety:
- never print or commit secrets;
- do not trigger real Twilio, Resend, Stripe or QBO side effects merely to prove implementation;
- deterministic/mocked tests are the default during development;
- real Production provider validation is a separate explicitly-authorized activity;
- do not run a repository command against Production if it can execute migrations or side effects; use the repository's safe validation/build path where available.

Git/review discipline:
- keep each wave on its own branch/PR unless the human explicitly requests otherwise;
- do not mix unrelated cleanup/refactors into the Sales Demo PR;
- never edit an applied migration;
- preserve a clean diff and explain any necessary change outside the expected feature area;
- if a required change would materially weaken an existing security, tenant-isolation, billing or provider invariant, stop and report the conflict instead of bypassing it.

At completion report:
1. implementation summary;
2. migrations;
3. main files changed;
4. security decisions;
5. demo entitlement isolation;
6. SMS billing exclusion;
7. activation/conversion behavior;
8. responsive work;
9. tests/results;
10. `npm run check`;
11. `npm run build`;
12. remaining risks/manual infrastructure;
13. exact assigned-wave acceptance criteria proven;
14. anything intentionally deferred to the next wave.

For **Wave 1**, the implementation agent should stop after A–G are complete, validated and reviewable. Do not implement real demo communications, quick-scenario seeding, activation, conversion, payment handoff, analytics exclusions or final conversion lifecycle in Wave 1 except for minimal schema/domain hooks strictly required to make A–G safe.
