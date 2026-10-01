/* eslint-disable @typescript-eslint/no-explicit-any -- SDK fakes are loosely typed on purpose */
// Política de efectos salientes hacia proveedores: tener credenciales NO basta.
// Ningún test llama a un proveedor real: `fetch` global es una trampa que registra/lanza, los métodos del SDK
// de Stripe/Pusher se reemplazan por fakes, y todas las credenciales son claves de mentira.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { patchDb } from "./helpers/db-mock";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

// Credenciales de mentira con FORMA real (un entorno Preview "accidentalmente" equipado).
const FAKE_ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: "sk_test_FAKEFAKEFAKEFAKE0000",
  STRIPE_WEBHOOK_SECRET: "whsec_fakefakefakefake",
  TWILIO_ACCOUNT_SID: "ACffffffffffffffffffffffffffffffff",
  TWILIO_AUTH_TOKEN: "fakefakefakefakefakefakefakefake",
  TWILIO_FROM_NUMBER: "+15145550000",
  RESEND_API_KEY: "re_FAKEFAKEFAKEFAKE0000",
  EMAIL_FROM: "GarageOS <noreply@example.test>",
  PUSHER_APP_ID: "1",
  PUSHER_KEY: "fakekey",
  PUSHER_SECRET: "fakesecret",
  PUSHER_CLUSTER: "us2",
  TELEGRAM_BOT_TOKEN: "123456:FAKE",
  TELEGRAM_CHAT_ID: "999",
  QBO_CLIENT_ID: "fakeqbo",
  QBO_CLIENT_SECRET: "fakeqbosecret",
  CRON_SECRET: "cron-secret-long-enough-0000",
  NEXT_PUBLIC_APP_URL: "https://preview.example.test",
};
const POLICY_VARS = ["PROVIDER_SIDE_EFFECTS", "STRIPE_TEST_MUTATIONS"];

