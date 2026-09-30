import assert from "node:assert/strict";
import test from "node:test";
import { setSession, RedirectError } from "./helpers/action-harness";
import { allowOwnership, mockSubscription, patchDb, patchTransaction } from "./helpers/db-mock";
import type { WorkOrderFormData } from "../src/lib/validations";

const importActions = await import("../src/actions/import");
const woActions = await import("../src/actions/work-orders");

const owner = () => setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });

function csvForm(csv: string, extra: Record<string, string> = {}, entity = "customers", name = "c.csv") {
  const fd = new FormData();
  fd.set("file", new File([csv], name, { type: "text/csv" }));
  fd.set("entity", entity);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function patchImportReads(t: import("node:test").TestContext) {
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
  const clients = patchDb(t, "client", "findMany", async () => []);
  patchDb(t, "vehicle", "findMany", async () => []);
  patchDb(t, "inventoryPart", "findMany", async () => []);
  patchDb(t, "importRun", "findMany", async () => []);
  return clients;
}

// patchDb("shop","findUnique") ya lo usa mockSubscription; el action también lee shop.defaultLanguage.
function mockShopAndSub(t: import("node:test").TestContext, plan: "CORE" | "PRO", status: "ACTIVE" | "UNPAID" = "ACTIVE") {
  const sub = mockSubscription(t, plan, status);
  sub.mock.mockImplementation((async (a: never) => {
    const select = (a as { select?: Record<string, unknown> }).select;
    if (select && "defaultLanguage" in select) return { defaultLanguage: "FR" };
    return {
      organizationId: null,
      subscription: { id: "s", shopId: "shop-A", plan, status, billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null },
    };
  }) as never);
}

test("import: Core previews customers (shop-scoped lookups) but is refused inventory and 'update' server-side", async (t) => {
  owner();
  mockShopAndSub(t, "CORE");
  const clients = patchImportReads(t);
  const csv = "First name,Last name,Email\nAnn,Lee,ann@x.com\n,Nofirst,\n";

  const ok = await importActions.previewImportAction(csvForm(csv, { mapping: JSON.stringify({ firstName: 0, lastName: 1, email: 2 }) }));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.report?.summary.create, 1);
    assert.equal(ok.report?.summary.errors, 1);
  }
  assert.deepEqual((clients.mock.calls[0].arguments as unknown as [{ where: unknown }])[0].where, { shopId: "shop-A" });

  assert.deepEqual(await importActions.previewImportAction(csvForm("Name,Price\nOil,5\n", {}, "inventory")), { ok: false, error: "UPGRADE_REQUIRED" });
  assert.deepEqual(await importActions.previewImportAction(csvForm(csv, { duplicates: "update" })), { ok: false, error: "UPGRADE_REQUIRED" });
  const big = "First name\n" + Array.from({ length: 501 }, (_, i) => `N${i}`).join("\n");
  assert.deepEqual(await importActions.previewImportAction(csvForm(big)), { ok: false, error: "TOO_MANY_ROWS" });
});

test("import: Pro can preview inventory; non-owners and restricted shops are blocked", async (t) => {
  owner();
  mockShopAndSub(t, "PRO");
  patchImportReads(t);
  const res = await importActions.previewImportAction(csvForm("Part,SKU,Price,Qty\nOil,O-1,9.99,4\n", { mapping: JSON.stringify({ name: 0, sku: 1, unitPrice: 2, quantityOnHand: 3 }) }, "inventory"));
  assert.ok(res.ok && res.report?.summary.create === 1);

  setSession({ user: { id: "u2", role: "MECHANIC", shopId: "shop-A" } });
  await assert.rejects(importActions.previewImportAction(csvForm("First name\nAnn\n")), /permiso/i);
  await assert.rejects(importActions.commitImportAction(csvForm("First name\nAnn\n")), /permiso/i);

  owner();
  mockShopAndSub(t, "PRO", "UNPAID");
  await assert.rejects(importActions.previewImportAction(csvForm("First name\nAnn\n")), (e) => e instanceof RedirectError && e.url.includes("restricted=1"));
});

test("import: commit writes inside one transaction and is scoped to the session shop", async (t) => {
  owner();
  mockShopAndSub(t, "CORE");
  const calls: { name: string; args: unknown }[] = [];
  const rec = (name: string, ret: unknown = { count: 1 }) => async (args: unknown) => (calls.push({ name, args }), ret);
  patchTransaction(t, {
    client: { findMany: rec("client.findMany", []), createMany: rec("client.createMany"), updateMany: rec("client.updateMany") },
    importRun: { create: rec("importRun.create") },
  });
  const res = await importActions.commitImportAction(
    csvForm("First name,Last name,Email\nAnn,Lee,ann@x.com\n", { mapping: JSON.stringify({ firstName: 0, lastName: 1, email: 2 }) })
  );
  assert.ok(res.ok && res.report.summary.create === 1);
  const created = calls.find((c) => c.name === "client.createMany")!.args as { data: { shopId: string; language: string }[] };
  assert.equal(created.data[0].shopId, "shop-A");
  assert.equal(created.data[0].language, "FR");
  // Sin mapeo o con columnas requeridas sin asignar, no se escribe nada.
  assert.deepEqual(await importActions.commitImportAction(csvForm("First name\nAnn\n")), { ok: false, error: "INVALID_REQUEST" });
  assert.deepEqual(await importActions.commitImportAction(csvForm("First name\nAnn\n", { mapping: "{}" })), { ok: false, error: "MISSING_COLUMNS", missing: ["firstName"] });
});

