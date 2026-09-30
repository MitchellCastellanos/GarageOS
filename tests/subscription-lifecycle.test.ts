/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures inspect loosely-typed Stripe params */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { registerHooks } from "node:module";
import type Stripe from "stripe";
import { db } from "../src/lib/db";
import { getStripeClient, createCheckoutSession } from "../src/lib/stripe";
import {
  confirmCheckoutSession,
  ensureStripeCustomer,
  handleStripeEvent,
  processStripeEvent,
  syncStripeSubscription,
  type StripeSyncApi,
} from "../src/lib/stripe-sync";
import {
  canAddUser,
  checkEntitlement,
  createOperatingChecker,
  createPendingSubscription,
  getEffectiveSubscription,
  requireWriteAccess,
  SubscriptionRestrictedError,
} from "../src/lib/subscription";
import { assertShopWritable } from "../src/lib/shop-context";

// `server-only` (import de Next que lanza fuera del bundler) no existe bajo node:test —
// se stubea para poder importar la ruta de signup / auth reales.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { POST: signupPost } = await import("../src/app/api/auth/signup/route");
const { authConfig } = await import("../src/lib/auth");

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_PRICE_CORE_MONTHLY = "price_core_m";
process.env.STRIPE_PRICE_CORE_YEARLY = "price_core_y";
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";
process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
process.env.STRIPE_PRICE_COMPLETE_MONTHLY = "price_complete_m";
process.env.STRIPE_PRICE_COMPLETE_YEARLY = "price_complete_y";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

type AnyFn = (...args: never[]) => unknown;

function mockDb<M extends keyof typeof db, K extends keyof (typeof db)[M]>(t: TestContext, model: M, method: K, impl: AnyFn) {
  const original = db[model][method];
  const fn = t.mock.fn(impl);
  db[model][method] = fn as unknown as (typeof db)[M][K];
  t.after(() => {
    db[model][method] = original;
  });
  return fn;
}

function mockTransaction(t: TestContext, tx: unknown) {
  const original = db.$transaction;
  const fn = t.mock.fn(async (cb: (tx: unknown) => unknown) => cb(tx));
  (db as unknown as { $transaction: unknown }).$transaction = fn;
  t.after(() => {
    (db as unknown as { $transaction: unknown }).$transaction = original;
  });
  return fn;
}

const NOW = Date.now();
const future = (days: number) => new Date(NOW + days * 86_400_000);

function subRow(over: Record<string, unknown> = {}) {
  return {
    id: "sub-row",
    shopId: "shop-A",
    plan: "PRO",
    status: "ACTIVE",
    billingInterval: "MONTHLY",
    trialEndsAt: null,
    currentPeriodEnd: future(20),
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus_A",
    stripeSubscriptionId: "sub_A",
    stripePriceId: "price_pro_m",
    billingEmail: null,
    ...over,
  };
}

function shopWithSub(row: unknown, organizationId: string | null = null) {
  return { organizationId, subscription: row };
}

