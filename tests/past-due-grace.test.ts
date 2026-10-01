/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures inspect loosely-typed Stripe / Prisma args */
// GarageOS impone por sí mismo la gracia de 48 h de PAST_DUE → RESTRICTED (sin depender de que Stripe llegue a
// `unpaid`). Reloj = Subscription.pastDueSince (primera observación de past_due), inyectable: nada duerme ni usa
// la hora real. Ningún test toca Stripe ni una DB real.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type Stripe from "stripe";
import { patchDb } from "./helpers/db-mock";
import {
  PAST_DUE_GRACE_MS,
  nextPastDueSince,
  resolveAccess,
  type DbSubscriptionStatus,
  type SubscriptionRowLike,
} from "../src/domain/subscription-state";
import { confirmCheckoutSession, handleStripeEvent, syncStripeSubscription, type StripeSyncApi } from "../src/lib/stripe-sync";
import { getEffectiveSubscription } from "../src/lib/subscription";

process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";

const T0 = new Date("2026-10-10T12:00:00.000Z");
const H = 3_600_000;
const at = (hours: number) => new Date(T0.getTime() + hours * H);

function row(over: Partial<SubscriptionRowLike> = {}): SubscriptionRowLike {
  return { plan: "PRO", status: "PAST_DUE", trialEndsAt: null, stripeSubscriptionId: "sub_A", pastDueSince: T0, ...over };
}

// ── Dominio puro ─────────────────────────────────────────────────────────────

test("the grace is 48 hours", () => {
  assert.equal(PAST_DUE_GRACE_MS, 48 * H);
});

test("PAST_DUE inside the 48 h grace keeps plan and write access (and reports when the grace ends)", () => {
  for (const hours of [0, 1, 24, 47.99]) {
    const a = resolveAccess(row(), at(hours));
    assert.deepEqual([a.accessState, a.plan, a.canWrite, a.isPastDueExpired], ["PAST_DUE", "PRO", true, false], `+${hours}h`);
    assert.equal(a.pastDueGraceEndsAt?.toISOString(), at(48).toISOString());
  }
});

test("PAST_DUE restricts EXACTLY at 48 h and after: no plan, no writes, never Core", () => {
  for (const ms of [0, 1, 6 * H, 24 * 30 * H]) {
    const a = resolveAccess(row(), new Date(T0.getTime() + PAST_DUE_GRACE_MS + ms));
    assert.deepEqual([a.accessState, a.plan, a.canWrite, a.isPastDueExpired], ["RESTRICTED", null, false, true], `+48h+${ms}ms`);
    assert.equal(a.pastDueGraceEndsAt, null);
  }
  const justBefore = resolveAccess(row(), new Date(T0.getTime() + PAST_DUE_GRACE_MS - 1));
  assert.equal(justBefore.accessState, "PAST_DUE", "1 ms before the deadline is still grace");
});

test("a PAST_DUE row without a clock cannot prove a grace: it fails closed (RESTRICTED)", () => {
  const a = resolveAccess(row({ pastDueSince: null }), T0);
  assert.deepEqual([a.accessState, a.canWrite, a.isPastDueExpired], ["RESTRICTED", false, true]);
  assert.equal(resolveAccess(row({ pastDueSince: undefined }), T0).accessState, "RESTRICTED");
});

test("a clock in the future (skew) is still grace, never an early restriction", () => {
  assert.equal(resolveAccess(row({ pastDueSince: at(2) }), T0).accessState, "PAST_DUE");
});

test("canceled / unpaid / incomplete stay restricted regardless of any stale pastDueSince", () => {
  for (const status of ["CANCELED", "UNPAID", "INCOMPLETE"] as DbSubscriptionStatus[]) {
    const a = resolveAccess(row({ status, pastDueSince: at(0) }), at(1));
    assert.deepEqual([a.accessState, a.plan, a.canWrite], ["RESTRICTED", null, false], status);
  }
});

test("a non-PAST_DUE status ignores pastDueSince (ACTIVE / TRIALING are not affected by a leftover value)", () => {
  assert.equal(resolveAccess(row({ status: "ACTIVE", pastDueSince: at(-500) }), T0).accessState, "ACTIVE");
});

