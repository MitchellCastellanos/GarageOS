// CSV de reportes (Block 5). Los mismos datos agregados que ve la pantalla — nunca una consulta aparte.
import { agingBucket, toCsv, type ResolvedRange } from "@/domain/reports";
import type {
  CustomersReport,
  InventoryReport,
  OperationsReport,
  OverviewReport,
  ReceivablesReport,
  SalesReport,
} from "@/lib/reports-service";

type Row = (string | number | null)[];
const HEAD = ["Section", "Item", "Count", "Amount"];

export function rangeLabel(r: Pick<ResolvedRange, "fromYmd" | "toYmd">) {
  return `${r.fromYmd}_${r.toYmd}`;
}

export function salesCsv(d: SalesReport): string {
  const rows: Row[] = [
    ["Totals", "Invoices paid", d.totals.invoices, null],
    ["Totals", "Subtotal", null, d.totals.subtotal],
    ["Totals", "Tax", null, d.totals.tax],
    ["Totals", "Total", null, d.totals.total],
    ["Totals", "Average invoice", null, d.totals.average],
    ...d.series.map((p): Row => [`Period (${d.granularity})`, p.key, p.count, p.total]),
    ...d.byMethod.map((m): Row => ["Payment method", m.method, null, m.amount]),
    ...d.byItemType.map((t): Row => ["Item type", t.type, null, t.amount]),
    ...d.topServices.map((s): Row => ["Top items", s.description, s.quantity, s.amount]),
    ...d.byLocation.map((l): Row => ["Location", l.shopId, l.invoices, l.total]),
  ];
  return toCsv(HEAD, rows);
}

export function receivablesCsv(d: ReceivablesReport): string {
  return toCsv(
    ["Invoice", "Customer", "Issued", "Due", "Days past due", "Aging bucket", "Amount"],
    d.oldest.map((o): Row => [o.invoiceNumber, o.client, o.issuedYmd, o.dueYmd, o.daysPastDue, agingBucket(o.daysPastDue), o.total])
  );
}

export function operationsCsv(d: OperationsReport): string {
  const rows: Row[] = [
    ["Work orders", "Created", d.workOrders.created, null],
    ...d.workOrders.byStatus.map((s): Row => ["Work orders by status", s.status, s.count, null]),
    ["Work orders", "Completed", d.workOrders.completed, null],
    ["Work orders", "Avg days to complete", null, d.workOrders.avgDaysToComplete],
    ["Work orders", "Open now", d.workOrders.openNow, null],
    ["Quotes", "Created", d.quotes.created, null],
    ...d.quotes.byStatus.map((s): Row => ["Quotes by status", s.status, s.count, null]),
    ["Quotes", "Approval rate", null, d.quotes.approvalRate],
    ...(d.quotes.value != null ? ([["Quotes", "Value sent", null, d.quotes.value]] as Row[]) : []),
    ...(d.quotes.acceptedValue != null ? ([["Quotes", "Value accepted", null, d.quotes.acceptedValue]] as Row[]) : []),
  ];
  return toCsv(HEAD, rows);
}

export function customersCsv(d: CustomersReport): string {
  const rows: Row[] = [
    ["Customers", "New", d.newClients, null],
    ["Customers", "Active", d.activeClients, null],
    ["Customers", "Returning", d.returningClients, null],
    ["Customers", "Retention rate", null, d.retentionRate],
    ...(d.top ?? []).map((c): Row => ["Top customers", c.name, c.invoices, c.total]),
  ];
  return toCsv(HEAD, rows);
}

export function inventoryCsv(d: InventoryReport): string {
  const rows: Row[] = [
    ["Inventory", "Active parts", d.activeParts, null],
    ["Inventory", "Units consumed", d.consumedUnits, null],
    ...(d.stockValue != null ? ([["Inventory", "Stock value (cost)", null, d.stockValue]] as Row[]) : []),
    ...d.lowStock.map((p): Row => ["Low stock", `${p.name}${p.sku ? ` (${p.sku})` : ""}`, p.onHand, p.threshold]),
  ];
  return toCsv(HEAD, rows);
}

export function overviewCsv(d: OverviewReport): string {
  const rows: Row[] = [
    ...(d.revenue ? ([["Revenue", "Paid invoices", d.revenue.invoices, d.revenue.total]] as Row[]) : []),
    ...(d.outstanding ? ([["Outstanding", "Unpaid invoices", d.outstanding.invoices, d.outstanding.total]] as Row[]) : []),
    ["Work orders", "Created", d.workOrders.created, null],
    ["Work orders", "Open now", d.workOrders.openNow, null],
    ["Customers", "New", d.newClients, null],
  ];
  return toCsv(HEAD, rows);
}
