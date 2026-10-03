#!/usr/bin/env node
// GarageOS — Stripe LIVE catalog provisioning + verification. NOT EXECUTED in the pre-live closure session.
//
//   node scripts/stripe-live-provision.mjs verify            # read-only audit of the LIVE account (default)
//   node scripts/stripe-live-provision.mjs plan              # read-only: shows what `apply` would create
//   node scripts/stripe-live-provision.mjs apply --apply     # creates ONLY missing products / meter / prices
//
// Fail-closed contract (see docs/stripe-live-cutover.md):
//   * the key comes from STRIPE_LIVE_SECRET_KEY (deliberately NOT STRIPE_SECRET_KEY, so a shell that still holds a
//     TEST key can never be mistaken for LIVE) and must be sk_live_/rk_live_;
//   * EXPECTED_STRIPE_ACCOUNT_ID must equal the account the key belongs to (read from the API before anything else);
//   * `apply` additionally needs the flag --apply AND
//       GARAGEOS_STRIPE_LIVE_AUTHORIZATION="CREATE_GARAGEOS_LIVE_RESOURCES:<that account id>"
//     typed by the operator for this run — an agent must never invent it;
//   * idempotent: resources are matched by lookup_key / metadata / meter event_name; an existing resource that
//     differs from the manifest ABORTS the run (Stripe Prices are immutable — never "fixed" silently);
//   * it never prints keys or signing secrets; the webhook endpoint and Customer Portal are verified, not created
//     (the signing secret is read from the Dashboard; an API-created portal configuration is not the default one).
// Secrets are never stored in this file. Nothing here touches the database or Vercel.

import Stripe from "stripe";

const [, , modeArg = "verify", ...flags] = process.argv;
const MODE = modeArg;
const APPLY_FLAG = flags.includes("--apply");

// ── Manifest (mirrors src/config/entitlements.ts PLAN_PRICING_CAD, src/domain/sms.ts, src/lib/stripe.ts) ──────────
const TAX_CODE = "txcd_10103001"; // same code used by the TEST catalog (SaaS — business use); confirm with the accountant
const PLANS = [
  { key: "core", plan: "CORE", name: "GarageOS Core", monthly: 19900, yearly: 199000 },
  { key: "pro", plan: "PRO", name: "GarageOS Pro", monthly: 29900, yearly: 299000 },
  { key: "complete", plan: "COMPLETE", name: "GarageOS Complete", monthly: 44900, yearly: 449000 },
];
const OVERAGE = {
  productKey: "sms_overage",
  productName: "SMS overage",
  // Canonical contract = the proven TEST meter (billing.meter.created evt_1UKfrG…, 2026-09-29) and the TEST/Preview
  // value of STRIPE_SMS_OVERAGE_METER_EVENT_NAME. The app has NO default: it sends exactly the env value.
  meterEventName: "sms_overage_segments", // -> STRIPE_SMS_OVERAGE_METER_EVENT_NAME
  meterDisplayName: "SMS overage segments",
  lookupKey: "garageos_sms_overage_monthly",
  unitAmountDecimal: "5", // CAD cents per segment = $0.05
};
const WEBHOOK_URL = "https://www.garage-os.ca/api/stripe/webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];
const SDK_API_VERSION = "2026-08-26.dahlia"; // pinned by stripe@22.x in package.json

const lk = (p, i) => `garageos_${p.key}_${i}`;

function die(msg, code = 2) {
  console.error(`REFUSED: ${msg}`);
  process.exit(code);
}

// ── Fail-closed preconditions ─────────────────────────────────────────────────
if (!["verify", "plan", "apply"].includes(MODE)) die(`unknown mode "${MODE}" (verify | plan | apply)`);
const key = process.env.STRIPE_LIVE_SECRET_KEY?.trim();
if (!key) die("STRIPE_LIVE_SECRET_KEY is not set");
if (!/^(sk|rk)_live_[A-Za-z0-9_]+$/.test(key)) die("STRIPE_LIVE_SECRET_KEY is not a live-mode key (sk_live_/rk_live_)");
const expectedAccount = process.env.EXPECTED_STRIPE_ACCOUNT_ID?.trim();
if (!expectedAccount || !/^acct_[A-Za-z0-9]+$/.test(expectedAccount)) die("EXPECTED_STRIPE_ACCOUNT_ID (acct_…) is required");
if (MODE === "apply") {
  if (!APPLY_FLAG) die("apply mode requires the --apply flag");
  if (process.env.GARAGEOS_STRIPE_LIVE_AUTHORIZATION !== `CREATE_GARAGEOS_LIVE_RESOURCES:${expectedAccount}`) {
    die("GARAGEOS_STRIPE_LIVE_AUTHORIZATION is missing or does not match CREATE_GARAGEOS_LIVE_RESOURCES:<account id>");
  }
}