/** Fija el entorno del test y lo restaura. `flag` = valor de PROVIDER_SIDE_EFFECTS (undefined = ausente). */
function env(t: TestContext, flag: string | undefined, extra: Record<string, string | undefined> = {}) {
  const snapshot: Record<string, string | undefined> = {};
  const next = { ...FAKE_ENV, PROVIDER_SIDE_EFFECTS: flag, STRIPE_TEST_MUTATIONS: undefined, ...extra };
  for (const k of new Set([...Object.keys(next), ...POLICY_VARS])) {
    snapshot[k] = process.env[k];
    const v = (next as Record<string, string | undefined>)[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

/** `fetch` global trampa: nada sale a la red. Devuelve las URLs "llamadas" y permite un fake por test. */
function trapFetch(t: TestContext, fake?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input?.url ?? input);
    calls.push(url);
    if (!fake) throw new Error(`NETWORK BLOCKED IN TEST: ${url}`);
    return fake(url, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = real;
  });
  t.mock.method(console, "warn", () => {});
  return calls;
}

const policy = await import("../src/lib/provider-policy");
const { ProviderDisabledError, providerSideEffectsEnabled, stripeMutationsAllowed, parseEnabledFlag } = policy;

// ── Parseo estricto ──────────────────────────────────────────────────────────

test("only the literal `enabled` authorizes outbound side effects; missing / empty / invalid fail CLOSED", () => {
  assert.equal(providerSideEffectsEnabled({}), false, "missing");
  for (const bad of ["", " ", "true", "TRUE", "1", "yes", "on", "enable", "enabled!", "disabled", "production", "0", "null", "undefined"]) {
    assert.equal(providerSideEffectsEnabled({ PROVIDER_SIDE_EFFECTS: bad }), false, JSON.stringify(bad));
  }
  assert.equal(providerSideEffectsEnabled({ PROVIDER_SIDE_EFFECTS: "enabled" }), true);
  assert.equal(providerSideEffectsEnabled({ PROVIDER_SIDE_EFFECTS: " Enabled " }), true, "tolerant of case/whitespace, nothing else");
  assert.equal(parseEnabledFlag(undefined), false);
});

test("credentials alone are never the switch: no variable other than PROVIDER_SIDE_EFFECTS enables the global policy", () => {
  assert.equal(providerSideEffectsEnabled({ ...FAKE_ENV }), false);
  assert.equal(providerSideEffectsEnabled({ ...FAKE_ENV, STRIPE_TEST_MUTATIONS: "enabled", VERCEL_ENV: "production", NODE_ENV: "production" }), false);
});

test("ProviderDisabledError is user-safe: no variable names, credentials or provider config in its message", () => {
  const err = new ProviderDisabledError("twilio", "messages.create");
  assert.doesNotMatch(err.message, /PROVIDER_SIDE_EFFECTS|KEY|TOKEN|SECRET|TWILIO|ACff|env/i);
  assert.equal(err.code, "PROVIDER_SIDE_EFFECTS_DISABLED");
  assert.equal(policy.isProviderDisabledError(err), true);
  assert.equal(policy.isProviderDisabledError(new Error("x")), false);
});

// ── Twilio ───────────────────────────────────────────────────────────────────

test("TWILIO: with credentials but side effects missing / invalid / disabled, SMS and number management are blocked", async (t) => {
  const twilio = await import("../src/lib/communications/twilio");
  const numbers = await import("../src/lib/communications/sms-numbers");
  const { recordAndSend } = await import("../src/lib/communications/outbox");
  const calls = trapFetch(t);

  for (const flag of [undefined, "", "true", "1", "disabled", "garbage"]) {
    env(t, flag);
    assert.equal(twilio.isTwilioConfigured(), true, "credentials ARE present");
    assert.throws(() => twilio.getTwilioClientForWrite(null, "messages.create"), ProviderDisabledError, String(flag));
    assert.throws(() => twilio.getTwilioParentClientForWrite("subaccounts.create"), ProviderDisabledError);
    // Gestión facturable: falla ANTES de tocar la DB (la DB no está mockeada: si la tocara, el error sería otro).
    await assert.rejects(() => numbers.provisionShopSmsNumber({ shopId: "s", actorUserId: "u" }), ProviderDisabledError);
    await assert.rejects(() => numbers.releaseShopSmsNumber({ shopId: "s", reason: "x" }), ProviderDisabledError);
    assert.deepEqual(await numbers.runSmsNumberLifecycle(), { scheduled: [], cancelled: [], released: [], errors: 0 });
    // El límite común del outbox: nada se reserva, nada se envía.
    let sent = 0;
    await assert.rejects(
      () => recordAndSend({ shopId: "s", purpose: "REMINDER", channel: "SMS", provider: "twilio", from: "+1", to: ["+2"], send: async () => (sent++, {}) }),
      ProviderDisabledError
    );
    assert.equal(sent, 0);
  }
  assert.equal(calls.length, 0, "no network call was even attempted");
});

test("TWILIO: with side effects ENABLED the write clients are handed out and the outbox reaches a FAKE provider", async (t) => {
  env(t, "enabled");
  const twilio = await import("../src/lib/communications/twilio");
  const { recordAndSend } = await import("../src/lib/communications/outbox");
  assert.ok(twilio.getTwilioClientForWrite(null, "messages.create"));
  assert.ok(twilio.getTwilioParentClientForWrite("subaccounts.create"));

  patchDb(t, "shop", "findUnique", (async () => ({ communicationsSuspendedAt: null })) as never);
  patchDb(t, "communicationMessage", "count", (async () => 0) as never);
  patchDb(t, "communicationMessage", "create", (async () => ({ id: "m1" })) as never);
  patchDb(t, "communicationMessage", "update", (async () => ({})) as never);
  patchDb(t, "communicationRoute", "findUnique", (async () => null) as never);
  let sent = 0;
  const res = await recordAndSend({
    shopId: "s", purpose: "APPOINTMENT", channel: "SMS", provider: "twilio", from: "+1", to: ["+2"], textBody: "hi",
    send: async () => (sent++, { providerMessageId: "SMfake" }),
  });
  assert.equal(sent, 1);
  assert.equal(res.providerMessageId, "SMfake");
});

test("TWILIO: reads and inbound validation are NOT disabled (status lookups, signed webhooks)", async (t) => {
  env(t, undefined);
  const twilio = await import("../src/lib/communications/twilio");
  const body = { AccountSid: FAKE_ENV.TWILIO_ACCOUNT_SID, MessageSid: "SM1", MessageStatus: "delivered" };
  const url = twilio.twilioWebhookUrl(twilio.TWILIO_STATUS_PATH);
  const { default: twilioLib } = await import("twilio");
  const signature = twilioLib.getExpectedTwilioSignature(FAKE_ENV.TWILIO_AUTH_TOKEN, url, body);
  assert.equal(await twilio.validateTwilioWebhook({ path: twilio.TWILIO_STATUS_PATH, signature, body }), true);
  assert.equal(await twilio.validateTwilioWebhook({ path: twilio.TWILIO_STATUS_PATH, signature: "bad", body }), false);
  assert.ok(twilio.getTwilioClientFor(null), "read client is still available");
});

// ── Resend ───────────────────────────────────────────────────────────────────

test("RESEND: transactional email, verification/platform email and managed-domain changes are blocked without authorization", async (t) => {
  const calls = trapFetch(t);
  const resend = await import("../src/lib/providers/resend");
  const domains = await import("../src/lib/domains/email");
  const { recordAndSend } = await import("../src/lib/communications/outbox");
  const { sendPlatformEmail } = await import("../src/lib/platform/notify");
  const { sendVerificationEmail } = await import("../src/lib/email-verification");
  const React = (await import("react")).default;

  for (const flag of [undefined, "", "yes", "disabled"]) {
    env(t, flag);
    const client = resend.getResendClient();
    assert.throws(() => client.emails.send({ from: "a@b.test", to: "c@d.test", subject: "s", html: "<p>x</p>" }), ProviderDisabledError, `${flag}: emails.send`);
    assert.throws(() => client.domains.create({ name: "x.example.test" }), ProviderDisabledError, "domains.create");
    assert.throws(() => client.domains.verify("dom_1"), ProviderDisabledError, "domains.verify");
    assert.throws(() => client.domains.remove("dom_1"), ProviderDisabledError, "domains.remove");
    assert.equal(resend.tryGetResendClient(), null, "best-effort callers get no client");

    await assert.rejects(() => domains.createEmailDomain("x.example.test"), ProviderDisabledError);
    await assert.rejects(() => domains.verifyEmailDomain("dom_1"), ProviderDisabledError);
    await assert.rejects(() => domains.removeEmailDomain("dom_1"), ProviderDisabledError);
    await assert.rejects(
      () => recordAndSend({ shopId: "s", purpose: "INVOICE", channel: "EMAIL", provider: "resend", from: "a@b.test", to: ["c@d.test"], send: async () => ({}) }),
      ProviderDisabledError
    );
    // Correos internos / de verificación: mejor esfuerzo — se omiten sin lanzar y sin pretender éxito.
    await sendPlatformEmail("ops@example.test", "subject", React.createElement("div", null, "x"));
    patchDb(t, "verificationToken", "deleteMany", (async () => ({ count: 0 })) as never);
    patchDb(t, "verificationToken", "create", (async () => ({})) as never);
    await sendVerificationEmail({ email: "new@example.test", name: "N" });
  }
  assert.equal(calls.length, 0, "Resend was never contacted");
});

test("RESEND: with side effects ENABLED the send path executes against a FAKE transport (and reads stay allowed)", async (t) => {
  env(t, "enabled");
  const calls = trapFetch(t, async () => new Response(JSON.stringify({ id: "em_fake" }), { status: 200, headers: { "content-type": "application/json" } }));
  const resend = await import("../src/lib/providers/resend");
  const client = resend.getResendClient();
  const { data, error } = await client.emails.send({ from: "GarageOS <a@example.test>", to: "c@example.test", subject: "s", html: "<p>x</p>" });
  assert.equal(error, null);
  assert.equal(data?.id, "em_fake");
  assert.ok(calls.some((u) => u.includes("api.resend.com/emails")), "went to the (faked) Resend endpoint");
  assert.ok(resend.tryGetResendClient(), "best-effort client available when authorized");
});

// ── Pusher ───────────────────────────────────────────────────────────────────

test("PUSHER: publishing is blocked (silent no-op) without authorization, but private-channel signing still works locally", async (t) => {
  env(t, undefined);
  t.mock.method(console, "warn", () => {});
  const pusher = await import("../src/lib/providers/pusher");
  const platform = await import("../src/lib/platform/pusher");
  const staff = await import("../src/lib/staff-notify-realtime");

  assert.equal(pusher.pusherConfigured(), true);
  assert.equal(pusher.getPusherForPublish(), null);
  // Nunca lanzan ni intentan la red (node-fetch no se puede trampear → si intentara, tardaría/fallaría ruidosamente).
  await platform.publishPlatformMessage("conv", { id: "1", sender: "SHOP", content: "x", createdAt: "now" });
  await platform.publishPlatformConversationUpdate("conv");
  await platform.publishPlatformPendingChanged();
  await staff.publishStaffNotification("u1", { id: "1", title: "t", body: "b", href: null, createdAt: "now" });

  // El cliente de auth es local: firmar una suscripción privada no es un efecto saliente.
  const signed = platform.signPusherChannelAuth("1234.5678", "private-staff-notifications-u1");
  assert.match(signed?.auth ?? "", /^fakekey:[0-9a-f]{64}$/);
  // …y si alguien intenta publicar con el cliente de auth, el gate lo corta.
  assert.throws(() => (pusher.getPusherForAuth() as any).trigger("private-x", "e", {}), ProviderDisabledError);
});

test("PUSHER: with side effects ENABLED publishing reaches the client (FAKE trigger)", async (t) => {
  env(t, "enabled");
  const pusher = await import("../src/lib/providers/pusher");
  const platform = await import("../src/lib/platform/pusher");
  const client = pusher.getPusherForPublish();
  assert.ok(client);
  const triggered: unknown[][] = [];
  (client as any).trigger = async (...args: unknown[]) => (triggered.push(args), { status: 200 });
  await platform.publishPlatformConversationUpdate("conv-1");
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0][0], "private-platform-messages-admin");
});

