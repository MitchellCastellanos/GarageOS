import type { AdminLocale } from "@/lib/admin-locale";

/** Estados de factura que se muestran como «Pendiente» (incluye legado DRAFT). */
export const INVOICE_PENDING_STATUSES = ["DRAFT", "SENT"] as const;

export type InvoicePendingStatus = (typeof INVOICE_PENDING_STATUSES)[number];

export function isInvoicePending(status: string): status is InvoicePendingStatus {
  return (INVOICE_PENDING_STATUSES as readonly string[]).includes(status);
}

/** Valor de filtro en listado (?status=PENDING). */
export const INVOICE_PENDING_FILTER = "PENDING";

const INVOICE_STATUS_LABELS: Record<AdminLocale, Record<string, string>> = {
  es: {
    DRAFT: "Pendiente",
    SENT: "Pendiente",
    PAID: "Pagada",
    OVERDUE: "Vencida",
    CANCELLED: "Cancelada",
  },
  en: {
    DRAFT: "Pending",
    SENT: "Pending",
    PAID: "Paid",
    OVERDUE: "Overdue",
    CANCELLED: "Cancelled",
  },
  fr: {
    DRAFT: "En attente",
    SENT: "En attente",
    PAID: "Payée",
    OVERDUE: "En retard",
    CANCELLED: "Annulée",
  },
};

export function invoiceStatusLabel(status: string, locale: AdminLocale): string {
  return INVOICE_STATUS_LABELS[locale][status] ?? status;
}

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

const ALL_STATUSES_LABEL: Record<AdminLocale, string> = {
  es: "Todas",
  en: "All",
  fr: "Toutes",
};

export function invoiceListStatusTabs(
  locale: AdminLocale
): { value: string; label: string }[] {
  const labels = INVOICE_STATUS_LABELS[locale];
  return [
    { value: "ALL", label: ALL_STATUSES_LABEL[locale] },
    { value: INVOICE_PENDING_FILTER, label: labels.SENT },
    { value: "PAID", label: labels.PAID },
    { value: "OVERDUE", label: labels.OVERDUE },
    { value: "CANCELLED", label: labels.CANCELLED },
  ];
}

const EMAIL_PENDING_CONFIRM_MESSAGES: Record<AdminLocale, string> = {
  es: "¿Estás seguro de que deseas enviar esta factura con estatus Pendiente? Si el cliente ya pagó, cancela y marca la factura como Pagada antes de enviar.",
  en: "Are you sure you want to send this invoice with Pending status? If the client already paid, cancel and mark the invoice as Paid before sending.",
  fr: "Voulez-vous vraiment envoyer cette facture avec le statut En attente ? Si le client a déjà payé, annulez et marquez la facture comme Payée avant d'envoyer.",
};

export function emailPendingConfirmMessage(locale: AdminLocale): string {
  return EMAIL_PENDING_CONFIRM_MESSAGES[locale];
}

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