function stripeSub(over: Record<string, unknown> = {}, priceId = "price_pro_m") {
  return {
    id: "sub_A",
    customer: "cus_A",
    status: "trialing",
    trial_end: Math.floor(future(14).getTime() / 1000),
    cancel_at_period_end: false,
    metadata: { shopId: "shop-A" },
    items: {
      data: [
        { id: "si_over", price: { id: "price_sms_overage" }, current_period_end: 1 },
        { id: "si_plan", price: { id: priceId }, current_period_end: Math.floor(future(14).getTime() / 1000) },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

function fakeApi(over: Partial<StripeSyncApi> = {}): StripeSyncApi & { canceled: string[] } {
  const canceled: string[] = [];
  return {
    canceled,
    cancelSubscription: async (id: string) => {
      canceled.push(id);
    },
    retrieveSubscription: async () => {
      throw new Error("not mocked");
    },
    ...over,
  };
}

// ── Signup ───────────────────────────────────────────────────────────────────

function signupRequest() {
  const fd = new FormData();
  fd.set("shopName", "Garage Test");
  fd.set("name", "Ana Owner");
  fd.set("email", "Ana@Example.com");
  fd.set("password", "supersecret1");
  return new Request("https://app.example.test/api/auth/signup", { method: "POST", body: fd }) as never;
}

test("email signup creates Shop + OWNER + AWAITING_PLAN subscription in ONE transaction (no default Pro trial), then verify-email", async (t) => {
  mockDb(t, "user", "findUnique", async () => null);
  mockDb(t, "verificationToken", "deleteMany", async () => ({}));
  mockDb(t, "verificationToken", "create", async () => ({}));
  const calls: { model: string; data: Record<string, unknown> }[] = [];
  const tx = {
    shop: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "shop", data }), { id: "shop-new", ...data }) },
    user: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "user", data }), data) },
    subscription: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "subscription", data }), data) },
  };
  const trx = mockTransaction(t, tx);

  const res = await signupPost(signupRequest());

  assert.equal(trx.mock.callCount(), 1);
  assert.deepEqual(calls.map((c) => c.model), ["shop", "user", "subscription"]);
  const sub = calls.find((c) => c.model === "subscription")!.data;
  assert.equal(sub.status, "AWAITING_PLAN");
  assert.equal(sub.plan, null);
  assert.equal(sub.trialEndsAt, undefined, "no trial is granted without a payment method");
  assert.equal(calls.find((c) => c.model === "user")!.data.role, "OWNER");
  assert.equal(calls.find((c) => c.model === "user")!.data.email, "ana@example.com");
  assert.match(res.headers.get("location") ?? "", /verify-email-sent/);
});

test("email signup: a failure creating the subscription aborts the whole account (no partial, commercially usable account)", async (t) => {
  mockDb(t, "user", "findUnique", async () => null);
  const sendMail = mockDb(t, "verificationToken", "create", async () => ({}));
  mockTransaction(t, {
    shop: { create: async () => ({ id: "shop-new" }) },
    user: { create: async () => ({}) },
    subscription: {
      create: async () => {
        throw new Error("db down");
      },
    },
  });
  const errors = t.mock.method(console, "error", () => {});
  const res = await signupPost(signupRequest());
  assert.match(res.headers.get("location") ?? "", /signup\?error=/);
  assert.equal(sendMail.mock.callCount(), 0, "no verification email for an account that was not created");
  assert.ok(errors.mock.callCount() >= 1);
});

test("Google signup: Shop + verified OWNER + AWAITING_PLAN subscription are created atomically; sign-in proceeds", async (t) => {
  mockDb(t, "user", "findUnique", async () => null);
  const calls: { model: string; data: Record<string, unknown> }[] = [];
  mockTransaction(t, {
    shop: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "shop", data }), { id: "shop-g", ...data }) },
    user: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "user", data }), data) },
    subscription: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.push({ model: "subscription", data }), data) },
  });
  t.mock.method(console, "error", () => {}); // sender-identity provisioning has no DB here; it is best-effort

  const ok = await authConfig.callbacks!.signIn!({
    user: { email: "g@example.com", name: "Gina" },
    account: { provider: "google" },
  } as never);

  assert.equal(ok, true);
  const sub = calls.find((c) => c.model === "subscription")!.data;
  assert.equal(sub.status, "AWAITING_PLAN");
  assert.equal(sub.plan, null);
  assert.ok(calls.find((c) => c.model === "user")!.data.emailVerified instanceof Date, "Google-verified email is trusted");
});

test("Google signup: if the transaction fails, sign-in is refused (no half-created account)", async (t) => {
  mockDb(t, "user", "findUnique", async () => null);
  const original = db.$transaction;
  (db as unknown as { $transaction: unknown }).$transaction = async () => {
    throw new Error("boom");
  };
  t.after(() => {
    (db as unknown as { $transaction: unknown }).$transaction = original;
  });
  t.mock.method(console, "error", () => {});
  const ok = await authConfig.callbacks!.signIn!({ user: { email: "g@example.com", name: "G" }, account: { provider: "google" } } as never);
  assert.equal(ok, false);
});

test("createPendingSubscription writes AWAITING_PLAN with no plan", async () => {
  let data: Record<string, unknown> | null = null;
  await createPendingSubscription({ subscription: { create: async (a: { data: Record<string, unknown> }) => (data = a.data) } } as never, "s1");
  assert.deepEqual(data, { shopId: "s1", plan: null, status: "AWAITING_PLAN" });
});

