// Consultas de reportes (Block 5). Agregación en servidor: nunca se envían filas crudas al navegador.
// Todas las consultas se acotan a `shopIds` — hoy siempre el taller activo; Complete/Multi-Shop
// (Block 12) podrá pasar las ubicaciones de la organización a la que el usuario tiene acceso,
// y `byLocation` ya agrupa por taller para la comparación entre ubicaciones.
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { formatClientName } from "@/lib/client-name";
import { effectiveTaxSnapshot } from "@/domain/fiscal";
import {
  AGING_BUCKETS,
  agingBucket,
  buildSeries,
  daysPastDue,
  localYmd,
  money,
  pickGranularity,
  type AgingBucket,
  type Granularity,
  type ResolvedRange,
  type SeriesPoint,
} from "@/domain/reports";

export interface ReportScope {
  shopIds: string[];
  range: ResolvedRange;
  /** Solo true si el usuario tiene `financial.view` (los reportes sin él no incluyen dinero). */
  includeFinancial: boolean;
}

const PENDING_STATUSES = ["DRAFT", "SENT", "OVERDUE"] as const;

function shopFilter(shopIds: string[]) {
  return { in: shopIds };
}

// ── Ventas ─────────────────────────────────────────────────

export interface SalesReport {
  granularity: Granularity;
  totals: { invoices: number; subtotal: number; tax: number; total: number; average: number };
  /** Reembolsos pagados en el periodo (por fecha del reembolso) y ventas netas (total − reembolsos). */
  refunds: { count: number; total: number; tax: number };
  net: number;
  taxByName: { name: string; amount: number }[];
  series: SeriesPoint[];
  byMethod: { method: string; amount: number }[];
  byItemType: { type: "LABOUR" | "PART" | "OTHER"; amount: number }[];
  topServices: { description: string; quantity: number; amount: number }[];
  byLocation: { shopId: string; invoices: number; total: number }[];
}

export async function getSalesReport(scope: ReportScope): Promise<SalesReport> {
  const { shopIds, range } = scope;
  const [invoices, refundAgg] = await Promise.all([
    db.invoice.findMany({
    where: { shopId: shopFilter(shopIds), status: "PAID", paidAt: { gte: range.from, lt: range.toExclusive } },
    select: {
      shopId: true,
      paidAt: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      total: true,
      taxSnapshot: true,
      paymentMode: true,
      paymentEntries: { select: { method: true, amount: true } },
      vehicles: { select: { lineItems: { select: { description: true, quantity: true, itemType: true, lineTotal: true } } } },
    },
    }),
    db.invoiceRefund.aggregate({
      where: { shopId: shopFilter(shopIds), refundedAt: { gte: range.from, lt: range.toExclusive } },
      _sum: { amount: true, taxAmount: true },
      _count: { _all: true },
    }),
  ]);

  const taxNames = new Map<string, Decimal>();
  let subtotal = new Decimal(0);
  let tax = new Decimal(0);
  let total = new Decimal(0);
  const method = new Map<string, Decimal>();
  const type = new Map<"LABOUR" | "PART" | "OTHER", Decimal>([
    ["LABOUR", new Decimal(0)],
    ["PART", new Decimal(0)],
    ["OTHER", new Decimal(0)],
  ]);
  const services = new Map<string, { description: string; quantity: Decimal; amount: Decimal }>();
  const location = new Map<string, { invoices: number; total: Decimal }>();

  for (const inv of invoices) {
    subtotal = subtotal.plus(inv.subtotal.toString());
    tax = tax.plus(inv.taxAmount.toString());
    total = total.plus(inv.total.toString());
    for (const l of effectiveTaxSnapshot(inv).lines) taxNames.set(l.name, (taxNames.get(l.name) ?? new Decimal(0)).plus(l.amount));

    const loc = location.get(inv.shopId) ?? { invoices: 0, total: new Decimal(0) };
    loc.invoices += 1;
    loc.total = loc.total.plus(inv.total.toString());
    location.set(inv.shopId, loc);

    if (inv.paymentEntries.length > 0) {
      for (const e of inv.paymentEntries) method.set(e.method, (method.get(e.method) ?? new Decimal(0)).plus(e.amount.toString()));
    } else if (inv.paymentMode) {
      // Facturas antiguas sin desglose de pagos: se atribuye el total a su modo.
      method.set(inv.paymentMode, (method.get(inv.paymentMode) ?? new Decimal(0)).plus(inv.total.toString()));
    }

    for (const v of inv.vehicles) {
      for (const li of v.lineItems) {
        type.set(li.itemType, (type.get(li.itemType) ?? new Decimal(0)).plus(li.lineTotal.toString()));
        const key = li.description.trim().toLowerCase();
        const s = services.get(key) ?? { description: li.description.trim(), quantity: new Decimal(0), amount: new Decimal(0) };
        s.quantity = s.quantity.plus(li.quantity.toString());
        s.amount = s.amount.plus(li.lineTotal.toString());
        services.set(key, s);
      }
    }
  }

  const granularity = pickGranularity(range.days);
  return {
    granularity,
    totals: {
      invoices: invoices.length,
      subtotal: money(subtotal),
      tax: money(tax),
      total: money(total),
      average: invoices.length ? money(total.div(invoices.length)) : 0,
    },
    refunds: { count: refundAgg._count._all, total: money(refundAgg._sum.amount?.toString() ?? 0), tax: money(refundAgg._sum.taxAmount?.toString() ?? 0) },
    net: money(total.minus(refundAgg._sum.amount?.toString() ?? 0)),
    taxByName: [...taxNames.entries()].map(([name, amount]) => ({ name, amount: money(amount) })),
    series: buildSeries(
      invoices.map((i) => ({ at: i.paidAt!, amount: i.total.toString() })),
      range,
      granularity
    ),
    byMethod: [...method.entries()].map(([m, a]) => ({ method: m, amount: money(a) })).sort((a, b) => b.amount - a.amount),
    byItemType: [...type.entries()].map(([t, a]) => ({ type: t, amount: money(a) })),
    topServices: [...services.values()]
      .sort((a, b) => b.amount.comparedTo(a.amount))
      .slice(0, 10)
      .map((s) => ({ description: s.description, quantity: money(s.quantity), amount: money(s.amount) })),
    byLocation: [...location.entries()].map(([shopId, v]) => ({ shopId, invoices: v.invoices, total: money(v.total) })),
  };
}

