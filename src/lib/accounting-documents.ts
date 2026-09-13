/** Extracts the invoice ID from notes on an auto-archived document. */
export function parseInvoiceIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  // Support both the legacy Spanish note format and the current English format.
  const match =
    notes.match(/Paid invoice .+ \(([^)]+)\)/) ??
    notes.match(/Factura pagada .+ \(([^)]+)\)/);
  return match?.[1] ?? null;
}

export type AccountingDocSource = "auto_paid_invoice" | "manual";

export function classifyAccountingDocSource(notes: string | null | undefined): AccountingDocSource {
  return parseInvoiceIdFromNotes(notes) ? "auto_paid_invoice" : "manual";
}

export type AccountingDocFilter = "ALL" | "AUTO_EXPORTED" | "MANUAL";

export const ACCOUNTING_DOC_FILTERS: {
  value: AccountingDocFilter;
  label: string;
  description: string;
}[] = [
  {
    value: "ALL",
    label: "All",
    description: "Automatically exported documents and manual uploads",
  },
  {
    value: "AUTO_EXPORTED",
    label: "Automatically exported",
    description: "Paid invoices automatically exported to accounting",
  },
  {
    value: "MANUAL",
    label: "Manual uploads",
    description: "Files uploaded directly from this page",
  },
];
