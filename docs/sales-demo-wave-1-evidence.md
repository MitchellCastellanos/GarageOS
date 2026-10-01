# Sales Demo Wave 1 — implementation and validation

Date: 2026-10-01. Scope: **A–G only** from `sales-demo-implementation-plan.md`.
Audited baseline: remote `main`, `51b89ac` (`docs: make sales demo plan self-contained and phased`).
Branch: `codex/sales-demo-wave-1`.

## Implementation and main files

| Block | Result | Main files |
|---|---|---|
| A | Dedicated SalesDemo relation, lifecycle/tier/contact/timestamp fields, safe foreign keys and indexes; validation and session/lifecycle helpers | `prisma/schema.prisma`, `src/domain/sales-demo.ts`, `src/lib/sales-demo.ts` |
| B | Real-identity SUPER_ADMIN Sales authorization and platform navigation/routes; tenant Role unchanged | `src/lib/sales-demo.ts`, `src/lib/routes.ts`, `src/components/admin/AdminSidebar.tsx` |
| C | Mobile prospect form and recent-demo cards; shop/contact fields and EN/FR copy; preparation/resume on the real Shop | `src/app/platform/sales/**`, `src/components/sales-demo/ProspectForm.tsx`, `src/actions/sales-demo.ts` |
| D | Camera/device/skip controls, preview, percentage crop, 90-degree rotation, prepared/original upload, retry/replace, copy-only ChatGPT helper; server normalization and existing public storage | `DemoAssetEditor.tsx`, `src/lib/sales-demo-assets.ts`, `src/lib/admin-locale/sales-demo.ts`, `src/lib/storage.ts` |
| E | Existing Auth.js impersonation retains platform identity; explicit demo claim, one-hour session cap and live relationship/expiry checks; toolbar within layout flow and Exit Demo | `src/lib/auth.ts`, `src/types/index.ts`, `SalesDemoToolbar.tsx`, admin/onboarding layouts, `AdminChrome.tsx` |
| F | Central session-authorized `SALES_DEMO` effective state, using the existing entitlement matrix and helpers; no Subscription mutation | `src/lib/subscription.ts`, `src/domain/subscription-state.ts` |
| G | Existing seven-step wizard; isolated no-Stripe tier selection and explicitly authorized demo completion; normal payment completion unchanged | `OnboardingWizard.tsx`, `DemoPlanStep.tsx`, `Step6Share.tsx`, `src/actions/sales-demo.ts` |

The audit covered authentication/permissions/routes/shop context; subscriptions/entitlements/state; onboarding; platform impersonation and commercial plan controls; Stripe Checkout/sync/webhooks; settings and public/private storage; booking configuration/renderer; verification and communications/outbox/SMS usage; tenant gates in operational actions (invoice/quote, portal, DVI, tire storage, reports, inventory and locations); platform MRR/growth queries; and the corresponding existing tests. No duplicate product, billing path, feature matrix or provider integration was introduced.

## Security and billing decisions

- `requireSalesActor()` checks the **real user id and current database SUPER_ADMIN role**, including while impersonation presents OWNER. Every Sales mutation calls this boundary.
- Tier/completion actions resolve SalesDemo server-side and require its id, Shop id, real actor id and active impersonation to agree. Lifecycle and `expiresAt` are checked again by conditional database mutations; completion locks the demo in its transaction before updating the bound Shop.
- JWT processing rechecks the demo relationship and lifecycle every request. Missing, expired, converted or mismatched demos drop impersonation and recover the real platform identity. A normal tenant user never receives the Sales toolbar or override.
- Demo entitlements are `SALES_DEMO`, not commercial ACTIVE, trial or Stripe-backed. The commercial Subscription stays `AWAITING_PLAN`, with no plan/customer/subscription ids. Owner completion still requires its original payment-backed predicate; a separate demo action is required.
- Existing owner and platform billing mutations refuse unconverted demo Shops. Generic platform “login as” routes demo Shops through the explicit demo-session action. Tier switches touch only SalesDemo and never call Stripe, commercial plan changes, billing email or Subscription writes.
- Uploads accept decoded JPEG/PNG/WebP, at most 4 MiB and 40 million source pixels; animated inputs and forged/unsupported bytes are rejected. EXIF orientation is applied, metadata stripped, dimensions bounded, logos stored as PNG and photos as WebP. Storage URLs come from the server, not browser input. Unique demo logo versions prevent lifecycle-raced uploads overwriting a live logo; an unsuccessful final bind may leave an unreferenced brand asset for retention review.
- Sales-collected email is not automatically verified using the salesperson's login identity. Preparation does not send shop-verification emails. Existing sender defaults are provisioned locally, without provider calls.