// ── Cuentas por cobrar ─────────────────────────────────────

export interface ReceivablesReport {
  asOf: string;
  totals: { invoices: number; outstanding: number };
  aging: { bucket: AgingBucket; invoices: number; amount: number }[];
  oldest: {
    id: string;
    invoiceNumber: string;
    client: string;
    total: number;
    /** Fechas locales del taller (YYYY-MM-DD). */
    dueYmd: string | null;
    issuedYmd: string;
    daysPastDue: number;
  }[];
}

export async function getReceivablesReport(scope: ReportScope, asOf: Date = new Date(), limit = 25): Promise<ReceivablesReport> {
  const { shopIds, range } = scope;
  const invoices = await db.invoice.findMany({
    where: { shopId: shopFilter(shopIds), status: { in: [...PENDING_STATUSES] } },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      dueAt: true,
      issuedAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });

  const buckets = new Map<AgingBucket, { invoices: number; amount: Decimal }>(AGING_BUCKETS.map((b) => [b, { invoices: 0, amount: new Decimal(0) }]));
  let outstanding = new Decimal(0);
  const rows = invoices.map((inv) => {
    const late = daysPastDue(inv, asOf, range.timeZone);
    const b = buckets.get(agingBucket(late))!;
    b.invoices += 1;
    b.amount = b.amount.plus(inv.total.toString());
    outstanding = outstanding.plus(inv.total.toString());
    return { inv, late };
  });

  return {
    asOf: asOf.toISOString(),
    totals: { invoices: invoices.length, outstanding: money(outstanding) },
    aging: AGING_BUCKETS.map((bucket) => ({ bucket, invoices: buckets.get(bucket)!.invoices, amount: money(buckets.get(bucket)!.amount) })),
    oldest: rows
      .sort((a, b) => b.late - a.late)
      .slice(0, limit)
      .map(({ inv, late }) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        client: formatClientName(inv.client),
        total: money(inv.total.toString()),
        dueYmd: inv.dueAt ? localYmd(inv.dueAt, range.timeZone) : null,
        issuedYmd: localYmd(inv.issuedAt, range.timeZone),
        daysPastDue: late,
      })),
  };
}

// ── Operación (órdenes de trabajo + cotizaciones) ──────────

export interface OperationsReport {
  workOrders: {
    created: number;
    byStatus: { status: string; count: number }[];
    completed: number;
    /** Días promedio entre apertura y la última actualización de las órdenes completadas/facturadas del periodo. */
    avgDaysToComplete: number | null;
    openNow: number;
  };
  quotes: {
    created: number;
    byStatus: { status: string; count: number }[];
    /** Aceptadas+convertidas / decididas (enviadas o resueltas), 0–1; null si aún no hay decididas. */
    approvalRate: number | null;
    /** Valor de las cotizaciones creadas — solo con financial.view. */
    value: number | null;
    acceptedValue: number | null;
  };
}