test("nextPastDueSince: first past_due starts the clock; repeats never reset it; every other status clears it", () => {
  assert.equal(nextPastDueSince({ status: "ACTIVE", pastDueSince: null }, "PAST_DUE", at(5))?.getTime(), at(5).getTime());
  assert.equal(nextPastDueSince({ status: "TRIALING", pastDueSince: null }, "PAST_DUE", at(5))?.getTime(), at(5).getTime());
  assert.equal(nextPastDueSince(null, "PAST_DUE", at(5))?.getTime(), at(5).getTime(), "new row");
  assert.equal(nextPastDueSince({ status: "PAST_DUE", pastDueSince: T0 }, "PAST_DUE", at(30))?.getTime(), T0.getTime(), "repeat keeps T0");
  assert.equal(nextPastDueSince({ status: "PAST_DUE", pastDueSince: null }, "PAST_DUE", at(30))?.getTime(), at(30).getTime(), "legacy row without a clock");
  for (const s of ["ACTIVE", "TRIALING", "UNPAID", "CANCELED", "INCOMPLETE", "AWAITING_PLAN"] as DbSubscriptionStatus[]) {
    assert.equal(nextPastDueSince({ status: "PAST_DUE", pastDueSince: T0 }, s, at(1)), null, s);
  }
  // Una nueva morosidad tras recuperarse empieza un reloj NUEVO (no hereda el viejo).
  assert.equal(nextPastDueSince({ status: "ACTIVE", pastDueSince: T0 }, "PAST_DUE", at(100))?.getTime(), at(100).getTime());
});

// ── Sincronización con Stripe (DB falsa con estado, reloj inyectado) ─────────

type Db = { current: any; upserts: any[] };

function statefulDb(t: TestContext, initial: Record<string, unknown>): Db {
  const state: Db = { current: { shopId: "shop-A", stripeCustomerId: "cus_A", stripeSubscriptionId: "sub_A", pastDueSince: null, ...initial }, upserts: [] };
  patchDb(t, "subscription", "findUnique", (async ({ where }: any) => {
    if (where.stripeSubscriptionId) return state.current.stripeSubscriptionId === where.stripeSubscriptionId ? { shopId: state.current.shopId } : null;
    if (where.stripeCustomerId) return state.current.stripeCustomerId === where.stripeCustomerId ? { shopId: state.current.shopId } : null;
    if (where.shopId) return state.current;
    if (where.id) return state.current;
    return null;
  }) as never);
  patchDb(t, "subscription", "upsert", (async (args: any) => {
    state.upserts.push(args);
    state.current = { ...state.current, ...args.update };
    return state.current;
  }) as never);
  patchDb(t, "subscription", "updateMany", (async ({ where, data }: any) => {
    if (where.stripeSubscriptionId && where.stripeSubscriptionId !== state.current.stripeSubscriptionId) return { count: 0 };
    state.current = { ...state.current, ...data };
    return { count: 1 };
  }) as never);
  patchDb(t, "shop", "findUnique", (async () => ({ id: "shop-A" })) as never);
  return state;
}

function stripeSub(status: string): Stripe.Subscription {
  return {
    id: "sub_A",
    customer: "cus_A",
    status,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    metadata: { shopId: "shop-A" },
    items: { data: [{ id: "si_plan", price: { id: "price_pro_m" }, current_period_end: Math.floor(at(24 * 20).getTime() / 1000) }] },
  } as unknown as Stripe.Subscription;
}

const fakeApi = (live: () => Stripe.Subscription): StripeSyncApi => ({
  cancelSubscription: async () => undefined,
  retrieveSubscription: async () => live(),
});

const accessAt = (db: Db, when: Date) =>
  resolveAccess(
    { plan: db.current.plan ?? "PRO", status: db.current.status, trialEndsAt: null, stripeSubscriptionId: "sub_A", pastDueSince: db.current.pastDueSince },
    when
  );

test("ACTIVE → PAST_DUE records the clock once; repeated past_due syncs (any later time) never reset it", async (t) => {
  const db = statefulDb(t, { status: "ACTIVE", plan: "PRO" });
  await syncStripeSubscription(stripeSub("past_due"), "shop-A", fakeApi(() => stripeSub("past_due")), { clock: () => at(0) });
  assert.equal(db.current.status, "PAST_DUE");
  assert.equal(db.current.pastDueSince.getTime(), T0.getTime());

  for (const hours of [1, 10, 47, 49, 200]) {
    await syncStripeSubscription(stripeSub("past_due"), "shop-A", fakeApi(() => stripeSub("past_due")), { clock: () => at(hours) });
    assert.equal(db.current.pastDueSince.getTime(), T0.getTime(), `still T0 after a repeat at +${hours}h`);
  }
});