// ── Telegram ─────────────────────────────────────────────────────────────────

test("TELEGRAM: no bot message without authorization; with authorization it reaches a FAKE transport", async (t) => {
  // platformTelegramConfigured se evalúa al importar: las credenciales deben existir antes.
  env(t, undefined);
  const calls = trapFetch(t, async () => new Response("{}", { status: 200 }));
  const telegram = await import("../src/lib/platform/telegram");
  assert.equal(telegram.platformTelegramConfigured, true);

  for (const flag of [undefined, "true", "disabled"]) {
    env(t, flag);
    assert.equal(await telegram.sendPlatformTelegramAlert("hi"), false);
  }
  assert.equal(calls.length, 0, "Telegram was never contacted");

  env(t, "enabled");
  assert.equal(await telegram.sendPlatformTelegramAlert("hi"), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/api\.telegram\.org\/bot/);
});

// ── QuickBooks ───────────────────────────────────────────────────────────────

test("QBO: inert and fail-closed unless side effects are authorized", async (t) => {
  const { getQboConfig } = await import("../src/lib/quickbooks/client");
  env(t, undefined);
  assert.equal(getQboConfig(), null, "credentials present, still inert");
  env(t, "enabled");
  assert.equal(getQboConfig()?.environment, "sandbox", "defaults to sandbox, never production");
  env(t, "enabled", { QBO_CLIENT_ID: undefined });
  assert.equal(getQboConfig(), null);
});

