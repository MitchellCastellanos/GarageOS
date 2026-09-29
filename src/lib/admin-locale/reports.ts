import type { AdminLocale } from "@/lib/admin-locale";

export interface ReportsDictionary {
  nav: string;
  title: string;
  subtitle: string;
  kinds: Record<"overview" | "sales" | "receivables" | "operations" | "customers" | "inventory", string>;
  presets: Record<"today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear" | "custom", string>;
  filters: { period: string; from: string; to: string; apply: string; export: string; exporting: string };
  errors: { INVALID_KIND: string; INVALID_RANGE: string; UPGRADE_REQUIRED: string; NO_SHOP: string; noFinancial: string };
  locked: { title: string; description: string; cta: string; basicNote: string };
  kpi: Record<string, string>;
  table: Record<string, string>;
  aging: Record<"current" | "d1_30" | "d31_60" | "d61_90" | "d90plus", string>;
  itemTypes: Record<"LABOUR" | "PART" | "OTHER", string>;
  methods: Record<string, string>;
  statuses: Record<string, string>;
  notes: Record<string, string>;
  empty: string;
}

const en: ReportsDictionary = {
  nav: "Reports",
  title: "Reports",
  subtitle: "How the shop is doing — sales, receivables, jobs and customers. Dates use your shop's time zone.",
  kinds: { overview: "Overview", sales: "Sales", receivables: "Receivables", operations: "Jobs & quotes", customers: "Customers", inventory: "Inventory" },
  presets: {
    today: "Today", last7: "Last 7 days", last30: "Last 30 days", thisMonth: "This month", lastMonth: "Last month",
    thisQuarter: "This quarter", thisYear: "This year", lastYear: "Last year", custom: "Custom range",
  },
  filters: { period: "Period", from: "From", to: "To", apply: "Apply", export: "Export CSV", exporting: "Exporting…" },
  errors: {
    INVALID_KIND: "Unknown report.", INVALID_RANGE: "That date range isn't valid (max 2 years, start before end).",
    UPGRADE_REQUIRED: "This report needs the Pro plan.", NO_SHOP: "Shop not found.",
    noFinancial: "Revenue figures are hidden — your role doesn't include financial access.",
  },
  locked: {
    title: "Full reports are included in Pro and Complete",
    description: "Custom date ranges, sales by payment method and item type, receivables aging, jobs and quote approval, customer retention, inventory and CSV export.",
    cta: "See plans",
    basicNote: "Basic reporting: this month, last month and last 30 days.",
  },
  kpi: {
    revenue: "Paid revenue", invoices: "Paid invoices", outstanding: "Outstanding", outstandingInvoices: "Unpaid invoices",
    woCreated: "Work orders opened", woOpen: "Open now", newClients: "New customers", subtotal: "Subtotal", tax: "Tax collected", total: "Total",
    average: "Average invoice (ARO)", completed: "Completed", avgDays: "Avg days to complete", quotes: "Quotes created", approvalRate: "Quote approval rate",
    quoteValue: "Quotes sent (value)", quoteAccepted: "Quotes accepted (value)", active: "Active customers", returning: "Returning customers",
    retention: "Retention", parts: "Active parts", low: "Low stock", stockValue: "Stock value (cost)", consumed: "Units used on jobs",
  },
  table: {
    period: "Period", count: "Invoices", amount: "Amount", method: "Payment method", type: "Item type", item: "Item", qty: "Qty", invoice: "Invoice",
    customer: "Customer", issued: "Issued", due: "Due", late: "Days late", status: "Status", name: "Name", onHand: "On hand", threshold: "Reorder at",
    bucket: "Age", sales: "Sales", byMethod: "By payment method", byType: "Labour / parts / other", top: "Top items", aging: "Receivables aging",
    oldest: "Oldest unpaid invoices", wo: "Work orders", quotes: "Quotes", topCustomers: "Top customers", lowStock: "Low stock", seriesTitle: "Sales over time",
  },
  aging: { current: "Not yet due", d1_30: "1–30 days", d31_60: "31–60 days", d61_90: "61–90 days", d90plus: "90+ days" },
  itemTypes: { LABOUR: "Labour", PART: "Parts", OTHER: "Other" },
  methods: { CARD: "Card", CASH: "Cash", MIXED: "Mixed", ETRANSFER: "Interac e-Transfer", CHEQUE: "Cheque", OTHER: "Other" },
  statuses: {
    OPEN: "Open", AWAITING_APPROVAL: "Awaiting approval", APPROVED: "Approved", IN_PROGRESS: "In progress", COMPLETED: "Completed",
    INVOICED: "Invoiced", CANCELLED: "Cancelled", DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", REJECTED: "Rejected", EXPIRED: "Expired", CONVERTED: "Converted",
  },
  notes: {
    aro: "Average invoice = paid revenue ÷ paid invoices in the period (taxes included).",
    days: "Days to complete is measured from opening to the last update of completed/invoiced work orders.",
    basis: "Revenue is counted on the date the invoice was marked paid.",
    retention: "Returning = customers who paid this period and also had a paid invoice before it.",
  },
  empty: "Nothing in this period.",
};

