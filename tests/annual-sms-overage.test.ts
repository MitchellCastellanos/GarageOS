/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures inspect loosely-typed Stripe params */
// Overage de SMS mensual para planes ANUALES: el Checkout no admite intervalos mezclados, así que el
// ítem se agrega después sobre la misma suscripción (modo flexible); la cancelación es de GarageOS
// (`cancel_at: max_period_end`), nunca del portal; la morosidad usa los estados existentes.
import "./helpers/fake-providers-authorized";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type Stripe from "stripe";
import { setSession } from "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";
import { db } from "../src/lib/db";
import {
  cancelStripeSubscriptionAtPeriodEnd,
  checkoutLineItems,
  ensureSmsOverageItem,
  getStripeClient,
  resumeStripeSubscription,
  updateStripeSubscriptionPrice,
} from "../src/lib/stripe";
import { handleStripeEvent, processStripeEvent, syncStripeSubscription, confirmCheckoutSession, type StripeSyncApi } from "../src/lib/stripe-sync";
import { mapStripeStatus, resolveAccess } from "../src/domain/subscription-state";

const billing = await import("../src/actions/billing");

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_PRICE_CORE_MONTHLY = "price_core_m";
process.env.STRIPE_PRICE_CORE_YEARLY = "price_core_y";
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";
process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
process.env.STRIPE_PRICE_COMPLETE_MONTHLY = "price_complete_m";
process.env.STRIPE_PRICE_COMPLETE_YEARLY = "price_complete_y";
process.env.STRIPE_SMS_OVERAGE_PRICE_ID = "price_sms_overage";

const NOW = Date.now();
const secs = (days: number) => Math.floor((NOW + days * 86_400_000) / 1000);

function stripeSub(over: Record<string, unknown> = {}, opts: { withOverage?: boolean; planPrice?: string; mode?: "flexible" | "classic" } = {}) {
  const items = [{ id: "si_plan", price: { id: opts.planPrice ?? "price_pro_y" }, current_period_end: secs(365) }];
  if (opts.withOverage) items.push({ id: "si_over", price: { id: "price_sms_overage" }, current_period_end: secs(30) });
  return {
    id: "sub_A",
    customer: "cus_A",
    status: "active",
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    billing_mode: { type: opts.mode ?? "flexible" },
    metadata: { shopId: "shop-A" },
    items: { data: items },
    ...over,
  } as unknown as Stripe.Subscription;
}

/** Reemplaza métodos del cliente de Stripe (singleton) y los restaura al terminar. */
function patchStripe(t: TestContext) {
  const stripe = getStripeClient() as any;
  const calls: { fn: string; args: any[] }[] = [];
  const originals: Record<string, any> = {};
  const state: { retrieve: () => Stripe.Subscription } = { retrieve: () => stripeSub() };
  const patch = (name: string, impl: (...a: any[]) => any) => {
    originals[name] = stripe.subscriptions[name];
    stripe.subscriptions[name] = async (...args: any[]) => {
      calls.push({ fn: name, args });
      return impl(...args);
    };
  };
  patch("retrieve", () => state.retrieve());
  patch("update", (id: string, params: any) => ({ ...state.retrieve(), id, ...(params.cancel_at ? { cancel_at: secs(365) } : {}) }));
  patch("migrate", (id: string) => ({ ...state.retrieve(), id, billing_mode: { type: "flexible" } }));
  t.after(() => {
    for (const [name, fn] of Object.entries(originals)) stripe.subscriptions[name] = fn;
  });
  return { calls, state, of: (fn: string) => calls.filter((c) => c.fn === fn) };
}

// ── Checkout line items ──────────────────────────────────────────────────────

test("checkoutLineItems: monthly plans carry the monthly overage item; yearly plans never do (Stripe rejects mixed intervals)", () => {
  assert.deepEqual(checkoutLineItems("price_pro_m", "MONTHLY", "price_sms_overage"), [
    { price: "price_pro_m", quantity: 1 },
    { price: "price_sms_overage" },
  ]);
  assert.deepEqual(checkoutLineItems("price_complete_y", "YEARLY", "price_sms_overage"), [
    { price: "price_complete_y", quantity: 1 },
  ]);
  assert.deepEqual(checkoutLineItems("price_pro_m", "MONTHLY", null), [{ price: "price_pro_m", quantity: 1 }]);
});