test("end to end: grace for 48 h, restricted after; recovery clears; a later past_due starts a NEW 48 h", async (t) => {
  const db = statefulDb(t, { status: "ACTIVE", plan: "PRO" });
  const sync = (status: string, hours: number) =>
    syncStripeSubscription(stripeSub(status), "shop-A", fakeApi(() => stripeSub(status)), { clock: () => at(hours) });

  await sync("past_due", 0);
  assert.equal(accessAt(db, at(47)).accessState, "PAST_DUE");
  assert.equal(accessAt(db, at(47)).canWrite, true);
  await sync("past_due", 47); // repetición
  assert.equal(accessAt(db, at(48)).accessState, "RESTRICTED", "48 h after the FIRST observation, not after the last repeat");
  await sync("past_due", 60);
  assert.equal(accessAt(db, at(60)).canWrite, false, "a late repeat does not extend the grace");

  await sync("active", 61); // paga
  assert.equal(db.current.pastDueSince, null, "recovery clears the clock");
  assert.equal(accessAt(db, at(61)).accessState, "ACTIVE");

  await sync("past_due", 100); // vuelve a fallar
  assert.equal(db.current.pastDueSince.getTime(), at(100).getTime(), "a new delinquency is a new clock");
  assert.equal(accessAt(db, at(147)).accessState, "PAST_DUE");
  assert.equal(accessAt(db, at(148)).accessState, "RESTRICTED");
});

test("trialing → past_due (first charge fails after the trial) starts the clock too; trialing/active clear it", async (t) => {
  const db = statefulDb(t, { status: "TRIALING", plan: "PRO" });
  await syncStripeSubscription(stripeSub("past_due"), "shop-A", fakeApi(() => stripeSub("past_due")), { clock: () => at(3) });
  assert.equal(db.current.pastDueSince.getTime(), at(3).getTime());
  await syncStripeSubscription(stripeSub("trialing"), "shop-A", fakeApi(() => stripeSub("trialing")), { clock: () => at(4) });
  assert.equal(db.current.pastDueSince, null);
});

test("terminal states: unpaid / canceled clear the clock and stay RESTRICTED; subscription.deleted does too", async (t) => {
  const db = statefulDb(t, { status: "PAST_DUE", plan: "PRO", pastDueSince: T0 });
  await syncStripeSubscription(stripeSub("unpaid"), "shop-A", fakeApi(() => stripeSub("unpaid")), { clock: () => at(10) });
  assert.deepEqual([db.current.status, db.current.pastDueSince, accessAt(db, at(10)).canWrite], ["UNPAID", null, false]);

  const db2 = statefulDb(t, { status: "PAST_DUE", plan: "PRO", pastDueSince: T0 });
  await syncStripeSubscription(stripeSub("canceled"), "shop-A", fakeApi(() => stripeSub("canceled")), { clock: () => at(10) });
  assert.deepEqual([db2.current.status, db2.current.pastDueSince, accessAt(db2, at(10)).canWrite], ["CANCELED", null, false]);

  const db3 = statefulDb(t, { status: "PAST_DUE", plan: "PRO", pastDueSince: T0 });
  await handleStripeEvent({ id: "evt_d", type: "customer.subscription.deleted", data: { object: { id: "sub_A" } } } as unknown as Stripe.Event, fakeApi(() => stripeSub("canceled")), () => at(11));
  assert.deepEqual([db3.current.status, db3.current.pastDueSince], ["CANCELED", null]);
});