const fr: ReportsDictionary = {
  nav: "Rapports",
  title: "Rapports",
  subtitle: "Où en est l'atelier — ventes, comptes à recevoir, travaux et clients. Les dates suivent le fuseau horaire de l'atelier.",
  kinds: { overview: "Aperçu", sales: "Ventes", receivables: "Comptes à recevoir", operations: "Travaux et soumissions", customers: "Clients", inventory: "Inventaire" },
  presets: {
    today: "Aujourd'hui", last7: "7 derniers jours", last30: "30 derniers jours", thisMonth: "Ce mois-ci", lastMonth: "Mois dernier",
    thisQuarter: "Ce trimestre", thisYear: "Cette année", lastYear: "Année dernière", custom: "Période personnalisée",
  },
  filters: { period: "Période", from: "Du", to: "Au", apply: "Appliquer", export: "Exporter en CSV", exporting: "Exportation…" },
  errors: {
    INVALID_KIND: "Rapport inconnu.", INVALID_RANGE: "Cette période n'est pas valide (2 ans max, début avant la fin).",
    UPGRADE_REQUIRED: "Ce rapport nécessite le forfait Pro.", NO_SHOP: "Atelier introuvable.",
    noFinancial: "Les montants sont masqués — votre rôle n'inclut pas l'accès financier.",
  },
  locked: {
    title: "Les rapports complets sont inclus dans Pro et Complete",
    description: "Périodes personnalisées, ventes par mode de paiement et type d'article, âge des comptes à recevoir, travaux et approbation des soumissions, fidélisation, inventaire et export CSV.",
    cta: "Voir les forfaits",
    basicNote: "Rapport de base : ce mois-ci, mois dernier et 30 derniers jours.",
  },
  kpi: {
    revenue: "Revenus encaissés", invoices: "Factures payées", outstanding: "À recevoir", outstandingInvoices: "Factures impayées",
    woCreated: "Bons de travail ouverts", woOpen: "Ouverts maintenant", newClients: "Nouveaux clients", subtotal: "Sous-total", tax: "Taxes perçues", total: "Total",
    average: "Facture moyenne", completed: "Terminés", avgDays: "Jours moyens pour terminer", quotes: "Soumissions créées", approvalRate: "Taux d'approbation",
    quoteValue: "Soumissions envoyées (valeur)", quoteAccepted: "Soumissions acceptées (valeur)", active: "Clients actifs", returning: "Clients récurrents",
    retention: "Fidélisation", parts: "Pièces actives", low: "Stock bas", stockValue: "Valeur du stock (coût)", consumed: "Unités utilisées",
  },
  table: {
    period: "Période", count: "Factures", amount: "Montant", method: "Mode de paiement", type: "Type d'article", item: "Article", qty: "Qté", invoice: "Facture",
    customer: "Client", issued: "Émise", due: "Échéance", late: "Jours de retard", status: "Statut", name: "Nom", onHand: "En stock", threshold: "Seuil de commande",
    bucket: "Âge", sales: "Ventes", byMethod: "Par mode de paiement", byType: "Main-d'œuvre / pièces / autre", top: "Articles principaux", aging: "Âge des comptes à recevoir",
    oldest: "Plus anciennes factures impayées", wo: "Bons de travail", quotes: "Soumissions", topCustomers: "Meilleurs clients", lowStock: "Stock bas", seriesTitle: "Ventes dans le temps",
  },
  aging: { current: "Non échu", d1_30: "1–30 jours", d31_60: "31–60 jours", d61_90: "61–90 jours", d90plus: "90+ jours" },
  itemTypes: { LABOUR: "Main-d'œuvre", PART: "Pièces", OTHER: "Autre" },
  methods: { CARD: "Carte", CASH: "Comptant", MIXED: "Mixte", ETRANSFER: "Virement Interac", CHEQUE: "Chèque", OTHER: "Autre" },
  statuses: {
    OPEN: "Ouvert", AWAITING_APPROVAL: "En attente d'approbation", APPROVED: "Approuvé", IN_PROGRESS: "En cours", COMPLETED: "Terminé",
    INVOICED: "Facturé", CANCELLED: "Annulé", DRAFT: "Brouillon", SENT: "Envoyée", ACCEPTED: "Acceptée", REJECTED: "Refusée", EXPIRED: "Expirée", CONVERTED: "Convertie",
  },
  notes: {
    aro: "Facture moyenne = revenus encaissés ÷ factures payées dans la période (taxes incluses).",
    days: "Les jours se mesurent de l'ouverture à la dernière mise à jour des bons terminés ou facturés.",
    basis: "Les revenus sont comptés à la date où la facture a été marquée payée.",
    retention: "Récurrent = client ayant payé dans la période et ayant déjà une facture payée avant.",
  },
  empty: "Rien dans cette période.",
};

export const REPORTS_DICT: Record<AdminLocale, ReportsDictionary> = { en, fr, es: en };
