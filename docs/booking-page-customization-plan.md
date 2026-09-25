# Booking Page Customization — Implementation Plan

## Goal

Turn the existing public booking landing into a **guided, constrained, branded booking website** for each shop without turning GarageOS into a website builder.

The implementation is the goal. This document records product intent and the current architecture so the implementation can be reviewed against the real codebase. **Audit the current repository first and change this proposal where the existing architecture suggests a cleaner or safer solution.** Preserve existing behavior unless the feature intentionally changes it.

## Current state verified in the repository

Public page:
- `src/app/book/[slug]/page.tsx`
- Current composition: `SiteHeader -> Hero -> QuickServicesStrip -> ServicesSection -> OurShopSection -> BookingSection -> ContactSection -> SiteFooter`.
- Embed mode (`?embed=1`) renders the booking section only and must remain lightweight and functional.

Current branding:
- `Shop.logoUrl` and `Shop.brandColor` already exist.
- Existing settings/actions already support logo upload and brand color.
- Hero and Our Shop currently both use the static `/garage-exterior.png`.
- Brand-color safety logic already exists; reuse/extend it rather than creating parallel color logic.

Current services:
- Real booking catalog is `ShopBookingService`.
- Fields currently include FR/EN/ES labels, duration, active state and sort order.
- The actual booking form receives active services from `getShopServiceCatalog()`.
- **Important:** `QuickServicesStrip.tsx` and `ServicesSection.tsx` currently use a hardcoded five-service marketing set and hardcoded Lucide icon mapping. They are not the shop's real catalog.
- This feature should remove that disconnect: public service presentation and booking selection should derive from the same shop service catalog.

Plans:
- GarageOS already has CORE / PRO / COMPLETE and an entitlement system under `src/config/entitlements`.
- Use the existing entitlement pattern and billing/plan UI. Do not create an unrelated permission mechanism.

## Product principles / non-goals

1. This is a configurator, **not a page builder**.
2. No drag-and-drop.
3. No arbitrary section ordering by the user.
4. No custom CSS, font upload, font-size controls, spacing controls, border-radius controls, secondary-color system, etc.
5. One real service catalog is the source of truth.
6. Existing shops must not suffer a visual/functional regression after migration.
7. The four templates are curated compositions of shared data/components, not four independent websites that drift apart.
8. Responsive/mobile behavior is first-class.
9. The initial setup should feel guided but short. After setup, the same route should behave as an editor rather than forcing the wizard every time.
10. UI copy must follow GarageOS's existing localization architecture.

---

## Desired customization

### Existing identity
Reuse:
- shop name
- logo
- primary/brand color
- phone/address/contact data
- existing booking configuration
- real booking service catalog

### New images
Add two shop-owned images:
1. **Cover / hero image** — guidance should ask for a wide exterior/facade or representative shop photo.
2. **Shop / about image** — guidance should ask for interior, service bays, equipment/team/work area.

Do not call them merely "Hero image" in customer-facing UI. Explain what photo to upload and recommend dimensions/aspect ratio.

Use existing storage/upload conventions if appropriate. Validate type/size, optimize images, and provide robust fallback behavior. Existing static garage imagery/design fallback should keep old shops looking intentional until they upload photos.

If the current storage architecture makes focal-point metadata worthwhile at low cost, implement it cleanly; otherwise do not expand scope solely for it.

### Templates

Four curated layouts:

1. **CLASSIC**
   - Closest to today's public booking page.
   - Large photographic hero with overlay.
   - Floating/light featured-services strip.
   - Conventional service cards.
   - Dark Our Shop section.
   - This is the backwards-compatible/default template.

2. **MODERN**
   - Split hero: copy/CTA + image.
   - Lighter, cleaner presentation.
   - Featured-service treatment visually integrated around/below hero.
   - Modern card treatment for services and shop content.

3. **BOLD**
   - Strong automotive/performance personality.
   - Large hero typography/image.
   - Featured services become a prominent solid brand-color band.
   - Stronger use of primary color and condensed/strong typography.
   - Booking remains clear and accessible, not decorative at the expense of usability.

4. **MINIMAL**
   - More whitespace/premium presentation.
   - Cleaner navigation/hero and less card-heavy service presentation.
   - Same underlying content and booking functionality.
   - Suitable for specialized/premium shops.

Exact component boundaries are an implementation decision. Prefer shared primitives/data contracts with template-specific composition/styles rather than copy-pasted pages.

### Typography

Use a **small curated set of typography styles/pairings**, not a free font picker. Approximately four styles is the target, e.g. Modern / Classic / Garage / Premium.

Each typography option may define heading font, body font, weights and tracking as a coherent preset. Use the framework's existing/appropriate optimized font-loading approach. Avoid loading an excessive font payload.

Names/fonts in this document are not sacred. Choose pairings that fit the design and technical constraints.

### Primary color

Continue using the existing `brandColor` as the single user-selected accent color. Do not add a second arbitrary color.

Templates may derive safe hover/subtle/contrast variants programmatically. Preserve accessibility/contrast safeguards.

---

