import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession } from "./helpers/action-harness";
import { mockSubscription, patchDb } from "./helpers/db-mock";
import {
  addDaysYmd,
  agingBucket,
  bucketKey,
  buildSeries,
  daysPastDue,
  pickGranularity,
  presetBounds,
  resolveRange,
  ReportRangeError,
  toCsv,
} from "../src/domain/reports";

const actions = await import("../src/actions/reports");

const TZ = "America/Montreal";
const NOW = new Date("2026-09-29T15:00:00Z"); // 11:00 local

// ── dominio puro ───────────────────────────────────────────

test("presets resolve in the shop's local date", () => {
  assert.deepEqual(presetBounds("thisMonth", "2026-09-29"), { fromYmd: "2026-09-01", toYmd: "2026-09-29" });
  assert.deepEqual(presetBounds("lastMonth", "2026-01-15"), { fromYmd: "2025-12-01", toYmd: "2025-12-31" });
  assert.deepEqual(presetBounds("lastMonth", "2026-03-10"), { fromYmd: "2026-02-01", toYmd: "2026-02-28" });
  assert.deepEqual(presetBounds("last30", "2026-09-29"), { fromYmd: "2026-08-31", toYmd: "2026-09-29" });
  assert.deepEqual(presetBounds("thisQuarter", "2026-08-10"), { fromYmd: "2026-07-01", toYmd: "2026-08-10" });
  assert.deepEqual(presetBounds("lastYear", "2026-08-10"), { fromYmd: "2025-01-01", toYmd: "2025-12-31" });
});

test("a late-evening local sale falls in the local day, not the UTC day", () => {
  // 2026-09-30 01:30Z is still 2026-09-29 21:30 in Montreal
  const at = new Date("2026-09-30T01:30:00Z");
  const series = buildSeries([{ at, amount: "100.00" }], { fromYmd: "2026-09-28", toYmd: "2026-09-30", timeZone: TZ }, "day");
  assert.deepEqual(series.map((p) => [p.key, p.total]), [["2026-09-28", 0], ["2026-09-29", 100], ["2026-09-30", 0]]);
});

test("range resolution: bounds are shop-local midnights, validation and plan presets", () => {
  const r = resolveRange({ preset: "thisMonth" }, { timeZone: TZ, now: NOW });
  assert.equal(r.fromYmd, "2026-09-01");
  assert.equal(r.from.toISOString(), "2026-09-01T04:00:00.000Z"); // EDT = UTC-4
  assert.equal(r.toExclusive.toISOString(), "2026-09-30T04:00:00.000Z");
  assert.throws(() => resolveRange({ preset: "custom", from: "2026-09-10", to: "2026-09-01" }, { timeZone: TZ, now: NOW }), (e) => e instanceof ReportRangeError && e.code === "INVERTED");
  assert.throws(() => resolveRange({ preset: "custom", from: "2026-02-31", to: "2026-03-01" }, { timeZone: TZ, now: NOW }), (e) => e instanceof ReportRangeError && e.code === "INVALID_DATE");
  assert.throws(() => resolveRange({ preset: "custom", from: "2020-01-01", to: "2026-01-01" }, { timeZone: TZ, now: NOW }), (e) => e instanceof ReportRangeError && e.code === "TOO_LONG");
  assert.throws(() => resolveRange({ preset: "thisYear" }, { timeZone: TZ, now: NOW, allowedPresets: ["thisMonth"] }), (e) => e instanceof ReportRangeError && e.code === "PRESET_NOT_ALLOWED");
  // Sin preset pero con fechas → personalizado.
  assert.equal(resolveRange({ from: "2026-09-01", to: "2026-09-05" }, { timeZone: TZ, now: NOW }).preset, "custom");
});

test("buckets, granularity and aging", () => {
  assert.equal(pickGranularity(30), "day");
  assert.equal(pickGranularity(90), "week");
  assert.equal(pickGranularity(365), "month");
  assert.equal(bucketKey("2026-09-29", "week"), "2026-09-28"); // lunes
  assert.equal(bucketKey("2026-09-29", "month"), "2026-09");
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(agingBucket(0), "current");
  assert.equal(agingBucket(-5), "current");
  assert.equal(agingBucket(1), "d1_30");
  assert.equal(agingBucket(30), "d1_30");
  assert.equal(agingBucket(31), "d31_60");
  assert.equal(agingBucket(91), "d90plus");
  assert.equal(daysPastDue({ dueAt: null, issuedAt: new Date("2026-08-30T15:00:00Z") }, NOW, TZ), 30);
});