## Migration

New migration: `prisma/migrations/20261001000000_sales_demo_foundation/migration.sql`, generated from audited-main schema to the new schema with `prisma migrate diff`. No applied migration was modified.

The new model has a unique Shop relation, status/expiry and actor/creation indexes, existing Plan/BillingInterval/InvoiceLanguage enums, and RESTRICT foreign keys to Shop and actor. Deleting SalesDemo cannot cascade to Shop. All **48 repository migrations** applied successfully to a fresh disposable PGlite PostgreSQL-compatible database. Actual SQL checks proved duplicate Shop binding rejected, referenced Shop deletion rejected, and deletion of a CONVERTED SalesDemo preserved its Shop.

**No Production migration was executed.** Deployment uses the existing guarded migration path. PGlite verifies the SQL/constraints locally; it does not replace deployment validation on the intended PostgreSQL infrastructure.

## Validation results

| Check | Result |
|---|---|
| `npm run check` | **PASS** — Prisma validate/generate, TypeScript and **542 tests**, zero failures/skips |
| New security/domain/image tests | **17 added tests**: 16 Sales tests plus JWT lifecycle revalidation; all pass |
| `npm run build` | **PASS** — optimized build, TypeScript and static-page generation; new Sales routes listed |
| Build database/provider safety | Local disposable database; provider effects disabled; migration/backfill/bootstrap explicitly skipped by the existing development guard |
| `npm run lint` | **PASS** — zero errors, 51 existing warnings; the unrelated temporary script from the initial run is no longer present in the checkout |
| Repository diff | `git diff --check` passes; working tree clean before this evidence refresh |
| Browser QA | **PASS: 60 responsive/flow checks**, zero uncaught browser errors |

One necessary baseline repair outside the feature: removed the unused `BUILD_ID` export from `src/app/api/auth/login/route.ts`. Next.js rejects that unsupported route-module export during build; no code referenced it. Login behavior is unchanged.

Seventeen new tests cover role spoofing/deletion/revocation, OWNER denial, wrong Shop/demo/actor/session expiry, normal onboarding payment protection, Core/Pro/Complete gates, background/no-session isolation, converted fallback to a commercial tier, lifecycle-raced mutations, atomic creation/completion, no commercial mutation through platform controls, upload authorization, actual image decoding/normalization/orientation and copy-only helper copy.

## Wave 1 acceptance proven in browser

Using a real local Next.js app, real Auth.js login/impersonation, actual Prisma SQL and fake local Supabase storage:

1. SUPER_ADMIN opens Sales, creates a prospect from a 375px viewport and persists business/contact/language data.
2. Sales previews/crops/rotates a logo, uploads preparation, replaces it with Use original, copies the exact maintained ChatGPT prompt and receives copied feedback.
3. Camera-input uploads and normal file uploads succeed for optional storefront/interior photos. `capture="environment"` is present only on camera controls.
4. The prospect's business/branding data prepopulates real onboarding. Business, Fiscal, Services, Hours and Design save through existing actions. Design preserves prepared photos.
5. Selecting Pro continues without Checkout, completes through the separate authorized demo action and reaches the real Dashboard.
6. Core → Pro → Complete updates the real inventory gate (Core locked, Pro/Complete unlocked). Domain/action tests additionally prove Complete-only multi-location gates.
7. Billing displays the demo explanation. Actual SQL still shows `AWAITING_PLAN`, null commercial plan and null Stripe ids. Logo/photos and onboarding completion remain on the same Shop.
8. Exit returns to Sales; Resume returns to the prepared Shop's Dashboard. Expiring a demo while its tab is open returns to the real platform identity on reload.
9. A separate normal OWNER cannot open Sales, never sees a demo toolbar/no-payment button, and cannot reach Dashboard before normal onboarding/payment completion.
10. Eleven screens/states were checked at **375, 430, 768, 1024 and 1440px**, with document width never exceeding viewport width. French copy/long Shop names fit; the toolbar does not overlap app navigation. English prospect form also passes all widths.