// ── Stripe ───────────────────────────────────────────────────────────────────

test("STRIPE: STRIPE_SECRET_KEY alone never enables mutations (missing / invalid / disabled flag)", async (t) => {
  const stripe = await import("../src/lib/stripe");
  for (const flag of [undefined, "", "true", "disabled"]) {
    env(t, flag);
    assert.equal(stripeMutationsAllowed(), false);
    const client = stripe.getStripeClient();
    assert.throws(() => client.customers.create({ email: "a@b.test" }), ProviderDisabledError);
    assert.throws(() => client.checkout.sessions.create({ mode: "subscription" } as any), ProviderDisabledError);
    assert.throws(() => client.billingPortal.sessions.create({ customer: "cus_1", return_url: "https://x.test" }), ProviderDisabledError);
    assert.throws(() => client.subscriptions.update("sub_1", {}), ProviderDisabledError);
    assert.throws(() => client.subscriptions.cancel("sub_1"), ProviderDisabledError);
    assert.throws(() => client.billing.meterEvents.create({ event_name: "e", payload: { stripe_customer_id: "c", value: "1" } }), ProviderDisabledError);
    await assert.rejects(
      () => stripe.createCheckoutSession({ shopId: "s", plan: "PRO", interval: "MONTHLY", stripeCustomerId: "c", trial: { kind: "none" }, successUrl: "x", cancelUrl: "y" }),
      ProviderDisabledError
    );
    await assert.rejects(() => stripe.createBillingPortalSession({ stripeCustomerId: "c", returnUrl: "https://x.test" }), ProviderDisabledError);
    await assert.rejects(() => stripe.createStripeCustomer({ shopId: "s", email: "a@b.test", name: "n" }), ProviderDisabledError);
  }
});

