import type { AdminLocale } from "@/lib/admin-locale";

export interface AccountingDictionary {
  methods: Record<"CARD" | "CASH" | "ETRANSFER" | "CHEQUE" | "OTHER", string>;
  refund: {
    button: string; title: string; balance: (amount: string) => string; amount: string; method: string; reason: string; reasonPlaceholder: string;
    submit: string; cancel: string; done: string; historyTitle: string; refundedOn: (date: string) => string; taxPart: (amount: string) => string;
    netTotal: string; refunded: string; cashNote: string; fullBalance: string;
  };
  tabs: { history: string; documents: string; summary: string; taxes: string; payments: string; activity: string };
  locked: { title: string; description: string; cta: string };
  controls: { period: string; from: string; to: string; apply: string; basis: string; basisIssued: string; basisPaid: string; export: string; exporting: string };
  presets: Record<"today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear" | "custom", string>;
  errors: { INVALID_RANGE: string; UPGRADE_REQUIRED: string; INVALID_KIND: string; NO_SHOP: string };
  summary: {
    title: string; gross: string; refunds: string; net: string; invoices: string; subtotal: string; taxCollected: string; taxRefunded: string; netTax: string;
    paymentsReceived: string; refundsPaid: string; netCash: string; method: string; amount: string; outstanding: string; unpaidInvoices: string;
    basisNote: { issued: string; paid: string }; disclaimer: string; unallocated: string;
  };
  taxes: { title: string; tax: string; collected: string; refunded: string; net: string; taxableSales: string; registration: string; none: string };
  activity: { title: string; when: string; event: string; invoice: string; amount: string; by: string; empty: string; more: string };
  events: Record<string, string>;
  exports: { salesJournal: string; payments: string; taxSummary: string; activity: string };
}

const en: AccountingDictionary = {
  methods: { CARD: "Card", CASH: "Cash", ETRANSFER: "Interac e-Transfer", CHEQUE: "Cheque", OTHER: "Other" },
  refund: {
    button: "Refund", title: "Refund invoice", balance: (a) => `Refundable balance: ${a}`, amount: "Amount (taxes included)", method: "Refunded by",
    reason: "Reason", reasonPlaceholder: "Why is this being refunded?", submit: "Record refund", cancel: "Cancel", done: "Refund recorded",
    historyTitle: "Refunds", refundedOn: (d) => `Refunded ${d}`, taxPart: (a) => `incl. ${a} tax`, netTotal: "Net after refunds", refunded: "Refunded",
    cashNote: "A cash refund is taken out of the cash drawer.", fullBalance: "Full balance",
  },
  tabs: { history: "Invoice history", documents: "Documents", summary: "Sales summary", taxes: "Tax summary", payments: "Payments & refunds", activity: "Activity log" },
  locked: {
    title: "Accounting Light is included in Pro and Complete",
    description: "Sales and tax summaries (GST/QST), payments and refunds by method, CSV exports for your bookkeeper and a full financial activity log.",
    cta: "See plans",
  },
  controls: {
    period: "Period", from: "From", to: "To", apply: "Apply", basis: "Count sales by", basisIssued: "Invoice date", basisPaid: "Payment date",
    export: "Export CSV", exporting: "Exporting…",
  },
  presets: {
    today: "Today", last7: "Last 7 days", last30: "Last 30 days", thisMonth: "This month", lastMonth: "Last month",
    thisQuarter: "This quarter", thisYear: "This year", lastYear: "Last year", custom: "Custom range",
  },
  errors: { INVALID_RANGE: "That date range isn't valid (max 2 years, start before end).", UPGRADE_REQUIRED: "This needs the Pro plan.", INVALID_KIND: "Unknown export.", NO_SHOP: "Shop not found." },
  summary: {
    title: "Sales summary", gross: "Gross sales", refunds: "Refunds", net: "Net sales", invoices: "Invoices", subtotal: "Before tax", taxCollected: "Tax on sales",
    taxRefunded: "Tax refunded", netTax: "Net tax to remit", paymentsReceived: "Payments received", refundsPaid: "Refunds paid out", netCash: "Net received",
    method: "Method", amount: "Amount", outstanding: "Outstanding (unpaid)", unpaidInvoices: "unpaid invoices",
    basisNote: {
      issued: "Sales are counted on the invoice date (excludes voided and never-issued drafts). Refunds are counted on the day they were paid out.",
      paid: "Sales are counted on the day the invoice was paid. Refunds are counted on the day they were paid out.",
    },
    disclaimer: "Operational summary to help you and your accountant — not tax advice. Confirm your filing method and rates with your accountant.",
    unallocated: "Tax (rate not itemised)",
  },
  taxes: { title: "Tax summary", tax: "Tax", collected: "Collected", refunded: "Refunded", net: "Net", taxableSales: "Sales base", registration: "Registration on file", none: "No taxes in this period." },
  activity: { title: "Financial activity log", when: "When", event: "Event", invoice: "Invoice", amount: "Amount", by: "By", empty: "No activity yet.", more: "Load more" },
  events: {
    INVOICE_ISSUED: "Invoice issued", INVOICE_UPDATED: "Invoice edited", PAYMENT_RECORDED: "Payment recorded", PAYMENT_REVERSED: "Payment reversed",
    INVOICE_VOIDED: "Invoice voided", INVOICE_DELETED: "Invoice deleted", REFUND_RECORDED: "Refund recorded",
  },
  exports: { salesJournal: "Sales journal (CSV)", payments: "Payments & refunds (CSV)", taxSummary: "Tax summary (CSV)", activity: "Activity log (CSV)" },
};

