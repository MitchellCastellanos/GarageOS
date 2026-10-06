# GarageOS — Stripe LIVE cutover plan (prepared 2026-10-02, NOT executed)

Status: **plan only.** Nothing in this document has been applied. No Stripe LIVE resource was created, read, modified or tested while writing it; the only Stripe account reachable from the preparing session was the TEST sandbox (`Garage OS sandbox`, read-only inspection). **The code is authoritative** — every value below was derived from `src/lib/stripe.ts`, `src/lib/stripe-sync.ts`, `src/lib/provider-policy.ts`, `src/config/entitlements.ts`, `src/domain/subscription-state.ts`, `src/domain/sms.ts`; the TEST catalog was used only as a cross-check.

Companion files: `scripts/stripe-live-provision.mjs` (non-executed, fail-closed catalog script), `docs/stripe-live-dress-rehearsal.md` (what to prove after the cutover), `docs/launch-readiness.md` (evidence matrix).

## 0. What the code actually requires

| Item | Required? | Code evidence |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes | `getStripeClient()` throws without it |
| `STRIPE_WEBHOOK_SECRET` | Yes (`whsec_…` of the LIVE endpoint) | `constructWebhookEvent()` |
| `STRIPE_PRICE_{CORE,PRO,COMPLETE}_{MONTHLY,YEARLY}` (6) | Yes — an unset one makes that plan/interval un-purchasable | `getPriceId()`; Checkout refuses if the Price amount/currency/interval/licensed-type disagree with `PLAN_PRICING_CAD` (`priceMismatchReason`) |
| `STRIPE_SMS_OVERAGE_PRICE_ID` | Needed for overage billing; if unset, subscriptions have no overage item and overage is not billed | `getSmsOverageItemPriceId()`; `overagePriceProblem()` validates CAD / metered / monthly / 5¢ / tax behavior at every Checkout |
| `STRIPE_SMS_OVERAGE_METER_EVENT_NAME` | Needed for overage billing (`isSmsOverageBillingConfigured`) | `reportSmsOverageUsage()` |
| Publishable key | **No.** Hosted Checkout + Portal only, no Stripe.js | `src/lib/stripe.ts` header comment; no `NEXT_PUBLIC_STRIPE*` anywhere in `src` |
| `PROVIDER_SIDE_EFFECTS=enabled` | Yes for LIVE mutations — already `enabled` in Production. A LIVE key can be mutated **only** through this gate (`STRIPE_TEST_MUTATIONS` never applies to `sk_live_`) | `stripeMutationsAllowed()` |
| `STRIPE_TEST_MUTATIONS` | Preview only; must stay absent/`disabled` in Production | same |

Live Vercel facts read 2026-10-02 (key/target/type only, nothing decrypted): all ten Stripe variables exist for **Production** (values `encrypted`/`sensitive`) and Preview has its own set. **Whether Production's current values are TEST or LIVE has never been verified** — treat Production as TEST-configured until the cutover step 6 reads it. A mixed state (LIVE key + TEST prices or the reverse) is fail-closed: `prices.retrieve` fails and Checkout refuses to open.