test("CSV escapes quotes/commas and neutralises spreadsheet formulas", () => {
  const csv = toCsv(["a", "b"], [['=HYPERLINK("x")', 'He said "hi", ok'], ["+1", -5]]);
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"He said ""hi"", ok"/);
  assert.match(csv, /'\+1,-5/);
});

// ── acciones: permisos, planes, aislamiento ─────────────────

type Where = Record<string, unknown>;

/** Registra cada `where` de las consultas de reportes y devuelve datos fijos. */
function fakeDb(t: TestContext, opts: { role?: "OWNER" | "MECHANIC" | "VIEWER"; grants?: string[]; denies?: string[] } = {}) {
  const wheres: { model: string; where: Where }[] = [];
  const rec = (model: string, result: unknown) => async (args: { where: Where }) => {
    wheres.push({ model, where: args.where });
    return result;
  };
  patchDb(t, "shop", "findFirst", (async () => ({ timezone: TZ })) as never);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: opts.grants ?? [], permissionDenies: opts.denies ?? [] })) as never);
  const paid = [
    { shopId: "shop-A", paidAt: new Date("2026-09-10T15:00:00Z"), subtotal: "100.00", taxAmount: "14.98", total: "114.98", paymentMode: "CARD", clientId: "c1", client: { firstName: "Ana", lastName: "R" },
      paymentEntries: [{ method: "CARD", amount: "114.98" }],
      vehicles: [{ lineItems: [{ description: "Oil change", quantity: "1", itemType: "LABOUR", lineTotal: "60.00" }, { description: "Filter", quantity: "1", itemType: "PART", lineTotal: "40.00" }] }] },
    { shopId: "shop-A", paidAt: new Date("2026-09-12T15:00:00Z"), subtotal: "50.00", taxAmount: "7.49", total: "57.49", paymentMode: "CASH", clientId: "c2", client: { firstName: "Bo", lastName: null },
      paymentEntries: [], vehicles: [{ lineItems: [{ description: "oil change", quantity: "1", itemType: "LABOUR", lineTotal: "50.00" }] }] },
  ];
  patchDb(t, "invoice", "findMany", (async (args: { where: Where }) => {
    wheres.push({ model: "invoice", where: args.where });
    if ((args.where.status as { in?: string[] })?.in) {
      return [{ id: "i9", invoiceNumber: "INV-9", total: "200.00", dueAt: new Date("2026-08-01T12:00:00Z"), issuedAt: new Date("2026-07-01T12:00:00Z"), client: { firstName: "Cy", lastName: null } }];
    }
    return paid;
  }) as never);
  patchDb(t, "invoice", "aggregate", rec("invoiceAgg", { _sum: { total: "200.00" }, _count: { _all: 1 } }) as never);
  patchDb(t, "invoice", "groupBy", rec("invoiceGroup", [{ clientId: "c1", _count: { _all: 2 } }]) as never);
  patchDb(t, "workOrder", "groupBy", rec("woGroup", [{ status: "COMPLETED", _count: { _all: 3 } }]) as never);
  patchDb(t, "workOrder", "findMany", rec("woMany", [{ createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-03T00:00:00Z") }]) as never);
  patchDb(t, "workOrder", "count", rec("woCount", 2) as never);
  patchDb(t, "quote", "groupBy", rec("quoteGroup", [{ status: "ACCEPTED", _count: { _all: 1 } }, { status: "REJECTED", _count: { _all: 1 } }]) as never);
  patchDb(t, "quote", "aggregate", rec("quoteAgg", { _sum: { total: "500.00" } }) as never);
  patchDb(t, "client", "count", rec("clientCount", 4) as never);
  patchDb(t, "inventoryPart", "findMany", rec("parts", [{ id: "p1", name: "Pads", sku: "P1", unitCost: "10.00", quantityOnHand: 1, reorderThreshold: 4 }]) as never);
  patchDb(t, "inventoryMovement", "aggregate", rec("moves", { _sum: { quantity: -6 } }) as never);
  setSession({ user: { id: "u1", role: opts.role ?? "OWNER", shopId: "shop-A" } });
  return wheres;
}

const shopScoped = (wheres: { model: string; where: Where }[]) =>
  wheres.every((w) => JSON.stringify(w.where.shopId) === JSON.stringify({ in: ["shop-A"] }));

test("Pro owner: sales report aggregates server-side, all queries scoped to the active shop", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  const res = await actions.getReport({ kind: "sales", preset: "thisMonth" });
  assert.ok(!("error" in res));
  const d = res.data as import("../src/lib/reports-service").SalesReport;
  assert.equal(d.totals.invoices, 2);
  assert.equal(d.totals.total, 172.47);
  assert.equal(d.totals.tax, 22.47);
  assert.equal(d.totals.average, 86.24); // 172.47/2 = 86.235 → half-up
  assert.deepEqual(d.byMethod, [{ method: "CARD", amount: 114.98 }, { method: "CASH", amount: 57.49 }]);
  assert.equal(d.byItemType.find((x) => x.type === "LABOUR")!.amount, 110);
  assert.equal(d.topServices[0].description, "Oil change"); // agrupa sin distinguir mayúsculas
  assert.equal(d.topServices[0].amount, 110);
  assert.ok(wheres.length > 0 && shopScoped(wheres));
  assert.ok(wheres.every((w) => w.model !== "invoice" || (w.where.paidAt as { gte: Date }).gte instanceof Date));
});

test("tenant isolation: the shop always comes from the session, never from input", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  await actions.getReport({ kind: "operations", preset: "thisMonth", shopId: "shop-B", shopIds: ["shop-B"] } as never);
  await actions.getReport({ kind: "customers", preset: "last30" });
  await actions.getReport({ kind: "inventory", preset: "last30" });
  await actions.getReport({ kind: "receivables" });
  assert.ok(wheres.length >= 10);
  assert.ok(shopScoped(wheres), "every report query must be filtered by the session shop only");
});

test("permissions: reports.view is required; financial reports also need financial.view", async (t) => {
  mockSubscription(t, "PRO");
  fakeDb(t, { role: "MECHANIC" });
  await assert.rejects(() => actions.getReport({ kind: "overview" }), /reports\.view/);
  await assert.rejects(() => actions.exportReportCsv({ kind: "sales" }), /reports\.view/);

  fakeDb(t, { role: "VIEWER" });
  await assert.rejects(() => actions.getReport({ kind: "operations" }), /reports\.view/);

  // Mecánico con reports.view delegado (Pro) pero sin financial.view: sin dinero.
  fakeDb(t, { role: "MECHANIC", grants: ["reports.view"] });
  await assert.rejects(() => actions.getReport({ kind: "sales" }), /financial\.view/);
  await assert.rejects(() => actions.getReport({ kind: "receivables" }), /financial\.view/);
  const overview = await actions.getReport({ kind: "overview" });
  assert.ok(!("error" in overview));
  assert.equal((overview.data as import("../src/lib/reports-service").OverviewReport).revenue, null);
  assert.equal((overview.data as import("../src/lib/reports-service").OverviewReport).series, null);
  const customers = await actions.getReport({ kind: "customers" });
  assert.ok(!("error" in customers));
  assert.equal((customers.data as import("../src/lib/reports-service").CustomersReport).top, null);
  const ops = await actions.getReport({ kind: "operations" });
  assert.equal((ops.data as import("../src/lib/reports-service").OperationsReport).quotes.value, null);
  const inv = await actions.getReport({ kind: "inventory" });
  assert.equal((inv.data as import("../src/lib/reports-service").InventoryReport).stockValue, null);

  // Con ambos permisos delegados sí.
  fakeDb(t, { role: "MECHANIC", grants: ["reports.view", "financial.view"] });
  assert.ok(!("error" in (await actions.getReport({ kind: "sales" }))));
});

test("Core: basic overview only — advanced kinds, custom ranges and export are blocked server-side", async (t) => {
  mockSubscription(t, "CORE");
  const wheres = fakeDb(t);
  const basic = await actions.getReport({ kind: "overview", preset: "lastMonth" });
  assert.ok(!("error" in basic));
  assert.equal(basic.advanced, false);
  const before = wheres.length;
  for (const kind of ["sales", "receivables", "operations", "customers", "inventory"]) {
    const r = await actions.getReport({ kind });
    assert.deepEqual(r, { error: "UPGRADE_REQUIRED" }, kind);
  }
  assert.deepEqual(await actions.getReport({ kind: "overview", preset: "thisYear" }), { error: "UPGRADE_REQUIRED" });
  assert.deepEqual(await actions.getReport({ kind: "overview", from: "2026-01-01", to: "2026-02-01" }), { error: "UPGRADE_REQUIRED" });
  assert.deepEqual(await actions.exportReportCsv({ kind: "overview" }), { error: "UPGRADE_REQUIRED" });
  assert.equal(wheres.length, before, "blocked requests must not touch report data");
});

test("no subscription row → no reports (error state, not free Core)", async (t) => {
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: null })) as never);
  fakeDb(t);
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: null })) as never);
  const r = await actions.getReport({ kind: "sales" });
  assert.deepEqual(r, { error: "UPGRADE_REQUIRED" });
});

