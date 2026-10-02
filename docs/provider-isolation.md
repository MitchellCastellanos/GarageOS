# Provider isolation & side-effects policy

Status: code hardening done (this document). **Env isolation in Vercel, Stripe TEST validation and Stripe Live are still pending** — see "What is NOT done yet".

## 1. Outbound side effects need explicit authorization

Having provider credentials is **not** enough to produce an external effect. An environment must say so:

```
PROVIDER_SIDE_EFFECTS=enabled      # Production only
```

Anything else — missing, empty, `true`, `1`, `on`, `Enabled!`, garbage — is **disabled** (fail closed). Parsing lives in one place: `src/lib/provider-policy.ts` (`parseEnabledFlag`: only the literal `enabled`, case/whitespace-insensitive, passes).

Rules of thumb:
- **Production** gets `PROVIDER_SIDE_EFFECTS=enabled` explicitly (a later env-change step; not applied yet).
- **Preview keeps it absent/disabled**, except for provider-specific controlled tests (see Stripe below).
- Inbound processing (signed webhooks, private-channel auth signing) and reads are never affected.

### Where it is enforced (lowest common boundary per provider)

| Provider | Boundary | Disabled behaviour |
|---|---|---|
| Twilio (SMS) | `recordAndSend` (outbox) **and** `getTwilioClientForWrite` (SDK boundary) | `ProviderDisabledError` **before** any history row / SMS quota / billing is touched. Nothing is marked sent. |
| Twilio (management: subaccounts, buy/configure/release numbers) | `provisionShopSmsNumber` / `releaseShopSmsNumber` assert first (before the atomic DB claim); `getTwilioParentClientForWrite` / `getTwilioClientForWrite` | `ProviderDisabledError`; DB state is untouched (a number is never marked `RELEASED` without Twilio being called). |
| Twilio reads (status lookup, account token for signature validation) | `getTwilioClientFor` / `getTwilioParentClient` (read-only; a code-guard test forbids `create/update/remove` on them) | Unchanged. |
| Resend (transactional/invoice/quote/appointment/campaign/inbox email) | `recordAndSend` **and** the gated client in `src/lib/providers/resend.ts` (the only place `new Resend(` is allowed) | `ProviderDisabledError` (user-triggered actions surface the generic message). |
| Resend (verification + platform/internal email) | `tryGetResendClient()` returns `null` when disabled | Best-effort contract kept: skipped with a log line that contains no address and no secret; never pretends to have sent. |
| Resend (managed-domain create/verify/remove) | gated client | `ProviderDisabledError`. |
| Pusher publish | `getPusherForPublish()` in `src/lib/providers/pusher.ts` (the only place `from "pusher"` is allowed) | Silent no-op (realtime is best-effort; UI falls back to refresh/polling). One warning per process. |
| Pusher private-channel auth signing | local HMAC, **not** an outbound effect | Keeps working with credentials. |
| Telegram | `sendPlatformTelegramAlert` | Returns `false` (best-effort), safe log. |
| QuickBooks | `getQboConfig()` returns `null` | Inert: connect/sync/revoke unavailable (already the state today: no `QBO_*` in Vercel). |
| Stripe | see §2 | see §2 |
| Supabase Storage | unchanged (the service key is deliberately absent in Preview → `isStorageConfigured()` is false, fail closed) | unchanged |

A code-guard test (`tests/provider-policy.test.ts`) fails if any file outside those modules constructs a provider SDK (`new Resend(`, `new Stripe(`, server `pusher`, `twilio`, `api.telegram.org`).

### Cron / background jobs
- `/api/webhooks/cron`: when disabled it **skips** every outbound step (service/automated/appointment/tire reminders, SMS number lifecycle) — nothing is marked sent or failed, no retry storm; purge and read-only reconciliation still run. The JSON reports `providerSideEffects: "disabled"`.
- `/api/webhooks/cron/campaigns`: returns `{ skipped: true, reason: "provider_side_effects_disabled" }` **before** moving any campaign to `SENDING`.
- SMS-overage reporting: `isSmsOverageBillingConfigured()` is false when Stripe mutations aren't authorized, so pending overage is left untouched (attempt counters are **not** burned; it is reported once an authorized environment runs the cron).

### User-facing failures
`ProviderDisabledError` carries a generic, safe message ("This action is unavailable: external provider actions are disabled in this environment.") — no variable names, no credential hints. Server actions that show `err.message` (domains, SMS numbers) show exactly that; billing actions keep their localized generic error.

## 2. Stripe: a narrower, separate permission

Stripe must stay usable for **intentional TEST validation** in Preview without enabling SMS/email. So:

- **Inbound is never gated**: webhook signature verification (`constructEvent`) and event processing work in every environment (covered by a test).
- **Reads** (`retrieve*`, `list*`, `search*`) are never gated.
- **Mutations** (create customer/Checkout/portal session, update/cancel/migrate subscription, meter events — anything that is not a read verb, at any depth of the SDK) go through a gated client (`gateStripeClient`, evaluated on every call) and need **either**:
  1. `PROVIDER_SIDE_EFFECTS=enabled` (Production), **or**
  2. `STRIPE_TEST_MUTATIONS=enabled` **and** a Stripe **test** key (`sk_test_…` / `rk_test_…`).
- `STRIPE_SECRET_KEY` alone never enables mutations. A live key never rides the TEST permission; it needs `PROVIDER_SIDE_EFFECTS=enabled`.
- `STRIPE_TEST_MUTATIONS` opens Stripe only — Twilio/Resend/Pusher/Telegram stay blocked (tested).