const stripe = new Stripe(key, { apiVersion: SDK_API_VERSION });
const problems = [];
const warnings = [];
const created = [];
const ids = {}; // env var -> id (IDs are not secrets)

async function all(listPromise) {
  return listPromise.autoPagingToArray({ limit: 1000 });
}

async function assertAccount() {
  const acct = await stripe.accounts.retrieve();
  if (acct.id !== expectedAccount) die(`key belongs to ${acct.id}, expected ${expectedAccount} — wrong Stripe account`, 3);
  console.log(`account: ${acct.id} · country ${acct.country} · default currency ${acct.default_currency}`);
}

function creating(what, fn) {
  if (MODE === "apply") return fn().then((r) => (created.push(what), r));
  console.log(`  [${MODE}] would create: ${what}`);
  return Promise.resolve(null);
}

// ── Products ──────────────────────────────────────────────────────────────────
async function ensureProduct(garageosKey, name, description) {
  const products = (await all(stripe.products.list({ active: true }))).filter((p) => p.metadata?.garageos_key === garageosKey);
  if (products.length > 1) die(`more than one active product with garageos_key=${garageosKey}`, 4);
  if (products.length === 1) {
    const p = products[0];
    if (p.tax_code !== TAX_CODE) problems.push(`product ${garageosKey}: tax_code is ${p.tax_code}, expected ${TAX_CODE}`);
    return p;
  }
  return creating(`product ${garageosKey}`, () =>
    stripe.products.create(
      { name, description, tax_code: TAX_CODE, metadata: { garageos_key: garageosKey } },
      { idempotencyKey: `garageos-live-product-${garageosKey}-v1` }
    )
  );
}

// ── Meter ─────────────────────────────────────────────────────────────────────
async function ensureMeter() {
  const meters = (await all(stripe.billing.meters.list({ status: "active" }))).filter((m) => m.event_name === OVERAGE.meterEventName);
  if (meters.length > 1) die(`more than one active meter for ${OVERAGE.meterEventName}`, 4);
  if (meters.length === 1) {
    const m = meters[0];
    if (m.default_aggregation?.formula !== "sum") problems.push(`meter aggregation is ${m.default_aggregation?.formula}, expected sum`);
    if (m.customer_mapping?.event_payload_key !== "stripe_customer_id" || m.customer_mapping?.type !== "by_id") {
      problems.push("meter customer_mapping must be by_id on payload key stripe_customer_id");
    }
    if (m.value_settings?.event_payload_key !== "value") problems.push("meter value_settings.event_payload_key must be 'value'");
    return m;
  }
  return creating(`meter ${OVERAGE.meterEventName}`, () =>
    stripe.billing.meters.create(
      {
        display_name: OVERAGE.meterDisplayName,
        event_name: OVERAGE.meterEventName,
        default_aggregation: { formula: "sum" },
        customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" },
        value_settings: { event_payload_key: "value" },
      },
      { idempotencyKey: "garageos-live-meter-sms-overage-v1" }
    )
  );
}

// ── Prices ────────────────────────────────────────────────────────────────────
function planPriceProblem(price, expectedAmount, interval, productId) {
  const out = [];
  if (!price.active) out.push("archived");
  if (price.currency !== "cad") out.push(`currency ${price.currency}`);
  if (price.unit_amount !== expectedAmount) out.push(`amount ${price.unit_amount} != ${expectedAmount}`);
  if (price.recurring?.interval !== interval || price.recurring?.interval_count !== 1) out.push("interval");
  if (price.recurring?.usage_type !== "licensed") out.push("not licensed");
  if (price.recurring?.trial_period_days) out.push("price carries a trial (trial must come from Checkout only)");
  if (price.tax_behavior !== "exclusive") out.push(`tax_behavior ${price.tax_behavior}, expected exclusive`);
  if (productId && price.product !== productId) out.push("wrong product");
  return out;
}

