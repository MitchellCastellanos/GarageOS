// CSV de Accounting Light (Block 9): mismos datos agregados que la pantalla.
import { toCsv } from "@/domain/reports";
import type { AccountingSummary, ActivityRow, JournalRow, LedgerRow } from "@/lib/accounting-service";

export const ACCOUNTING_EXPORTS = ["sales-journal", "payments", "tax-summary", "activity"] as const;
export type AccountingExportKind = (typeof ACCOUNTING_EXPORTS)[number];

type Cell = string | number | null;

export function salesJournalCsv(rows: JournalRow[]): string {
  const taxNames = [...new Set(rows.flatMap((r) => Object.keys(r.taxByName)))].sort();
  return toCsv(
    ["Invoice", "Issued", "Paid", "Status", "Customer", "Subtotal", ...taxNames, "Total tax", "Total", "Refunded", "Net", "Payment methods", "Tax registration"],
    rows.map((r): Cell[] => [
      r.invoiceNumber, r.issuedYmd, r.paidYmd, r.status, r.client, r.subtotal,
      ...taxNames.map((n) => r.taxByName[n] ?? 0),
      r.tax, r.total, r.refunded, r.net, r.methods, r.registration,
    ])
  );
}

export function paymentsLedgerCsv(rows: LedgerRow[]): string {
  return toCsv(
    ["Date", "Type", "Invoice", "Method", "Amount", "Tax portion", "Reason"],
    rows.map((r): Cell[] => [r.ymd, r.type, r.invoiceNumber, r.method, r.amount, r.tax, r.reason])
  );
}

export function taxSummaryCsv(s: AccountingSummary): string {
  const rows: Cell[][] = s.taxes.map((t) => [t.name, t.taxableSales, t.collected, t.refunded, t.net]);
  rows.push(["TOTAL", s.net.beforeTax, s.gross.tax, s.refunds.tax, s.net.tax]);
  return toCsv(["Tax", "Sales base (net of refunds)", "Collected", "Refunded", "Net to remit"], rows);
}

export function activityCsv(rows: ActivityRow[]): string {
  return toCsv(
    ["When (UTC)", "Event", "Invoice", "Amount", "By", "Details"],
    rows.map((r): Cell[] => [r.at, r.type, r.invoiceNumber, r.amount, r.actor, JSON.stringify(r.details)])
  );
}
