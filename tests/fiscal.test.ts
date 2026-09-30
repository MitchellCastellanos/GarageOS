import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Decimal from "decimal.js";
import { setSession, RedirectError } from "./helpers/action-harness";
import { db } from "../src/lib/db";
import { allowOwnership, mockSubscription, patchDb, patchTransaction } from "./helpers/db-mock";
import {
  allocateRefundTax,
  computeTax,
  derivePaymentMode,
  documentTaxView,
  effectiveTaxSnapshot,
  isPaymentMethod,
  parseTaxSnapshot,
  refundableBalance,
  validatePaymentEntries,
  type TaxSnapshot,
} from "../src/domain/fiscal";

const QC = [{ name: "GST", rate: "0.05" }, { name: "QST", rate: "0.09975" }];
const invoices = await import("../src/actions/invoices");
const { computeDocumentTax, fiscalForConvertedDocument } = await import("../src/lib/fiscal");
const { persistInvoicePayment } = await import("../src/lib/invoice-payment-service");

// ── cálculo de impuestos ────────────────────────────────────

test("Quebec GST+QST: each tax computed on the subtotal and rounded separately", () => {
  const r = computeTax("100.00", QC, null);
  assert.equal(r.taxAmount.toFixed(2), "14.98"); // 5.00 + 9.975→9.98
  assert.equal(r.total.toFixed(2), "114.98");
  assert.equal(r.taxRate.toString(), "0.14975");
  assert.deepEqual(r.snapshot.lines, [{ name: "GST", rate: "0.05", amount: "5.00" }, { name: "QST", rate: "0.09975", amount: "9.98" }]);
  assert.equal(r.snapshot.exempt, false);
  assert.equal(r.snapshot.source, "issued");
});

test("total tax is the SUM of the rounded lines (matches what the PDF itemises), not a combined rounding", () => {
  // 10.10: GST .505→.51, QST 1.007475→1.01 = 1.52  (combined 1.512475 would give 1.51)
  const r = computeTax("10.10", QC, null);
  assert.equal(r.taxAmount.toFixed(2), "1.52");
  assert.equal(r.total.toFixed(2), "11.62");
  for (const sub of ["0.01", "9.99", "33.33", "1234.56", "0.00"]) {
    const c = computeTax(sub, QC, null);
    const sum = c.snapshot.lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
    assert.ok(sum.equals(c.taxAmount), sub);
    assert.ok(c.total.equals(new Decimal(sub).plus(c.taxAmount)), sub);
  }
});

test("exempt (rate 0), custom rate scaling, single tax and no-tax shops", () => {
  const ex = computeTax("100", QC, 0);
  assert.equal(ex.taxAmount.toFixed(2), "0.00");
  assert.equal(ex.snapshot.exempt, true);
  assert.deepEqual(ex.snapshot.lines, []);

  const custom = computeTax("100", QC, "0.0749"); // half → GST 2.5% & QST 4.9875%→4.9875
  assert.deepEqual(custom.snapshot.lines.map((l) => l.name), ["GST", "QST"]);
  assert.equal(custom.taxRate.toString(), "0.0749");

  const hst = computeTax("200", [{ name: "HST", rate: "0.13" }], null);
  assert.equal(hst.taxAmount.toFixed(2), "26.00");

  const none = computeTax("200", [], null);
  assert.equal(none.taxAmount.toFixed(2), "0.00");
  assert.equal(none.snapshot.exempt, true);

  const noBase = computeTax("100", [], 0.05); // rate pedida sin líneas configuradas
  assert.deepEqual(noBase.snapshot.lines, [{ name: "Tax", rate: "0.05", amount: "5.00" }]);
});