async function ensurePlanPrice(plan, product, intervalKey) {
  const interval = intervalKey === "monthly" ? "month" : "year";
  const amount = plan[intervalKey];
  const lookupKey = lk(plan, intervalKey);
  const found = await all(stripe.prices.list({ lookup_keys: [lookupKey], active: true }));
  const envVar = `STRIPE_PRICE_${plan.plan}_${intervalKey === "monthly" ? "MONTHLY" : "YEARLY"}`;
  if (found.length > 1) die(`more than one active price with lookup_key ${lookupKey}`, 4);
  if (found.length === 1) {
    const bad = planPriceProblem(found[0], amount, interval, product?.id);
    if (bad.length) problems.push(`price ${lookupKey}: ${bad.join(", ")}`);
    ids[envVar] = found[0].id;
    return;
  }
  if (!product) return creating(`price ${lookupKey}`, async () => null); // product itself is only being planned
  const price = await creating(`price ${lookupKey}`, () =>
    stripe.prices.create(
      {
        product: product.id,
        currency: "cad",
        unit_amount: amount,
        recurring: { interval, interval_count: 1 },
        tax_behavior: "exclusive",
        lookup_key: lookupKey,
        nickname: `${plan.name.replace("GarageOS ", "")} - ${intervalKey === "monthly" ? "Monthly" : "Annual"}`,
        metadata: { plan: plan.plan, interval: intervalKey === "monthly" ? "MONTHLY" : "YEARLY" },
      },
      { idempotencyKey: `garageos-live-price-${lookupKey}-v1` }
    )
  );
  if (price) ids[envVar] = price.id;
}

async function ensureOveragePrice(product, meter) {
  const found = await all(stripe.prices.list({ lookup_keys: [OVERAGE.lookupKey], active: true }));
  if (found.length > 1) die(`more than one active price with lookup_key ${OVERAGE.lookupKey}`, 4);
  if (found.length === 1) {
    const p = found[0];
    const bad = [];
    if (p.currency !== "cad") bad.push(`currency ${p.currency}`);
    if (p.recurring?.usage_type !== "metered") bad.push("not metered");
    if (p.recurring?.interval !== "month" || p.recurring?.interval_count !== 1) bad.push("not monthly");
    if (p.unit_amount_decimal !== OVERAGE.unitAmountDecimal) bad.push(`unit_amount_decimal ${p.unit_amount_decimal} != ${OVERAGE.unitAmountDecimal}`);
    if (p.tax_behavior !== "exclusive") bad.push(`tax_behavior ${p.tax_behavior}, expected exclusive`);
    if (meter && p.recurring?.meter !== meter.id) bad.push("attached to a different meter");
    if (bad.length) problems.push(`price ${OVERAGE.lookupKey}: ${bad.join(", ")}`);
    ids.STRIPE_SMS_OVERAGE_PRICE_ID = p.id;
    return;
  }
  if (!product || !meter) return creating(`price ${OVERAGE.lookupKey}`, async () => null);
  const price = await creating(`price ${OVERAGE.lookupKey}`, () =>
    stripe.prices.create(
      {
        product: product.id,
        currency: "cad",
        unit_amount_decimal: OVERAGE.unitAmountDecimal,
        recurring: { interval: "month", interval_count: 1, usage_type: "metered", meter: meter.id },
        billing_scheme: "per_unit",
        tax_behavior: "exclusive",
        lookup_key: OVERAGE.lookupKey,
        nickname: "SMS overage segments - $0.05 CAD/segment",
      },
      { idempotencyKey: `garageos-live-price-${OVERAGE.lookupKey}-v1` }
    )
  );
  if (price) ids.STRIPE_SMS_OVERAGE_PRICE_ID = price.id;
}

// ── Read-only verification of things the script never creates ─────────────────
async function verifyTax() {
  try {
    const s = await stripe.tax.settings.retrieve();
    console.log(`tax settings: status=${s.status} default tax_behavior=${s.defaults?.tax_behavior} head_office=${s.head_office?.address?.country}/${s.head_office?.address?.state}`);
    if (s.status !== "active") problems.push("Stripe Tax settings are not active");
    const regs = await all(stripe.tax.registrations.list({ status: "active" }));
    const summary = regs.map((r) => `${r.country}${r.country_options?.ca?.type ? `:${r.country_options.ca.type}` : ""}`);
    console.log(`active tax registrations (country[:type] only): ${summary.join(", ") || "NONE"}`);
    if (!regs.some((r) => r.country === "CA")) {
      warnings.push("no active CA tax registration: automatic_tax will collect NO GST/QST — only acceptable if the operator confirms not-yet-registered/small-supplier status");
    }
  } catch (err) {
    warnings.push(`could not read Stripe Tax (${err?.code ?? err?.message}) — check the key's permissions`);
  }
}