// ── Resolver / restricted enforcement ────────────────────────────────────────

test("getEffectiveSubscription: onboarding shop → SETUP_REQUIRED, no plan, cannot write", async (t) => {
  mockDb(t, "shop", "findUnique", async () => shopWithSub(subRow({ plan: null, status: "AWAITING_PLAN", stripeSubscriptionId: null, stripeCustomerId: null, currentPeriodEnd: null })));
  const sub = await getEffectiveSubscription("shop-A");
  assert.equal(sub.accessState, "SETUP_REQUIRED");
  assert.equal(sub.plan, null);
  assert.equal(sub.canWrite, false);
  assert.equal(sub.trialEligible, true);
});

test("getEffectiveSubscription: missing row → RESTRICTED + subscriptionMissing, never Core", async (t) => {
  mockDb(t, "shop", "findUnique", async () => shopWithSub(null));
  const sub = await getEffectiveSubscription("shop-A");
  assert.equal(sub.accessState, "RESTRICTED");
  assert.equal(sub.subscriptionMissing, true);
  assert.equal(sub.plan, null);
  assert.equal(sub.canWrite, false);
});

test("getEffectiveSubscription: Pro monthly trial exposes plan, trial end and the trusted first charge", async (t) => {
  const end = future(13);
  mockDb(t, "shop", "findUnique", async () => shopWithSub(subRow({ status: "TRIALING", trialEndsAt: end, currentPeriodEnd: end })));
  const sub = await getEffectiveSubscription("shop-A");
  assert.equal(sub.accessState, "TRIALING");
  assert.equal(sub.plan, "PRO");
  assert.equal(sub.isTrialing, true);
  assert.equal(sub.nextCharge?.amountCad, 299);
  assert.equal(sub.nextCharge?.date.getTime(), end.getTime());
});

test("multi-location: a location without its own row resolves the organization's subscription", async (t) => {
  mockDb(t, "shop", "findUnique", async () => shopWithSub(null, "org-1"));
  mockDb(t, "shop", "findFirst", async () => ({ subscription: subRow({ plan: "COMPLETE", shopId: "shop-root" }) }));
  const sub = await getEffectiveSubscription("shop-loc2");
  assert.equal(sub.plan, "COMPLETE");
  assert.equal(sub.canWrite, true);
});

test("requireWriteAccess: restricted shops are blocked server-side; active/trialing/past-due pass", async (t) => {
  const shopFind = mockDb(t, "shop", "findUnique", async () => shopWithSub(subRow({ status: "UNPAID" })));
  await assert.rejects(() => requireWriteAccess("shop-A"), SubscriptionRestrictedError);

  for (const status of ["CANCELED", "INCOMPLETE"]) {
    shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ status })));
    await assert.rejects(() => requireWriteAccess("shop-A"), SubscriptionRestrictedError, status);
  }
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ status: "TRIALING", trialEndsAt: future(3) })));
  assert.equal((await requireWriteAccess("shop-A")).plan, "PRO");
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ status: "PAST_DUE" })));
  assert.equal((await requireWriteAccess("shop-A")).accessState, "PAST_DUE");
  // Trial vencido sin tarjeta (heredado) → bloqueado.
  shopFind.mock.mockImplementation(async () =>
    shopWithSub(subRow({ status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: future(-2) }))
  );
  await assert.rejects(() => requireWriteAccess("shop-A"), SubscriptionRestrictedError);
  // Sin fila.
  shopFind.mock.mockImplementation(async () => shopWithSub(null));
  await assert.rejects(() => requireWriteAccess("shop-A"), SubscriptionRestrictedError);
});

test("assertShopWritable (used by getWritableShopId) redirects a restricted shop to Billing and lets an active shop through", async (t) => {
  const shopFind = mockDb(t, "shop", "findUnique", async () => shopWithSub(subRow({ status: "CANCELED" })));
  await assert.rejects(
    () => assertShopWritable("shop-A"),
    (err: unknown) => (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") === true && String((err as { digest: string }).digest).includes("tab=billing")
  );
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ status: "ACTIVE" })));
  await assert.doesNotReject(() => assertShopWritable("shop-A"));
});