## Services: fix the current architecture as part of this feature

The public landing should stop presenting hardcoded generic services when the shop has a real catalog.

Extend the existing service catalog only as much as needed for public presentation. Likely metadata:
- `iconKey` (curated GarageOS/Lucide-compatible icon identifier)
- `isFeatured` (whether it appears in the compact featured-services treatment)
- existing `sortOrder` should determine stable display order where appropriate.

Review whether any additional "public" flag is actually necessary before adding one. Avoid redundant flags if `isActive` already expresses the correct business rule.

### Icon picker

In the existing Services admin UI, add a curated automotive icon picker. Do **not** allow arbitrary icon/image uploads per service.

Provide a useful but finite vocabulary such as oil, tires, brakes, battery, diagnostics, engine, wrench/general repair, alignment, suspension, A/C, transmission, exhaust, inspection, detailing, etc. Use one consistent icon family.

Define a safe fallback icon for existing/new services without an explicit icon.

### Featured services

Allow a small bounded number of featured services (target around 5; choose the exact limit after checking UI/mobile constraints).

The four templates should each render featured services in their own visual treatment:
- Classic: floating/light strip
- Modern: integrated clean icon strip/cards
- Bold: strong brand-color service band
- Minimal: restrained compact row/list

They all consume the same catalog metadata.

The full Services section should also consume the real catalog rather than `SERVICE_KEYS` marketing constants. The booking form must continue consuming the actual active booking services.

Do not duplicate service names/descriptions in a separate booking-page configuration.

---

## Booking Page configuration UX

Create a dedicated **Booking Page** settings area/tab consistent with the current Settings architecture.

Keep the first-time flow short. Target four conceptual stages, but implementation can combine screens if that produces better UX:

### 1. Photos
"Make the page feel like your shop."
- Cover/exterior photo
- Shop/interior photo
- Show existing logo as already configured rather than forcing re-upload.
- Existing primary color can be shown but does not need editing here.
- Helpful photo guidance and immediate thumbnail feedback.

### 2. Choose template
Show the four templates as visual choices rendered with the shop's own name/logo/images/services where practical.
- Classic is the safe/default option.
- User should understand the difference visually without reading technical descriptions.
- A larger preview can be available.
- This stage is also where plan locks become visible.

### 3. Customize style
This is where the **large live preview becomes central**.
Controls:
- typography preset
- primary color (reuse current field)
- desktop/mobile preview toggle

Changes are local/draft until saved/published. Do not mutate the live public page on every click.

### 4. Review & Publish
No new design decisions.
- large final preview
- concise summary
- publish/save action
- after success, show/open/copy public booking URL using existing routing/domain logic.

If the current application already has a better draft/save convention, follow it. Avoid introducing a large publishing subsystem solely for this feature. The core requirement is that experimentation in the configurator must not accidentally alter the public page before the user confirms.

### Returning users

Do not force a first-time wizard forever. Once configured, `Booking Page` should work as a compact editor where photos/template/style/preview can be revisited directly.

Choose the cleanest way to determine configured state after auditing existing patterns. A dedicated timestamp/flag is acceptable only if useful; do not add schema merely because this document suggests it.

---

## Preview

The preview should reuse the same rendering primitives/configuration as the public page so it does not become a fake screenshot that diverges from production.

Requirements:
- shop's actual data
- selected template
- selected typography
- selected color
- uploaded/draft image previews
- real service metadata
- desktop/mobile modes
- responsive enough to represent actual output

Prefer a shared renderer/config object. Whether this is rendered directly, through a preview component, or another architecture is up to the repository audit. Avoid iframe complexity unless it materially improves correctness.

---

## Plan tiers / entitlements

Build gating now, using the existing entitlement architecture, and surface the feature in existing Plans/Billing UI.

Product intent:

### CORE
- public booking page
- Classic template
- logo
- brand color
- two shop photos
- real services/icons/featured services
- preview
- normal booking functionality

### PRO and COMPLETE
- everything above
- all four templates
- typography customization/presets
- advanced booking-page customization

Do **not** artificially reserve one of the four templates for COMPLETE just to create another tier. COMPLETE can retain its broader existing value proposition.

Custom domains and GarageOS branding/removal should follow/reconcile with **existing entitlements** rather than this document inventing conflicting rules.

### Upsell behavior

Locked premium designs should remain previewable by CORE users if feasible:
- allow them to see their own shop in Modern/Bold/Minimal and typography presets
- clearly mark them as PRO
- provide the existing upgrade/plans path
- prevent publishing/saving premium-only configuration without entitlement

This makes the personalized preview the upsell rather than hiding the feature.

### Security/enforcement

Entitlements must be enforced server-side in mutation/publish actions, not only with disabled UI. A crafted request from CORE must not persist a premium template/style.

Also decide safe downgrade behavior. Recommended principle: never break the public page. If a shop loses the required entitlement, public rendering must gracefully use an allowed configuration (likely Classic/default typography) while preserving the saved premium preference if that fits existing subscription conventions, so it can return on re-upgrade. Align with existing GarageOS downgrade semantics.