test("STRIPE: overage reporting neither fires nor burns retry attempts when mutations are not authorized", async (t) => {
  env(t, undefined, { STRIPE_SMS_OVERAGE_METER_EVENT_NAME: "sms_overage_segments" });
  const stripe = await import("../src/lib/stripe");
  assert.equal(stripe.isSmsOverageBillingConfigured(), false, "→ settleSmsOverage returns not_configured without counting an attempt");
  assert.equal(await stripe.reportSmsOverageUsage({ stripeCustomerId: "cus_1", segments: 2, messageId: "m1" }), false);
  env(t, "enabled", { STRIPE_SMS_OVERAGE_METER_EVENT_NAME: "sms_overage_segments" });
  assert.equal(stripe.isSmsOverageBillingConfigured(), true);
});

test("STRIPE: the explicit TEST permission needs BOTH STRIPE_TEST_MUTATIONS=enabled AND a test key — never a live key, never a typo", () => {
  const base = { STRIPE_SECRET_KEY: "sk_test_abc123" };
  assert.equal(stripeMutationsAllowed({ ...base }), false, "test key alone");
  assert.equal(stripeMutationsAllowed({ ...base, STRIPE_TEST_MUTATIONS: "enabled" }), true, "explicit Stripe-TEST permission");
  assert.equal(stripeMutationsAllowed({ ...base, STRIPE_TEST_MUTATIONS: "true" }), false, "invalid value");
  assert.equal(stripeMutationsAllowed({ STRIPE_SECRET_KEY: "rk_test_abc123", STRIPE_TEST_MUTATIONS: "enabled" }), true, "restricted test key");
  assert.equal(stripeMutationsAllowed({ STRIPE_SECRET_KEY: "sk_live_abc123", STRIPE_TEST_MUTATIONS: "enabled" }), false, "live key never rides the test permission");
  assert.equal(stripeMutationsAllowed({ STRIPE_SECRET_KEY: "rk_live_abc123", STRIPE_TEST_MUTATIONS: "enabled" }), false);
  assert.equal(stripeMutationsAllowed({ STRIPE_TEST_MUTATIONS: "enabled" }), false, "no key");
  assert.equal(stripeMutationsAllowed({ STRIPE_SECRET_KEY: "sk_test_x y", STRIPE_TEST_MUTATIONS: "enabled" }), false, "malformed key");
  // Producción: el flag global autoriza (con la clave que tenga).
  assert.equal(stripeMutationsAllowed({ STRIPE_SECRET_KEY: "sk_live_abc123", PROVIDER_SIDE_EFFECTS: "enabled" }), true);
});

