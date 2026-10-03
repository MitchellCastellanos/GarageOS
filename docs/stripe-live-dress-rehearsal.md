# GarageOS — Production LIVE dress rehearsal (prepared 2026-10-02, NOT executed)

Run **only after** `docs/stripe-live-cutover.md` is complete (LIVE catalog verified, nine Production Stripe variables updated, Production redeployed, TEST endpoint on the production URL removed). One human operator present at the keyboard and the phone/mailbox; one controlled action at a time; record evidence (no card data, no secrets, no real customer data) in `docs/launch-readiness.md`.

## Already proven — do NOT repeat
Stripe **TEST** E2E (Checkout, 14-day trial/$0 today, monthly + metered overage attachment, duplicate-checkout protection, webhook lifecycle, cancel/resume, failed payment → `past_due`, ≥48 h → RESTRICTED, recovery, annual provider-level behavior); Twilio Production outbound/inbound/STOP/START (dedicated number); Resend Production QUOTE delivery; Google OAuth Production; Neon restore drill and the off-platform backup/restore drill. The rehearsal below only proves what differs in LIVE: the LIVE account, LIVE catalog, LIVE webhook, a real card, real tax.

## Who/what is used
- **Test identity:** a *new* dedicated rehearsal shop created through the normal owner signup path with an operator-owned mailbox (e.g. a plus-address or alias on a domain the operator controls), named so it is obviously internal (`ZZ Rehearsal – internal`). A *new* shop is required: a shop that already had a Stripe subscription gets **no trial and an immediate charge** (`decideTrialPlan`).
- **Do not use Pichitos Garage** for billing: it is the retained smoke-test fixture (Complete, ACTIVE, no Stripe customer, its own Twilio number). Giving it a LIVE subscription would change its state permanently.
- **Demo-conversion leg** needs a *separate* prepared Sales Demo shop (also internal, operator-owned contact) — not a real prospect.
- **Card:** the operator's own real card. Only a real card works in LIVE; Stripe test cards are rejected.
- **Plan/interval:** do the main run on **Core monthly** (cheapest real charge exposure: CAD $199 + tax if the trial were ever allowed to end). Optionally one **Core annual** run to prove the overage item is attached to an annual LIVE subscription (CAD $1,990 + tax exposure if not cancelled).

## What can cost real money (and how it is prevented)
| Action | Real charge? | Control |
|---|---|---|
| Checkout with trial | **$0 today** (card is only validated/authorized by Stripe; some banks show a $0/pending authorization) | Stop the run if the Checkout page shows anything other than "Today $0.00" |
| Trial running | None until day 14 | **Cancel immediately in the Stripe LIVE Dashboard** at the end of the rehearsal (see Cleanup) — GarageOS's own Cancel uses `cancel_at: max_period_end` and would leave the subscription alive until trial end |
| SMS overage meter test | `$0.05` + tax per segment, billed at the next invoice | Optional step B-12 only; one event, subscription cancelled in trial → never invoiced |
| Trial ends / subscription left alive | **CAD plan price + tax** | Cleanup is mandatory the same day; calendar a reminder for day 13 as a backstop |
| Real SMS/email to the operator | Twilio/Resend usage (cents) | Operator's own number/mailbox only |
| Failed-payment / dunning | Not exercised in LIVE (proven in TEST) | Do not attempt |

