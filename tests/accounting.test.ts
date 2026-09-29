import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession } from "./helpers/action-harness";
import { mockSubscription, patchDb } from "./helpers/db-mock";

const accounting = await import("../src/actions/accounting");

const SNAP = (g: string, q: string) => ({ v: 1, source: "issued", exempt: false, lines: [{ name: "GST", rate: "0.05", amount: g }, { name: "QST", rate: "0.09975", amount: q }] });
type Where = Record<string, unknown>;

function fakeDb(t: TestContext, opts: { role?: "OWNER" | "MECHANIC"; grants?: string[] } = {}) {
  const wheres: { model: string; where: Where }[] = [];
  const rec = <T>(model: string, result: T) => async (args: { where: Where }) => (wheres.push({ model, where: args.where }), result);
  patchDb(t, "shop", "findFirst", (async () => ({ timezone: "America/Montreal" })) as never);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: opts.grants ?? [], permissionDenies: [] })) as never);
  const invoiceRows = [
    { invoiceNumber: "INV-1", issuedAt: new Date("2026-09-05T15:00:00Z"), paidAt: new Date("2026-09-06T15:00:00Z"), status: "PAID", subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98",
      taxSnapshot: SNAP("5.00", "9.98"), taxRegistration: "TPS 1", client: { firstName: "Ana", lastName: "R" }, paymentEntries: [{ method: "CARD" }], refunds: [{ amount: "57.49" }] },
    { invoiceNumber: "INV-2", issuedAt: new Date("2026-09-07T15:00:00Z"), paidAt: new Date("2026-09-08T15:00:00Z"), status: "PAID", subtotal: "50.00", taxRate: "0.14975", taxAmount: "7.49", total: "57.49",
      taxSnapshot: SNAP("2.50", "4.99"), taxRegistration: "TPS 1", client: { firstName: "Bo", lastName: null }, paymentEntries: [{ method: "CASH" }, { method: "ETRANSFER" }], refunds: [] },
  ];
  patchDb(t, "invoice", "findMany", (async (args: { where: Where }) => (wheres.push({ model: "invoice", where: args.where }), invoiceRows)) as never);
  patchDb(t, "invoice", "aggregate", rec("invoiceAgg", { _sum: { total: "300.00" }, _count: { _all: 2 } }) as never);
  const refundRows = [{ amount: "57.49", taxAmount: "7.49", taxLines: [{ name: "GST", amount: "2.50" }, { name: "QST", amount: "4.99" }], method: "CASH", reason: "Returned", refundedAt: new Date("2026-09-10T15:00:00Z"), invoice: { invoiceNumber: "INV-1" } }];
  patchDb(t, "invoiceRefund", "findMany", (async (args: { where: Where }) => (wheres.push({ model: "refunds", where: args.where }), refundRows)) as never);
  patchDb(t, "invoiceRefund", "groupBy", rec("refundGroup", [{ method: "CASH", _sum: { amount: "57.49" } }]) as never);
  patchDb(t, "invoicePaymentEntry", "groupBy", rec("payGroup", [{ method: "CARD", _sum: { amount: "114.98" } }, { method: "CASH", _sum: { amount: "30.00" } }, { method: "ETRANSFER", _sum: { amount: "27.49" } }]) as never);
  patchDb(t, "invoicePaymentEntry", "findMany", (async (args: { where: Where }) => (wheres.push({ model: "entries", where: args.where }), [
    { method: "CARD", amount: "114.98", invoice: { invoiceNumber: "INV-1", paidAt: new Date("2026-09-06T15:00:00Z") } },
  ])) as never);
  const events = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, shopId: "shop-A", invoiceId: "inv1", type: "PAYMENT_RECORDED", actorId: "u1", amount: "114.98", data: { invoiceNumber: "INV-1" }, createdAt: new Date(2026, 8, 6 + i) }));
  patchDb(t, "financialEvent", "findMany", (async (args: { where: Where; take: number }) => (wheres.push({ model: "events", where: args.where }), events.slice(0, args.take))) as never);
  patchDb(t, "user", "findMany", (async (args: { where: Where }) => (wheres.push({ model: "users", where: args.where }), [{ id: "u1", name: "Owner", email: "o@x" }])) as never);
  setSession({ user: { id: "u1", role: opts.role ?? "OWNER", shopId: "shop-A" } });
  return wheres;
}

const RANGE = { preset: "custom", from: "2026-09-01", to: "2026-09-30" };

test("summary nets refunds and splits GST/QST correctly (issued basis)", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  const res = await accounting.getAccountingSummaryAction({ ...RANGE, basis: "issued" });
  assert.ok(!("error" in res));
  const s = res.summary;
  assert.deepEqual(s.gross, { invoices: 2, subtotal: 150, tax: 22.47, total: 172.47 });
  assert.deepEqual(s.refunds, { count: 1, total: 57.49, tax: 7.49 });
  assert.deepEqual(s.net, { beforeTax: 100, tax: 14.98, total: 114.98 });
  assert.deepEqual(s.taxes, [
    { name: "GST", taxableSales: 100, collected: 7.5, refunded: 2.5, net: 5 },
    { name: "QST", taxableSales: 100, collected: 14.97, refunded: 4.99, net: 9.98 },
  ]);
  assert.deepEqual(s.payments.find((p) => p.method === "CASH"), { method: "CASH", received: 30, refunded: 57.49, net: -27.49 });
  assert.deepEqual(s.outstanding, { invoices: 2, total: 300 });
  // base devengada: por fecha de factura, sin anuladas/borradores
  const inv = wheres.find((w) => w.model === "invoice")!.where;
  assert.deepEqual(inv.status, { in: ["SENT", "OVERDUE", "PAID"] });
  assert.ok("issuedAt" in inv && !("paidAt" in inv));
  assert.ok(wheres.every((w) => w.where.shopId === "shop-A" || (w.where.invoice as Where | undefined)?.shopId === "shop-A"));
});