Machine-readable results and final database snapshot: [`sales-demo-wave-1-evidence/results.json`](sales-demo-wave-1-evidence/results.json). Only disposable `example.test` fixture contacts appear in this evidence.

Representative screenshots: [phone prospect form](sales-demo-wave-1-evidence/prospect-form-375.png), [phone logo editor](sales-demo-wave-1-evidence/logo-editor-375.png), [phone Dashboard/toolbar](sales-demo-wave-1-evidence/dashboard-375.png), [desktop Dashboard](sales-demo-wave-1-evidence/dashboard-1440.png). Screenshots were visually inspected in addition to automated measurements.

## Reproduce local browser/migration QA

Install QA-only dependencies in a temporary directory, **not** application dependencies:

```powershell
$qaPackages = Join-Path $env:TEMP 'garageos-wave1-qa'
npm install --prefix $qaPackages --no-audit --no-fund @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
$env:GARAGEOS_QA_PACKAGES = $qaPackages
node scripts/qa-sales-demo.mjs
```

In another terminal, set `GARAGEOS_QA_PLAYWRIGHT` to a node_modules directory containing Playwright (the Codex workspace runtime provides it). Microsoft Edge is used headlessly:

```powershell
$env:GARAGEOS_QA_PLAYWRIGHT = '<runtime node_modules directory>'
$env:GARAGEOS_QA_OUTPUT = Join-Path $qaPackages 'evidence'
node scripts/qa-sales-demo-browser.mjs
```

The infrastructure script binds local ports 55440/55441/55442 and app port 3100. It creates an in-memory database, seeds only local test identities, overrides app/database URLs and provider authorization, and uses fake storage. The QA-only image setting is enabled **only in development** with `GARAGEOS_LOCAL_QA=1`; Production retains its existing image optimizer/host allowlist. Shut down the infrastructure script after testing. The fixture is destroyed with the process; no Production credentials/database are used by QA. Restart it before rerunning browser QA to reset fixtures.

## Deferred behavior and remaining infrastructure

### PR #70 completion audit

On 2026-10-01, re-read the complete implementation authority and reviewed A–G against current remote `main` (`51b89ac`, unchanged). No genuine Wave 1 blocker or source correction was found. Re-ran `npm run check` (542 passing tests), unrestricted lint (zero errors), all 48 migrations and SQL constraint checks in a fresh disposable database, and the complete browser flow (60 passing checks, zero uncaught browser errors). Refreshed phone screenshots were visually inspected. The production build was re-run with provider effects disabled and database migration/backfill/bootstrap steps skipped. GitHub reported the PR mergeable, Vercel successful, and no review comments; no GitHub Actions workflow runs are configured for this commit. No Production environment, communications/provider configuration or provider validation was touched. Physical camera and Production storage checks remain the documented manual limitations, not claims of completed validation. Stop at Wave 1; H–O remain deferred.

**SMS billing exclusion:** not implemented in Wave 1. Newly created demo Shops use the existing `communicationsSuspendedAt` flag, so operational outbox sending is unavailable pending Wave 2. No real SMS/email/provider calls were used to validate this implementation. The durable per-message exclusion, retry/reconciliation protection and normal-paid overage behavior remain Wave 2 work; a null Stripe customer alone is not claimed as the future exclusion strategy.

**Activation/conversion:** only minimal schema lifecycle/timestamp hooks exist. No tokens, activation/resend emails, owner collision handling, conversion UI, payment handoff or Stripe conversion finalization were implemented. Restart, quick-scenario seeding and Booking Page demo behavior are deferred to Wave 2. Commercial shop/cohort/count analytics exclusions and final cleanup/conversion lifecycle remain Wave 3; pending demo subscriptions add no MRR, but general Shop counts currently include them.

**Operational needs:** deploy the new migration through the existing guarded path; use the existing configured public-assets bucket. Physical iOS/Android camera capture and real Production storage were not exercised; browser tests prove the capture attributes, standard upload fallback and server processing using fake storage. Prospects/public photos need appropriate collection/publication disclosure. PIA and retention records were updated; Sales/platform operations and the Privacy Officer own retention review, including expired lead records and unreferenced asset versions. There is no destructive automatic cleanup. Existing provider-register, Terms and CASL behavior is unchanged.