test("STRIPE: the TEST permission opens ONLY Stripe — SMS, email, Pusher and Telegram stay blocked", async (t) => {
  env(t, undefined, { STRIPE_TEST_MUTATIONS: "enabled" });
  trapFetch(t);
  const stripe = await import("../src/lib/stripe");
  const twilio = await import("../src/lib/communications/twilio");
  const resend = await import("../src/lib/providers/resend");
  const pusher = await import("../src/lib/providers/pusher");
  assert.equal(stripeMutationsAllowed(), true);
  assert.equal(providerSideEffectsEnabled(), false);

  // Stripe TEST: la mutación llega hasta el (fake) método del SDK.
  const client = stripe.getStripeClient();
  const created: unknown[] = [];
  (client.customers as any).create = async (p: unknown) => (created.push(p), { id: "cus_fake" });
  assert.equal(await stripe.createStripeCustomer({ shopId: "s", email: "a@b.test", name: "n" }), "cus_fake");
  assert.equal(created.length, 1);

  assert.throws(() => twilio.getTwilioClientForWrite(null, "messages.create"), ProviderDisabledError);
  assert.throws(() => resend.getResendClient().emails.send({ from: "a@b.test", to: "c@d.test", subject: "s", html: "x" }), ProviderDisabledError);
  assert.equal(pusher.getPusherForPublish(), null);
});

test("STRIPE: reads pass the gate even when mutations are blocked (prices.retrieve, subscriptions.retrieve)", async (t) => {
  env(t, undefined);
  const stripe = await import("../src/lib/stripe");
  const client = stripe.getStripeClient();
  (client.prices as any).retrieve = async (id: string) => ({ id });
  (client.subscriptions as any).retrieve = async (id: string) => ({ id });
  assert.deepEqual(await client.prices.retrieve("price_1"), { id: "price_1" });
  assert.deepEqual(await client.subscriptions.retrieve("sub_1"), { id: "sub_1" });
});

test("STRIPE INBOUND: webhook signature verification and processing are NOT disabled by the outbound policy", async (t) => {
  env(t, undefined);
  const { POST } = await import("../src/app/api/stripe/webhook/route");
  const created: string[] = [];
  patchDb(t, "stripeWebhookEvent", "create", (async ({ data }: any) => (created.push(data.id), data)) as never);

  const payload = JSON.stringify({ id: "evt_inbound_1", object: "event", type: "invoice.paid", data: { object: {} } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", FAKE_ENV.STRIPE_WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");
  const good = await POST(new Request("http://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": `t=${ts},v1=${sig}` } }) as never);
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), { received: true, duplicate: false });
  assert.deepEqual(created, ["evt_inbound_1"]);

  t.mock.method(console, "error", () => {});
  const forged = await POST(new Request("http://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": `t=${ts},v1=${"0".repeat(64)}` } }) as never);
  assert.equal(forged.status, 400, "a bad signature is still rejected");
});

test("SMS overage price validation: metered CAD monthly 5¢; tax_behavior unspecified is only OK when the account has a default", async () => {
  const { overagePriceProblem } = await import("../src/lib/stripe");
  const good = { active: true, currency: "cad", recurring: { interval: "month", interval_count: 1, usage_type: "metered" }, tax_behavior: "unspecified", unit_amount_decimal: "5" } as any;
  assert.equal(overagePriceProblem(good, "exclusive"), null, "TEST account today: default exclusive");
  assert.equal(overagePriceProblem(good, "inferred_by_currency"), null);
  assert.match(overagePriceProblem(good, null) ?? "", /no default tax behavior/);
  assert.equal(overagePriceProblem(good, undefined), null, "could not read Tax settings → inconclusive, not a hard stop");
  assert.equal(overagePriceProblem({ ...good, tax_behavior: "exclusive" }, null), null, "explicit behavior needs no account default");
  assert.match(overagePriceProblem({ ...good, active: false }, "exclusive") ?? "", /archived/);
  assert.match(overagePriceProblem({ ...good, currency: "usd" }, "exclusive") ?? "", /cad/);
  assert.match(overagePriceProblem({ ...good, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } }, "exclusive") ?? "", /not metered/);
  assert.match(overagePriceProblem({ ...good, recurring: { interval: "year", interval_count: 1, usage_type: "metered" } }, "exclusive") ?? "", /not monthly/);
  assert.match(overagePriceProblem({ ...good, unit_amount_decimal: "10" }, "exclusive") ?? "", /expected 5/);
});

// ── Cron ─────────────────────────────────────────────────────────────────────