// ── ensureSmsOverageItem ─────────────────────────────────────────────────────

test("ensureSmsOverageItem adds the monthly metered item to an annual subscription, idempotently keyed", async (t) => {
  const s = patchStripe(t);
  assert.equal(await ensureSmsOverageItem(stripeSub()), "added");
  const [{ args }] = s.of("update");
  assert.equal(args[0], "sub_A");
  assert.deepEqual(args[1].items, [{ price: "price_sms_overage" }], "only the overage item is added; the plan item is untouched");
  assert.equal(args[1].proration_behavior, "none");
  assert.equal(args[2].idempotencyKey, "sms-overage-item:sub_A", "one key per subscription → retries/concurrency cannot double-add");
  assert.equal(s.of("migrate").length, 0, "already flexible: no migration");
});

test("ensureSmsOverageItem is a no-op when the item exists (monthly Checkout, retry, webhook replay)", async (t) => {
  const s = patchStripe(t);
  assert.equal(await ensureSmsOverageItem(stripeSub({}, { withOverage: true })), "present");
  assert.equal(await ensureSmsOverageItem(stripeSub({}, { withOverage: true, planPrice: "price_pro_m" })), "present");
  assert.equal(s.calls.length, 0);
});

test("ensureSmsOverageItem skips unconfigured billing and dead subscriptions (no orphan item on a canceled/unpaid sub)", async (t) => {
  const s = patchStripe(t);
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(await ensureSmsOverageItem(stripeSub({ status })), "skipped", status);
  }
  for (const status of ["trialing", "active", "past_due"]) {
    assert.equal(await ensureSmsOverageItem(stripeSub({ status }, { withOverage: true })), "present", status);
  }
  const price = process.env.STRIPE_SMS_OVERAGE_PRICE_ID;
  delete process.env.STRIPE_SMS_OVERAGE_PRICE_ID;
  t.after(() => {
    process.env.STRIPE_SMS_OVERAGE_PRICE_ID = price;
  });
  assert.equal(await ensureSmsOverageItem(stripeSub()), "skipped");
  assert.equal(s.calls.length, 0);
});

test("ensureSmsOverageItem migrates a legacy 'classic' subscription to flexible first (mixed intervals need it)", async (t) => {
  const s = patchStripe(t);
  assert.equal(await ensureSmsOverageItem(stripeSub({}, { mode: "classic" })), "added");
  assert.deepEqual(s.calls.map((c) => c.fn), ["migrate", "update"]);
  assert.deepEqual(s.of("migrate")[0].args[1], { billing_mode: { type: "flexible" } });
});

test("ensureSmsOverageItem propagates a Stripe failure so the caller can retry (nothing is swallowed)", async (t) => {
  const stripe = getStripeClient() as any;
  const original = stripe.subscriptions.update;
  stripe.subscriptions.update = async () => {
    throw new Error("stripe down");
  };
  t.after(() => {
    stripe.subscriptions.update = original;
  });
  await assert.rejects(() => ensureSmsOverageItem(stripeSub()), /stripe down/);
});

// ── Sync / webhook ───────────────────────────────────────────────────────────

const row = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  shopId: "shop-A",
  plan: "PRO",
  status: "TRIALING",
  billingInterval: "YEARLY",
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: "cus_A",
  stripeSubscriptionId: null,
  ...over,
});

function syncDb(t: TestContext, current = row()) {
  const upserts: any[] = [];
  patchDb(t, "subscription", "findUnique", (async () => current) as never);
  patchDb(t, "subscription", "upsert", (async (args: any) => (upserts.push(args), args)) as never);
  patchDb(t, "subscription", "updateMany", (async () => ({ count: 1 })) as never);
  patchDb(t, "shop", "findUnique", (async () => ({ id: "shop-A" })) as never);
  return upserts;
}

function api(over: Partial<StripeSyncApi> = {}): StripeSyncApi & { ensured: string[] } {
  const ensured: string[] = [];
  return {
    ensured,
    cancelSubscription: async () => {},
    retrieveSubscription: async () => stripeSub(),
    ensureSmsOverageItem: async (s) => {
      ensured.push(s.id);
      return "added";
    },
    ...over,
  };
}