test("paid (cash) basis filters by payment date and only PAID invoices", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  await accounting.getAccountingSummaryAction({ ...RANGE, basis: "paid" });
  const inv = wheres.find((w) => w.model === "invoice")!.where;
  assert.equal(inv.status, "PAID");
  assert.ok("paidAt" in inv && !("issuedAt" in inv));
});

test("Core can't use Accounting Light; financial.view is required; restricted Pro keeps read-only access", async (t) => {
  mockSubscription(t, "CORE");
  const wheres = fakeDb(t);
  assert.deepEqual(await accounting.getAccountingSummaryAction(RANGE), { error: "UPGRADE_REQUIRED" });
  assert.deepEqual(await accounting.exportAccountingCsv("sales-journal", RANGE), { error: "UPGRADE_REQUIRED" });
  assert.deepEqual(await accounting.getFinancialActivityAction(null), { error: "UPGRADE_REQUIRED" });
  assert.equal(wheres.length, 0);

  mockSubscription(t, "PRO");
  fakeDb(t, { role: "MECHANIC" });
  await assert.rejects(() => accounting.getAccountingSummaryAction(RANGE), /financial\.view/);
  await assert.rejects(() => accounting.exportAccountingCsv("payments", RANGE), /financial\.view/);
  await assert.rejects(() => accounting.getFinancialActivityAction(null), /financial\.view/);

  mockSubscription(t, "PRO", "CANCELED");
  fakeDb(t);
  assert.ok(!("error" in (await accounting.getAccountingSummaryAction(RANGE))));
  assert.ok(!("error" in (await accounting.exportAccountingCsv("tax-summary", RANGE))));
});

test("invalid inputs are rejected before querying", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  assert.deepEqual(await accounting.exportAccountingCsv("everything", RANGE), { error: "INVALID_KIND" });
  assert.deepEqual(await accounting.getAccountingSummaryAction({ preset: "custom", from: "2026-09-30", to: "2026-09-01" }), { error: "INVALID_RANGE" });
  assert.deepEqual(await accounting.getAccountingSummaryAction({ preset: "custom", from: "2010-01-01", to: "2026-09-01" }), { error: "INVALID_RANGE" });
  assert.equal(wheres.length, 0);
});

test("exports: sales journal (one column per tax), payments ledger (refunds negative), tax summary, activity", async (t) => {
  mockSubscription(t, "PRO");
  fakeDb(t);
  const journal = await accounting.exportAccountingCsv("sales-journal", RANGE);
  assert.ok(!("error" in journal));
  assert.equal(journal.filename, "garageos-sales-journal-2026-09-01_2026-09-30.csv");
  const lines = journal.csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "Invoice,Issued,Paid,Status,Customer,Subtotal,GST,QST,Total tax,Total,Refunded,Net,Payment methods,Tax registration");
  assert.equal(lines[1], "INV-1,2026-09-05,2026-09-06,PAID,Ana R,100,5,9.98,14.98,114.98,57.49,57.49,CARD,TPS 1");
  assert.match(lines[2], /^INV-2,.*,CASH\+ETRANSFER,TPS 1$/);

  const ledger = await accounting.exportAccountingCsv("payments", RANGE);
  assert.ok(!("error" in ledger));
  assert.match(ledger.csv, /2026-09-06,PAYMENT,INV-1,CARD,114.98,,\r\n/);
  assert.match(ledger.csv, /2026-09-10,REFUND,INV-1,CASH,-57.49,7.49,Returned/);

  const tax = await accounting.exportAccountingCsv("tax-summary", RANGE);
  assert.ok(!("error" in tax));
  assert.match(tax.csv, /GST,100,7.5,2.5,5/);
  assert.match(tax.csv, /QST,100,14.97,4.99,9.98/);
  assert.match(tax.csv, /TOTAL,100,22.47,7.49,14.98/);

  const act = await accounting.exportAccountingCsv("activity", RANGE);
  assert.ok(!("error" in act));
  assert.match(act.csv, /PAYMENT_RECORDED,INV-1,114.98,Owner/);
});

test("activity log is scoped to the shop and paginates", async (t) => {
  mockSubscription(t, "PRO");
  const wheres = fakeDb(t);
  const page = await accounting.getFinancialActivityAction(null);
  assert.ok(!("error" in page));
  assert.equal(page.rows.length, 3);
  assert.equal(page.rows[0].actor, "Owner");
  assert.equal(wheres.find((w) => w.model === "events")!.where.shopId, "shop-A");
  // el nombre del actor solo se resuelve entre usuarios del mismo taller
  assert.equal(wheres.find((w) => w.model === "users")!.where.shopId, "shop-A");
});
