import type { TestContext } from "node:test";
import { db } from "../../src/lib/db";

type AnyFn = (...args: never[]) => unknown;

/** Sustituye db[model][method] durante el test (se restaura solo). */
export function patchDb(t: TestContext, model: string, method: string, impl: AnyFn) {
  const m = (db as unknown as Record<string, Record<string, unknown>>)[model];
  const original = m[method];
  const fn = t.mock.fn(impl);
  m[method] = fn;
  t.after(() => {
    m[method] = original;
  });
  return fn;
}

export function patchTransaction(t: TestContext, tx: unknown) {
  const original = db.$transaction;
  (db as unknown as { $transaction: unknown }).$transaction = async (cb: (tx: unknown) => unknown) => cb(tx);
  t.after(() => {
    (db as unknown as { $transaction: unknown }).$transaction = original;
  });
}

const DAY = 86_400_000;

/** Suscripción del taller: plan + estado (ACTIVE por defecto). */
export function mockSubscription(
  t: TestContext,
  plan: "CORE" | "PRO" | "COMPLETE" | null,
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "UNPAID" = "ACTIVE"
) {
  const row = {
    id: "sub",
    shopId: "shop-A",
    plan,
    status,
    billingInterval: "MONTHLY",
    trialEndsAt: status === "TRIALING" ? new Date(Date.now() + 5 * DAY) : null,
    currentPeriodEnd: new Date(Date.now() + 20 * DAY),
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus",
    stripeSubscriptionId: "sub_x",
    stripePriceId: "price",
    billingEmail: null,
  };
  return patchDb(t, "shop", "findUnique", async () => ({ organizationId: null, subscription: row }));
}

/** Ownership checks (`findForeignRef`) pass: the referenced customer / vehicle / mechanic belong to the acting shop. */
export function allowOwnership(t: TestContext) {
  patchDb(t, "client", "findFirst", (async () => ({ id: "owned" })) as never);
  patchDb(t, "vehicle", "findFirst", (async () => ({ id: "owned" })) as never);
  patchDb(t, "user", "findFirst", (async () => ({ id: "owned" })) as never);
}
