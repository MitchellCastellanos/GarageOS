import assert from "node:assert/strict";
import test from "node:test";
import { setSession } from "./helpers/action-harness";
import { mockSubscription, patchDb, patchTransaction } from "./helpers/db-mock";
import { addMonths, matchRules, planReminder, validateRule } from "../src/domain/reminder-rules";
import { resolveSegmentClients, isValidSegmentDefinition } from "../src/lib/communications/segments";
import { db } from "../src/lib/db";

const rulesActions = await import("../src/actions/reminder-rules");
const automation = await import("../src/lib/reminder-automation");

const owner = () => setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
const RULE = { id: "r1", name: "Oil", keyword: "Oil", intervalMonths: 6, intervalKm: 8000, leadDays: 14 };

function planRow(plan: "CORE" | "PRO", status = "ACTIVE") {
  return async () => ({
    organizationId: null,
    subscription: { id: "s", shopId: "shop-A", plan, status, billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null },
  });
}

test("rule matching ignores case and accents; dates clamp to month end", () => {
  const rules = [RULE, { ...RULE, id: "r2", keyword: "Freins" }, { ...RULE, id: "r3", keyword: "  " }];
  assert.deepEqual(matchRules(rules, ["Changement d'huile", "Oil change 5W30"]).map((r) => r.id), ["r1"]);
  assert.deepEqual(matchRules(rules, ["Remplacement des FREINS avant"]).map((r) => r.id), ["r2"]);
  assert.equal(addMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonths(new Date("2026-08-15T12:00:00Z"), 6).toISOString().slice(0, 10), "2027-02-15");
});

test("planReminder: due date, mileage and lead time; km-only rules are rejected", () => {
  const done = new Date("2026-09-01T12:00:00Z");
  const p = planReminder(RULE, done, 50_000)!;
  assert.equal(p.dueDate!.toISOString().slice(0, 10), "2027-03-01");
  assert.equal(p.dueMileage, 58_000);
  assert.equal(p.remindAt.toISOString().slice(0, 10), "2027-02-15");
  assert.equal(planReminder(RULE, done, null)!.dueMileage, null);
  assert.equal(planReminder({ ...RULE, intervalMonths: null }, done, 1), null);
  // Anticipación mayor que el intervalo: nunca en el pasado.
  assert.equal(planReminder({ ...RULE, intervalMonths: 1, leadDays: 90 }, done, 1)!.remindAt.getTime(), done.getTime());
  assert.deepEqual(validateRule({ name: "", keyword: "x", intervalMonths: 6 }), { ok: false, error: "NAME_REQUIRED" });
  assert.deepEqual(validateRule({ name: "a", keyword: "x", intervalKm: 5000 }), { ok: false, error: "INTERVAL_REQUIRED" });
  assert.deepEqual(validateRule({ name: "a", keyword: "x", intervalMonths: 6, leadDays: 200 }), { ok: false, error: "INVALID_NUMBER" });
});

test("rules CRUD: Core refused server-side; Pro creates shop-scoped rules", async (t) => {
  owner();
  const sub = mockSubscription(t, "CORE");
  const create = patchDb(t, "reminderRule", "create", async () => ({}));
  const list = patchDb(t, "reminderRule", "findMany", async () => []);
  const del = patchDb(t, "reminderRule", "deleteMany", async () => ({ count: 1 }));

  assert.match(String((await rulesActions.createReminderRule({ name: "Oil", keyword: "oil", intervalMonths: 6 })).error), /PRO/);
  assert.deepEqual(await rulesActions.getReminderRules(), []);
  assert.equal(create.mock.callCount() + list.mock.callCount(), 0);

  sub.mock.mockImplementation(planRow("PRO") as never);
  assert.deepEqual(await rulesActions.createReminderRule({ name: "Oil", keyword: "oil", intervalMonths: 6, intervalKm: 8000 }), { success: true });
  assert.deepEqual((create.mock.calls[0].arguments as unknown as [{ data: unknown }])[0].data, { shopId: "shop-A", name: "Oil", keyword: "oil", intervalMonths: 6, intervalKm: 8000, leadDays: 14 });
  assert.deepEqual(await rulesActions.createReminderRule({ name: "Oil", keyword: "oil" }), { error: "INTERVAL_REQUIRED" });
  await rulesActions.deleteReminderRule("r1");
  assert.deepEqual((del.mock.calls[0].arguments as unknown as [{ where: unknown }])[0].where, { id: "r1", shopId: "shop-A" });

  sub.mock.mockImplementation(planRow("PRO", "UNPAID") as never);
  await assert.rejects(rulesActions.createReminderRule({ name: "Oil", keyword: "oil", intervalMonths: 6 }), /NEXT_REDIRECT/);
});

function completedWorkOrder() {
  return { id: "wo1", orderNumber: "OT-1", vehicleId: "v1", mileageIn: 40_000, mileageOut: 40_050, lines: [{ description: "Oil change" }, { description: "Filter" }] };
}

