/** Extrae el ID de factura de las notas de un documento auto-archivado. */
export function parseInvoiceIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/Factura pagada .+ \(([^)]+)\)/);
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
    label: "Todos",
    description: "Documentos exportados y subidas manuales",
  },
  {
    value: "AUTO_EXPORTED",
    label: "Exportado automáticamente",
    description: "Facturas pagadas exportadas automáticamente a contabilidad",
  },
  {
    value: "MANUAL",
    label: "Subidas manuales",
    description: "Archivos subidos directamente desde esta página",
  },
];
