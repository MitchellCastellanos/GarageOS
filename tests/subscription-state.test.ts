import assert from "node:assert/strict";
import test from "node:test";
import {
  STRIPE_TRIAL_CONVERSION_GRACE_MS,
  TRIAL_DAYS,
  canWriteInState,
  decideStripeSync,
  decideTrialPlan,
  isLiveStripeStatus,
  mapStripeStatus,
  nextChargeFor,
  quoteTrialStart,
  resolveAccess,
  type DbSubscriptionStatus,
  type SubscriptionRowLike,
} from "../src/domain/subscription-state";
import { planIncludes, type Plan } from "../src/config/entitlements";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function row(over: Partial<SubscriptionRowLike> = {}): SubscriptionRowLike {
  return { plan: "PRO", status: "ACTIVE", trialEndsAt: null, stripeSubscriptionId: "sub_1", ...over };
}

// ── Estados / acceso ─────────────────────────────────────────────────────────

test("a shop still choosing a plan is SETUP_REQUIRED: no plan, no write access, never Core", () => {
  const a = resolveAccess(row({ plan: null, status: "AWAITING_PLAN", stripeSubscriptionId: null }), NOW);
  assert.equal(a.accessState, "SETUP_REQUIRED");
  assert.equal(a.plan, null);
  assert.equal(a.canWrite, false);
});

test("a missing Subscription row is RESTRICTED (recovery state), not complimentary Core", () => {
  const a = resolveAccess(null, NOW);
  assert.equal(a.accessState, "RESTRICTED");
  assert.equal(a.plan, null);
  assert.equal(a.canWrite, false);
});

test("selected plan entitlements apply during the trial: Core / Pro / Complete", () => {
  for (const plan of ["CORE", "PRO", "COMPLETE"] as Plan[]) {
    const a = resolveAccess(row({ plan, status: "TRIALING", trialEndsAt: day(10) }), NOW);
    assert.equal(a.accessState, "TRIALING");
    assert.equal(a.plan, plan, `${plan} trial gets ${plan} entitlements`);
    assert.equal(a.isTrialing, true);
    assert.equal(a.canWrite, true);
  }
  // Core trial NO recibe capacidades de Pro; Complete trial sí tiene multi-sucursal.
  const core = resolveAccess(row({ plan: "CORE", status: "TRIALING", trialEndsAt: day(5) }), NOW).plan!;
  const complete = resolveAccess(row({ plan: "COMPLETE", status: "TRIALING", trialEndsAt: day(5) }), NOW).plan!;
  assert.equal(planIncludes(core, "inventory.manage"), false);
  assert.equal(planIncludes(complete, "organization.multiLocation"), true);
});

test("ACTIVE keeps the paid plan", () => {
  const a = resolveAccess(row({ plan: "COMPLETE", status: "ACTIVE" }), NOW);
  assert.deepEqual([a.accessState, a.plan, a.canWrite], ["ACTIVE", "COMPLETE", true]);
});

test("PAST_DUE keeps the selected plan and write access during the 48 h GarageOS grace", () => {
  const a = resolveAccess(row({ plan: "PRO", status: "PAST_DUE", pastDueSince: new Date(NOW.getTime() - 3_600_000) }), NOW);
  assert.deepEqual([a.accessState, a.plan, a.canWrite], ["PAST_DUE", "PRO", true]);
});

test("UNPAID, CANCELED and INCOMPLETE are RESTRICTED — no plan, no writes, never Core", () => {
  for (const status of ["UNPAID", "CANCELED", "INCOMPLETE"] as DbSubscriptionStatus[]) {
    const a = resolveAccess(row({ status }), NOW);
    assert.equal(a.accessState, "RESTRICTED", status);
    assert.equal(a.plan, null, status);
    assert.equal(a.canWrite, false, status);
  }
});

test("a legacy trial without Stripe (no card) restricts the moment it expires", () => {
  const legacy = row({ status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: new Date(NOW.getTime() - 1000) });
  const a = resolveAccess(legacy, NOW);
  assert.equal(a.accessState, "RESTRICTED");
  assert.equal(a.isTrialExpired, true);
  assert.equal(a.plan, null);
});