test("CRON: without authorization the campaigns job touches nothing (no SENDING transition, no failures, no retries)", async (t) => {
  env(t, undefined);
  let touched = 0;
  for (const [model, method] of [["campaign", "updateMany"], ["campaign", "findMany"]] as const) patchDb(t, model, method, (async () => (touched++, [])) as never);
  const { GET } = await import("../src/app/api/webhooks/cron/campaigns/route");
  const res = await GET(new Request("http://x/cron", { headers: { authorization: `Bearer ${FAKE_ENV.CRON_SECRET}` } }));
  assert.deepEqual(await res.json(), { skipped: true, reason: "provider_side_effects_disabled" });
  assert.equal(touched, 0);
});

test("CRON: the reminders job skips every outbound step when disabled (and reports why)", async (t) => {
  env(t, undefined, { TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined });
  t.mock.method(console, "error", () => {});
  let outboundQueries = 0;
  patchDb(t, "serviceReminder", "findMany", (async () => (outboundQueries++, [])) as never);
  patchDb(t, "shop", "findMany", (async () => (outboundQueries++, [])) as never);
  patchDb(t, "rateLimitBucket", "deleteMany", (async () => ({ count: 0 })) as never);
  const { GET } = await import("../src/app/api/webhooks/cron/route");
  const res = await GET(new Request("http://x/cron", { headers: { authorization: `Bearer ${FAKE_ENV.CRON_SECRET}` } }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.providerSideEffects, "disabled");
  assert.equal(body.smsNumbers, null);
  assert.equal(outboundQueries, 0, "no reminder/appointment candidates were even loaded");
});

// ── Guardia de código: nadie instancia un SDK de proveedor fuera de su módulo central ───────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test("CODEBASE GUARD: provider SDKs are constructed only inside their gated modules", () => {
  const root = join(process.cwd(), "src");
  const rules: { name: string; pattern: RegExp; allowed: string[] }[] = [
    { name: "new Resend(", pattern: /new Resend\(/, allowed: ["lib/providers/resend.ts"] },
    { name: 'server Pusher SDK (from "pusher")', pattern: /from ["']pusher["']/, allowed: ["lib/providers/pusher.ts"] },
    { name: "new Stripe(", pattern: /new Stripe\(/, allowed: ["lib/stripe.ts"] },
    { name: "Twilio SDK", pattern: /from ["']twilio["']/, allowed: ["lib/communications/twilio.ts"] },
    { name: "Telegram API", pattern: /api\.telegram\.org/, allowed: ["lib/platform/telegram.ts"] },
    { name: "raw Stripe/Twilio fetch", pattern: /api\.stripe\.com|api\.twilio\.com/, allowed: [] },
  ];
  const offenders: string[] = [];
  for (const file of sourceFiles(root)) {
    const rel = relative(root, file).replace(/\\/g, "/");
    const text = readFileSync(file, "utf8");
    for (const rule of rules) if (rule.pattern.test(text) && !rule.allowed.includes(rel)) offenders.push(`${rel}: ${rule.name}`);
  }
  assert.deepEqual(offenders, [], "every outbound provider call must go through the gated module");
});

test("CODEBASE GUARD: Twilio MUTATIONS only use the *ForWrite clients; the read clients never create/update/remove", () => {
  const root = join(process.cwd(), "src");
  const offenders: string[] = [];
  for (const file of sourceFiles(root)) {
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel === "lib/communications/twilio.ts") continue;
    const text = readFileSync(file, "utf8");
    const usesReadClient = /\bgetTwilio(Parent)?Client(For)?\s*\(/.test(text.replace(/getTwilio(Parent)?Client(For)?Write/g, ""));
    if (!usesReadClient) continue;
    if (/\.(create|update|remove|delete)\s*\(/.test(text.replace(/getTwilio(Parent)?Client(For)?Write[\s\S]*?\)/g, ""))) {
      // Solo se considera ofensor si la llamada mutadora cuelga del cliente de lectura.
      if (/getTwilio(Parent)?Client(For)?\s*\([^)]*\)[\s\S]{0,120}?\.(create|update|remove|delete)\s*\(/.test(text.replace(/getTwilio(Parent)?Client(For)?Write/g, "FORWRITE"))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});