test("sync of an annual subscription stores the ANNUAL plan/period (not the monthly overage item) and adds the overage item", async (t) => {
  const upserts = syncDb(t);
  const a = api();
  // El ítem de excedente va PRIMERO y con período mensual: el período guardado debe ser el del plan.
  const sub = stripeSub({}, { withOverage: true });
  (sub.items.data as any[]).reverse();
  assert.equal(await syncStripeSubscription(sub, "shop-A", a), "applied");
  const data = upserts[0].update;
  assert.equal(data.plan, "PRO");
  assert.equal(data.billingInterval, "YEARLY");
  assert.equal(data.currentPeriodEnd.getTime(), secs(365) * 1000, "annual period end, not the 30-day overage item");
  assert.deepEqual(a.ensured, ["sub_A"]);
});

test("cancel_at (GarageOS's max_period_end cancellation) is stored as cancelAtPeriodEnd; cleared when resumed", async (t) => {
  const upserts = syncDb(t);
  await syncStripeSubscription(stripeSub({ cancel_at: secs(365) }), "shop-A", api());
  assert.equal(upserts[0].update.cancelAtPeriodEnd, true);
  await syncStripeSubscription(stripeSub({ cancel_at: null }), "shop-A", api());
  assert.equal(upserts[1].update.cancelAtPeriodEnd, false);
  await syncStripeSubscription(stripeSub({ cancel_at_period_end: true }), "shop-A", api());
  assert.equal(upserts[2].update.cancelAtPeriodEnd, true, "legacy flag still honoured");
});

test("webhook: a failure adding the overage item returns an error (Stripe retries) and clears the idempotency marker", async (t) => {
  syncDb(t);
  const created: string[] = [];
  const deleted: string[] = [];
  patchDb(t, "stripeWebhookEvent", "create", (async ({ data }: any) => void created.push(data.id)) as never);
  patchDb(t, "stripeWebhookEvent", "delete", (async ({ where }: any) => void deleted.push(where.id)) as never);
  t.mock.method(console, "error", () => {});
  const a = api({
    retrieveSubscription: async () => stripeSub(),
    ensureSmsOverageItem: async () => {
      throw new Error("stripe 500");
    },
  });
  const event = { id: "evt_1", type: "customer.subscription.updated", data: { object: stripeSub() } } as unknown as Stripe.Event;
  await assert.rejects(() => processStripeEvent(event, a), /stripe 500/);
  assert.deepEqual(deleted, ["evt_1"], "marker removed → the retry is processed, not treated as a duplicate");
});

test("webhook replay: a duplicate event never re-runs the overage step; a second event for a subscription that has the item is a no-op", async (t) => {
  syncDb(t);
  const seen = new Set<string>();
  patchDb(t, "stripeWebhookEvent", "create", (async ({ data }: any) => {
    if (seen.has(data.id)) throw Object.assign(new Error("dup"), { code: "P2002" });
    seen.add(data.id);
  }) as never);
  const a = api();
  const event = { id: "evt_1", type: "customer.subscription.created", data: { object: stripeSub() } } as unknown as Stripe.Event;
  assert.equal(await processStripeEvent(event, a), "processed");
  assert.equal(await processStripeEvent(event, a), "duplicate");
  assert.equal(a.ensured.length, 1, "exactly one ensure call for the replayed event");

  // La segunda entrega (evento distinto) llega con el ítem ya presente: ensureSmsOverageItem no escribe.
  const s = patchStripe(t);
  await ensureSmsOverageItem(stripeSub({}, { withOverage: true }));
  assert.equal(s.of("update").length, 0);
});

test("returning from Checkout: an overage-item failure does not break confirmation of an already-paid subscription", async (t) => {
  syncDb(t);
  t.mock.method(console, "error", () => {});
  const a = api({
    retrieveSubscription: async () => stripeSub(),
    ensureSmsOverageItem: async () => {
      throw new Error("stripe 500");
    },
  });
  const session = { client_reference_id: "shop-A", status: "complete", subscription: "sub_A" } as unknown as Stripe.Checkout.Session;
  assert.equal(await confirmCheckoutSession("cs_1", "shop-A", a, async () => session), "confirmed");
});