test("a Stripe-backed trial gets a short webhook-lag grace, then restricts", () => {
  const ended = new Date(NOW.getTime() - 60_000);
  const inGrace = resolveAccess(row({ status: "TRIALING", trialEndsAt: ended }), NOW);
  assert.equal(inGrace.accessState, "TRIALING");

  const past = new Date(NOW.getTime() - STRIPE_TRIAL_CONVERSION_GRACE_MS - 60_000);
  const lost = resolveAccess(row({ status: "TRIALING", trialEndsAt: past }), NOW);
  assert.equal(lost.accessState, "RESTRICTED");
  assert.equal(lost.isTrialExpired, true);
});

test("TRIALING without trialEndsAt and a non-pending row without a plan are restricted (corrupt rows fail closed)", () => {
  assert.equal(resolveAccess(row({ status: "TRIALING", trialEndsAt: null, stripeSubscriptionId: null }), NOW).accessState, "RESTRICTED");
  assert.equal(resolveAccess(row({ plan: null, status: "ACTIVE" }), NOW).accessState, "RESTRICTED");
});

test("only TRIALING / ACTIVE / PAST_DUE can write", () => {
  assert.deepEqual(
    (["SETUP_REQUIRED", "TRIALING", "ACTIVE", "PAST_DUE", "RESTRICTED"] as const).map(canWriteInState),
    [false, true, true, true, false]
  );
});

// ── Trial: fechas e importes ─────────────────────────────────────────────────

test("quoteTrialStart: $0 today, 14 days, first charge = trusted plan price on the exact date", () => {
  assert.equal(TRIAL_DAYS, 14);
  const cases: [Plan, "MONTHLY" | "YEARLY", number][] = [
    ["CORE", "MONTHLY", 199],
    ["PRO", "MONTHLY", 299],
    ["COMPLETE", "MONTHLY", 449],
    ["CORE", "YEARLY", 1990],
    ["PRO", "YEARLY", 2990],
    ["COMPLETE", "YEARLY", 4490],
  ];
  for (const [plan, interval, amount] of cases) {
    const q = quoteTrialStart(plan, interval, NOW);
    assert.equal(q.dueTodayCad, 0);
    assert.equal(q.firstChargeAmountCad, amount, `${plan}/${interval}`);
    assert.equal(q.firstChargeDate.toISOString(), day(14).toISOString());
  }
});

test("nextChargeFor: trial shows first charge at trial end; active shows period end; cancelling shows none", () => {
  const trialing = { plan: "PRO" as const, status: "TRIALING" as const, billingInterval: "YEARLY" as const, trialEndsAt: day(14), currentPeriodEnd: day(14), cancelAtPeriodEnd: false };
  const t = nextChargeFor(trialing, resolveAccess({ ...trialing, stripeSubscriptionId: "sub_1" }, NOW));
  assert.equal(t?.amountCad, 2990);
  assert.equal(t?.date.toISOString(), day(14).toISOString());

  const active = { ...trialing, status: "ACTIVE" as const, currentPeriodEnd: day(30), billingInterval: "MONTHLY" as const };
  const a = nextChargeFor(active, resolveAccess({ ...active, stripeSubscriptionId: "sub_1" }, NOW));
  assert.equal(a?.amountCad, 299);
  assert.equal(a?.date.toISOString(), day(30).toISOString());

  const canceling = { ...active, cancelAtPeriodEnd: true };
  assert.equal(nextChargeFor(canceling, resolveAccess({ ...canceling, stripeSubscriptionId: "sub_1" }, NOW)), null);
});

