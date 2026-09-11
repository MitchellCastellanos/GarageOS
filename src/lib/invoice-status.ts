/** Estados de factura que se muestran como «Pendiente» (incluye legado DRAFT). */
export const INVOICE_PENDING_STATUSES = ["DRAFT", "SENT"] as const;

export type InvoicePendingStatus = (typeof INVOICE_PENDING_STATUSES)[number];

export function isInvoicePending(status: string): status is InvoicePendingStatus {
  return (INVOICE_PENDING_STATUSES as readonly string[]).includes(status);
}

/** Valor de filtro en listado (?status=PENDING). */
export const INVOICE_PENDING_FILTER = "PENDING";

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Pendiente",
  SENT: "Pendiente",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800",
  SENT: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export const INVOICE_STATUS_CHART_COLOR: Record<string, string> = {
  DRAFT: "#f59e0b",
  SENT: "#f59e0b",
  PAID: "#10b981",
  OVERDUE: "#ef4444",
  CANCELLED: "#94a3b8",
};

export const INVOICE_LIST_STATUS_TABS = [
  { value: "ALL", label: "Todas" },
  { value: INVOICE_PENDING_FILTER, label: "Pendiente" },
  { value: "PAID", label: "Pagada" },
  { value: "OVERDUE", label: "Vencida" },
  { value: "CANCELLED", label: "Cancelada" },
] as const;

export const EMAIL_PENDING_CONFIRM_MESSAGE =
  "¿Estás seguro de que deseas enviar esta factura con estatus Pendiente? Si el cliente ya pagó, cancela y marca la factura como Pagada antes de enviar.";

/** Etiqueta de estado en PDF según idioma de la factura. */
export function invoiceStatusLabelForPdf(
  statuses: Record<string, string>,
  status: string
): string {
  if (isInvoicePending(status)) {
    return statuses.SENT ?? statuses.DRAFT ?? "PENDIENTE";
  }
  return statuses[status] ?? status;
}