const DECIDED_QUOTE = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"];
const WON_QUOTE = ["ACCEPTED", "CONVERTED"];

export async function getOperationsReport(scope: ReportScope): Promise<OperationsReport> {
  const { shopIds, range, includeFinancial } = scope;
  const created = { gte: range.from, lt: range.toExclusive };
  const [woByStatus, doneOrders, openNow, quoteByStatus, quoteValue, quoteWon] = await Promise.all([
    db.workOrder.groupBy({ by: ["status"], where: { shopId: shopFilter(shopIds), createdAt: created }, _count: { _all: true } }),
    db.workOrder.findMany({
      where: { shopId: shopFilter(shopIds), status: { in: ["COMPLETED", "INVOICED"] }, updatedAt: created },
      select: { createdAt: true, updatedAt: true },
    }),
    db.workOrder.count({ where: { shopId: shopFilter(shopIds), status: { in: ["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"] } } }),
    db.quote.groupBy({ by: ["status"], where: { shopId: shopFilter(shopIds), createdAt: created }, _count: { _all: true } }),
    includeFinancial
      ? db.quote.aggregate({ where: { shopId: shopFilter(shopIds), createdAt: created, status: { not: "DRAFT" } }, _sum: { total: true } })
      : Promise.resolve(null),
    includeFinancial
      ? db.quote.aggregate({ where: { shopId: shopFilter(shopIds), createdAt: created, status: { in: WON_QUOTE as never } }, _sum: { total: true } })
      : Promise.resolve(null),
  ]);

  const woRows = woByStatus.map((r) => ({ status: r.status as string, count: r._count._all }));
  const qRows = quoteByStatus.map((r) => ({ status: r.status as string, count: r._count._all }));
  const decided = qRows.filter((r) => DECIDED_QUOTE.includes(r.status)).reduce((s, r) => s + r.count, 0);
  const won = qRows.filter((r) => WON_QUOTE.includes(r.status)).reduce((s, r) => s + r.count, 0);
  const avgMs = doneOrders.length
    ? doneOrders.reduce((s, o) => s + (o.updatedAt.getTime() - o.createdAt.getTime()), 0) / doneOrders.length
    : null;

  return {
    workOrders: {
      created: woRows.reduce((s, r) => s + r.count, 0),
      byStatus: woRows,
      completed: doneOrders.length,
      avgDaysToComplete: avgMs == null ? null : Math.round((avgMs / 86_400_000) * 10) / 10,
      openNow,
    },
    quotes: {
      created: qRows.reduce((s, r) => s + r.count, 0),
      byStatus: qRows,
      approvalRate: decided ? Math.round((won / decided) * 1000) / 1000 : null,
      value: quoteValue ? money(quoteValue._sum.total?.toString() ?? 0) : null,
      acceptedValue: quoteWon ? money(quoteWon._sum.total?.toString() ?? 0) : null,
    },
  };
}

// ── Clientes ───────────────────────────────────────────────

export interface CustomersReport {
  newClients: number;
  activeClients: number;
  returningClients: number;
  /** returning / active, 0–1; null sin clientes activos. */
  retentionRate: number | null;
  /** Solo con financial.view. */
  top: { clientId: string; name: string; invoices: number; total: number }[] | null;
}