test("entitlement checks fail closed for restricted shops and respect the selected plan during a trial", async (t) => {
  const shopFind = mockDb(t, "shop", "findUnique", async () => shopWithSub(subRow({ plan: "CORE", status: "TRIALING", trialEndsAt: future(5) })));
  assert.match((await checkEntitlement("shop-A", "inventory.manage")) ?? "", /PRO/); // Core trial ≠ Pro
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ plan: "PRO", status: "TRIALING", trialEndsAt: future(5) })));
  assert.equal(await checkEntitlement("shop-A", "inventory.manage"), null);
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ plan: "COMPLETE", status: "TRIALING", trialEndsAt: future(5) })));
  assert.equal(await checkEntitlement("shop-A", "organization.multiLocation"), null);
  shopFind.mock.mockImplementation(async () => shopWithSub(subRow({ plan: "PRO", status: "UNPAID" })));
  assert.ok(await checkEntitlement("shop-A", "inventory.manage"), "an UNPAID Pro shop is not entitled to anything");
  assert.deepEqual(await canAddUser("shop-A"), { allowed: false, limit: 0 });
});

// ── Checkout ─────────────────────────────────────────────────────────────────

test("createCheckoutSession: server-controlled price, card required, 14-day trial, stable idempotency, existing customer", async (t) => {
  const created: { params: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
  const stripe = getStripeClient();
  const original = stripe.checkout.sessions.create;
  (stripe.checkout.sessions as unknown as { create: unknown }).create = async (params: Record<string, unknown>, opts: Record<string, unknown>) => {
    created.push({ params, opts });
    return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
  };
  const originalRetrieve = stripe.prices.retrieve;
  const table: Record<string, [number, "month" | "year"]> = {
    price_complete_y: [449000, "year"],
    price_core_m: [19900, "month"],
    price_pro_m: [29900, "month"],
  };
  (stripe.prices as unknown as { retrieve: unknown }).retrieve = async (id: string) => ({
    id, active: true, currency: "cad", unit_amount: table[id][0], recurring: { interval: table[id][1], interval_count: 1, usage_type: "licensed" },
  });
  t.after(() => {
    (stripe.checkout.sessions as unknown as { create: unknown }).create = original;
    (stripe.prices as unknown as { retrieve: unknown }).retrieve = originalRetrieve;
  });

  const base = {
    shopId: "shop-A",
    stripeCustomerId: "cus_A",
    successUrl: "https://app.example.test/ok",
    cancelUrl: "https://app.example.test/no",
  } as const;

  await createCheckoutSession({ ...base, plan: "COMPLETE", interval: "YEARLY", trial: { kind: "fresh", days: 14 } });
  await createCheckoutSession({ ...base, plan: "COMPLETE", interval: "YEARLY", trial: { kind: "fresh", days: 14 } });
  const [first, second] = created;
  const p = first.params as Record<string, any>;
  assert.equal(p.mode, "subscription");
  assert.equal(p.customer, "cus_A");
  assert.equal(p.client_reference_id, "shop-A");
  assert.equal(p.line_items[0].price, "price_complete_y", "price comes from server env by plan/interval");
  assert.equal(p.payment_method_collection, "always", "card is collected before the trial starts");
  assert.equal(p.subscription_data.trial_period_days, 14);
  assert.equal(p.subscription_data.trial_settings.end_behavior.missing_payment_method, "cancel");
  assert.equal(p.subscription_data.metadata.shopId, "shop-A");
  assert.equal(p.automatic_tax.enabled, true);
  assert.equal(first.opts.idempotencyKey, second.opts.idempotencyKey, "reloads/double-clicks reuse the same session");

  // Re-suscripción (ya tuvo trial): sin trial → cobro inmediato.
  await createCheckoutSession({ ...base, plan: "CORE", interval: "MONTHLY", trial: { kind: "none" } });
  const noTrial = created[2].params as Record<string, any>;
  assert.equal(noTrial.subscription_data.trial_period_days, undefined);
  assert.equal(noTrial.subscription_data.trial_end, undefined);
  assert.equal(noTrial.line_items[0].price, "price_core_m");

  // Trial heredado: conserva su fecha de fin.
  const endsAt = future(5);
  await createCheckoutSession({ ...base, plan: "PRO", interval: "MONTHLY", trial: { kind: "until", endsAt } });
  assert.equal((created[3].params as Record<string, any>).subscription_data.trial_end, Math.floor(endsAt.getTime() / 1000));
});

test("createCheckoutSession refuses a Stripe Price whose amount/currency/interval disagrees with the quoted plan price", async (t) => {
  const stripe = getStripeClient();
  const originalRetrieve = stripe.prices.retrieve;
  const originalCreate = stripe.checkout.sessions.create;
  let opened = 0;
  (stripe.checkout.sessions as unknown as { create: unknown }).create = async () => {
    opened++;
    return { id: "cs", url: "u" };
  };
  t.after(() => {
    (stripe.prices as unknown as { retrieve: unknown }).retrieve = originalRetrieve;
    (stripe.checkout.sessions as unknown as { create: unknown }).create = originalCreate;
  });
  const args = { shopId: "s", plan: "PRO", interval: "MONTHLY", stripeCustomerId: "c", trial: { kind: "fresh", days: 14 }, successUrl: "x", cancelUrl: "y" } as const;
  // The pre-launch sandbox Price ($249) must never be sold as the current $299 plan.
  for (const bad of [
    { unit_amount: 24900, currency: "cad", recurring: { interval: "month", interval_count: 1 } },
    { unit_amount: 29900, currency: "usd", recurring: { interval: "month", interval_count: 1 } },
    { unit_amount: 29900, currency: "cad", recurring: { interval: "year", interval_count: 1 } },
    { unit_amount: 29900, currency: "cad", recurring: { interval: "month", interval_count: 1, usage_type: "metered" } },
  ]) {
    (stripe.prices as unknown as { retrieve: unknown }).retrieve = async () => ({ active: true, ...bad });
    await assert.rejects(() => createCheckoutSession(args), /does not match PRO\/MONTHLY/);
  }
  assert.equal(opened, 0, "no Checkout Session is ever created for a mismatched Price");
});

test("createCheckoutSession refuses a plan/interval with no configured Stripe Price", async () => {
  delete process.env.STRIPE_PRICE_CORE_YEARLY;
  await assert.rejects(
    () => createCheckoutSession({ shopId: "s", plan: "CORE", interval: "YEARLY", stripeCustomerId: "c", trial: { kind: "none" }, successUrl: "x", cancelUrl: "y" }),
    /STRIPE_PRICE_CORE_YEARLY/
  );
  process.env.STRIPE_PRICE_CORE_YEARLY = "price_core_y";
});

test("ensureStripeCustomer reuses the stored customer and never creates a second one", async (t) => {
  mockDb(t, "subscription", "findUnique", async () => ({ stripeCustomerId: "cus_existing" }));
  const stripe = getStripeClient();
  const create = t.mock.fn(async () => ({ id: "cus_new" }));
  const original = stripe.customers.create;
  (stripe.customers as unknown as { create: unknown }).create = create;
  t.after(() => {
    (stripe.customers as unknown as { create: unknown }).create = original;
  });
  assert.equal(await ensureStripeCustomer({ subscriptionOwnerShopId: "shop-A", email: "a@b.c", name: "A" }), "cus_existing");
  assert.equal(create.mock.callCount(), 0);
});

// ── Sync / webhook ───────────────────────────────────────────────────────────

test("sync: a Pro monthly trial from Stripe is stored as TRIALING with plan, interval, real trial end and customer/sub ids", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId || where.stripeCustomerId ? null : subRow({ plan: null, status: "AWAITING_PLAN", stripeCustomerId: "cus_A", stripeSubscriptionId: null })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));

  const result = await syncStripeSubscription(stripeSub(), "shop-A", fakeApi());
  assert.equal(result, "applied");
  const arg = upsert.mock.calls[0].arguments[0] as { where: { shopId: string }; update: Record<string, any> };
  assert.equal(arg.where.shopId, "shop-A");
  assert.equal(arg.update.status, "TRIALING");
  assert.equal(arg.update.plan, "PRO");
  assert.equal(arg.update.billingInterval, "MONTHLY");
  assert.equal(arg.update.stripePriceId, "price_pro_m", "the PLAN item is used, not the SMS overage item listed first");
  assert.equal(arg.update.stripeSubscriptionId, "sub_A");
  assert.ok(arg.update.trialEndsAt instanceof Date);
});