## Sequence (mechanical)
**Before starting:** (1) confirm Production is `READY` on the intended commit; (2) confirm the rollback path is known (cutover doc §5, previous env values in the operator's secret store, previous deployment id noted); (3) Stripe LIVE Dashboard open on Webhooks → Event deliveries and Customers; Vercel runtime logs open on `/api/stripe/webhook`; (4) take note of the time.

**A. Owner signup / activation**
1. Sign up the rehearsal shop (email + password path; a second run may use Google). Complete onboarding to the plan step. *Verify:* shop created, `Subscription` row `AWAITING_PLAN`, no free-Core fallback (restricted/setup state, not Core entitlements).
2. Select **Core / Monthly**. *Verify:* the quote shows **Today $0**, due date = today + 14 days, amount = $199 CAD + tax as applicable (UI values come from `PLAN_PRICING_CAD`).

**B. Stripe Checkout (LIVE)**
3. Continue to Checkout. *Verify:* Stripe URL is `checkout.stripe.com` and the page is **LIVE** (no "test mode" banner); line items: Core monthly (+ SMS overage metered line); "Today $0.00"; "then CAD 199.00/month starting <day+14>"; **tax lines match the registration state** (QST/GST if registered; none if the operator confirmed not registered); billing address required; tax-id field present; language follows the browser (test once with a French browser).
4. Enter the real card and confirm. *Verify:* success redirect to GarageOS Billing; no error.
5. **Webhook (real):** within seconds the LIVE Dashboard shows `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` → all **2xx**. *Verify in DB (read-only):* `Subscription` row for the shop: `plan=CORE`, `billingInterval=MONTHLY`, `status=TRIALING`, `trialEndsAt≈day+14`, `stripeCustomerId`/`stripeSubscriptionId` set, `stripePriceId` = the LIVE Core monthly Price; exactly one `StripeWebhookEvent` per event id with `completedAt`.
6. **Entitlements match the plan:** log in as the owner → Core features available, Pro-only features (e.g. `reports.advanced`, `accounting.light`, campaigns/custom domain) correctly **gated**; plan badge, trial banner (first charge date + amount) correct. *Verify:* nothing shows Pro/Complete, nothing silently downgrades/upgrades.
7. **Selected plan/interval remain authoritative:** reload Billing; replay is not needed — confirm the Billing card shows Core / Monthly / trial end / next payment.
8. **Duplicate Checkout protection:** from Billing try to start another Checkout (and open two tabs). *Expected:* the app routes to the Portal / refuses; Stripe LIVE shows **one** customer, **one** subscription for the shop. If a second subscription ever appears, the webhook cancels it (`duplicate_canceled`) — treat any occurrence as a stop condition.

**C. Portal and cancel/resume**
9. Billing → manage payment method → Stripe portal opens (LIVE): shows payment methods, invoices, billing details; **no cancel / no plan switch**. Return link works.
10. **Cancel/resume semantics:** Billing → Cancel. *Verify:* `cancelAtPeriodEnd=true` in GarageOS, Stripe subscription has `cancel_at` set (≈ trial end), shop keeps access. → "Keep my subscription" resumes: `cancel_at` cleared, state unchanged. (Both from the TEST-proven path; here we only confirm LIVE behaves the same.)
11. **No accidental free-Core fallback:** confirm via Billing/entitlements that while TRIALING the plan is Core (the *selected* plan), and that after final cleanup (step 20) the shop is `CANCELED` → RESTRICTED with **no plan** (never Core).

**D. Providers, messaging, SMS**
12. **Provider effects only where intended:** `PROVIDER_SIDE_EFFECTS=enabled` is Production-only; Preview must still be `disabled`. With the rehearsal shop (needs its own dedicated number — a Twilio purchase; **skip number provisioning unless the operator explicitly approves the cost**) send exactly one transactional email to the operator's mailbox (e.g. a quote) and observe: one `CommunicationMessage`, one provider send, one delivery, one webhook, no duplicates. SMS allowance leg: if a dedicated number exists, send one SMS to the operator → usage shows 1 of 300 segments, **0 overage**, no meter event. *(Optional B-12, explicit approval, $0.05 exposure:)* to prove the LIVE meter + customer mapping without 300+ real SMS, the operator or agent posts **one** meter event for the rehearsal customer with a unique identifier `rehearsal-<date>` and value 1, then reads the meter's event summaries for that customer (value 1). Because the subscription is still trialing and is cancelled at cleanup, no invoice is produced.
13. **No duplicate messages:** re-run the daily cron manually only if the operator wants a check (`/api/webhooks/cron` with the cron secret) — a second invocation in the same window must produce no second reminder (claim logic from Launch Agent 1).

**E. Demo → paid conversion (separate demo shop)**
14. Using the existing Sales Demo flow (activation link to the operator's mailbox → owner accepts → payment): complete **one** Core monthly Checkout for the demo shop. *Verify:* the **same Shop id** converts (`SalesDemo` → `CONVERTED` only via authoritative sync; no second shop), `finalizeSalesDemo` ran, subscription `TRIALING`, entitlements = Core.
15. **Historical demo SMS excluded:** any SMS sent during the demo period keeps `salesDemoOriginId`; usage/overage queries exclude it; *verify* the usage summary counts only post-conversion paid messages, and `reportSmsOverageUsage` would refuse a demo-origin message.
16. **New paid SMS follows normal rules:** one post-conversion SMS counts as 1 segment against the 300 Core allowance, 0 overage (as in step 12).

**F. Cleanup (same day) and evidence**
17. Stripe LIVE Dashboard → each rehearsal subscription → **Cancel immediately** (no proration, no invoice — they are still trialing). Confirm `customer.subscription.deleted` 2xx → GarageOS `Subscription.status=CANCELED`, shop RESTRICTED.
18. Leave the Stripe customers (they are evidence and have no cost); do **not** delete subscriptions' history. Delete nothing in the GarageOS DB; keep the rehearsal shops as internal fixtures (like Pichitos) or archive them through normal admin controls only with operator approval. Do not touch Pichitos Garage.
19. Capture in `docs/launch-readiness.md`: date, commit, Stripe event ids (not payloads), the delivery statuses, the DB field values (no ids that identify a person), screenshots of Checkout ("Today $0.00" + future amount), Portal, dunning setting, meter summary. Never include card digits, emails, phone numbers.
20. Stop-condition review → then the final **rollback/failure verification** and the GO/NO-GO decision (out of this document's scope).

## Stop conditions (abort and roll back to the previous Stripe env values)
- Checkout shows a non-zero "Today" amount, a wrong future amount, a wrong currency, or a test-mode banner.
- Any webhook delivery ≠ 2xx after retries, or a `CRITICAL` / `firma inválida` log line.
- A second Stripe customer or subscription for one shop; `duplicate_canceled` appears.
- Entitlements of any plan other than the selected one; any state resolving to a free Core.
- Any duplicate customer-facing message.
- Tax behavior differs from what the operator declared (e.g. tax charged while not registered, or none charged while registered).
- Any real charge appears on the operator's card statement other than a $0 authorization.