test("out-of-order events: a stale past_due payload never restarts or extends the clock — the LIVE Stripe state wins", async (t) => {
  // La DB ya recuperó (ACTIVE); llega tarde un evento con payload past_due, pero Stripe hoy dice active.
  const db = statefulDb(t, { status: "ACTIVE", plan: "PRO", pastDueSince: null });
  const stale = { id: "evt_s", type: "customer.subscription.updated", data: { object: stripeSub("past_due") } } as unknown as Stripe.Event;
  await handleStripeEvent(stale, fakeApi(() => stripeSub("active")), () => at(500));
  assert.deepEqual([db.current.status, db.current.pastDueSince], ["ACTIVE", null], "no PAST_DUE is resurrected from an old payload");

  // La DB sigue PAST_DUE desde T0; llega un evento 'active' viejo pero Stripe hoy sigue past_due → el reloj no se mueve.
  const db2 = statefulDb(t, { status: "PAST_DUE", plan: "PRO", pastDueSince: T0 });
  const old = { id: "evt_o", type: "customer.subscription.updated", data: { object: stripeSub("active") } } as unknown as Stripe.Event;
  await handleStripeEvent(old, fakeApi(() => stripeSub("past_due")), () => at(500));
  assert.equal(db2.current.pastDueSince.getTime(), T0.getTime());
});

test("if the live re-read fails for any reason other than 'deleted', the handler fails (Stripe retries) instead of applying a stale snapshot", async (t) => {
  const db = statefulDb(t, { status: "ACTIVE", plan: "PRO", pastDueSince: null });
  const evt = { id: "evt_f", type: "customer.subscription.updated", data: { object: stripeSub("past_due") } } as unknown as Stripe.Event;
  await assert.rejects(
    () =>
      handleStripeEvent(evt, { cancelSubscription: async () => undefined, retrieveSubscription: async () => { throw new Error("stripe outage"); } }, () => at(1)),
    /stripe outage/
  );
  assert.deepEqual([db.current.status, db.current.pastDueSince], ["ACTIVE", null], "nothing was applied");

  // resource_missing (la suscripción ya no existe) sí permite usar el payload.
  await handleStripeEvent(
    evt,
    { cancelSubscription: async () => undefined, retrieveSubscription: async () => { throw Object.assign(new Error("gone"), { code: "resource_missing" }); } },
    () => at(2)
  );
  assert.equal(db.current.status, "PAST_DUE");
});

test("manual resync from Checkout (confirmCheckoutSession) keeps the existing clock when already PAST_DUE", async (t) => {
  const db = statefulDb(t, { status: "PAST_DUE", plan: "PRO", pastDueSince: T0 });
  const res = await confirmCheckoutSession(
    "cs_1",
    "shop-A",
    fakeApi(() => stripeSub("past_due")),
    async () => ({ client_reference_id: "shop-A", status: "complete", subscription: "sub_A" }) as unknown as Stripe.Checkout.Session,
    () => at(300)
  );
  assert.equal(res, "confirmed");
  assert.equal(db.current.pastDueSince.getTime(), T0.getTime());
});

test("checkout.session.completed and subscription.created also go through the same clock rule", async (t) => {
  const db = statefulDb(t, { status: "ACTIVE", plan: "PRO" });
  await handleStripeEvent(
    { id: "evt_c", type: "checkout.session.completed", data: { object: { client_reference_id: "shop-A", subscription: "sub_A" } } } as unknown as Stripe.Event,
    fakeApi(() => stripeSub("past_due")),
    () => at(7)
  );
  assert.equal(db.current.pastDueSince.getTime(), at(7).getTime());
});

// ── Lectura efectiva: getEffectiveSubscription con reloj inyectado ───────────

test("getEffectiveSubscription(shop, now) applies the 48 h rule and exposes the grace window", async (t) => {
  const base = { id: "r", shopId: "shop-A", plan: "PRO", status: "PAST_DUE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: at(100), cancelAtPeriodEnd: false, stripeCustomerId: "cus_A", stripeSubscriptionId: "sub_A", stripePriceId: "price_pro_m", billingEmail: null, pastDueSince: T0 };
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: base })) as never);
  const inside = await getEffectiveSubscription("shop-A", at(47));
  assert.deepEqual([inside.accessState, inside.canWrite, inside.isPastDueExpired], ["PAST_DUE", true, false]);
  assert.equal(inside.pastDueSince?.getTime(), T0.getTime());
  assert.equal(inside.pastDueGraceEndsAt?.getTime(), at(48).getTime());
  assert.equal(inside.subscribedPlan, "PRO");

  const after = await getEffectiveSubscription("shop-A", at(48));
  assert.deepEqual([after.accessState, after.canWrite, after.plan, after.isPastDueExpired], ["RESTRICTED", false, null, true]);
  assert.equal(after.subscribedPlan, "PRO", "the chosen plan is still shown for read access/billing");
  assert.equal(after.hasStripeSubscription, true, "billing stays reachable so the customer can pay");
});
