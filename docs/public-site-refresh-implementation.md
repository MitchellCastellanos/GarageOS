# GarageOS public-site refresh — implementation plan

**Date:** 2026-09-13

This document translates `docs/public-product-surface-gap.md` into an implementation-ready refresh of the public GarageOS site.

The visual direction of the current marketing site is already strong and should be preserved. This is primarily a **content architecture + product representation update**, not a redesign.

The public site should communicate GarageOS as a connected operating workflow for an independent auto shop:

> booking → customer/vehicle → appointment → inspection → estimate → approval → Work Order → job status → Ready for Pickup → invoice/payment → history → maintenance reminder

with inventory, communications, reports, branding and multi-location around that core flow.

The refresh should remain simple, polished and believable. Do not turn the homepage into a giant feature catalog.

---

# 1. Homepage

Current order:

1. Hero
2. FeatureStrip
3. ToolsSection
4. BrandControlSection
5. BuiltForSection
6. Testimonials
7. PricingSection
8. CTASection

Target order:

1. Hero
2. FeatureStrip
3. **WorkflowSection — new**
4. **FeatureHighlightsSection — replace/rework current ToolsSection**
5. BrandControlSection
6. BuiltForSection
7. **ManagementSection — new/lightweight**
8. Testimonials or equivalent social-proof slot
9. PricingSection
10. CTASection

Keep the current spacing, max widths, rounded cards, slate/white sections, blue accents, navy sections and overall visual tone.

## Hero

Keep the existing two-column structure and dashboard mockup.

The hero should position GarageOS as the system that follows the entire customer/job lifecycle, not just scheduling + invoices.

Recommended English direction:

**Eyebrow**
`Auto shop management software`

**Headline**
Keep the current strong headline unless a clearly better alternative appears:

`Less admin.`
`More wrench time.`

**Description**
Replace the current generic feature list with:

`Run the whole job in one place — from booking and inspection to customer approval, work orders, payment and the next service reminder.`

**Bullets**
- `Keep every job organized`
- `Keep customers in the loop`
- `Bring customers back`

Keep primary CTA → `/get-started` and secondary CTA → `/demo`.

French should communicate the same outcome naturally, not word-for-word awkward translation.

### Dashboard mockup

Update marketing data so it better represents the product:

Stats:
- Appointments today
- Jobs in service
- Awaiting approval
- Ready for pickup

Recent activity examples:
- Inspection completed
- Estimate approved
- Vehicle marked Ready for Pickup
- Invoice paid

The mockup should visually imply the real GarageOS workflow without attempting to reproduce every admin page.

Do not add VIN anywhere.

---

# 2. FeatureStrip

Keep this compact strip exactly as a quick visual scan.

Use eight broad categories rather than obscure implementation details:

1. Appointments & Booking
2. Digital Inspections
3. Estimates & Approvals
4. Work Orders
5. Customer Updates
6. Invoicing & Payments
7. Vehicle History
8. Inventory & Reports

French equivalent required.

The purpose of this strip is breadth, not explanation.

---

# 3. New WorkflowSection

Create `src/components/marketing/WorkflowSection.tsx`.

Place immediately after FeatureStrip.

Purpose: this is the main new section. It explains GarageOS as one continuous workflow.

Suggested heading:

**Eyebrow**
`One connected workflow`

**Heading**
`From booking to the next visit.`

**Description**
`GarageOS keeps the customer, vehicle, approval, work and payment connected from start to finish.`

Render six stages:

### 1. Book
`Online or front-desk appointments, customers, vehicles and scheduling.`

### 2. Inspect
`Record vehicle condition, findings, notes and photos with a digital inspection.`

### 3. Approve
`Turn recommended work into a clear estimate and capture the customer's decision.`

### 4. Repair
`Move approved work into the Work Order, track job status and keep the front desk aligned.`

### 5. Pay
`Invoice completed work, record payment and keep the service history together.`

### 6. Return
`Create maintenance reminders and follow up when the vehicle is due back.`

Desktop: six connected steps across a horizontal or 3x2 layout with subtle connectors.

Mobile: vertical stacked sequence.

Use Lucide icons already available in the project. Do not add another icon dependency.

The section must fit the existing GarageOS design language. Avoid timeline gimmicks, gradients everywhere or oversized illustrations.

---

# 4. FeatureHighlightsSection

The current `ToolsSection` is visually good but its two-column bullet list now carries too much product scope.

Rework it into 4–6 strong product highlights. It can remain `ToolsSection.tsx` internally if that minimizes churn, or be renamed if clean.

Recommended highlights:

### Digital vehicle inspections
`Capture findings, notes and photos while the vehicle is in the shop — then turn recommended work into an estimate without retyping it.`

### Customer approvals
`Send a clear estimate and keep a traceable record of what the customer approved.`

