// Accounting Light (Block 9): resúmenes financieros operativos para el dueño/contador. NO es un
// libro mayor: agrega facturas, pagos, reembolsos y snapshots fiscales que GarageOS ya posee.
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { formatClientName } from "@/lib/client-name";
import { effectiveTaxSnapshot } from "@/domain/fiscal";
import { localYmd, money, type ResolvedRange } from "@/domain/reports";

export type SalesBasis = "issued" | "paid";

export interface AccountingScope {
  shopId: string;
  range: ResolvedRange;
  basis: SalesBasis;
}

/** Facturas contables por base: fecha de factura (devengado, sin borradores ni anuladas) o de pago (caja). */
function invoiceWhere({ shopId, range, basis }: AccountingScope) {
  const window = { gte: range.from, lt: range.toExclusive };
  return basis === "paid"
    ? { shopId, status: "PAID" as const, paidAt: window }
    : { shopId, status: { in: ["SENT", "OVERDUE", "PAID"] as ("SENT" | "OVERDUE" | "PAID")[] }, issuedAt: window };
}

export interface TaxSummaryRow {
  name: string;
  /** Base de ventas (antes de impuestos) de las facturas que llevan este impuesto, neta de reembolsos. */
  taxableSales: number;
  collected: number;
  refunded: number;
  net: number;
}

export interface AccountingSummary {
  basis: SalesBasis;
  gross: { invoices: number; subtotal: number; tax: number; total: number };
  refunds: { count: number; total: number; tax: number };
  net: { beforeTax: number; tax: number; total: number };
  taxes: TaxSummaryRow[];
  payments: { method: string; received: number; refunded: number; net: number }[];
  outstanding: { invoices: number; total: number };
}

export async function getAccountingSummary(scope: AccountingScope): Promise<AccountingSummary> {
  const { shopId, range } = scope;
  const window = { gte: range.from, lt: range.toExclusive };
  const [invoices, refunds, received, refundedByMethod, outstanding] = await Promise.all([
    db.invoice.findMany({
      where: invoiceWhere(scope),
      select: { subtotal: true, taxRate: true, taxAmount: true, total: true, taxSnapshot: true },
    }),
    db.invoiceRefund.findMany({ where: { shopId, refundedAt: window }, select: { amount: true, taxAmount: true, taxLines: true } }),
    db.invoicePaymentEntry.groupBy({
      by: ["method"],
      where: { invoice: { shopId, status: "PAID", paidAt: window } },
      _sum: { amount: true },
    }),
    db.invoiceRefund.groupBy({ by: ["method"], where: { shopId, refundedAt: window }, _sum: { amount: true } }),
    db.invoice.aggregate({ where: { shopId, status: { in: ["DRAFT", "SENT", "OVERDUE"] } }, _sum: { total: true }, _count: { _all: true } }),
  ]);

  let subtotal = new Decimal(0);
  let tax = new Decimal(0);
  let total = new Decimal(0);
  const byTax = new Map<string, { base: Decimal; collected: Decimal; refunded: Decimal; refundedBase: Decimal }>();
  const row = (name: string) => {
    const r = byTax.get(name) ?? { base: new Decimal(0), collected: new Decimal(0), refunded: new Decimal(0), refundedBase: new Decimal(0) };
    byTax.set(name, r);
    return r;
  };

  for (const inv of invoices) {
    subtotal = subtotal.plus(inv.subtotal.toString());
    tax = tax.plus(inv.taxAmount.toString());
    total = total.plus(inv.total.toString());
    for (const l of effectiveTaxSnapshot(inv).lines) {
      const r = row(l.name);
      r.base = r.base.plus(inv.subtotal.toString());
      r.collected = r.collected.plus(l.amount);
    }
  }

  let refundTotal = new Decimal(0);
  let refundTax = new Decimal(0);
  for (const rf of refunds) {
    refundTotal = refundTotal.plus(rf.amount.toString());
    refundTax = refundTax.plus(rf.taxAmount.toString());
    const lines = Array.isArray(rf.taxLines) ? (rf.taxLines as { name?: unknown; amount?: unknown }[]) : [];
    const base = new Decimal(rf.amount.toString()).minus(rf.taxAmount.toString());
    for (const l of lines) {
      if (typeof l.name !== "string") continue;
      const r = row(l.name);
      r.refunded = r.refunded.plus(String(l.amount ?? 0));
      r.refundedBase = r.refundedBase.plus(base);
    }
  }

  const methods = new Map<string, { received: Decimal; refunded: Decimal }>();
  const m = (k: string) => methods.get(k) ?? { received: new Decimal(0), refunded: new Decimal(0) };
  for (const r of received) methods.set(r.method, { ...m(r.method), received: new Decimal(r._sum.amount?.toString() ?? 0) });
  for (const r of refundedByMethod) methods.set(r.method, { ...m(r.method), refunded: new Decimal(r._sum.amount?.toString() ?? 0) });

  const netTotal = total.minus(refundTotal);
  const netTax = tax.minus(refundTax);
  return {
    basis: scope.basis,
    gross: { invoices: invoices.length, subtotal: money(subtotal), tax: money(tax), total: money(total) },
    refunds: { count: refunds.length, total: money(refundTotal), tax: money(refundTax) },
    net: { beforeTax: money(netTotal.minus(netTax)), tax: money(netTax), total: money(netTotal) },
    taxes: [...byTax.entries()].map(([name, r]) => ({
      name,
      taxableSales: money(r.base.minus(r.refundedBase)),
      collected: money(r.collected),
      refunded: money(r.refunded),
      net: money(r.collected.minus(r.refunded)),
    })),
    payments: [...methods.entries()].map(([method, v]) => ({ method, received: money(v.received), refunded: money(v.refunded), net: money(v.received.minus(v.refunded)) })),
    outstanding: { invoices: outstanding._count._all, total: money(outstanding._sum.total?.toString() ?? 0) },
  };
}