**Read-only preflight, 2026-10-06 (no Stripe, Vercel or database mutation):**
- **Variable count corrected:** the code needs **ten** Stripe variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the six `STRIPE_PRICE_{PLAN}_{INTERVAL}` built by `getPriceId()`, `STRIPE_SMS_OVERAGE_PRICE_ID`, `STRIPE_SMS_OVERAGE_METER_EVENT_NAME`); earlier text said "nine". All ten exist for Production (encrypted/sensitive, last updated 2026-10-01).
- **Production is TEST-configured and stale.** The one non-secret Production value read (`STRIPE_PRICE_CORE_MONTHLY`) is a Price of the TEST sandbox `acct_1UGgimQwef5QpewG`: `livemode=false`, **archived**, **CAD 149/month** (the pre-launch price set). Production Checkout therefore currently fails closed (price guard). The cutover replaces all ten; the "previous values" rollback set is TEST and is only useful to return Production to a non-selling state.
- **Production DB:** 3 `Subscription` rows, **0** with any Stripe id → no TEST-id conflict with LIVE. 30 `StripeWebhookEvent` rows exist (TEST deliveries through the TEST endpoint below); idempotency is per `event.id`, LIVE ids never collide — leave unchanged.
- **TEST webhooks:** `we_1UH29O…` → `https://www.garage-os.ca/api/stripe/webhook` (enabled, 4 events, account-default API version) — delete at cutover step 8; `we_1ULaRP…` → the Preview branch URL **with a query string (bypass token)**, API `2026-08-26.dahlia` — keep until the Preview bypass token is rotated (runbook "Security token follow-ups"): rotate token → update this endpoint URL in the same session → verify one Preview TEST delivery 2xx.
- **TEST meter:** `sms_overage_segments`, sum, `by_id`/`stripe_customer_id`, value key `value` — matches the canonical contract.
- **API version** for the LIVE endpoint: `2026-08-26.dahlia` re-verified from the installed `stripe@22.6.2` (`ApiVersion`).
- **LIVE inventory NOT performed:** the Stripe connector was not authenticated in this session, and the machine's Stripe CLI is logged into a different business account (`Mimarca.me`), which was not used beyond identifying it. The LIVE account must be identified by the operator before any LIVE read.

## 1. LIVE resource manifest

All amounts CAD; **tax behavior `exclusive` on every Price** (the app quotes "price + tax"; matches the TEST catalog for plans — and the TEST overage Price is `unspecified`, relying on the account default, which is why the LIVE script sets `exclusive` explicitly). **No trial on any Price** (the 14-day trial comes only from Checkout `subscription_data.trial_period_days`). Prices are immutable: a wrong amount is fixed by creating a new Price and archiving the old one, never by editing.

| # | Product (`metadata.garageos_key`) | Price (`lookup_key`) | Amount | Interval | Type | Env var |
|---|---|---|---|---|---|---|
| 1 | GarageOS Core (`core`) | `garageos_core_monthly` | 19 900 ¢ = $199 | month | licensed | `STRIPE_PRICE_CORE_MONTHLY` |
| 2 | | `garageos_core_yearly` | 199 000 ¢ = $1,990 | year | licensed | `STRIPE_PRICE_CORE_YEARLY` |
| 3 | GarageOS Pro (`pro`) | `garageos_pro_monthly` | 29 900 ¢ = $299 | month | licensed | `STRIPE_PRICE_PRO_MONTHLY` |
| 4 | | `garageos_pro_yearly` | 299 000 ¢ = $2,990 | year | licensed | `STRIPE_PRICE_PRO_YEARLY` |
| 5 | GarageOS Complete (`complete`) | `garageos_complete_monthly` | 44 900 ¢ = $449 | month | licensed | `STRIPE_PRICE_COMPLETE_MONTHLY` |
| 6 | | `garageos_complete_yearly` | 449 000 ¢ = $4,490 | year | licensed | `STRIPE_PRICE_COMPLETE_YEARLY` |
| 7 | SMS overage (`sms_overage`) | `garageos_sms_overage_monthly` | `unit_amount_decimal` "5" ¢ = $0.05 / segment | month | **metered**, bound to the meter below | `STRIPE_SMS_OVERAGE_PRICE_ID` |

Annual = 10 × monthly (1,990 / 2,990 / 4,490). Public copy keeps SMS allowances generic; internal allowances (Core 300 / Pro 1,000 / Complete 2,500 segments, UTC calendar month) live in `PLAN_LIMITS` and are not Stripe objects.