### Job status + Ready for Pickup
`Know where each vehicle stands and optionally notify the customer when the job is ready.`

### Maintenance reminders
`Keep future service needs attached to the customer and vehicle so the next visit does not get forgotten.`

### Complete vehicle history
`Appointments, inspections, estimates, work and invoices stay connected to the vehicle record.`

### Built to run the shop
`Inventory, reporting, team access and multi-location tools give owners visibility beyond a single job.`

Preferred layout: cards or alternating highlight blocks rather than two long checklist columns.

Keep a CTA to `/features`.

Remove the fake quote currently embedded inside ToolsSection unless there is a verified testimonial available.

---

# 5. BrandControlSection

Keep this section and its current visual structure.

Expand the copy from only confirmations/estimates/invoices to the full customer-facing experience:

`Your customers see your shop — from booking and approvals to inspection results, status updates and invoices. GarageOS stays behind the scenes while your logo, contact information and communication identity stay front and center.`

Phone mockup should preferably show a **Ready for Pickup** message instead of only appointment confirmation because it better demonstrates the newly completed workflow.

Example:

Title:
`Your vehicle is ready`

Body:
`Hi James, your 2019 Honda Civic is ready for pickup at Riverside Auto.`

Button can be omitted or use a neutral action only if the real product supports it.

Invoice mockup:

Change:
`2019 Honda Civic · VIN: ...`

to:
`2019 Honda Civic`

No VIN references anywhere in public marketing.

---

# 6. BuiltForSection

Preserve the navy section and visual treatment.

Make the positioning more explicit:

GarageOS is primarily designed around the owner/front desk/service-advisor workflow. Mechanics should not need to operate a complex project-management system all day.

Recommended copy direction:

**Heading**
`Built for independent shops — not enterprise process.`

**Description**
`GarageOS gives the front desk and owner one clear place to run the day while keeping technician interaction simple when it is needed. It works for a small single-location shop and can grow into multiple locations.`

Avoid implying technician time tracking, payroll or kanban/work-board functionality.

---

# 7. New ManagementSection

Create one compact section after BuiltForSection.

Purpose: communicate the capabilities that matter to an owner but do not belong in the customer/job timeline.

Suggested heading:

`Run more than the job.`

Four cards:

### Inventory & parts
Track stock and movement history.

### Reports & visibility
See shop activity and business performance without rebuilding the day in spreadsheets.

### Multi-location
Operate multiple shop locations with shared access where configured.

### Communications & branding
Manage customer messaging and keep the shop's brand in front of customers.

Do not advertise Tire Storage, QuickBooks or Data Import as available until those features are actually implemented.

---

# 8. Testimonials / social proof

Current testimonials and shop names appear real but are not backed by known evidence in the repository.

Do not publish fake customer quotes as real testimonials.

Preferred current solution:

- remove `Testimonials` from the homepage temporarily; or
- replace it with a neutral product-value section that does not pretend to quote customers.

Do not replace fake testimonials with other invented testimonials.

When real pilot customers provide permission/quotes, this section can return.

---

# 9. CTASection

Remove unsupported claim:

`Join hundreds of garages already running on GarageOS.`

Replace with something factual.

Recommended English:

**Eyebrow**
`Ready to get started?`

**Heading**
`Run your next job in GarageOS.`

**Description**
`Set up your shop and start bringing your workflow into one place.`

CTA:
`Get Started`

French equivalent required.

---

# 10. Product page

Create `src/app/product/page.tsx`.

This page answers **how GarageOS works**, while `/features` answers **what GarageOS includes**.

Use `MarketingPageShell` and existing visual language.

## Hero

Eyebrow:
`Product`

Heading:
`One system from booking to the next visit.`

Description:
`GarageOS connects the customer, vehicle, inspection, approval, work, payment and future service in one workflow.`

## Main workflow

Use the same six-stage model as homepage, with more detail:

- Book
- Inspect
- Approve
- Repair
- Pay
- Return

Each step should explain what GarageOS stores/connects and what the shop gains.

## Customer-facing experience

Explain:

- branded booking;
- estimates/approvals;
- DVI results where available;
- job-status/Ready notifications;
- invoices/documents.

## Front-desk-first operation

Explain that the owner/front desk can run the workflow without requiring mechanics to constantly interact with GarageOS.

## Management layer

Show Inventory, Reports, Multi-location and Communications.

CTA → `/get-started` and `/demo`.

Add metadata reflecting full workflow.

---

# 11. Features page

Replace the current eight-card flat grid with grouped capability sections.

Keep page visually lightweight.

## Group 1 — Schedule & customers

- Online booking
- Front-desk appointments
- Customer records
- Vehicle records
- Vehicle/service history
- Team assignment

## Group 2 — Inspect & authorize