// ── Exportaciones detalladas ───────────────────────────────

const EXPORT_LIMIT = 20_000;

export interface JournalRow {
  invoiceNumber: string;
  issuedYmd: string;
  paidYmd: string | null;
  status: string;
  client: string;
  subtotal: number;
  taxByName: Record<string, number>;
  tax: number;
  total: number;
  refunded: number;
  net: number;
  methods: string;
  registration: string | null;
}

export async function getSalesJournal(scope: AccountingScope): Promise<JournalRow[]> {
  const invoices = await db.invoice.findMany({
    where: invoiceWhere(scope),
    orderBy: [{ issuedAt: "asc" }, { invoiceNumber: "asc" }],
    take: EXPORT_LIMIT,
    select: {
      invoiceNumber: true, issuedAt: true, paidAt: true, status: true, subtotal: true, taxRate: true, taxAmount: true, total: true,
      taxSnapshot: true, taxRegistration: true,
      client: { select: { firstName: true, lastName: true } },
      paymentEntries: { select: { method: true } },
      refunds: { select: { amount: true } },
    },
  });
  const tz = scope.range.timeZone;
  return invoices.map((inv) => {
    const refunded = inv.refunds.reduce((s, r) => s.plus(r.amount.toString()), new Decimal(0));
    const taxByName: Record<string, number> = {};
    for (const l of effectiveTaxSnapshot(inv).lines) taxByName[l.name] = money(new Decimal(taxByName[l.name] ?? 0).plus(l.amount));
    return {
      invoiceNumber: inv.invoiceNumber,
      issuedYmd: localYmd(inv.issuedAt, tz),
      paidYmd: inv.paidAt ? localYmd(inv.paidAt, tz) : null,
      status: inv.status,
      client: formatClientName(inv.client),
      subtotal: money(inv.subtotal.toString()),
      taxByName,
      tax: money(inv.taxAmount.toString()),
      total: money(inv.total.toString()),
      refunded: money(refunded),
      net: money(new Decimal(inv.total.toString()).minus(refunded)),
      methods: [...new Set(inv.paymentEntries.map((p) => p.method))].join("+"),
      registration: inv.taxRegistration,
    };
  });
}

export interface LedgerRow {
  ymd: string;
  type: "PAYMENT" | "REFUND";
  invoiceNumber: string;
  method: string;
  /** Con signo: pagos +, reembolsos −. */
  amount: number;
  tax: number | null;
  reason: string | null;
}

export async function getPaymentsLedger(scope: AccountingScope): Promise<LedgerRow[]> {
  const { shopId, range } = scope;
  const window = { gte: range.from, lt: range.toExclusive };
  const [entries, refunds] = await Promise.all([
    db.invoicePaymentEntry.findMany({
      where: { invoice: { shopId, status: "PAID", paidAt: window } },
      take: EXPORT_LIMIT,
      select: { method: true, amount: true, invoice: { select: { invoiceNumber: true, paidAt: true } } },
    }),
    db.invoiceRefund.findMany({
      where: { shopId, refundedAt: window },
      take: EXPORT_LIMIT,
      select: { method: true, amount: true, taxAmount: true, reason: true, refundedAt: true, invoice: { select: { invoiceNumber: true } } },
    }),
  ]);
  const tz = range.timeZone;
  const rows: LedgerRow[] = [
    ...entries.map((e): LedgerRow => ({ ymd: localYmd(e.invoice.paidAt!, tz), type: "PAYMENT", invoiceNumber: e.invoice.invoiceNumber, method: e.method, amount: money(e.amount.toString()), tax: null, reason: null })),
    ...refunds.map((r): LedgerRow => ({ ymd: localYmd(r.refundedAt, tz), type: "REFUND", invoiceNumber: r.invoice.invoiceNumber, method: r.method, amount: -money(r.amount.toString()), tax: money(r.taxAmount.toString()), reason: r.reason })),
  ];
  return rows.sort((a, b) => (a.ymd === b.ymd ? a.invoiceNumber.localeCompare(b.invoiceNumber) : a.ymd < b.ymd ? -1 : 1));
}

export interface ActivityRow {
  id: string;
  at: string;
  type: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  actor: string | null;
  details: Record<string, unknown>;
}

export async function getFinancialActivity(shopId: string, opts: { cursor?: string | null; take?: number; range?: ResolvedRange } = {}): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> {
  const take = Math.min(opts.take ?? 50, EXPORT_LIMIT);
  const events = await db.financialEvent.findMany({
    where: { shopId, ...(opts.range ? { createdAt: { gte: opts.range.from, lt: opts.range.toExclusive } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const page = events.slice(0, take);
  const actorIds = [...new Set(page.map((e) => e.actorId).filter((x): x is string => !!x))];
  const users = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds }, shopId }, select: { id: true, name: true, email: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name || u.email]));
  return {
    rows: page.map((e) => {
      const data = (e.data && typeof e.data === "object" ? e.data : {}) as Record<string, unknown>;
      return {
        id: e.id,
        at: e.createdAt.toISOString(),
        type: e.type,
        invoiceId: e.invoiceId,
        invoiceNumber: typeof data.invoiceNumber === "string" ? data.invoiceNumber : null,
        amount: e.amount == null ? null : money(e.amount.toString()),
        actor: e.actorId ? (name.get(e.actorId) ?? null) : null,
        details: data,
      };
    }),
    nextCursor: events.length > take ? page[page.length - 1].id : null,
  };
}
