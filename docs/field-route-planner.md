# Field Route Planner (FIELD sellers)

Implements §P0/P3 of [the Lead Engine + Field Planner roadmap](garageos-lead-engine-field-planner-roadmap.md). Screenshots (390 / 768 / 1280 px, synthetic data): [`field-route-planner-evidence/`](field-route-planner-evidence/).

## P0 — visit engagement semantics
- `CrmActivity.fieldVisitOutcome` (enum `CrmFieldVisitOutcome`) + `idempotencyKey` (unique per author). Legacy `FIELD_VISIT` rows have `NULL` outcome and **no longer count as engagement** (intentional).
- `Engagement.qualifiedVisit` (not `visited`) is what `evaluateColdEmail` checks. Qualifying: `DECISION_MAKER_CONTACTED`, `INTERESTED`, `DEMO_DISCUSSED`, `DEMO_SCHEDULED`. A later `NOT_INTERESTED / CONTACT_REJECTED / BUSINESS_CLOSED / INVALID_LOCATION / DO_NOT_CONTACT` revokes it.
- A visit never creates a sending basis or enrolls anything; CASL, DNC, suppression and language checks are untouched. Territory engagement is not consent.
- `logFieldVisit` now requires the prospect to be **assigned to the actor** (Super Admin excepted), rejects archived/merged/DNC prospects and is idempotent.

## Data model (migration `20261012090000_field_route_planner`, additive)
`CrmProspectLocation` (coords only for GEOCODED/VERIFIED, CHECK-enforced; address fingerprint), `CrmFieldRoute` (version CAS, `clientRequestId` idempotency, one IN_PROGRESS per seller via partial unique index), `CrmFieldRouteStop` (unique route+prospect and route+position; snapshot name/address/coords; unique `activityId`). Not applied to Production.

## Geocoding / maps — Mapbox (Geocoding API v6, Permanent Geocoding)
Full runbook: `docs/mapbox-geocoding.md`. Summary: server-side requests with `permanent=true` only (the sole mode whose results may be stored); the Super Admin page `/platform/sales/settings/geocoding` previews, runs a 5-prospect test batch, then 25-prospect batches within an owner-set request ceiling; ambiguous/low-confidence/incomplete addresses go to manual review and never become coordinates. Sellers' "locate" button never reaches Mapbox. Map: MapLibre draws Mapbox raster tiles with a URL-restricted public `pk.` token; located prospects appear as grey markers on the planner (tap = add to route). Distances stay straight-line and labelled as such: no routing service is integrated.

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

## Field Planner 2.0 — territory workspace (this replaces the route-picker list)
Code: `domain/sales-crm/field-map.ts` (status, clustering, viewport rules), `lib/sales-crm/field-map-service.ts` (viewport, nearby, place search, summary, prospect detail), `field-route-service.ts#recordMapVisit`, actions in `actions/sales-field.ts`, UI `components/sales-field/{FieldWorkspace,TerritoryMap,VisitResultForm}.tsx`. Tests: `field-map-domain`, `field-map-db`, `field-planner-coverage-render`.
* **Dense map.** `loadFieldMapViewport(bbox, zoom, statuses, q)` returns EVERY located prospect of the seller's own book in the viewport: individual markers when ≤ 40 are in view, or zoom ≥ 14 and ≤ 500; otherwise grid clusters with exact counts (cell ≈ 48 px, deterministic). The 25-stop limit applies only to the route. Row ceiling per viewport: 8,000 (above it the response says `truncated` and the UI asks to zoom in). Counters keep four things apart: *In your territory* / *On the map* (located) / *In this view* + *Match filters* / *Route stops n/25*.
* **CRM status filter = derived, not stored.** One status per prospect, first match wins: WON → LOST → DEMO_SCHEDULED → INTERESTED → FOLLOW_UP → ATTEMPTED → NOT_VISITED → PENDING, from the opportunity stage, the latest structured FIELD_VISIT outcome, open `CrmTask`s and activity count (`mapStatusOf`). *Not contacted* = nothing recorded; *Not visited* = contacted another way, never visited. A refusal outcome shows LOST immediately. No new CRM state or table.
* **Nearby.** Browser geolocation is requested once, on tap (no `watchPosition`, nothing stored); or search a city / street / neighbourhood / postal code over the seller's own prospects' addresses (free; no paid geocoder is called). Radius 1/2.5/5/10/25 km. Prospects without a usable position are listed with the reason (pending, ambiguous, incomplete address).
* **Route.** Tap a marker → panel → *Add to route* / *Remove*; everything else stays on the map; duplicates impossible; 25 max; existing optimizer ("Optimize order") and `saveFieldRoute` (CAS + idempotency) unchanged. A DRAFT is still the saved/resumable unit.
* **Visit result on the map.** `submitMapVisit` → `recordMapVisit`: if the prospect is a PENDING stop of the route in progress it is the normal stop result (stop claim + activity + task + opportunity + audit in ONE transaction); otherwise the same `writeFieldVisit` transaction without a stop. Same outcome rules, same idempotency key (author + submission id), assigned-seller only. `DEMO_SCHEDULED` requires a date and creates a `DEMO_PREP` task — never a `CrmMeeting` without an attendee email. The marker, counters and route stop refresh immediately.
* **Multi-rep.** Visibility is `assignedStaffId = actor.staffId` plus the existing territory-coverage keys; managers/Super Admin do not get a map of other sellers' books (route read access is unchanged). REMOTE sellers have no FIELD map. No second territory/assignment engine; reassignment through the existing workflow keeps activity history (activities hang off the prospect).
* **Verified:** tsc, eslint, unit suite, 4 DB suites on scratch Postgres (incl. 60 prospects on the map vs a 25-stop route, scope, idempotent retry, stop sync), `next build`. **Not verified:** real-device rendering of the live MapLibre map (no basemap token or browser session in the engineering environment) — do a phone check after deploy.