export async function getCustomersReport(scope: ReportScope): Promise<CustomersReport> {
  const { shopIds, range, includeFinancial } = scope;
  const [newClients, paid] = await Promise.all([
    db.client.count({ where: { shopId: shopFilter(shopIds), createdAt: { gte: range.from, lt: range.toExclusive } } }),
    db.invoice.findMany({
      where: { shopId: shopFilter(shopIds), status: "PAID", paidAt: { gte: range.from, lt: range.toExclusive } },
      select: { clientId: true, total: true, client: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const perClient = new Map<string, { name: string; invoices: number; total: Decimal }>();
  for (const inv of paid) {
    const c = perClient.get(inv.clientId) ?? { name: formatClientName(inv.client), invoices: 0, total: new Decimal(0) };
    c.invoices += 1;
    c.total = c.total.plus(inv.total.toString());
    perClient.set(inv.clientId, c);
  }
  const activeIds = [...perClient.keys()];
  const before = activeIds.length
    ? await db.invoice.groupBy({
        by: ["clientId"],
        where: { shopId: shopFilter(shopIds), status: "PAID", clientId: { in: activeIds }, paidAt: { lt: range.from } },
        _count: { _all: true },
      })
    : [];

  return {
    newClients,
    activeClients: activeIds.length,
    returningClients: before.length,
    retentionRate: activeIds.length ? Math.round((before.length / activeIds.length) * 1000) / 1000 : null,
    top: includeFinancial
      ? [...perClient.entries()]
          .sort(([, a], [, b]) => b.total.comparedTo(a.total))
          .slice(0, 10)
          .map(([clientId, c]) => ({ clientId, name: c.name, invoices: c.invoices, total: money(c.total) }))
      : null,
  };
}

// ── Inventario ─────────────────────────────────────────────

export interface InventoryReport {
  activeParts: number;
  lowStock: { id: string; name: string; sku: string | null; onHand: number; threshold: number }[];
  /** Valor al costo — solo con financial.view. */
  stockValue: number | null;
  consumedUnits: number;
}

export async function getInventoryReport(scope: ReportScope): Promise<InventoryReport> {
  const { shopIds, range, includeFinancial } = scope;
  const [parts, consumed] = await Promise.all([
    db.inventoryPart.findMany({
      where: { shopId: shopFilter(shopIds), isActive: true },
      select: { id: true, name: true, sku: true, unitCost: true, quantityOnHand: true, reorderThreshold: true },
    }),
    db.inventoryMovement.aggregate({
      where: { shopId: shopFilter(shopIds), type: "CONSUMED", createdAt: { gte: range.from, lt: range.toExclusive } },
      _sum: { quantity: true },
    }),
  ]);
  const low = parts
    .filter((p) => p.reorderThreshold > 0 && p.quantityOnHand <= p.reorderThreshold)
    .sort((a, b) => a.quantityOnHand - a.reorderThreshold - (b.quantityOnHand - b.reorderThreshold))
    .slice(0, 50)
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, onHand: p.quantityOnHand, threshold: p.reorderThreshold }));
  const value = parts.reduce((s, p) => s.plus(new Decimal(p.unitCost?.toString() ?? 0).times(Math.max(p.quantityOnHand, 0))), new Decimal(0));
  return {
    activeParts: parts.length,
    lowStock: low,
    stockValue: includeFinancial ? money(value) : null,
    consumedUnits: Math.abs(consumed._sum.quantity ?? 0),
  };
}

// ── Resumen (Core: básico) ─────────────────────────────────

export interface OverviewReport {
  granularity: Granularity;
  /** Los campos de dinero son null sin financial.view. */
  revenue: { invoices: number; total: number; refunds: number; net: number } | null;
  series: SeriesPoint[] | null;
  outstanding: { invoices: number; total: number } | null;
  workOrders: { created: number; openNow: number };
  newClients: number;
}

export async function getOverviewReport(scope: ReportScope): Promise<OverviewReport> {
  const { shopIds, range, includeFinancial } = scope;
  const created = { gte: range.from, lt: range.toExclusive };
  const granularity = pickGranularity(range.days);
  const [paid, refundAgg, outstanding, woCreated, woOpen, newClients] = await Promise.all([
    includeFinancial
      ? db.invoice.findMany({
          where: { shopId: shopFilter(shopIds), status: "PAID", paidAt: created },
          select: { paidAt: true, total: true },
        })
      : Promise.resolve(null),
    includeFinancial
      ? db.invoiceRefund.aggregate({ where: { shopId: shopFilter(shopIds), refundedAt: created }, _sum: { amount: true } })
      : Promise.resolve(null),
    includeFinancial
      ? db.invoice.aggregate({ where: { shopId: shopFilter(shopIds), status: { in: [...PENDING_STATUSES] } }, _sum: { total: true }, _count: { _all: true } })
      : Promise.resolve(null),
    db.workOrder.count({ where: { shopId: shopFilter(shopIds), createdAt: created } }),
    db.workOrder.count({ where: { shopId: shopFilter(shopIds), status: { in: ["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"] } } }),
    db.client.count({ where: { shopId: shopFilter(shopIds), createdAt: created } }),
  ]);
  return {
    granularity,
    revenue: paid
      ? (() => {
          const gross = paid.reduce((s, i) => s.plus(i.total.toString()), new Decimal(0));
          const refunds = new Decimal(refundAgg?._sum.amount?.toString() ?? 0);
          return { invoices: paid.length, total: money(gross), refunds: money(refunds), net: money(gross.minus(refunds)) };
        })()
      : null,
    series: paid ? buildSeries(paid.map((i) => ({ at: i.paidAt!, amount: i.total.toString() })), range, granularity) : null,
    outstanding: outstanding ? { invoices: outstanding._count._all, total: money(outstanding._sum.total?.toString() ?? 0) } : null,
    workOrders: { created: woCreated, openNow: woOpen },
    newClients,
  };
}
