// Textos del Customer Portal (EN/FR — el idioma sale del Client.language; ES cae a EN, como el resto de las
// páginas públicas al cliente). Todo el contenido visible del portal pasa por aquí.
export type PortalLang = "en" | "fr";

export function resolvePortalLang(language: string | null | undefined): PortalLang {
  return language === "FR" ? "fr" : "en";
}

export interface PortalStrings {
  metaTitle: string;
  greeting: (name: string) => string;
  intro: string;
  sections: {
    inShop: string; appointments: string; vehicles: string; estimates: string; invoices: string;
    inspections: string; reminders: string; history: string;
  };
  empty: {
    appointments: string; vehicles: string; estimates: string; invoices: string; inspections: string; reminders: string; history: string;
  };
  book: string;
  bookHint: string;
  callShop: string;
  upcoming: string;
  recent: string;
  manageAppointment: string;
  viewHistory: string;
  back: string;
  reviewEstimate: string;
  estimateStatus: Record<string, string>;
  expires: (date: string) => string;
  invoiceStatus: Record<string, string>;
  dueOn: (date: string) => string;
  paidOn: (date: string) => string;
  viewInvoice: string;
  downloadPdf: string;
  viewReport: string;
  jobStatus: Record<string, string>;
  workOrderStatus: Record<string, string>;
  orderNumber: (n: string) => string;
  dueService: (date: string | null, km: number | null) => string;
  invoice: {
    title: (n: string) => string; issued: string; total: string; subtotal: string; taxes: string; refunded: string; payments: string;
    method: Record<string, string>; noPayments: string; lines: string; qty: string;
  };
  linkExpired: { title: string; body: string; request: string };
  request: { title: string; intro: string; email: string; submit: string; sent: string; sentBody: string; back: string };
  footer: string;
  privacy: string;
}

const en: PortalStrings = {
  metaTitle: "Customer portal",
  greeting: (n) => `Hello ${n}`,
  intro: "Your vehicles, appointments, estimates and invoices in one place.",
  sections: {
    inShop: "In the shop now", appointments: "Appointments", vehicles: "Your vehicles", estimates: "Estimates",
    invoices: "Invoices", inspections: "Inspection reports", reminders: "Service reminders", history: "Service history",
  },
  empty: {
    appointments: "No upcoming appointments.", vehicles: "No vehicles on file yet.", estimates: "No estimates.", invoices: "No invoices yet.",
    inspections: "No inspection reports have been shared with you.", reminders: "You're all caught up.", history: "No service history yet.",
  },
  book: "Book an appointment",
  bookHint: "Pick a time that works for you.",
  callShop: "Questions? Contact the shop",
  upcoming: "Upcoming",
  recent: "Recent",
  manageAppointment: "Reschedule or cancel",
  viewHistory: "Service history",
  back: "Back",
  reviewEstimate: "Review & respond",
  estimateStatus: { SENT: "Awaiting your answer", ACCEPTED: "Approved", REJECTED: "Declined", EXPIRED: "Expired", CONVERTED: "Approved & invoiced" },
  expires: (d) => `Valid until ${d}`,
  invoiceStatus: { DRAFT: "Issued", SENT: "Unpaid", OVERDUE: "Overdue", PAID: "Paid" },
  dueOn: (d) => `Due ${d}`,
  paidOn: (d) => `Paid ${d}`,
  viewInvoice: "View invoice",
  downloadPdf: "Download PDF",
  viewReport: "View report",
  jobStatus: {
    CHECKED_IN: "Checked in", WAITING_APPROVAL: "Waiting for your approval", WAITING_PARTS: "Waiting for parts", IN_SERVICE: "In service",
    READY_FOR_PICKUP: "Ready for pickup", COMPLETED: "Completed",
  },
  workOrderStatus: { OPEN: "Open", AWAITING_APPROVAL: "Awaiting approval", APPROVED: "Approved", IN_PROGRESS: "In progress", COMPLETED: "Completed", INVOICED: "Completed" },
  orderNumber: (n) => `Work order ${n}`,
  dueService: (d, km) => [d ? `Due ${d}` : null, km ? `at ${km.toLocaleString("en-CA")}` : null].filter(Boolean).join(" · ") || "Due soon",
  invoice: {
    title: (n) => `Invoice ${n}`, issued: "Issued", total: "Total", subtotal: "Subtotal", taxes: "Taxes", refunded: "Refunded", payments: "Payments",
    method: { CARD: "Card", CASH: "Cash", ETRANSFER: "Interac e-Transfer", CHEQUE: "Cheque", OTHER: "Other" }, noPayments: "No payment recorded yet.", lines: "Services and parts", qty: "Qty",
  },
  linkExpired: { title: "This link is no longer valid", body: "For your security, portal links expire or can be replaced. Request a new one and we'll email it to the address we have on file.", request: "Email me a new link" },
  request: {
    title: "Customer portal", intro: "Enter the email address the shop has on file and we'll send you a secure link to your vehicles, estimates and invoices.",
    email: "Email address", submit: "Email me my link", sent: "Check your inbox", sentBody: "If that address matches a customer of this shop, a secure link is on its way. It may take a minute to arrive.", back: "Back",
  },
  footer: "Secure customer portal · Powered by GarageOS",
  privacy: "This link is personal. Don't share it.",
};