test("sync covers every plan and interval combination", async (t) => {
  mockDb(t, "subscription", "findUnique", async () => null);
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A" }));
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const combos: [string, string, string][] = [
    ["price_core_m", "CORE", "MONTHLY"],
    ["price_pro_m", "PRO", "MONTHLY"],
    ["price_complete_m", "COMPLETE", "MONTHLY"],
    ["price_core_y", "CORE", "YEARLY"],
    ["price_pro_y", "PRO", "YEARLY"],
    ["price_complete_y", "COMPLETE", "YEARLY"],
  ];
  for (const [price, plan, interval] of combos) {
    await syncStripeSubscription(stripeSub({}, price), "shop-A", fakeApi());
    const last = upsert.mock.calls.at(-1)!.arguments[0] as { update: Record<string, unknown> };
    assert.equal(last.update.plan, plan);
    assert.equal(last.update.billingInterval, interval);
  }
});

test("sync: trial conversion (trialing → active) and payment failure (active → past_due → unpaid/canceled) update status", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId ? { shopId: "shop-A" } : subRow({ status: "TRIALING" })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const statuses: string[] = [];
  for (const s of ["active", "past_due", "unpaid", "canceled"]) {
    await syncStripeSubscription(stripeSub({ status: s, trial_end: null }), "shop-A", fakeApi());
    statuses.push((upsert.mock.calls.at(-1)!.arguments[0] as { update: { status: string } }).update.status);
  }
  assert.deepEqual(statuses, ["ACTIVE", "PAST_DUE", "UNPAID", "CANCELED"]);
});