test("completing a work order creates one reminder per matching rule (Pro), replacing the previous pending one, idempotently", async (t) => {
  const sub = mockSubscription(t, "PRO");
  patchDb(t, "reminderRule", "findMany", async () => [RULE, { ...RULE, id: "r2", keyword: "brake" }]);
  patchDb(t, "workOrder", "findFirst", async () => completedWorkOrder());
  const created: Record<string, unknown>[] = [];
  const updates: unknown[] = [];
  let duplicate = false;
  patchTransaction(t, {
    serviceReminder: {
      updateMany: async (a: unknown) => (updates.push(a), { count: 1 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (duplicate) throw Object.assign(new Error("dup"), { code: "P2002" });
        created.push(data);
        return data;
      },
    },
  });

  const res = await automation.createRemindersForCompletedWorkOrder("shop-A", "wo1");
  assert.deepEqual(res, { created: 1, replaced: 1 });
  assert.equal(created[0].serviceType, "Oil");
  assert.equal(created[0].dueMileage, 48_050);
  assert.equal(created[0].ruleId, "r1");
  assert.equal(created[0].workOrderId, "wo1");
  assert.equal(created[0].shopId, "shop-A");
  assert.deepEqual(updates[0], { where: { shopId: "shop-A", vehicleId: "v1", ruleId: "r1", status: "PENDING" }, data: { status: "DISMISSED" } });

  duplicate = true; // segunda llamada (p. ej. reintento): no falla ni duplica
  assert.deepEqual(await automation.createRemindersForCompletedWorkOrder("shop-A", "wo1"), { created: 0, replaced: 0 });

  // Core: nada, y ni siquiera lee las reglas.
  sub.mock.mockImplementation(planRow("CORE") as never);
  const rulesRead = patchDb(t, "reminderRule", "findMany", async () => [RULE]);
  assert.deepEqual(await automation.createRemindersForCompletedWorkOrder("shop-A", "wo1"), { created: 0, replaced: 0 });
  assert.equal(rulesRead.mock.callCount(), 0);
});

test("cron delivery: only Pro/operating shops, customer's channel preference, SENT once", async (t) => {
  const sub = mockSubscription(t, "PRO");
  const now = new Date("2027-02-16T09:00:00Z");
  const base = {
    id: "rem1",
    shopId: "shop-A",
    serviceType: "Oil",
    dueDate: new Date("2027-03-01T00:00:00Z"),
    dueMileage: 48_000,
    shop: { id: "shop-A", name: "Garage", phone: "514", email: null },
    vehicle: { year: 2018, make: "Ford", model: "F150", licensePlate: "ABC", mileageUnit: "KM", client: { id: "c1", firstName: "Ann", lastName: "Lee", phone: null, email: null as string | null, language: "EN", notifyChannel: "AUTO" } },
  };
  const find = patchDb(t, "serviceReminder", "findMany", async () => [base]);
  const mark = patchDb(t, "serviceReminder", "updateMany", async () => ({ count: 1 }));

  // Sin teléfono ni email: se omite.
  const skipped = await automation.deliverDueAutomatedReminders(now, async () => true);
  assert.deepEqual(skipped, { sent: 0, skipped: 1, errors: 0 });
  const where = (find.mock.calls[0].arguments as unknown as [{ where: Record<string, unknown> }])[0].where;
  assert.deepEqual(where.ruleId, { not: null });
  assert.equal(mark.mock.callCount(), 0);

  // Taller restringido (canOperate false): se omite aunque tenga contacto.
  base.vehicle.client.email = "ann@x.com";
  assert.deepEqual(await automation.deliverDueAutomatedReminders(now, async () => false), { sent: 0, skipped: 1, errors: 0 });

  // Core (bajó de plan): se omite.
  sub.mock.mockImplementation(planRow("CORE") as never);
  assert.deepEqual(await automation.deliverDueAutomatedReminders(now, async () => true), { sent: 0, skipped: 1, errors: 0 });
  assert.equal(mark.mock.callCount(), 0);
  void db;
});

test("campaign segment SERVICE_DUE is validated and shop-scoped", async (t) => {
  assert.ok(isValidSegmentDefinition({ type: "SERVICE_DUE", days: 30 }));
  assert.ok(!isValidSegmentDefinition({ type: "SERVICE_DUE", days: -1 }));
  assert.ok(!isValidSegmentDefinition({ type: "SERVICE_DUE", days: 1.5 }));
  const find = patchDb(t, "client", "findMany", async () => []);
  await resolveSegmentClients("shop-A", { type: "SERVICE_DUE", days: 30 });
  const where = (find.mock.calls[0].arguments as unknown as [{ where: Record<string, unknown> }])[0].where as { shopId: string; marketingEmailConsent: boolean; vehicles: { some: { reminders: { some: { shopId: string; status: unknown } } } } };
  assert.equal(where.shopId, "shop-A");
  assert.equal(where.marketingEmailConsent, true, "consent filter can't be skipped");
  assert.equal(where.vehicles.some.reminders.some.shopId, "shop-A");
});