// ── Work orders: consumo de inventario ──────────────────────

const WO: WorkOrderFormData = {
  clientId: "c1",
  vehicleId: "v1",
  mechanicId: "",
  concern: "Oil change",
  diagnosis: "",
  mileageIn: null,
  mileageOut: null,
  lineItems: [{ description: "Oil filter", quantity: 2, unitPrice: 9, itemType: "PART", partId: "p1" }],
};

function woTx(parts: { id: string; shopId: string; quantityOnHand: number; name: string }[]) {
  const movements: Record<string, unknown>[] = [];
  const lines: { partId: string; quantity: number }[] = [];
  return {
    movements,
    parts,
    tx: {
      $queryRaw: async () => [],
      documentSequence: { upsert: async () => ({ lastNumber: 7 }) },
      inventoryPart: {
        findMany: async ({ where }: { where: { id: { in: string[] }; shopId: string } }) => parts.filter((p) => where.id.in.includes(p.id) && p.shopId === where.shopId),
        findFirst: async ({ where }: { where: { id: string; shopId: string } }) => parts.find((p) => p.id === where.id && p.shopId === where.shopId) ?? null,
        updateMany: async ({ where, data }: { where: { id: string; shopId: string; quantityOnHand?: { gte: number } }; data: { quantityOnHand: { decrement?: number; increment?: number } } }) => {
          const p = parts.find((x) => x.id === where.id && x.shopId === where.shopId);
          if (!p || (where.quantityOnHand && p.quantityOnHand < where.quantityOnHand.gte)) return { count: 0 };
          p.quantityOnHand += (data.quantityOnHand.increment ?? 0) - (data.quantityOnHand.decrement ?? 0);
          return { count: 1 };
        },
      },
      workOrder: {
        create: async ({ data }: { data: { lines: { create: { partId: string | null; quantity: string }[] } } }) => {
          lines.push(...data.lines.create.filter((l) => l.partId).map((l) => ({ partId: l.partId as string, quantity: Number(l.quantity) })));
          return { id: "wo-new", orderNumber: "WO-0007" };
        },
      },
      workOrderLine: { findMany: async () => lines },
      inventoryMovement: {
        groupBy: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => void movements.push(data),
      },
    },
  };
}

test("work order: Core cannot attach inventory parts (server-side entitlement)", async (t) => {
  owner();
  allowOwnership(t);
  mockShopAndSub(t, "CORE");
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
  const fake = woTx([{ id: "p1", shopId: "shop-A", quantityOnHand: 5, name: "Oil filter" }]);
  patchTransaction(t, fake.tx);
  const res = await woActions.createWorkOrder(WO);
  assert.match((res as { error: { _form: string[] } }).error._form[0], /PRO/);
  assert.equal(fake.parts[0].quantityOnHand, 5);
});

test("work order: Pro consumes stock in the same transaction; insufficient stock rolls the save back with a message", async (t) => {
  owner();
  allowOwnership(t);
  mockShopAndSub(t, "PRO");
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
  patchDb(t, "savedLineItem", "upsert", async () => ({}));
  const fake = woTx([{ id: "p1", shopId: "shop-A", quantityOnHand: 5, name: "Oil filter" }]);
  patchTransaction(t, fake.tx);

  await assert.rejects(woActions.createWorkOrder(WO), (e) => e instanceof RedirectError && e.url.endsWith("/work-orders/wo-new"));
  assert.equal(fake.parts[0].quantityOnHand, 3);
  assert.deepEqual(fake.movements.map((m) => [m.type, m.quantity, m.workOrderId, m.shopId]), [["CONSUMED", -2, "wo-new", "shop-A"]]);

  const tooMany = { ...WO, lineItems: [{ ...WO.lineItems[0], quantity: 9 }] };
  const fake2 = woTx([{ id: "p1", shopId: "shop-A", quantityOnHand: 3, name: "Oil filter" }]);
  patchTransaction(t, fake2.tx);
  const res = (await woActions.createWorkOrder(tooMany)) as { error: { _form: string[] } };
  assert.match(res.error._form[0], /Not enough stock of "Oil filter": 3 on hand, 9 needed/);
  assert.equal(fake2.parts[0].quantityOnHand, 3);

  // Pieza de OTRO taller: se rechaza sin tocar su stock.
  const fake3 = woTx([{ id: "p1", shopId: "shop-B", quantityOnHand: 3, name: "Foreign" }]);
  patchTransaction(t, fake3.tx);
  const foreign = (await woActions.createWorkOrder(WO)) as { error: { _form: string[] } };
  assert.match(foreign.error._form[0], /no longer exists/);
  assert.equal(fake3.parts[0].quantityOnHand, 3);
});
