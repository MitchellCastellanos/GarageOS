# Field Route Planner (FIELD sellers)

Implements §P0/P3 of [the Lead Engine + Field Planner roadmap](garageos-lead-engine-field-planner-roadmap.md). Screenshots (390 / 768 / 1280 px, synthetic data): [`field-route-planner-evidence/`](field-route-planner-evidence/).

## P0 — visit engagement semantics
- `CrmActivity.fieldVisitOutcome` (enum `CrmFieldVisitOutcome`) + `idempotencyKey` (unique per author). Legacy `FIELD_VISIT` rows have `NULL` outcome and **no longer count as engagement** (intentional).
- `Engagement.qualifiedVisit` (not `visited`) is what `evaluateColdEmail` checks. Qualifying: `DECISION_MAKER_CONTACTED`, `INTERESTED`, `DEMO_DISCUSSED`, `DEMO_SCHEDULED`. A later `NOT_INTERESTED / CONTACT_REJECTED / BUSINESS_CLOSED / INVALID_LOCATION / DO_NOT_CONTACT` revokes it.
- A visit never creates a sending basis or enrolls anything; CASL, DNC, suppression and language checks are untouched. Territory engagement is not consent.
- `logFieldVisit` now requires the prospect to be **assigned to the actor** (Super Admin excepted), rejects archived/merged/DNC prospects and is idempotent.

## Data model (migration `20261012090000_field_route_planner`, additive)
`CrmProspectLocation` (coords only for GEOCODED/VERIFIED, CHECK-enforced; address fingerprint), `CrmFieldRoute` (version CAS, `clientRequestId` idempotency, one IN_PROGRESS per seller via partial unique index), `CrmFieldRouteStop` (unique route+prospect and route+position; snapshot name/address/coords; unique `activityId`). Not applied to Production.

## Geocoding / maps — owner decisions pending
- `GEOCODING_PROVIDER` unset: geocoding is **disabled**; no coordinates are invented. `synthetic` is a dev/test adapter (refused in production). Any other value shows "pending". Needed: provider choice, terms permitting storage/caching, budget, a test on 50 authorized addresses, then an adapter implementing `GeocodeProvider` (`src/lib/sales-crm/geocoder.ts`). Until then **no prospect can be placed on a real route**.
- Map: `maplibre-gl` is lazy-loaded only if `MAP_STYLE_URL` (https) **and** `MAP_ATTRIBUTION` are set (public values, no secrets). It has not been exercised against any tile provider. Otherwise the planner is list-first with a labelled schematic plot.
- Distances are straight-line estimates; no ETA/traffic. Navigation opens one destination (coordinates only) in Google/Apple/Waze.

## Rollout checklist
1. Review/merge; the migration applies through the normal Vercel Production build.
2. Confirm FIELD sellers and assigned prospects exist; no production geocoding until a provider is approved.
3. After approval: implement the adapter, geocode the 50-address sample, check accuracy, then enable.
4. Optionally configure an approved map style + attribution.
5. Pilot a few routes; review the metrics on `/platform/sales/field`.

## Known limitations
- `DEMO_SCHEDULED` creates a `DEMO_PREP` task on the agreed date; it does not insert a `CrmMeeting` (needs attendee email + calendar).
- Draft edits replace stops wholesale; reordering uses up/down buttons (no drag-and-drop).
- A refusal stops active sequence enrollments; already-queued emails rely on the dispatcher's existing DNC/policy re-check.
- Pre-existing: 4 `sales-comms-db` tests fail identically on `main` (date-dependent).