Update the existing plan comparison/billing UI to mention the new benefit, using concise customer-facing language such as "Advanced booking page customization" rather than implementation details.

---

## Suggested data model direction (not mandatory)

After auditing current patterns, the implementation will probably need shop-level booking-page configuration similar to:
- cover image URL
- shop/about image URL
- template identifier
- typography preset identifier
- optional configured/published state if genuinely necessary

Prefer enums or validated constants where they reduce invalid state, but follow existing Prisma/project conventions.

Service catalog likely needs:
- icon identifier
- featured boolean

Do not blindly use these field names. Pick names consistent with the codebase.

Migration must provide defaults that preserve today's experience:
- Classic template
- sensible default typography matching/approximating current design
- existing brand color
- existing static/fallback imagery until custom photos exist
- existing services remain bookable
- service icons have safe defaults

---

## Public page refactor

`src/app/book/[slug]/page.tsx` should remain the public entry point unless architecture provides a compelling reason otherwise.

Refactor toward a normalized public booking-page view model/config that can feed both the public renderer and preview. Avoid passing raw Prisma objects deep into client components unnecessarily.

Preserve:
- metadata/SEO behavior, improving it only where the new images/config make that straightforward
- locale switching FR/EN/ES
- anchors/navigation
- phone/address behavior
- booking availability rules
- WhatsApp behavior
- embed mode
- custom-domain routing
- accessibility
- current booking flow and server-side booking validation

Template-specific components must not fork booking business logic.

---

## Likely areas to inspect/change

This is a guide, not an exhaustive file mandate:

- `prisma/schema.prisma` + migration
- `src/app/book/[slug]/page.tsx`
- `src/components/booking/*`
  - Hero
  - QuickServicesStrip
  - ServicesSection
  - OurShopSection
  - shared/template renderer(s)
- `src/components/settings/ServiceCatalogSettings.tsx`
- settings page/tab navigation and dictionaries
- booking/settings server actions
- shop settings/image upload/storage helpers
- `src/lib/booking-slots.ts` or a new focused public-page data mapper
- `src/config/entitlements/*`
- billing/plans UI and copy
- tests for booking settings, services, entitlements and public rendering

Before editing, search the repo for every consumer of `ShopBookingService`, `SERVICE_KEYS`, `brandColor`, `logoUrl`, custom-domain entitlements and existing image-upload helpers.

---

## Implementation quality / edge cases

Handle at minimum:
- shop with no custom photos
- shop with one photo only
- broken/deleted image URL
- no featured services
- fewer than target featured count
- many active services
- service without icon
- service deactivated after being featured
- long FR/EN/ES labels
- mobile overflow in featured-service treatments
- missing phone/address/logo
- very light/unsafe selected brand color
- CORE attempting premium save directly
- PRO -> CORE downgrade
- booking disabled
- embed mode
- custom landing domain
- first-time shop vs already configured shop
- upload failure/retry
- unsaved changes/navigation away if the app already has a pattern for it

Do not add complexity for hypothetical cases that existing GarageOS architecture already solves.

---

## Tests / acceptance criteria

Add/update tests according to existing project patterns.

Critical acceptance criteria:
1. Existing shop with no new customization still gets a functional, intentional Classic public booking page.
2. Hero/About can use two distinct uploaded shop images with fallbacks.
3. Public service strip and service section derive from the shop's real service catalog, not hardcoded marketing service constants.
4. Service icon and featured metadata are editable and reflected publicly.
5. Four templates render the same shop data/booking functionality with genuinely distinct curated presentation.
6. Typography/color changes render correctly and remain accessible.
7. First-time guided configuration is short and returning users can edit without replaying a cumbersome wizard.
8. Preview represents real template/data and supports desktop/mobile.
9. CORE can publish allowed configuration but cannot persist/publish premium template/typography through UI **or direct server request**.
10. PRO/COMPLETE can publish advanced customization.
11. Plan/billing UI exposes the advanced booking-page customization benefit.
12. Existing booking creation, slot logic, locales, embed mode and custom-domain behavior continue to work.
13. Typecheck/lint/tests/build used by the repo pass.

---

## How to execute this plan

**Do not implement this document mechanically.**

1. Audit the current implementation and relevant conventions first.
2. Identify any assumptions above that are outdated or architecturally awkward.
3. Make reasonable improvements where the existing architecture supports a cleaner solution. Keep the product constraints intact: constrained customization, four templates, real services, short guided setup, live preview, tier gating.
4. Avoid unnecessary new abstractions and avoid duplicating existing infrastructure.
5. Then implement the feature end-to-end: schema/migration, server logic, uploads, services metadata, settings UX, templates, preview, entitlement enforcement, plans UI, localization and tests.
6. If a material product decision is genuinely blocking, stop and flag it. For ordinary implementation details, choose the best approach and proceed.
7. Finish with a concise implementation summary, important architecture decisions/deviations from this plan, migration notes, tests run/results, and any remaining follow-ups.

The desired result is not a prototype: it should be production-quality GarageOS functionality built on the architecture that actually exists in the repository.