test("subscription.deleted for a payment_failed cancellation is logged as CRITICAL (the Stripe 'cancel after retries' setting is wrong)", async (t) => {
  const updates: any[] = [];
  patchDb(t, "subscription", "updateMany", (async (a: any) => (updates.push(a), { count: 1 })) as never);
  const logged: string[] = [];
  t.mock.method(console, "error", (...a: unknown[]) => void logged.push(String(a[0])));
  const event = {
    id: "evt_d",
    type: "customer.subscription.deleted",
    data: { object: stripeSub({ status: "canceled", cancellation_details: { reason: "payment_failed" } }) },
  } as unknown as Stripe.Event;
  await handleStripeEvent(event, api());
  assert.match(logged.join("\n"), /CRITICAL/);
  assert.equal(updates[0].data.status, "CANCELED");
});

// ── Delinquency uses the existing states (annual plan is not destroyed) ──────

test("delinquency of an annual subscription follows PAST_DUE → RESTRICTED (unpaid) → ACTIVE recovery, keeping the paid period", async (t) => {
  const upserts = syncDb(t, row({ status: "ACTIVE", stripeSubscriptionId: "sub_A", plan: "PRO" }));
  const walk: string[] = [];
  for (const status of ["past_due", "unpaid", "active"]) {
    await syncStripeSubscription(stripeSub({ status }, { withOverage: true }), "shop-A", api());
    const u = upserts[upserts.length - 1].update;
    assert.equal(u.stripeSubscriptionId, "sub_A", "same subscription throughout — never replaced or canceled");
    assert.equal(u.plan, "PRO");
    assert.equal(u.currentPeriodEnd.getTime(), secs(365) * 1000, "paid annual period preserved");
    walk.push(
      resolveAccess({ plan: u.plan, status: u.status, trialEndsAt: null, stripeSubscriptionId: "sub_A", pastDueSince: u.pastDueSince }).accessState
    );
  }
  assert.deepEqual(walk, ["PAST_DUE", "RESTRICTED", "ACTIVE"]);
  assert.equal(mapStripeStatus("unpaid"), "UNPAID");
});

// ── Cancellation / resume at Stripe ──────────────────────────────────────────

test("cancelStripeSubscriptionAtPeriodEnd uses cancel_at=max_period_end (never cancel_at_period_end) on flexible subscriptions", async (t) => {
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({}, { withOverage: true });
  await cancelStripeSubscriptionAtPeriodEnd("sub_A");
  assert.deepEqual(s.of("update")[0].args[1], { cancel_at: "max_period_end" });
});

test("cancelStripeSubscriptionAtPeriodEnd falls back to cancel_at_period_end only for single-interval 'classic' subscriptions", async (t) => {
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({}, { mode: "classic", planPrice: "price_pro_m" });
  await cancelStripeSubscriptionAtPeriodEnd("sub_A");
  assert.deepEqual(s.of("update")[0].args[1], { cancel_at_period_end: true });
});

test("resumeStripeSubscription clears cancel_at (or the legacy flag) and is a no-op when nothing is scheduled", async (t) => {
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({ cancel_at: secs(365) });
  await resumeStripeSubscription("sub_A");
  assert.deepEqual(s.of("update")[0].args[1], { cancel_at: "" });
  s.state.retrieve = () => stripeSub({ cancel_at_period_end: true });
  await resumeStripeSubscription("sub_A");
  assert.deepEqual(s.of("update")[1].args[1], { cancel_at_period_end: false });
  s.state.retrieve = () => stripeSub();
  await resumeStripeSubscription("sub_A");
  assert.equal(s.of("update").length, 2);
});

test("plan change on a subscription with a scheduled cancellation recomputes the (already resolved) cancel_at", async (t) => {
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({ cancel_at: secs(30) }, { withOverage: true, planPrice: "price_pro_m" });
  await updateStripeSubscriptionPrice("sub_A", "price_pro_y");
  const updates = s.of("update").map((c) => c.args[1]);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].items[0].price, "price_pro_y");
  assert.deepEqual(updates[1], { cancel_at: "max_period_end" });
});

test("plan change without a scheduled cancellation touches nothing else", async (t) => {
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({}, { withOverage: true, planPrice: "price_pro_m" });
  await updateStripeSubscriptionPrice("sub_A", "price_pro_y");
  assert.equal(s.of("update").length, 1);
});

// ── Owner cancel / resume actions ────────────────────────────────────────────