const fr: PortalStrings = {
  metaTitle: "Portail client",
  greeting: (n) => `Bonjour ${n}`,
  intro: "Vos véhicules, rendez-vous, devis et factures au même endroit.",
  sections: {
    inShop: "Actuellement à l'atelier", appointments: "Rendez-vous", vehicles: "Vos véhicules", estimates: "Devis",
    invoices: "Factures", inspections: "Rapports d'inspection", reminders: "Rappels d'entretien", history: "Historique d'entretien",
  },
  empty: {
    appointments: "Aucun rendez-vous à venir.", vehicles: "Aucun véhicule au dossier pour l'instant.", estimates: "Aucun devis.", invoices: "Aucune facture pour l'instant.",
    inspections: "Aucun rapport d'inspection ne vous a été partagé.", reminders: "Tout est à jour.", history: "Aucun historique d'entretien pour l'instant.",
  },
  book: "Prendre rendez-vous",
  bookHint: "Choisissez le moment qui vous convient.",
  callShop: "Une question? Communiquez avec l'atelier",
  upcoming: "À venir",
  recent: "Récents",
  manageAppointment: "Modifier ou annuler",
  viewHistory: "Historique d'entretien",
  back: "Retour",
  reviewEstimate: "Consulter et répondre",
  estimateStatus: { SENT: "En attente de votre réponse", ACCEPTED: "Approuvé", REJECTED: "Refusé", EXPIRED: "Expiré", CONVERTED: "Approuvé et facturé" },
  expires: (d) => `Valide jusqu'au ${d}`,
  invoiceStatus: { DRAFT: "Émise", SENT: "À payer", OVERDUE: "En retard", PAID: "Payée" },
  dueOn: (d) => `Échéance : ${d}`,
  paidOn: (d) => `Payée le ${d}`,
  viewInvoice: "Voir la facture",
  downloadPdf: "Télécharger le PDF",
  viewReport: "Voir le rapport",
  jobStatus: {
    CHECKED_IN: "Véhicule reçu", WAITING_APPROVAL: "En attente de votre approbation", WAITING_PARTS: "En attente de pièces", IN_SERVICE: "En cours de réparation",
    READY_FOR_PICKUP: "Prêt à récupérer", COMPLETED: "Terminé",
  },
  workOrderStatus: { OPEN: "Ouvert", AWAITING_APPROVAL: "En attente d'approbation", APPROVED: "Approuvé", IN_PROGRESS: "En cours", COMPLETED: "Terminé", INVOICED: "Terminé" },
  orderNumber: (n) => `Ordre de travail ${n}`,
  dueService: (d, km) => [d ? `Échéance : ${d}` : null, km ? `à ${km.toLocaleString("fr-CA")}` : null].filter(Boolean).join(" · ") || "Bientôt dû",
  invoice: {
    title: (n) => `Facture ${n}`, issued: "Émise le", total: "Total", subtotal: "Sous-total", taxes: "Taxes", refunded: "Remboursé", payments: "Paiements",
    method: { CARD: "Carte", CASH: "Comptant", ETRANSFER: "Virement Interac", CHEQUE: "Chèque", OTHER: "Autre" }, noPayments: "Aucun paiement enregistré pour l'instant.", lines: "Services et pièces", qty: "Qté",
  },
  linkExpired: { title: "Ce lien n'est plus valide", body: "Pour votre sécurité, les liens du portail expirent ou peuvent être remplacés. Demandez-en un nouveau et nous l'enverrons à l'adresse courriel au dossier.", request: "M'envoyer un nouveau lien" },
  request: {
    title: "Portail client", intro: "Entrez l'adresse courriel que l'atelier a au dossier et nous vous enverrons un lien sécurisé vers vos véhicules, devis et factures.",
    email: "Adresse courriel", submit: "M'envoyer mon lien", sent: "Vérifiez votre boîte de réception", sentBody: "Si cette adresse correspond à un client de cet atelier, un lien sécurisé est en route. Cela peut prendre une minute.", back: "Retour",
  },
  footer: "Portail client sécurisé · Propulsé par GarageOS",
  privacy: "Ce lien est personnel. Ne le partagez pas.",
};

export const PORTAL_STRINGS: Record<PortalLang, PortalStrings> = { en, fr };

export function formatPortalDate(date: Date | string, lang: PortalLang, timeZone?: string): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone }).format(new Date(date));
}

export function formatPortalDateTime(date: Date | string, lang: PortalLang, timeZone?: string): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
  }).format(new Date(date));
}

export function formatPortalMoney(amount: number | string, lang: PortalLang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" }).format(Number(amount));
}