test("sync: a second live subscription for the same shop is canceled in Stripe, not stored (no double billing)", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId ? null : subRow({ stripeSubscriptionId: "sub_ORIGINAL", status: "ACTIVE" })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  t.mock.method(console, "error", () => {});
  const api = fakeApi();
  const result = await syncStripeSubscription(stripeSub({ id: "sub_DUP" }), "shop-A", api);
  assert.equal(result, "duplicate_canceled");
  assert.deepEqual(api.canceled, ["sub_DUP"]);
  assert.equal(upsert.mock.callCount(), 0);
});

test("sync: a late 'canceled' event from an OLD subscription does not overwrite the current live one", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId ? null : subRow({ stripeSubscriptionId: "sub_NEW", status: "ACTIVE" })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const result = await syncStripeSubscription(stripeSub({ id: "sub_OLD", status: "canceled" }), "shop-A", fakeApi());
  assert.equal(result, "ignored_stale");
  assert.equal(upsert.mock.callCount(), 0);
});

test("sync: an event whose customer differs from the shop's stored customer is refused (cross-shop protection)", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId || where.stripeCustomerId ? null : subRow({ stripeCustomerId: "cus_OTHER" })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  t.mock.method(console, "error", () => {});
  assert.equal(await syncStripeSubscription(stripeSub(), "shop-A", fakeApi()), "customer_mismatch");
  assert.equal(upsert.mock.callCount(), 0);
});

test("sync: an unmapped price never writes a plan (no guessing)", async (t) => {
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  t.mock.method(console, "error", () => {});
  assert.equal(await syncStripeSubscription(stripeSub({}, "price_unknown"), "shop-A", fakeApi()), "unmapped_price");
  assert.equal(upsert.mock.callCount(), 0);
});

test("webhook idempotency: the same event id is processed once; a replay is a no-op", async (t) => {
  const seen = new Set<string>();
  mockDb(t, "stripeWebhookEvent", "create", async ({ data }: { data: { id: string } }) => {
    if (seen.has(data.id)) throw Object.assign(new Error("unique"), { code: "P2002" });
    seen.add(data.id);
    return data;
  });
  const updateMany = mockDb(t, "subscription", "updateMany", async () => ({ count: 1 }));
  const event = { id: "evt_1", type: "customer.subscription.deleted", data: { object: { id: "sub_A" } } } as unknown as Stripe.Event;

  assert.equal(await processStripeEvent(event, fakeApi()), "processed");
  assert.equal(await processStripeEvent(event, fakeApi()), "duplicate");
  assert.equal(updateMany.mock.callCount(), 1);
  assert.deepEqual((updateMany.mock.calls[0].arguments[0] as { data: unknown }).data, { status: "CANCELED", cancelAtPeriodEnd: false });
});