function actionDb(t: TestContext, current: Record<string, unknown>) {
  const cancellations: any[] = [];
  const subUpdates: any[] = [];
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: current })) as never);
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
  const origTx = (db as any).$transaction;
  (db as any).$transaction = async (ops: Promise<unknown>[]) => Promise.all(ops);
  t.after(() => {
    (db as any).$transaction = origTx;
  });
  patchDb(t, "subscription", "update", (async (a: any) => (subUpdates.push(a), a)) as never);
  patchDb(t, "subscriptionCancellation", "create", (async (a: any) => (cancellations.push(a), a)) as never);
  return { cancellations, subUpdates };
}

const owner = () => setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
const live = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  shopId: "shop-A",
  plan: "PRO",
  status: "ACTIVE",
  billingInterval: "YEARLY",
  trialEndsAt: null,
  currentPeriodEnd: new Date(NOW + 200 * 86_400_000),
  cancelAtPeriodEnd: false,
  stripeCustomerId: "cus_A",
  stripeSubscriptionId: "sub_A",
  ...over,
});

test("cancelSubscriptionAction: schedules max_period_end at Stripe, records the owner cancellation once, idempotent on repeat", async (t) => {
  owner();
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({}, { withOverage: true });
  const { cancellations, subUpdates } = actionDb(t, live());

  assert.deepEqual(await billing.cancelSubscriptionAction("too expensive"), { success: true });
  assert.deepEqual(s.of("update")[0].args[1], { cancel_at: "max_period_end" });
  assert.equal(subUpdates[0].data.cancelAtPeriodEnd, true);
  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].data.initiatedBy, "OWNER");
  assert.equal(cancellations[0].data.reason, "too expensive");
  assert.equal(cancellations[0].data.effectiveAt.getTime(), secs(365) * 1000);

  // Ya programada → sin llamada a Stripe ni fila nueva.
  const again = actionDb(t, live({ cancelAtPeriodEnd: true }));
  assert.deepEqual(await billing.cancelSubscriptionAction(), { success: true });
  assert.equal(s.of("update").length, 1);
  assert.equal(again.cancellations.length, 0);
});

test("cancelSubscriptionAction refuses shops without a live Stripe subscription and non-owners", async (t) => {
  owner();
  const s = patchStripe(t);
  actionDb(t, live({ status: "CANCELED" }));
  assert.match((await billing.cancelSubscriptionAction() as any).error, /subscription/i);
  actionDb(t, live({ stripeSubscriptionId: null }));
  assert.match((await billing.cancelSubscriptionAction() as any).error, /subscription/i);
  assert.equal(s.calls.length, 0);

  setSession({ user: { id: "u2", role: "MECHANIC", shopId: "shop-A" } });
  actionDb(t, live());
  await assert.rejects(() => billing.cancelSubscriptionAction());
});

test("resumeSubscriptionAction clears the cancellation at Stripe and locally; no-op if nothing is scheduled", async (t) => {
  owner();
  const s = patchStripe(t);
  s.state.retrieve = () => stripeSub({ cancel_at: secs(365) });
  const { subUpdates } = actionDb(t, live({ cancelAtPeriodEnd: true }));
  assert.deepEqual(await billing.resumeSubscriptionAction(), { success: true });
  assert.deepEqual(s.of("update")[0].args[1], { cancel_at: "" });
  assert.equal(subUpdates[0].data.cancelAtPeriodEnd, false);

  actionDb(t, live());
  assert.deepEqual(await billing.resumeSubscriptionAction(), { success: true });
  assert.equal(s.of("update").length, 1);
});

test("a Stripe failure while cancelling leaves the local row untouched and returns a friendly error", async (t) => {
  owner();
  const stripe = getStripeClient() as any;
  const orig = { retrieve: stripe.subscriptions.retrieve };
  stripe.subscriptions.retrieve = async () => {
    throw new Error("stripe down");
  };
  t.after(() => {
    stripe.subscriptions.retrieve = orig.retrieve;
  });
  t.mock.method(console, "error", () => {});
  const { subUpdates, cancellations } = actionDb(t, live());
  const result = (await billing.cancelSubscriptionAction()) as any;
  assert.match(result.error, /Could not cancel/);
  assert.equal(subUpdates.length + cancellations.length, 0);
});