const fr: AccountingDictionary = {
  methods: { CARD: "Carte", CASH: "Comptant", ETRANSFER: "Virement Interac", CHEQUE: "Chèque", OTHER: "Autre" },
  refund: {
    button: "Rembourser", title: "Rembourser la facture", balance: (a) => `Solde remboursable : ${a}`, amount: "Montant (taxes incluses)", method: "Remboursé par",
    reason: "Motif", reasonPlaceholder: "Pourquoi ce remboursement?", submit: "Enregistrer le remboursement", cancel: "Annuler", done: "Remboursement enregistré",
    historyTitle: "Remboursements", refundedOn: (d) => `Remboursé le ${d}`, taxPart: (a) => `dont ${a} de taxes`, netTotal: "Net après remboursements", refunded: "Remboursé",
    cashNote: "Un remboursement comptant est retiré de la caisse.", fullBalance: "Solde complet",
  },
  tabs: { history: "Historique des factures", documents: "Documents", summary: "Sommaire des ventes", taxes: "Sommaire des taxes", payments: "Paiements et remboursements", activity: "Journal d'activité" },
  locked: {
    title: "Comptabilité légère incluse dans Pro et Complete",
    description: "Sommaires des ventes et des taxes (TPS/TVQ), paiements et remboursements par mode, exports CSV pour votre comptable et journal d'activité financière complet.",
    cta: "Voir les forfaits",
  },
  controls: {
    period: "Période", from: "Du", to: "Au", apply: "Appliquer", basis: "Compter les ventes selon", basisIssued: "La date de facture", basisPaid: "La date de paiement",
    export: "Exporter en CSV", exporting: "Exportation…",
  },
  presets: {
    today: "Aujourd'hui", last7: "7 derniers jours", last30: "30 derniers jours", thisMonth: "Ce mois-ci", lastMonth: "Mois dernier",
    thisQuarter: "Ce trimestre", thisYear: "Cette année", lastYear: "Année dernière", custom: "Période personnalisée",
  },
  errors: { INVALID_RANGE: "Cette période n'est pas valide (2 ans max, début avant la fin).", UPGRADE_REQUIRED: "Nécessite le forfait Pro.", INVALID_KIND: "Export inconnu.", NO_SHOP: "Atelier introuvable." },
  summary: {
    title: "Sommaire des ventes", gross: "Ventes brutes", refunds: "Remboursements", net: "Ventes nettes", invoices: "Factures", subtotal: "Avant taxes", taxCollected: "Taxes sur les ventes",
    taxRefunded: "Taxes remboursées", netTax: "Taxes nettes à remettre", paymentsReceived: "Paiements reçus", refundsPaid: "Remboursements versés", netCash: "Net reçu",
    method: "Mode", amount: "Montant", outstanding: "À recevoir (impayé)", unpaidInvoices: "factures impayées",
    basisNote: {
      issued: "Les ventes sont comptées à la date de facture (sans les factures annulées ni les brouillons jamais émis). Les remboursements sont comptés le jour où ils ont été versés.",
      paid: "Les ventes sont comptées le jour du paiement de la facture. Les remboursements sont comptés le jour où ils ont été versés.",
    },
    disclaimer: "Sommaire opérationnel pour vous et votre comptable — pas un conseil fiscal. Confirmez votre méthode de déclaration et vos taux avec votre comptable.",
    unallocated: "Taxes (taux non détaillé)",
  },
  taxes: { title: "Sommaire des taxes", tax: "Taxe", collected: "Perçue", refunded: "Remboursée", net: "Nette", taxableSales: "Base de ventes", registration: "Inscription au dossier", none: "Aucune taxe dans cette période." },
  activity: { title: "Journal d'activité financière", when: "Quand", event: "Événement", invoice: "Facture", amount: "Montant", by: "Par", empty: "Aucune activité.", more: "Charger plus" },
  events: {
    INVOICE_ISSUED: "Facture émise", INVOICE_UPDATED: "Facture modifiée", PAYMENT_RECORDED: "Paiement enregistré", PAYMENT_REVERSED: "Paiement annulé",
    INVOICE_VOIDED: "Facture annulée", INVOICE_DELETED: "Facture supprimée", REFUND_RECORDED: "Remboursement enregistré",
  },
  exports: { salesJournal: "Journal des ventes (CSV)", payments: "Paiements et remboursements (CSV)", taxSummary: "Sommaire des taxes (CSV)", activity: "Journal d'activité (CSV)" },
};

export const ACCOUNTING_DICT: Record<AdminLocale, AccountingDictionary> = { en, fr, es: en };
