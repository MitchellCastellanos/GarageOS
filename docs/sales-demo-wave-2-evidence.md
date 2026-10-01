# Sales Demo Wave 2 evidence

Validated locally on 2026-10-01. Authority: [implementation plan](sales-demo-implementation-plan.md), Wave 2 H–I, Restart and Booking Page only.

## Baseline and isolation

- Branch: `codex/sales-demo-wave-2`, isolated managed worktree `C:/Users/mitch/.codex/worktrees/sales-demo-wave-2/GarageOS`.
- Audited latest `origin/main`: `81e188546807d51e620b81b1f18628a4604c08a3`, containing merged Wave 1 PR #70 (`a1490ae`) and independent Resend evidence PR #71.
- Read the complete implementation plan before editing. Audited the existing outbox, email/SMS senders, sender routes, suppression, callbacks, reconciliation, subscription gates, fiscal models and real Booking Page.
- Existing fields describe current shop state and computed usage; they cannot permanently identify a communication after conversion. An additive migration is therefore necessary.
- No changes to `docs/launch-readiness.md`, historical migrations, provider configuration, packages, main or another agent's checkout.

## Implemented behavior

- `/admin/demo` is available only within the centralized, live SUPER_ADMIN Sales session. The toolbar links to it. EN/FR controls navigate the actual clients, appointments, quotes, work orders, invoices, Inbox, booking settings and public Booking Page.
- Communications are disabled until Sales explicitly confirms recipient permission. Enabling uses the same shop and existing pipeline; it cannot override the global provider gate or lift a later platform suspension. Lifecycle and session are checked again immediately before dispatch.
- Optional scenario loading creates one coherent, explicitly tagged client, vehicle, appointment, quote, work order and draft invoice with real fiscal calculation. It is atomic and idempotent, contains no real email/phone, and sends nothing.
- Restart returns the same Shop to onboarding. It preserves prospect identity, logo/photos, business/fiscal details, services, hours, design, tier and real operational data. Only an explicitly selected synthetic batch is eligible for removal. Financial, stock, approvals, portal/tire and live links cause atomic refusal; restrictive foreign keys provide a further guard. Serializable isolation protects against concurrent live links. A serialization conflict asks the caller to retry.
- Booking Page uses the existing `/book/[slug]` path and persisted shop/branding/services/images. Core uses the existing standard fallback; Pro/Complete restore the retained advanced design. Demo entitlement access remains bound to the authorized Sales session; anonymous visitors and unrelated owners do not gain demo privileges. No duplicate renderer or public subscription bypass was added.

## Additive schema and permanent no-meter proof

Migration: `20261001010000_sales_demo_experience`.

- `SalesDemo.communicationsEnabled` defaults false; unique nullable `scenarioBatchId` identifies the current synthetic batch.
- Six scenario models gain nullable `demoSeedBatchId`.
- `CommunicationMessage.salesDemoOriginId` records immutable origin, without a foreign key that could remove the attribution when the demo is deleted. `sendAttemptedAt` supports conditional retry reservation.
- Existing demo messages are conservatively backfilled using their shop and conversion timestamp. A PostgreSQL trigger captures demo origin and preserves any existing origin on every update, forcing marked SMS `billedOverageSegments` to zero.
- Initial sends, converted retries and new delivery fallbacks retain provenance. Fallback context is internal and derived from the persisted source message. Demo sends fail closed if their history cannot be written.
- Commercial allowance queries exclude demo messages. Settlement and pending-overage retries reject them. The lowest Stripe meter function independently rejects a missing or demo-origin source before SDK metering, even after conversion/deletion.
- Provider segment correction keeps actual delivered segments while retaining zero billable overage. Callback/reconciliation status updates cannot change that invariant. Conditional retry leases and unique-key race handling prevent concurrent duplicate dispatch; cross-shop idempotency keys fail closed.
- Normal paid SMS uses its existing allowance, overage count, stable meter identifier and provider path. STOP/suppression and provider-side-effects gates remain enforced.

## Validation

- `npm run check`: PASS — Prisma validate/generate, TypeScript and **562 tests**, zero failures/skips, including **20 new Wave 2 tests**.
- `npm run lint`: PASS — zero errors; 51 existing repository warnings.
- `npm run build`: PASS — optimized production compilation, TypeScript and static generation. Local database URLs, provider effects disabled, Stripe mutations disabled, no production environment; the deploy guard explicitly skipped migrations, backfill and super-admin bootstrap.
- Disposable PGlite PostgreSQL replay: **all 49 migrations applied**. SQL assertions prove origin and zero overage remain immutable after conversion, attempted clearing/replacement and demo deletion; unmarked paid SMS retains its overage. Existing foreign-key, uniqueness and converted-Shop preservation checks pass.
- Responsive browser QA: **105 checks**, zero page errors, at **375, 430, 768, 1024 and 1440 px**. Covers inherited Wave 1 onboarding/no-payment/tier/expiry/owner checks plus FR/EN controls, explicit/idempotent scenario, communications consent, actual Booking Page at all three tiers, unsafe-reset refusal, synthetic cleanup, preserved branding and retained live client. Booking captures scroll through the existing renderer's animation reveals before capture.
- Hostile tests cover OWNER/no-session/cross-shop/expired/disabled access, lifecycle races, history failure, expiration before dispatch, converted retries/fallbacks, concurrent reservation, callbacks, stale reconciliation, pending settlement, lowest Stripe boundary, paid billing, real sender/template reuse with mocked transports, STOP, and guarded restart.
- Retained screenshots and machine-readable browser results: [evidence directory](sales-demo-wave-2-evidence/).
- Final added-diff secret-pattern and whitespace checks: PASS. Latest `origin/main` was fetched again and remains the audited baseline; no integration conflicts or independent-documentation changes.

## Reproduction and boundaries

`scripts/qa-sales-demo.mjs` and `scripts/qa-sales-demo-browser.mjs` retain their Wave 1 default. Set `GARAGEOS_QA_WAVE2=1` to enable the additive SQL and browser checks. Supply `GARAGEOS_QA_PACKAGES` for disposable PGlite dependencies, `GARAGEOS_QA_PLAYWRIGHT` for Playwright, and `GARAGEOS_QA_OUTPUT` for artifacts. Fixtures and control endpoints are disposable localhost-only QA infrastructure, not deployed routes. Provider effects remain disabled throughout browser QA.

No Production database/configuration/environment actions, real SMS/email sends, Stripe mutations or provider resource mutations were performed. During initial test development, an incorrectly scoped Twilio SDK mock allowed one request using fake credentials; Twilio rejected it with HTTP 401. No real credentials or recipients were used and no message was sent. This was disclosed during implementation and corrected at the SDK transport boundary; the final suite also blocks HTTP/HTTPS/fetch networking. Final evidence uses deterministic transports only.

Deferred entirely to Wave 3: J–O owner activation/collision handling, conversion form/payment handoff, Stripe-confirmed conversion, analytics exclusions and final cross-wave completion. This PR does not perform conversion or real provider validation and must not be merged automatically.