- Digital Vehicle Inspections
- Inspection notes/photos
- Estimates
- Customer approval flow
- Approval history/audit trail
- Findings → recommended work/estimate where supported

## Group 3 — Run the job

- Work Orders
- Job status
- Ready for Pickup notifications
- Parts/labour
- Inventory

## Group 4 — Communicate & retain

- Email/SMS notifications
- Maintenance reminders
- Campaigns
- Branded communications
- Custom sending/domain configuration where supported

## Group 5 — Invoice & manage

- Invoicing
- Payment recording
- Receipts/documents
- Reports
- Multi-location

Do not include as available yet:

- VIN lookup/scanning
- Work Board/kanban
- two-way SMS
- Purchase Orders/Suppliers
- full accounting
- QuickBooks until implemented
- Tire Storage until implemented
- Data Import until implemented
- public API except clearly labeled future/coming soon where already appropriate

Keep `#branding` anchor working because BrandControlSection links to it.

---

# 12. Demo page

Replace the current four-step text walkthrough with a complete sample visit.

Hero:

`One vehicle. The whole workflow.`

Description:
`Follow a customer visit from booking through inspection, approval, repair, payment and the next reminder.`

Use approximately eight steps:

1. **Book the visit** — appointment, customer, vehicle.
2. **Check in the vehicle** — confirm the job/context.
3. **Inspect** — DVI findings + photos.
4. **Estimate & approve** — recommended work and customer decision.
5. **Run the Work Order** — approved work moves into execution.
6. **Update the customer** — status progresses to Ready for Pickup; notification when enabled.
7. **Invoice & record payment** — complete financial record.
8. **Keep the relationship going** — history + maintenance reminder.

The demo should feel visual even if no screenshots are available. Use lightweight UI-like sample cards/status chips within the existing style rather than plain text boxes only.

Links should point to relevant `/features`, `/guides` and `/get-started` destinations.

---

# 13. Get Started vs Quick Start

Keep existing `/get-started` as the **pre-signup sales/onboarding explanation**.

Update its copy so it does not stop at appointments/quotes/invoices.

Recommended four steps:

1. Create your account.
2. Set up your shop and booking.
3. Add your team and customers/vehicles.
4. Run your first job end-to-end.

The last step should mention inspection, approval, Work Order, customer updates, invoice and reminders at a high level.

Create `/quick-start` as a separate **practical setup guide** for an owner who already has access.

Quick Start contents:

1. Shop identity + timezone/language/business details.
2. Hours + online booking.
3. Team.
4. First customer and vehicle.
5. First appointment.
6. First estimate + approval.
7. Work Order.
8. DVI.
9. Status + Ready notification settings.
10. Invoice + payment.
11. Maintenance reminder.
12. Optional: inventory, communications/domain, additional location.

Use deep links to actual admin routes only after checking `src/lib/routes.ts` and current admin paths.

Do not invent admin URLs.

---

# 14. Help Center and Guides

The current data-driven `marketing-resources.ts` architecture is sufficient. Extend it rather than introducing a docs CMS.

Add guides only for features that exist on the branch being implemented.

Required guide coverage after Status/Reminders/DVI and Work Orders are present:

- Run a job from estimate to Work Order
- Perform a Digital Vehicle Inspection
- Turn inspection findings into recommended/estimated work
- Manage job status and Ready for Pickup notifications
- Set up and manage maintenance reminders
- Manage inventory and stock adjustments
- Use multiple GarageOS locations
- Configure branded customer communications
- Understand estimate/customer approval history

Update existing `estimate-to-invoice` guide so it reflects the real workflow rather than skipping Work Orders if the current code no longer does so.

Help Center should group content by category once guide count grows:

- Getting started
- Customers & vehicles
- Scheduling
- Estimates & approvals
- Work Orders
- Digital inspections
- Invoices & payments
- Communications
- Inventory
- Reports & locations

A simple client-side search/filter is acceptable if useful, but do not build a new documentation platform.

---

# 15. Integrations page

Reframe the page so implementation infrastructure is not confused with user-facing integrations.

Do not make Resend/Twilio sound like integrations the average shop owner must understand unless they actually configure their own credentials.

Use two conceptual groups:

### GarageOS delivery capabilities

Explain email/SMS/document delivery and configuration requirements in user language.

### External integrations

Only list actual shop-facing external systems.

QuickBooks should appear only after the integration exists.

Payment processing and external calendar sync can remain clearly unavailable/future if useful, but do not fill the page with a long “not available” catalog.

Re-check whether Google Drive remains relevant enough to be prominently displayed.

---

# 16. Navigation

Update `MarketingHeader` so:

- Product → `/product`
- Features → `/features`
- Pricing can continue to → `/#pricing`
- Resources dropdown remains