## 3. Auth claims are revalidated against the environment's DB

`NEXTAUTH_SECRET` **must be different in Preview and Production** (env step pending). As defense in depth the JWT callback (`src/lib/auth.ts`) no longer trusts claims:

- `userId` / `shopId` / `role` are re-derived from **this** environment's DB on every request.
- If the user can't be found (deleted, from another database, forged claims, no `userId`) the callback returns `null` → the session is destroyed. No privileged claim (SUPER_ADMIN, shopId) survives.
- Role and shop changes in the DB apply on the next request; a stale `shopId` is replaced even when the DB value is `null`.
- Impersonation can only start from, and only survives for, a SUPER_ADMIN that still exists in the DB; expired/forged `impersonation` claims are dropped.
- Legitimate flows keep working: credentials sign-in, returning Google users, first-time Google signup (`signIn` creates Shop+OWNER, then `jwt` resolves by email). Tests: `tests/auth-claims.test.ts` (including an end-to-end signed-cookie case).

The unsubscribe HMAC also uses `NEXTAUTH_SECRET`; splitting the secret per environment is required there too.

## 4. PAST_DUE → RESTRICTED (GarageOS-enforced 48 h)

```
first observed Stripe past_due ──48 h──▶ RESTRICTED   (does not depend on Stripe moving to `unpaid`)
```

- Clock: `Subscription.pastDueSince` (migration `20261004100000_subscription_past_due_since`). **Not** `updatedAt`.
- Invariant: `pastDueSince IS NOT NULL ⇔ status = 'PAST_DUE'` (`nextPastDueSince`, pure, in `src/domain/subscription-state.ts`).
  - entering PAST_DUE (from ACTIVE/TRIALING/anything, or a new row) → set to the observation time (injectable `clock`);
  - repeated `past_due` syncs, re-delivered webhooks, manual re-syncs (Checkout confirm) → **kept** (never reset);
  - ACTIVE / TRIALING (recovery) → cleared; a later past_due starts a **new** 48 h;
  - UNPAID / CANCELED / INCOMPLETE / `subscription.deleted` → cleared; access is restricted by status as before.
- `resolveAccess`: `now < pastDueSince + 48 h` → `PAST_DUE` (plan kept, writes allowed, `pastDueGraceEndsAt` exposed); `now >= pastDueSince + 48 h` (inclusive) → `RESTRICTED` (`plan: null`, `canWrite: false`, `isPastDueExpired: true`). A PAST_DUE row **without** a clock fails closed (restricted).
- Out-of-order events: syncs re-read the **live** Stripe subscription, so a stale `past_due` payload can't resurrect PAST_DUE or move the clock. If the live re-read fails for any reason other than `resource_missing`, the handler fails (Stripe retries) instead of applying a stale snapshot.
- Billing stays reachable when restricted (the customer can open the portal and pay; Stripe → `active` clears everything).
- The dedicated SMS-number lifecycle treats an expired past-due shop as "not in good standing" (the existing 30-day release grace then applies).
- Elapsed time is computed from the stored clock vs. `now` at read time — no cron needed, and no sleeping in tests.

**Migration backfill policy:** existing PAST_DUE rows have no trustworthy start (`updatedAt` moves on any edit; Stripe exposes no past_due timestamp), so they get `pastDueSince = migration time`: nobody is locked out retroactively by the deploy, and every legacy PAST_DUE shop is restricted at most 48 h after it. Other rows stay `NULL`.

Stripe's own dunning setting should still be *mark as unpaid / leave past due, never cancel* (an unpaid SMS-overage invoice would otherwise cancel a prepaid annual plan) — but it is no longer what enforces the 48 h.

## 5. SMS overage Price & `tax_behavior` (finding)

Stripe docs: a Price needs `tax_behavior` (`exclusive`/`inclusive`) **or** the account needs a default tax behavior in Tax settings. The TEST overage price `price_1UKhqe…` is `unspecified`, but the TEST account default is **`exclusive`** (read-only check), so in TEST it resolves to exclusive: monthly Checkout, the annual post-payment attachment (`ensureSmsOverageItem`) and metered invoicing are not broken there.

The risk is **Live**: if the live account has no default and the live overage Price is `unspecified`, monthly Checkout, the annual attach step and metered invoices would fail under automatic tax. Mitigation in code: `createCheckoutSession` now validates the overage Price before opening Checkout (`overagePriceProblem`): active, CAD, metered, monthly, 5¢, and `unspecified` only when the account default is set (it reads `tax.settings`; if that read isn't permitted the check is inconclusive and does not block). For Live, create the overage Price with `tax_behavior=exclusive` or set the default — still pending (Stripe Live is last).

## 6. What is NOT done yet

**Update (2026-10-01, Launch Agent 1, read live via the Vercel API):** the two env-isolation items below are now **done**. `PROVIDER_SIDE_EFFECTS` is `enabled` in Production and `disabled` in Preview (plaintext values read directly). Stripe/NEXTAUTH/Pusher/Google/cron/Resend/Twilio/Telegram/admin credentials are now separate-or-absent per environment — see the re-verified table in `docs/compliance/subprocessors.md` → "Environment separation". Only the item below remains:
- Stripe TEST validation (Test Clock pass, card `4000 0000 0000 0341`) remains pending; Stripe Live remains **last** (both explicitly out of this agent's scope).
