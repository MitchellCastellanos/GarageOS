import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { db } from "../src/lib/db";
import { planSmsOverage } from "../src/lib/communications/sms-usage";

type AnyFn = (...args: unknown[]) => unknown;

function mockDb<M extends keyof typeof db, K extends keyof (typeof db)[M]>(
  t: TestContext,
  model: M,
  method: K,
  impl: AnyFn
) {
  const original = db[model][method];
  const fn = t.mock.fn(impl);
  db[model][method] = fn as unknown as (typeof db)[M][K];
  t.after(() => {
    db[model][method] = original;
  });
  return fn;
}

function mockUsage(t: TestContext, opts: { used: number; allowance: number }) {
  mockDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: opts.used } }));
  mockDb(t, "communicationMessage", "count", async () => 0);
  mockDb(t, "shop", "findUnique", async () => ({
    smsMonthlyAllowanceOverride: opts.allowance,
    organizationId: null,
    subscription: null,
  }));
}

// planSmsOverage nunca toca Twilio (solo lee CommunicationMessage/Shop) — seguro de
// correr sin red, a diferencia de sendSms de punta a punta.

test("planSmsOverage never blocks — it just reports how much of this message is overage", async (t) => {
  mockUsage(t, { used: 100, allowance: 100 });
  const plan = await planSmsOverage("shop-A", 1);
  assert.deepEqual(plan, { usedBefore: 100, allowance: 100, overageSegments: 1 });
});

test("planSmsOverage reports zero overage while still under the allowance", async (t) => {
  mockUsage(t, { used: 50, allowance: 100 });
  const plan = await planSmsOverage("shop-A", 10);
  assert.equal(plan.overageSegments, 0);
});

test("planSmsOverage splits a message that straddles the allowance boundary", async (t) => {
  mockUsage(t, { used: 98, allowance: 100 });
  const plan = await planSmsOverage("shop-A", 5);
  assert.equal(plan.overageSegments, 3);
});