test("webhook: when the handler fails the idempotency marker is removed so Stripe's retry reprocesses it", async (t) => {
  const create = mockDb(t, "stripeWebhookEvent", "create", async () => ({}));
  const del = mockDb(t, "stripeWebhookEvent", "delete", async () => ({}));
  mockDb(t, "subscription", "updateMany", async () => {
    throw new Error("db down");
  });
  const event = { id: "evt_2", type: "customer.subscription.deleted", data: { object: { id: "sub_A" } } } as unknown as Stripe.Event;
  await assert.rejects(() => processStripeEvent(event, fakeApi()), /db down/);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(del.mock.callCount(), 1);
});

test("billing recovery: after the customer fixes their card Stripe reports active and the shop is restored", async (t) => {
  mockDb(t, "subscription", "findUnique", async ({ where }: { where: Record<string, unknown> }) =>
    where.stripeSubscriptionId ? { shopId: "shop-A" } : subRow({ status: "PAST_DUE" })
  );
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const api = fakeApi({ retrieveSubscription: async () => stripeSub({ status: "active", trial_end: null }) });
  // El payload del evento dice 'past_due' (viejo); se relee el estado ACTUAL → active (webhooks desordenados).
  const stale = { id: "evt_3", type: "customer.subscription.updated", data: { object: stripeSub({ status: "past_due" }) } } as unknown as Stripe.Event;
  await handleStripeEvent(stale, api);
  assert.equal((upsert.mock.calls[0].arguments[0] as { update: { status: string } }).update.status, "ACTIVE");
});

test("checkout.session.completed syncs the trial subscription for the shop in client_reference_id", async (t) => {
  mockDb(t, "subscription", "findUnique", async () => null);
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A" }));
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const api = fakeApi({ retrieveSubscription: async () => stripeSub() });
  const event = {
    id: "evt_4",
    type: "checkout.session.completed",
    data: { object: { client_reference_id: "shop-A", subscription: "sub_A" } },
  } as unknown as Stripe.Event;
  await handleStripeEvent(event, api);
  assert.equal((upsert.mock.calls[0].arguments[0] as { where: { shopId: string } }).where.shopId, "shop-A");
});

test("confirmCheckoutSession: a session belonging to another shop is forbidden; an incomplete one is not applied", async (t) => {
  const upsert = mockDb(t, "subscription", "upsert", async () => ({}));
  const api = fakeApi({ retrieveSubscription: async () => stripeSub() });
  const otherShop = async () => ({ client_reference_id: "shop-OTHER", status: "complete", subscription: "sub_X" }) as never;
  assert.equal(await confirmCheckoutSession("cs_1", "shop-A", api, otherShop), "forbidden");
  const open = async () => ({ client_reference_id: "shop-A", status: "open", subscription: null }) as never;
  assert.equal(await confirmCheckoutSession("cs_1", "shop-A", api, open), "incomplete");
  assert.equal(upsert.mock.callCount(), 0);

  mockDb(t, "subscription", "findUnique", async () => null);
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A" }));
  const done = async () => ({ client_reference_id: "shop-A", status: "complete", subscription: "sub_A" }) as never;
  assert.equal(await confirmCheckoutSession("cs_1", "shop-A", api, done), "confirmed");
  assert.equal(upsert.mock.callCount(), 1);
});

test("cron guard: restricted shops don't operate (no automatic reminders/campaigns); the check is cached per run", async (t) => {
  const find = mockDb(t, "shop", "findUnique", async ({ where }: { where: { id: string } }) =>
    shopWithSub(where.id === "shop-paid" ? subRow({ status: "ACTIVE" }) : subRow({ status: "UNPAID" }))
  );
  const canOperate = createOperatingChecker();
  assert.equal(await canOperate("shop-paid"), true);
  assert.equal(await canOperate("shop-unpaid"), false);
  assert.equal(await canOperate("shop-unpaid"), false);
  assert.equal(find.mock.callCount(), 2, "second lookup for the same shop is served from the cache");
});