test("snapshot parsing is tolerant, legacy documents never depend on current shop settings", () => {
  assert.equal(parseTaxSnapshot(null), null);
  assert.equal(parseTaxSnapshot({ lines: "nope" }), null);
  assert.equal(parseTaxSnapshot({ lines: [{ name: "GST", rate: "x", amount: "1" }] }), null);
  const legacy = effectiveTaxSnapshot({ taxSnapshot: null, taxRate: "0.14975", taxAmount: "14.98" });
  assert.equal(legacy.source, "legacy");
  assert.deepEqual(legacy.lines, [{ name: "Tax", rate: "0.14975", amount: "14.98" }]);
  assert.equal(effectiveTaxSnapshot({ taxSnapshot: null, taxRate: "0", taxAmount: "0" }).exempt, true);
});

test("document tax view: snapshot wins over whatever the shop's tax lines are today", () => {
  const snap: TaxSnapshot = { v: 1, source: "issued", exempt: false, lines: [{ name: "GST", rate: "0.05", amount: "5.00" }, { name: "QST", rate: "0.09975", amount: "9.98" }] };
  const newShopLines = [{ name: "HST", rate: "0.13" }]; // el taller cambió de configuración después
  const v = documentTaxView({ taxSnapshot: snap, subtotal: "100.00", taxRate: "0.14975", shopTaxLines: newShopLines });
  assert.deepEqual(v.lines.map((l) => [l.name, l.pct, l.amount.toFixed(2)]), [["GST", "5", "5.00"], ["QST", "9.975", "9.98"]]);
  assert.equal(v.taxAmount.toFixed(2), "14.98");
  // sin snapshot (cotización antigua) sigue el desglose actual, como antes
  const q = documentTaxView({ taxSnapshot: null, subtotal: "100.00", taxRate: "0.13", shopTaxLines: newShopLines });
  assert.equal(q.lines[0].name, "HST");
});

// ── historial estable al editar / convertir ─────────────────

/** Añade la configuración fiscal del taller a lo que ya devuelve el mock de suscripción (si lo hay). */
function shopWith(t: TestContext, taxLines: unknown, extra: Record<string, unknown> = {}, withSubscription = false) {
  const prev = db.shop.findUnique as unknown as (...a: unknown[]) => Promise<Record<string, unknown> | null>;
  patchDb(t, "shop", "findUnique", (async (...a: unknown[]) => ({ ...(withSubscription ? ((await prev(...a)) ?? {}) : {}), taxLines, taxId: "TPS 123RT0001", currency: "CAD", ...extra })) as never);
}

test("editing keeps the invoice's own tax names/rates when the rate is unchanged, even after the shop changed its taxes", async (t) => {
  const issued = computeTax("100.00", QC, null);
  const existing = { taxRate: issued.taxRate.toString(), taxAmount: issued.taxAmount.toString(), taxSnapshot: issued.snapshot, taxRegistration: "TPS: OLD-REG", currency: "CAD" };
  shopWith(t, [{ name: "HST", rate: "0.13" }], { taxId: "NEW-REG" }); // configuración actual distinta

  const edited = await computeDocumentTax("shop-A", "200.00", "0.14975", existing);
  assert.deepEqual(edited.snapshot.lines.map((l) => l.name), ["GST", "QST"]);
  assert.equal(edited.taxAmount.toFixed(2), "29.95"); // 10.00 + 19.95
  assert.equal(edited.taxRegistration, "TPS: OLD-REG"); // registro fijado al emitir

  // Un documento NUEVO sí toma la configuración vigente.
  const fresh = await computeDocumentTax("shop-A", "100.00", null);
  assert.deepEqual(fresh.snapshot.lines.map((l) => l.name), ["HST"]);
  assert.equal(fresh.taxRegistration, "NEW-REG");
  assert.equal(fresh.taxAmount.toFixed(2), "13.00");

  // Si el usuario cambia la tasa explícitamente (p. ej. exento) se respeta.
  const exempt = await computeDocumentTax("shop-A", "100.00", 0, existing);
  assert.equal(exempt.taxAmount.toFixed(2), "0.00");
  assert.equal(exempt.snapshot.exempt, true);
});