Resources menu should include:

- Help Center
- Quick Start
- Guides
- Blog
- Changelog

Footer Product links should include Product, Features, Demo, Integrations and Pricing as appropriate.

Footer Resources should include Quick Start, Help, Guides, Blog and Changelog.

Preserve desktop/mobile accessibility behavior already implemented in MarketingHeader.

---

# 17. Marketing locale

Homepage/header/footer shared marketing copy currently uses `src/lib/marketing-locale.ts` and must remain bilingual EN/FR.

Add dictionary structures for new homepage sections instead of hardcoding English inside client components.

At minimum localize:

- WorkflowSection
- FeatureHighlights/ToolsSection
- ManagementSection
- navigation additions
- refreshed BrandControl/BuiltFor/CTA copy

Do not break the existing locale provider or auth marketing copy.

Public long-form pages are currently mostly English. It is acceptable for this refresh to keep that architecture if converting all resources to bilingual would materially expand scope, but do not make EN/FR support worse than it is today.

---

# 18. Pricing

Do not invent new plan entitlements during this refresh.

Keep existing prices/tiers unless another authoritative pricing document in the repo supersedes them.

Do remove or revise individual feature bullets that are factually stale.

The page/home pricing should not promise:

- API access as currently available;
- QuickBooks before implementation;
- Tire Storage before implementation;
- Data Import before implementation.

If there is uncertainty about a feature's tier, use broader existing plan language rather than making a new product decision.

---

# 19. Claims cleanup

Across all public routes and shared copy, remove or fix:

- VIN references;
- `Join hundreds of garages...` or unsupported traction claims;
- fake testimonials presented as real;
- claims that GarageOS processes card payments if it currently only records externally collected payments;
- stale Work Order descriptions that actually mean estimate→invoice;
- two-way SMS claims;
- supplier/purchase-order claims;
- full-accounting claims;
- Work Board/kanban implications;
- stale single-location-only language.

Keep future features clearly future.

---

# 20. Files expected to change

Existing files likely involved:

- `src/app/page.tsx`
- `src/app/features/page.tsx`
- `src/app/demo/page.tsx`
- `src/app/get-started/page.tsx`
- `src/app/help/page.tsx`
- `src/app/guides/page.tsx`
- `src/app/integrations/page.tsx`
- `src/app/changelog/page.tsx`
- `src/lib/marketing-locale.ts`
- `src/lib/marketing-resources.ts`
- `src/components/marketing/Hero.tsx`
- `src/components/marketing/DashboardMockup.tsx`
- `src/components/marketing/FeatureStrip.tsx`
- `src/components/marketing/ToolsSection.tsx`
- `src/components/marketing/BrandControlSection.tsx`
- `src/components/marketing/BuiltForSection.tsx`
- `src/components/marketing/Testimonials.tsx`
- `src/components/marketing/CTASection.tsx`
- `src/components/marketing/MarketingHeader.tsx`
- `src/components/marketing/MarketingFooter.tsx`
- `src/components/marketing/ResourceArticles.tsx` if categorization/search needs it

New files likely:

- `src/components/marketing/WorkflowSection.tsx`
- `src/components/marketing/ManagementSection.tsx`
- `src/app/product/page.tsx`
- `src/app/quick-start/page.tsx`

Additional small components are fine if they genuinely reduce duplication.

Do not perform unrelated architecture rewrites.

---

# 21. Availability rule

Before changing marketing copy for Work Orders, DVI, job status/customer notifications or maintenance reminders, inspect the current branch/repository state.

Only present a capability as currently available if the underlying implementation is actually present on that branch.

If this refresh runs before the in-progress feature PR is merged, keep copy ready but do not falsely publish those capabilities as completed.

The public site must describe the product that exists at merge time.

---

# 22. Final validation

After implementation:

1. Run the repository's normal lint/check/typecheck/test commands.
2. Run the production build.
3. Fix issues introduced by this refresh.
4. Smoke-test public routes at minimum:
   - `/`
   - `/product`
   - `/features`
   - `/demo`
   - `/get-started`
   - `/quick-start`
   - `/help`
   - `/guides`
   - `/blog`
   - `/integrations`
   - `/changelog`
   - `/contact`
5. Check desktop and mobile layouts.
6. Check EN/FR switching on the homepage/header/footer.
7. Verify header dropdown keyboard/Escape behavior still works.
8. Verify all internal links resolve.
9. Verify no horizontal overflow.
10. Search the public source for stale terms/claims:
    - `VIN`
    - `hundreds of garages`
    - `two-way`
    - `purchase order`
    - unsupported accounting/payment claims
11. Confirm no public page advertises an unimplemented feature as available.

The final public experience should still look unmistakably like the current GarageOS site — just substantially more complete, coherent and representative of the product.