**Product tax code:** `txcd_10103001` on all four products (identical to the TEST catalog; Stripe's "SaaS — business use" code). *Business/accounting confirmation needed* that this is the intended taxability classification for Quebec before LIVE.

**Billing Meter** — canonical contract, traced end to end (resolved 2026-10-02; an earlier draft of this file wrongly proposed `garageos_sms_overage`, an invention not derived from code or TEST):
- **Event name: `sms_overage_segments`** → `STRIPE_SMS_OVERAGE_METER_EVENT_NAME`. Source of truth in the app: `smsOverageMeterEventName()` in `src/lib/stripe.ts` reads **only** that env var (trimmed). It is **not hardcoded and has no default**: if absent, `isSmsOverageBillingConfigured()` is false and `reportSmsOverageUsage()` returns false without calling Stripe — overage is then never billed (the daily cron keeps retrying pending reports for ≤30 days). The app sends whatever the env says, so the Stripe meter's `event_name` and the Vercel variable **must be identical**.
- Evidence for the value: the working TEST meter `mtr_test_61VU3o…` (read-only, via its `billing.meter.created` event `evt_1UKfrG…`, 2026-09-29) has `event_name: "sms_overage_segments"`, display name "SMS overage segments", `default_aggregation.formula: sum`, `customer_mapping {type: by_id, event_payload_key: stripe_customer_id}`, `value_settings.event_payload_key: value`, `event_time_window: null`; the plaintext Preview (TEST) Vercel variable `STRIPE_SMS_OVERAGE_METER_EVENT_NAME` is `sms_overage_segments` (Production's is encrypted, mode/value not read). The test suites use other placeholders (`sms_overage`, `local_sms`) that are fixtures, not contracts. No earlier doc records a meter **event** emitted in TEST (launch-readiness: none in Production either) — the TEST E2E proved the metered item *attachment*; the emission path (`billing.meterEvents.create`) is exercised by the dress rehearsal's optional meter step.
- Aggregation **sum**; customer mapping **by_id** on payload key **`stripe_customer_id`**; value payload key **`value`**, sent as `String(segments)`; **unit = SMS segments** (Twilio's actual `numSegments` minus the monthly allowance remainder — `computeOverageSegments`), not messages; price $0.05 CAD per segment.
- Idempotency/timestamp: `identifier: sms-overage:<CommunicationMessage.id>`; message timestamp when ≤ 34 days old. Demo-origin messages are never reported.
- No other billing configuration is required. There is **no justified migration** from the TEST name; do not rename a proven billing contract. `scripts/stripe-live-provision.mjs` uses the same value and, in `apply` mode, aborts before creating anything further if an existing LIVE product/meter/price disagrees with the manifest (verify/plan record the PROBLEM and exit non-zero).

**Tax (Stripe Tax) — decision depends on business facts, do not assume:**
- Checkout is created with `automatic_tax.enabled = true`, `billing_address_collection: required`, `tax_id_collection.enabled = true`, `customer_update {address,name: auto}`. Stripe Tax must be **active** with head office (CA / QC) and the default tax behavior `exclusive`; TEST currently shows exactly that.
- Stripe collects GST/QST **only where a tax registration is configured in Stripe Tax**. GST/HST and QST registration status/numbers are *operator business facts still pending*. If not yet registered, Checkout will show no tax (acceptable only if the operator confirms the supplier is legitimately not registered — see Open items); if registered, add the Canada (GST) and Quebec (QST) registrations in the LIVE Dashboard (Tax → Registrations). **Never write registration numbers into the repo.**
- Dress-rehearsal check #5 verifies the displayed future amount matches the selected plan + the tax behavior that results.

**Webhook endpoint (Dashboard → Developers → Webhooks, LIVE mode):**
- URL `https://www.garage-os.ca/api/stripe/webhook`
- Events (exactly what `handleStripeEvent` switches on; everything else falls to `default: break`): `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- API version: pin **2026-08-26.dahlia** (the version the installed `stripe@22.x` SDK pins). The TEST endpoint for the same URL was created on the account-default version (`api_version: null`).
- Created in the Dashboard (not the script) so the signing secret can be copied from the Dashboard at any time → `STRIPE_WEBHOOK_SECRET`.
- **Do not add a Vercel protection-bypass token or query string** — `www.garage-os.ca` is a custom domain and is public by design (SSO protection covers only `*.vercel.app`).

**Customer Portal (LIVE Dashboard → Settings → Billing → Customer portal; must be the *default* configuration, `createBillingPortalSession` passes no configuration id):**
Mirror the TEST configuration `bpc_1ULCjG…` (`metadata.purpose=garageos-v1-portal`):
- ON: payment-method update; invoice history; customer update (email, name, address, tax id).
- OFF: **cancel subscription** (cancellation is GarageOS-native, `cancel_at: max_period_end`; a portal "cancel at period end" would cut an annual plan short on mixed-interval subscriptions), **plan switching** (`subscription_update`), pause.
- Default return URL `https://www.garage-os.ca/admin/settings?tab=billing`. (The TEST config has no privacy/terms URL in its business profile — set them to `/privacy` and `/terms` in LIVE, a low-risk improvement.)

**Dunning / failed payments (account-level Dashboard setting, no API — Billing → Subscriptions and emails → Manage failed payments):**
- Retry schedule: Smart Retries on, any schedule the operator accepts.
- **When retries are exhausted: "Mark the subscription as unpaid" (or "leave past due"). NEVER "Cancel the subscription".** Reason (code + docs): the annual plan carries the monthly SMS-overage item and Stripe applies this setting to the whole subscription; canceling would destroy a prepaid year over an unpaid overage invoice. GarageOS independently restricts 48 h after first observing `past_due` (`PAST_DUE_GRACE_MS`, `pastDueSince`), so GarageOS access never depends on Stripe's retry duration; Stripe `unpaid` → `UNPAID` → RESTRICTED; paying the open invoice returns the shop to ACTIVE. A `customer.subscription.deleted` with `cancellation_details.reason = payment_failed` is logged `CRITICAL` in `stripe-sync.ts` — that log line means this setting is wrong.
- Also for LIVE: review "Subscriptions and emails" customer emails (receipts/invoices/upcoming-renewal) — *Stripe-hosted email language follows the Customer's `preferred_locales` / browser locale; GarageOS does not currently set `preferred_locales`* (see follow-ups).

**Annual plan + SMS overage (verified from code):** Checkout rejects mixed intervals, so for `YEARLY` the Checkout session carries only the annual plan Price (`checkoutLineItems`); immediately after the subscription is linked (`syncStripeSubscription` from the webhook, or `confirmCheckoutSession` on return) `ensureSmsOverageItem` migrates the subscription to **flexible billing mode** if needed and adds the monthly metered item (`proration_behavior: none`, idempotency key `sms-overage-item:<subscription>`). `MONTHLY` gets the overage as the 2nd Checkout line item. In both cases overage is metered/billed monthly; the plan year is prepaid. Cancellation uses `cancel_at: max_period_end` (never the shorter overage period).

## 2. LIVE access mechanism (still needed)

Not available to the preparing session: no LIVE Stripe account is connected to the Stripe MCP connector (only the TEST sandbox `acct_1UGgimQwef5QpewG`). The final agent needs, supplied by the operator for that session only: (a) the LIVE account id (`acct_…`) to pin in `EXPECTED_STRIPE_ACCOUNT_ID`; (b) a **restricted** LIVE key (`rk_live_…`) with the minimum permissions — Products (write), Prices (write), Billing meters (write), Billing meter events (read), Tax settings/registrations (read), Webhook endpoints (read), Customer portal (read), Customers/Subscriptions/Checkout/Invoices (read) — or the Dashboard for manual creation; (c) the operator at the Dashboard for the dashboard-only steps (webhook creation, portal, dunning, Tax registrations). Do not paste keys into chat; export as environment variables in the executing shell only; revoke/expire the temporary restricted key when the cutover is finished.

## 3. Creation order (deterministic)

1. **Pre-flight (read-only)**: confirm operator facts (legal entity, GST/QST status) and that the LIVE account is activated for payments; confirm Stripe Tax is active with head office CA/QC.
2. **Pre-flight DB check (Production read-only, via the operator's own Neon access):** `select count(*) from "Subscription" where "stripeCustomerId" is not null;` (schema `garageos`). If Production was previously exercised with TEST keys, such rows hold **TEST** customer/subscription ids that LIVE cannot resolve. The two fixture shops are documented as having no Stripe customer; any other non-zero result must be reviewed by the operator **before** step 6 — do not edit Production rows from the cutover session without explicit approval.
3. `node scripts/stripe-live-provision.mjs verify` (empty account: reports missing webhook/portal, no catalog problems) then `plan`, review the output.
4. `apply --apply` with the explicit authorization string (script creates only missing products → meter → prices; prints the env-var/ID mapping; re-run `verify` — must report no PROBLEM lines).
5. Dashboard-only steps, in this order: Stripe Tax registrations (if applicable) → **Customer Portal** (default config as above) → **Manage failed payments** setting → **Webhook endpoint** (copy the `whsec_…` secret).
6. **Vercel Production env** (update all ten in one session, then redeploy once — env changes only reach NEW deployments):

| Vercel Production variable | Value source |
|---|---|
| `STRIPE_SECRET_KEY` | LIVE **secret** key `sk_live_…` (the app's runtime key; not the temporary restricted provisioning key unless the operator chooses a restricted runtime key with the permissions Checkout/Portal/Subscriptions/Customers/Meter events need) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the LIVE endpoint |
| `STRIPE_PRICE_CORE_MONTHLY` / `…_CORE_YEARLY` | script output for lookup keys `garageos_core_monthly` / `garageos_core_yearly` |
| `STRIPE_PRICE_PRO_MONTHLY` / `…_PRO_YEARLY` | `garageos_pro_*` |
| `STRIPE_PRICE_COMPLETE_MONTHLY` / `…_COMPLETE_YEARLY` | `garageos_complete_*` |
| `STRIPE_SMS_OVERAGE_PRICE_ID` | `garageos_sms_overage_monthly` |
| `STRIPE_SMS_OVERAGE_METER_EVENT_NAME` | `sms_overage_segments` (must equal the LIVE meter's `event_name`; no app default) |

   Keep `PROVIDER_SIDE_EFFECTS=enabled`; keep `STRIPE_TEST_MUTATIONS` absent from Production; **do not touch Preview's Stripe variables** (Preview stays TEST). Capture the previous Production values (operator's secret store) before overwriting — they are the rollback.
7. Redeploy Production; confirm the new deployment is `READY` and that nothing else changed.
8. At the cutover: **delete or disable the TEST-mode webhook endpoint `we_1UH29O…` that points at `https://www.garage-os.ca/api/stripe/webhook`** (TEST mutation, operator/approved). Left in place it keeps posting TEST events to the LIVE endpoint URL; they fail signature verification (HTTP 400, harmless, noisy) and Stripe may eventually disable it.

## 4. Verification

**Webhook (before any customer):** LIVE Dashboard → the endpoint → *Send test webhook* is available in LIVE for built-in event types — if used, expect HTTP 400/`resource_missing`-style handling for an unknown shop and **no DB change** (the handler ignores events whose shop/customer it cannot match); prefer verifying with the first real rehearsal Checkout instead: expect `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` deliveries all **2xx** (check Dashboard → Webhooks → Event deliveries; Vercel runtime logs `/api/stripe/webhook`), exactly one `StripeWebhookEvent` row per event id, and no `[stripe webhook] firma inválida` / `CRITICAL` log lines.

**Portal:** from the rehearsal shop, Billing → Manage payment method → the Stripe portal must show payment methods, invoice history and billing details, and must show **no** cancel, **no** plan switch, **no** pause. Return link lands on `/admin/settings?tab=billing`. `verify` mode also asserts cancel/update/pause are OFF on the default configuration.

**Dunning:** the LIVE setting has no API read; verify visually in the Dashboard (screenshot into the evidence folder, no secrets). Behavior cannot be exercised in LIVE without a failing real card, and **must not be**: it was proven end to end in TEST (`past_due` → ≥48 h → RESTRICTED → recovery). Verification in LIVE = the setting value + the CRITICAL-log tripwire above.

**Catalog:** `verify` mode checks every Price (CAD, amount, interval, licensed, no trial, tax exclusive, correct product), the meter (sum / by_id `stripe_customer_id` / `value`), the overage Price (metered, monthly, 5¢, exclusive, same meter), tax settings/registration summary, webhook endpoint (URL, 4 events, enabled, API version), and default portal configuration. The application re-validates the plan Price and overage Price on every Checkout (fail-closed).

## 5. Rollback (if LIVE configuration is wrong)

| Symptom | Action |
|---|---|
| Wrong Price amount/interval/tax in LIVE, **no customer yet** | Archive the Price (`active=false`), create the corrected one under a new `lookup_key` version, update the env var, redeploy. Never edit amounts. |
| Wrong Price **after** a customer subscribed | Do not archive Prices that live subscriptions use. Fix forward with `updateStripeSubscriptionPrice` / Stripe Dashboard per-subscription, operator-approved. |
| Checkout won't open / "Price … does not match" | The guard is working: compare `verify` output to env vars; fix env, redeploy. |
| Webhook secret wrong (400 on every delivery) | Roll the signing secret in the Dashboard, update `STRIPE_WEBHOOK_SECRET`, redeploy, **resend** failed events from the Dashboard (handler is idempotent per `event.id`; Stripe also retries ~3 days). |
| Anything severe, before the first LIVE customer | Restore the **previous** Production Stripe env values captured in step 6 and redeploy (promote the previous deployment is *not* enough — env is read at deploy time for new deployments only). No customer data is affected because no LIVE customer exists yet. |
| Meter/overage misconfigured | Unset `STRIPE_SMS_OVERAGE_METER_EVENT_NAME` (overage stops being reported; the daily cron retries pending reports for ≤30 days so nothing is lost) and/or archive the overage Price; fix; restore. |
| A real LIVE subscription exists and must be unwound | Operator action in the Dashboard (cancel immediately, refund if charged); the `customer.subscription.deleted` webhook sets the shop `CANCELED` → RESTRICTED. Never edit `Subscription` rows by hand except a documented grandfather case. |

## 6. Open items that block LIVE (operator input)

1. Legal entity (registered legal name/form of GABAN Solutions), NEQ, legal-notice address — for Stripe account details, invoices and Terms. *TODO-OPERATOR; not recorded in source control.*
2. GST/HST and QST registration status and Stripe Tax registrations — decides whether LIVE Checkout charges tax. *TODO-OPERATOR; never commit numbers.*
3. LIVE Stripe account id + the access mechanism in §2.
4. Confirmation that product tax code `txcd_10103001` is the intended classification.

Not a blocker to the cutover: the EFVP sign-off and the Neon/Pusher agreement confirmations (`docs/compliance/privacy-impact-assessment.md` §7) gate the first **non-operator personal information** in Production, not Stripe LIVE activation or the operator-only rehearsal.

## 7. Follow-ups discovered (non-blocking, not changed in this session)

- Stripe-hosted receipts/emails/Portal language: `createStripeCustomer` does not set `preferred_locales` and Checkout does not set `locale`; Stripe falls back to the browser/account locale. Rehearsal check: confirm a French-browser owner sees French Checkout. Candidate small code change after the cutover (set `preferred_locales` from the shop's `defaultLanguage`).
- The TEST overage Price has `tax_behavior: unspecified` (works through the TEST account default); the LIVE script sets `exclusive`.
- Preview Stripe TEST webhook URL embeds a Vercel protection-bypass token — see `docs/operations-runbook.md` → "Security token follow-ups".