test("quote → invoice conversion keeps the quote's totals and snapshot", async (t) => {
  shopWith(t, [{ name: "HST", rate: "0.13" }]);
  const snap = computeTax("100.00", QC, null).snapshot;
  const withSnap = await fiscalForConvertedDocument("shop-A", { subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", taxSnapshot: snap });
  assert.deepEqual((withSnap.taxSnapshotJson as unknown as TaxSnapshot).lines.map((l) => l.name), ["GST", "QST"]);

  // Cotización anterior a Block 9: solo se reconstruye si las líneas actuales la reproducen exactamente.
  shopWith(t, QC);
  const rebuilt = await fiscalForConvertedDocument("shop-A", { subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", taxSnapshot: null });
  assert.deepEqual((rebuilt.taxSnapshotJson as unknown as TaxSnapshot).lines.map((l) => l.name), ["GST", "QST"]);
  shopWith(t, [{ name: "HST", rate: "0.13" }]);
  const generic = await fiscalForConvertedDocument("shop-A", { subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", taxSnapshot: null });
  assert.deepEqual((generic.taxSnapshotJson as unknown as TaxSnapshot).lines, [{ name: "Tax", rate: "0.14975", amount: "14.98" }]);
});

// ── reembolsos: reparto de impuestos ────────────────────────

test("refund tax allocation: proportional, exact on the closing refund, never above what was collected", () => {
  const snap = computeTax("100.00", QC, null).snapshot; // GST 5.00 / QST 9.98, total 114.98
  const first = allocateRefundTax(snap, "114.98", "14.98", "57.49", []);
  assert.equal(first.taxAmount.toFixed(2), "7.49");
  assert.deepEqual(first.taxLines, [{ name: "GST", amount: "2.50" }, { name: "QST", amount: "4.99" }]);
  const last = allocateRefundTax(snap, "114.98", "14.98", "57.49", [{ amount: "57.49", taxLines: first.taxLines }]);
  assert.deepEqual(last.taxLines, [{ name: "GST", amount: "2.50" }, { name: "QST", amount: "4.99" }]);
  assert.equal(refundableBalance("114.98", [{ amount: "57.49" }]).toFixed(2), "57.49");
});

test("refund tax allocation: any split of the total refunds exactly the invoice tax, line by line", () => {
  const snap = computeTax("333.33", QC, null).snapshot;
  const tax = snap.lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const total = new Decimal("333.33").plus(tax);
  const parts = ["0.01", "17.77", "100.00", "3.33", "50.05"];
  const used = parts.reduce((s, p) => s.plus(p), new Decimal(0));
  const chunks = [...parts, total.minus(used).toFixed(2)];
  const done: { amount: string; taxLines: { name: string; amount: string }[] }[] = [];
  for (const c of chunks) {
    const a = allocateRefundTax(snap, total, tax, c, done);
    assert.ok(a.taxAmount.gte(0));
    done.push({ amount: c, taxLines: a.taxLines });
  }
  for (const line of snap.lines) {
    const sum = done.reduce((s, d) => s.plus(d.taxLines.find((l) => l.name === line.name)!.amount), new Decimal(0));
    assert.equal(sum.toFixed(2), line.amount, line.name);
  }
  assert.equal(done.reduce((s, d) => s.plus(d.amount), new Decimal(0)).toFixed(2), total.toFixed(2));
});

test("payment validation and helpers", () => {
  assert.equal(validatePaymentEntries("CARD", [{ method: "CARD", amount: 114.98 }], "114.98"), null);
  assert.equal(validatePaymentEntries("MIXED", [{ method: "ETRANSFER", amount: 100 }, { method: "CASH", amount: 14.98 }], "114.98"), null);
  assert.equal(validatePaymentEntries("CARD", [{ method: "CARD", amount: 100 }], "114.98"), "MISMATCH");
  assert.equal(validatePaymentEntries("CARD", [{ method: "CASH", amount: 114.98 }], "114.98"), "CARD_MODE");
  assert.equal(validatePaymentEntries("CASH", [{ method: "CHEQUE", amount: 114.98 }], "114.98"), "CASH_MODE");
  assert.equal(validatePaymentEntries("MIXED", [{ method: "CARD", amount: 114.985 }], "114.98"), "BAD_AMOUNT");
  assert.equal(validatePaymentEntries("MIXED", [{ method: "CARD", amount: -1 }, { method: "CARD", amount: 115.98 }], "114.98"), "BAD_AMOUNT");
  assert.equal(derivePaymentMode(["CARD", "CARD"]), "CARD");
  assert.equal(derivePaymentMode(["CASH"]), "CASH");
  assert.equal(derivePaymentMode(["ETRANSFER"]), "MIXED");
  assert.ok(isPaymentMethod("CHEQUE") && !isPaymentMethod("BITCOIN"));
});

// ── persistencia: pago idempotente, anulación, reversa, borrado, reembolso ──

interface Store {
  invoice: Record<string, unknown> & { id: string; shopId: string; status: string };
  entries: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  drawer: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

/** Fake transaccional mínimo de una sola factura, con las consultas que usan las actions. */
function fakeInvoiceTx(t: TestContext, invoice: Partial<Store["invoice"]> = {}) {
  const st: Store = {
    invoice: { id: "inv1", shopId: "shop-A", status: "SENT", invoiceNumber: "INV-0001", total: "114.98", taxAmount: "14.98", taxRate: "0.14975", subtotal: "100.00",
      taxSnapshot: computeTax("100.00", QC, null).snapshot, sentAt: null, emailSendCount: 0, smsSendCount: 0, ...invoice },
    entries: [], refunds: [], drawer: [], events: [],
  };
  const matches = (where: Record<string, unknown>) =>
    where.id === st.invoice.id && where.shopId === st.invoice.shopId &&
    (where.status === undefined || where.status === st.invoice.status || ((where.status as { in?: string[] }).in?.includes(st.invoice.status) ?? false));
  const tx = {
    invoice: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(st.invoice, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        matches(where) ? { ...st.invoice, paymentEntries: [...st.entries], refunds: [...st.refunds], _count: { paymentEntries: st.entries.length, refunds: st.refunds.length } } : null,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        st.invoice.deleted = true;
        return { count: 1 };
      },
    },
    invoicePaymentEntry: {
      deleteMany: async () => void (st.entries.length = 0),
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => void st.entries.push(...data),
    },
    invoiceRefund: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `r${st.refunds.length + 1}`, createdAt: new Date(), ...data };
        st.refunds.push(r);
        return r;
      },
    },
    cashDrawerEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => void st.drawer.push(data),
      deleteMany: async () => void (st.drawer.length = 0),
    },
    financialEvent: { create: async ({ data }: { data: Record<string, unknown> }) => void st.events.push(data) },
  };
  patchTransaction(t, tx);
  return st;
}

const owner = (shopId = "shop-A") => setSession({ user: { id: "u1", role: "OWNER", shopId } });

test("payment persistence is idempotent: a second attempt on a paid invoice records nothing", async (t) => {
  const st = fakeInvoiceTx(t);
  const rows = [{ method: "ETRANSFER" as const, amount: new Decimal("114.98"), receiptPath: null }];
  const args = { shopId: "shop-A", invoiceId: "inv1", invoiceNumber: "INV-0001", mode: "MIXED" as const, rows, extraPaths: [], actorId: "u1" };
  assert.equal(await persistInvoicePayment(args), true);
  assert.equal(st.invoice.status, "PAID");
  assert.equal(st.entries.length, 1);
  assert.equal(await persistInvoicePayment(args), false);
  assert.equal(st.entries.length, 1);
  assert.equal(st.events.length, 1);
  assert.equal(st.events[0].type, "PAYMENT_RECORDED");
  // otro taller no puede cobrar esta factura
  st.invoice.status = "SENT";
  assert.equal(await persistInvoicePayment({ ...args, shopId: "shop-B" }), false);
});

async function paidInvoice(t: TestContext) {
  mockSubscription(t, "CORE");
  owner();
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  return fakeInvoiceTx(t, { status: "PAID", paidAt: new Date() });
}

test("refund: partial then final refund, tax split per line, cash goes out of the drawer, audit trail", async (t) => {
  const st = await paidInvoice(t);
  const r1 = await invoices.refundInvoice("inv1", { amount: "57.49", method: "CASH", reason: "Part returned" });
  assert.ok("success" in r1 && r1.success);
  assert.equal(st.refunds.length, 1);
  assert.equal(st.refunds[0].taxAmount, "7.49");
  assert.equal(st.drawer.length, 1);
  assert.equal(st.drawer[0].type, "CASH_OUT");
  assert.equal(st.drawer[0].amount, "57.49");
  assert.equal(st.invoice.status, "PAID"); // la factura conserva su estado y total
  assert.equal(st.invoice.total, "114.98");

  const over = await invoices.refundInvoice("inv1", { amount: "57.50", method: "CARD", reason: "Too much" });
  assert.match((over as { error: string }).error, /exceeds/);
  assert.equal(st.refunds.length, 1);

  const r2 = await invoices.refundInvoice("inv1", { amount: "57.49", method: "CARD", reason: "Rest" });
  assert.ok("success" in r2 && r2.success);
  assert.equal(st.drawer.length, 1); // el reembolso con tarjeta no toca la caja
  const totalTax = st.refunds.reduce((s, r) => s.plus(r.taxAmount as string), new Decimal(0));
  assert.equal(totalTax.toFixed(2), "14.98");
  assert.deepEqual(st.events.map((e) => e.type), ["REFUND_RECORDED", "REFUND_RECORDED"]);
  assert.equal((st.events[1].data as { remainingRefundable: string }).remainingRefundable, "0.00");

  const none = await invoices.refundInvoice("inv1", { amount: "0.01", method: "CARD", reason: "Nothing left" });
  assert.match((none as { error: string }).error, /exceeds/);
});

test("refund input validation, permissions, restricted shops and cross-shop protection", async (t) => {
  const st = await paidInvoice(t);
  for (const bad of [{ amount: "0" }, { amount: "-5" }, { amount: "abc" }, { amount: "1.005" }]) {
    const r = await invoices.refundInvoice("inv1", { method: "CARD", reason: "why", ...bad });
    assert.match((r as { error: string }).error, /Invalid refund amount/, JSON.stringify(bad));
  }
  assert.match(((await invoices.refundInvoice("inv1", { amount: "5", method: "BITCOIN", reason: "why" })) as { error: string }).error, /Invalid refund method/);
  assert.match(((await invoices.refundInvoice("inv1", { amount: "5", method: "CARD", reason: " " })) as { error: string }).error, /reason/);
  assert.equal(st.refunds.length, 0);

  // Otro taller: la factura no existe para él.
  setSession({ user: { id: "u9", role: "OWNER", shopId: "shop-B" } });
  assert.match(((await invoices.refundInvoice("inv1", { amount: "5", method: "CARD", reason: "why" })) as { error: string }).error, /Only paid/);
  assert.equal(st.refunds.length, 0);

  // Un mecánico no tiene refunds.write por defecto (ni siquiera con payments.write).
  setSession({ user: { id: "m1", role: "MECHANIC", shopId: "shop-A" } });
  await assert.rejects(() => invoices.refundInvoice("inv1", { amount: "5", method: "CARD", reason: "why" }), /refunds\.write/);
  setSession({ user: { id: "v1", role: "VIEWER", shopId: "shop-A" } });
  await assert.rejects(() => invoices.refundInvoice("inv1", { amount: "5", method: "CARD", reason: "why" }), /permiso|permission|ops\.write|refunds\.write/i);

  // Taller restringido: no puede reembolsar (escritura operativa).
  mockSubscription(t, "CORE", "CANCELED");
  owner();
  await assert.rejects(() => invoices.refundInvoice("inv1", { amount: "5", method: "CARD", reason: "why" }), (e) => e instanceof RedirectError || /restring|suscrip|Billing/i.test(String(e)));
  assert.equal(st.refunds.length, 0);
});

test("refunded invoices can't be reverted or voided; unrefunded revert/void keep an audit trail with the removed payments", async (t) => {
  const st = await paidInvoice(t);
  st.entries.push({ method: "ETRANSFER", amount: "114.98" });
  st.drawer.push({ type: "CASH_IN" });
  await invoices.refundInvoice("inv1", { amount: "10.00", method: "CARD", reason: "Goodwill" });
  assert.match(((await invoices.revertInvoiceToPending("inv1")) as { error: string }).error, /refunds/);
  assert.match(((await invoices.cancelInvoice("inv1")) as { error: string }).error, /refunds/);
  assert.equal(st.invoice.status, "PAID");
  assert.equal(st.entries.length, 1);

  // Sin reembolsos: se puede revertir, y la bitácora conserva lo que se quitó.
  const st2 = await paidInvoice(t);
  st2.entries.push({ method: "ETRANSFER", amount: "114.98" });
  const rev = await invoices.revertInvoiceToPending("inv1");
  assert.deepEqual(rev, { success: true });
  assert.equal(st2.invoice.status, "SENT");
  assert.equal(st2.entries.length, 0);
  assert.equal(st2.events[0].type, "PAYMENT_REVERSED");
  assert.deepEqual((st2.events[0].data as { payments: unknown[] }).payments, [{ method: "ETRANSFER", amount: "114.98" }]);
  // Revertir una factura no pagada no borra nada (antes borraba los pagos sin verificar el estado).
  assert.match(((await invoices.revertInvoiceToPending("inv1")) as { error: string }).error, /Paid/);

  const st3 = await paidInvoice(t);
  st3.entries.push({ method: "CARD", amount: "114.98" });
  assert.deepEqual(await invoices.cancelInvoice("inv1"), { success: true });
  assert.equal(st3.invoice.status, "CANCELLED");
  assert.equal(st3.events[0].type, "INVOICE_VOIDED");
  assert.equal((st3.events[0].data as { previousStatus: string }).previousStatus, "PAID");
  // otro taller no puede anularla
  const st4 = await paidInvoice(t);
  setSession({ user: { id: "u9", role: "OWNER", shopId: "shop-B" } });
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  assert.match(((await invoices.cancelInvoice("inv1")) as { error: string }).error, /cannot be voided/);
  assert.equal(st4.invoice.status, "PAID");
});

test("deleting is only for never-issued invoices without payments/refunds; it leaves an audit event", async (t) => {
  mockSubscription(t, "CORE");
  owner();
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);

  const issued = fakeInvoiceTx(t, { status: "SENT", sentAt: new Date(), emailSendCount: 1 });
  assert.match(((await invoices.deleteInvoice("inv1")) as { error: string }).error, /can't be deleted/);
  assert.ok(!issued.invoice.deleted);

  const paid = fakeInvoiceTx(t, { status: "PAID" });
  assert.match(((await invoices.deleteInvoice("inv1")) as { error: string }).error, /can't be deleted/);
  assert.ok(!paid.invoice.deleted);

  const withPayment = fakeInvoiceTx(t, { status: "DRAFT" });
  withPayment.entries.push({ method: "CASH", amount: "1" });
  assert.match(((await invoices.deleteInvoice("inv1")) as { error: string }).error, /can't be deleted/);

  const draft = fakeInvoiceTx(t, { status: "DRAFT" });
  await assert.rejects(() => invoices.deleteInvoice("inv1"), (e) => e instanceof RedirectError);
  assert.ok(draft.invoice.deleted);
  assert.equal(draft.events[0].type, "INVOICE_DELETED");
  assert.equal((draft.events[0].data as { invoiceNumber: string }).invoiceNumber, "INV-0001");

  // otro taller
  const other = fakeInvoiceTx(t, { status: "DRAFT" });
  setSession({ user: { id: "u9", role: "OWNER", shopId: "shop-B" } });
  assert.match(((await invoices.deleteInvoice("inv1")) as { error: string }).error, /not found/i);
  assert.ok(!other.invoice.deleted);
});

// ── emisión: snapshot + bitácora, y edición histórica ───────

const FORM = {
  clientId: "c1",
  vehicles: [{ vehicleId: "v1", lineItems: [{ description: "Brakes", quantity: 1, unitPrice: 100, itemType: "LABOUR" as const }] }],
  taxRate: 0.14975,
  language: "EN" as const,
  notes: "",
  dueAt: "",
};

test("createInvoice stores the fiscal snapshot (lines, registration, currency) and an audit event", async (t) => {
  mockSubscription(t, "CORE");
  owner();
  allowOwnership(t);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  shopWith(t, QC, { taxId: "TPS: 123RT0001 TVQ: 456TQ0001", currency: "CAD" }, true);
  patchDb(t, "savedLineItem", "upsert", (async () => ({})) as never);
  const created: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  patchTransaction(t, {
    documentSequence: { upsert: async () => ({ lastNumber: 7 }) },
    invoice: { create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: "new1", ...data }) },
    financialEvent: { create: async ({ data }: { data: Record<string, unknown> }) => void events.push(data) },
  });
  await assert.rejects(() => invoices.createInvoice(FORM), (e) => e instanceof RedirectError && /invoices\/new1/.test(e.url));
  const inv = created[0];
  assert.equal(inv.shopId, "shop-A");
  assert.equal(inv.taxAmount, "14.98");
  assert.equal(inv.total, "114.98");
  assert.equal(inv.taxRegistration, "TPS: 123RT0001 TVQ: 456TQ0001");
  assert.equal(inv.currency, "CAD");
  assert.deepEqual((inv.taxSnapshot as TaxSnapshot).lines.map((l) => [l.name, l.amount]), [["GST", "5.00"], ["QST", "9.98"]]);
  assert.equal(events[0].type, "INVOICE_ISSUED");
  assert.equal(events[0].shopId, "shop-A");
  assert.equal(events[0].actorId, "u1");
  assert.equal(events[0].amount, "114.98");
});

test("updateInvoice on a pending invoice keeps its issued tax lines/registration after the shop changed settings", async (t) => {
  mockSubscription(t, "CORE");
  owner();
  allowOwnership(t);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  shopWith(t, [{ name: "HST", rate: "0.13" }], { taxId: "NEW-REG" }, true);
  patchDb(t, "savedLineItem", "upsert", (async () => ({})) as never);
  const issued = computeTax("100.00", QC, null);
  patchDb(t, "invoice", "findFirst", (async () => ({
    id: "inv1", shopId: "shop-A", status: "SENT", invoiceNumber: "INV-0001", subtotal: "100.00", taxAmount: "14.98", total: "114.98",
    taxRate: "0.14975", taxSnapshot: issued.snapshot, taxRegistration: "OLD-REG", currency: "CAD",
  })) as never);
  const updates: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  patchTransaction(t, {
    invoiceVehicle: { deleteMany: async () => ({}) },
    invoice: { update: async ({ data }: { data: Record<string, unknown> }) => void updates.push(data) },
    financialEvent: { create: async ({ data }: { data: Record<string, unknown> }) => void events.push(data) },
  });
  const form = { ...FORM, vehicles: [{ vehicleId: "v1", lineItems: [{ description: "Brakes", quantity: 2, unitPrice: 100, itemType: "LABOUR" as const }] }] };
  await assert.rejects(() => invoices.updateInvoice("inv1", form), (e) => e instanceof RedirectError);
  assert.equal(updates[0].taxAmount, "29.95");
  assert.deepEqual((updates[0].taxSnapshot as TaxSnapshot).lines.map((l) => l.name), ["GST", "QST"]);
  assert.equal(events[0].type, "INVOICE_UPDATED");
  assert.deepEqual((events[0].data as { before: unknown }).before, { subtotal: "100.00", taxAmount: "14.98", total: "114.98" });
});