test("restricted Pro shop keeps read-only reports and export (data access, not a write)", async (t) => {
  mockSubscription(t, "PRO", "CANCELED");
  fakeDb(t);
  const r = await actions.getReport({ kind: "sales", preset: "thisMonth" });
  assert.ok(!("error" in r));
  const csv = await actions.exportReportCsv({ kind: "sales", preset: "thisMonth" });
  assert.ok(!("error" in csv));
});

test("invalid kind / range are rejected without querying", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  assert.deepEqual(await actions.getReport({ kind: "nope" }), { error: "INVALID_KIND" });
  assert.deepEqual(await actions.getReport({ kind: "sales", preset: "custom", from: "2026-09-10", to: "2026-09-01" }), { error: "INVALID_RANGE" });
  assert.deepEqual(await actions.getReport({ kind: "sales", preset: "custom", from: "2010-01-01", to: "2026-09-01" }), { error: "INVALID_RANGE" });
  assert.equal(wheres.length, 0);
});

test("CSV exports for Pro: content, filename and formula safety", async (t) => {
  mockSubscription(t, "PRO");
  fakeDb(t);
  const sales = await actions.exportReportCsv({ kind: "sales", preset: "custom", from: "2026-09-01", to: "2026-09-30" });
  assert.ok(!("error" in sales));
  assert.equal(sales.filename, "garageos-sales-2026-09-01_2026-09-30.csv");
  assert.match(sales.csv, /Totals,Total,,172.47/);
  assert.match(sales.csv, /Payment method,CARD,,114.98/);
  const rec = await actions.exportReportCsv({ kind: "receivables" });
  assert.ok(!("error" in rec));
  assert.match(rec.csv, /INV-9,Cy,2026-07-01,2026-08-01,59,d31_60,200/);
  for (const kind of ["operations", "customers", "inventory", "overview"]) {
    const r = await actions.exportReportCsv({ kind });
    assert.ok(!("error" in r) && r.csv.startsWith("﻿"), kind);
  }
});

test("operations + customers KPIs", async (t) => {
  mockSubscription(t, "PRO");
  fakeDb(t);
  const ops = await actions.getReport({ kind: "operations", preset: "thisMonth" });
  assert.ok(!("error" in ops));
  const o = ops.data as import("../src/lib/reports-service").OperationsReport;
  assert.equal(o.workOrders.avgDaysToComplete, 2);
  assert.equal(o.quotes.approvalRate, 0.5);
  assert.equal(o.quotes.value, 500);
  const cu = await actions.getReport({ kind: "customers", preset: "thisMonth" });
  const c = cu.data as import("../src/lib/reports-service").CustomersReport;
  assert.equal(c.activeClients, 2);
  assert.equal(c.returningClients, 1);
  assert.equal(c.retentionRate, 0.5);
  assert.equal(c.top![0].name, "Ana R");
});