async function verifyWebhook() {
  const eps = await all(stripe.webhookEndpoints.list());
  const mine = eps.filter((e) => e.url === WEBHOOK_URL);
  for (const e of eps) if (e.url !== WEBHOOK_URL && /garage-os\.ca/.test(e.url)) warnings.push(`unexpected LIVE endpoint on garage-os.ca: ${e.id}`);
  if (mine.length !== 1) return problems.push(`expected exactly one LIVE webhook endpoint at ${WEBHOOK_URL}, found ${mine.length}`);
  const e = mine[0];
  if (e.status !== "enabled") problems.push("webhook endpoint is not enabled");
  const missing = WEBHOOK_EVENTS.filter((t) => !e.enabled_events.includes(t));
  const extra = e.enabled_events.filter((t) => !WEBHOOK_EVENTS.includes(t));
  if (missing.length) problems.push(`webhook missing events: ${missing.join(", ")}`);
  if (extra.length) warnings.push(`webhook has extra events (harmless, handler ignores them): ${extra.join(", ")}`);
  if (e.api_version && e.api_version !== SDK_API_VERSION) warnings.push(`webhook api_version ${e.api_version} differs from SDK ${SDK_API_VERSION}`);
  if (!e.api_version) warnings.push(`webhook uses the account default API version — prefer pinning ${SDK_API_VERSION}`);
  console.log(`webhook: ${e.id} status=${e.status} events=${e.enabled_events.length}`);
}

async function verifyPortal() {
  const configs = await all(stripe.billingPortal.configurations.list({ active: true }));
  const d = configs.find((c) => c.is_default);
  if (!d) return problems.push("no default Customer Portal configuration (create it in Dashboard → Settings → Billing → Customer portal)");
  const f = d.features;
  if (f.subscription_cancel?.enabled) problems.push("portal: subscription_cancel must be OFF");
  if (f.subscription_update?.enabled) problems.push("portal: subscription_update (plan switching) must be OFF");
  if (f.subscription_pause?.enabled) problems.push("portal: subscription_pause must be OFF");
  if (!f.payment_method_update?.enabled) problems.push("portal: payment_method_update should be ON");
  if (!f.invoice_history?.enabled) warnings.push("portal: invoice_history is OFF (expected ON)");
  console.log(`portal default config: ${d.id} cancel=${f.subscription_cancel?.enabled} update=${f.subscription_update?.enabled}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
// In apply mode never create anything on top of an existing resource that already disagrees with the manifest.
function guardApply() {
  if (MODE === "apply" && problems.length) {
    for (const p of problems) console.error(`PROBLEM: ${p}`);
    die("existing LIVE resources disagree with the manifest — aborting before creating anything else", 4);
  }
}

async function main() {
  console.log(`GarageOS Stripe LIVE ${MODE.toUpperCase()}${MODE === "apply" ? " (WRITES ENABLED)" : " (read-only)"}`);
  await assertAccount();

  const overageProduct = await ensureProduct(OVERAGE.productKey, OVERAGE.productName, "SMS segments beyond the plan's monthly allowance — GarageOS");
  const meter = await ensureMeter();
  guardApply();
  ids.STRIPE_SMS_OVERAGE_METER_EVENT_NAME = OVERAGE.meterEventName;
  for (const plan of PLANS) {
    const product = await ensureProduct(plan.key, plan.name, `${plan.name} plan`);
    guardApply();
    await ensurePlanPrice(plan, product, "monthly");
    await ensurePlanPrice(plan, product, "yearly");
  }
  await ensureOveragePrice(overageProduct, meter);

  await verifyTax();
  await verifyWebhook();
  await verifyPortal();

  console.log("\nVercel Production env mapping (IDs only — never paste keys here):");
  for (const [k, v] of Object.entries(ids)) console.log(`  ${k}=${v}`);
  if (created.length) console.log(`\ncreated in LIVE: ${created.join("; ")}`);
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  if (problems.length) {
    for (const p of problems) console.error(`PROBLEM: ${p}`);
    process.exit(1);
  }
  console.log(MODE === "apply" ? "\nOK — re-run `verify` and complete the dashboard-only steps." : "\nOK (no problems found).");
}

main().catch((err) => {
  console.error(`FAILED: ${err?.code ?? ""} ${err?.message ?? err}`);
  process.exit(1);
});