test("decideTrialPlan: fresh 14 days only for a shop that never had a Stripe subscription", () => {
  assert.deepEqual(decideTrialPlan({ status: "AWAITING_PLAN", stripeSubscriptionId: null, trialEndsAt: null }, NOW), { kind: "fresh", days: 14 });
  // Cancelar y volver a empezar no regala otro trial.
  assert.equal(decideTrialPlan({ status: "CANCELED", stripeSubscriptionId: "sub_old", trialEndsAt: day(-30) }, NOW).kind, "none");
  assert.equal(decideTrialPlan({ status: "UNPAID", stripeSubscriptionId: "sub_old", trialEndsAt: null }, NOW).kind, "none");
  assert.equal(decideTrialPlan(null, NOW).kind, "none");
  // Trial heredado (sin tarjeta) vigente → conserva SU fin, no se extiende a 14 días.
  const legacy = decideTrialPlan({ status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: day(5) }, NOW);
  assert.equal(legacy.kind, "until");
  assert.equal(legacy.kind === "until" && legacy.endsAt.toISOString(), day(5).toISOString());
  // Trial heredado ya vencido → sin trial.
  assert.equal(decideTrialPlan({ status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: day(-1) }, NOW).kind, "none");
  // Trial heredado a punto de vencer → respeta el mínimo de 48 h de Stripe.
  const soon = decideTrialPlan({ status: "TRIALING", stripeSubscriptionId: null, trialEndsAt: day(0.5) }, NOW);
  assert.equal(soon.kind === "until" && soon.endsAt.getTime() >= NOW.getTime() + 48 * 3600_000, true);
});

// ── Stripe ───────────────────────────────────────────────────────────────────

test("mapStripeStatus covers the full lifecycle; unknown/incomplete states fail closed", () => {
  assert.equal(mapStripeStatus("trialing"), "TRIALING");
  assert.equal(mapStripeStatus("active"), "ACTIVE");
  assert.equal(mapStripeStatus("past_due"), "PAST_DUE");
  assert.equal(mapStripeStatus("unpaid"), "UNPAID");
  assert.equal(mapStripeStatus("canceled"), "CANCELED");
  assert.equal(mapStripeStatus("incomplete"), "INCOMPLETE");
  assert.equal(mapStripeStatus("incomplete_expired"), "INCOMPLETE");
  assert.equal(mapStripeStatus("paused"), "INCOMPLETE");
  assert.equal(isLiveStripeStatus("PAST_DUE"), true);
  assert.equal(isLiveStripeStatus("UNPAID"), false);
});

test("trial → paid: the same subscription moving trialing→active becomes ACTIVE with the paid plan", () => {
  const current = { stripeSubscriptionId: "sub_1", status: "TRIALING" as const };
  assert.equal(decideStripeSync(current, { id: "sub_1", status: mapStripeStatus("active") }), "apply");
  const a = resolveAccess(row({ status: mapStripeStatus("active"), trialEndsAt: day(-1) }), NOW);
  assert.equal(a.accessState, "ACTIVE");
});

test("decideStripeSync: duplicate live subscriptions are canceled; stale events from old subs are ignored", () => {
  const live = { stripeSubscriptionId: "sub_A", status: "ACTIVE" as const };
  // Segunda suscripción viva para el mismo taller = doble cobro.
  assert.equal(decideStripeSync(live, { id: "sub_B", status: "TRIALING" }), "cancel_duplicate");
  // Evento tardío de OTRA suscripción ya muerta no pisa a la viva.
  assert.equal(decideStripeSync(live, { id: "sub_B", status: "CANCELED" }), "ignore_stale");
  // Fila muerta + nueva suscripción viva (re-suscripción) → se aplica.
  const dead = { stripeSubscriptionId: "sub_A", status: "CANCELED" as const };
  assert.equal(decideStripeSync(dead, { id: "sub_B", status: "TRIALING" }), "apply");
  // Fila muerta + evento viejo terminal de otra → ignorar.
  assert.equal(decideStripeSync(dead, { id: "sub_C", status: "CANCELED" }), "ignore_stale");
  // Fila sin suscripción todavía (recién elegida) → aplica.
  assert.equal(decideStripeSync({ stripeSubscriptionId: null, status: "AWAITING_PLAN" }, { id: "sub_B", status: "TRIALING" }), "apply");
  assert.equal(decideStripeSync(null, { id: "sub_B", status: "TRIALING" }), "apply");
});
