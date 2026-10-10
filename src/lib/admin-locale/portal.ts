import type { AdminLocale } from "@/lib/admin-locale";

export interface PortalAdminDictionary {
  title: string;
  description: string;
  activeLinks: (n: number) => string;
  sendEmail: string;
  sending: string;
  copyLink: string;
  creating: string;
  revoke: string;
  revoking: string;
  noEmail: string;
  sent: (email: string) => string;
  copied: string;
  linkShownOnce: string;
  revoked: (n: number) => string;
  confirmRevoke: string;
  errors: { NOT_FOUND: string; NO_EMAIL: string; SEND_FAILED: string; generic: string };
}

const en: PortalAdminDictionary = {
  title: "Customer portal",
  description: "Give this customer a secure link to their vehicles, service history, estimates and invoices. Links expire after 30 days and can be revoked.",
  activeLinks: (n) => (n === 0 ? "No active links" : `${n} active ${n === 1 ? "link" : "links"}`),
  sendEmail: "Email portal link",
  sending: "Sending…",
  copyLink: "Create link to copy",
  creating: "Creating…",
  revoke: "Revoke all links",
  revoking: "Revoking…",
  noEmail: "Add an email address to this customer to send the link by email.",
  sent: (e) => `Portal link sent to ${e}`,
  copied: "Link copied to clipboard",
  linkShownOnce: "Copy this link now — for security it can't be shown again:",
  revoked: (n) => `${n} ${n === 1 ? "link" : "links"} revoked`,
  confirmRevoke: "Revoke every active portal link for this customer? They'll need a new link to get back in.",
  errors: { NOT_FOUND: "Customer not found.", NO_EMAIL: "This customer has no email address.", SEND_FAILED: "The email could not be sent. Please try again.", generic: "Something went wrong. Please try again." },
};

const fr: PortalAdminDictionary = {
  title: "Portail client",
  description: "Donnez à ce client un lien sécurisé vers ses véhicules, son historique d'entretien, ses devis et ses factures. Les liens expirent après 30 jours et peuvent être révoqués.",
  activeLinks: (n) => (n === 0 ? "Aucun lien actif" : `${n} lien${n === 1 ? "" : "s"} actif${n === 1 ? "" : "s"}`),
  sendEmail: "Envoyer le lien par courriel",
  sending: "Envoi…",
  copyLink: "Créer un lien à copier",
  creating: "Création…",
  revoke: "Révoquer tous les liens",
  revoking: "Révocation…",
  noEmail: "Ajoutez une adresse courriel à ce client pour lui envoyer le lien par courriel.",
  sent: (e) => `Lien du portail envoyé à ${e}`,
  copied: "Lien copié dans le presse-papiers",
  linkShownOnce: "Copiez ce lien maintenant — pour des raisons de sécurité, il ne peut plus être affiché ensuite :",
  revoked: (n) => `${n} lien${n === 1 ? "" : "s"} révoqué${n === 1 ? "" : "s"}`,
  confirmRevoke: "Révoquer tous les liens actifs du portail de ce client? Il aura besoin d'un nouveau lien pour y revenir.",
  errors: { NOT_FOUND: "Client introuvable.", NO_EMAIL: "Ce client n'a pas d'adresse courriel.", SEND_FAILED: "Le courriel n'a pas pu être envoyé. Veuillez réessayer.", generic: "Une erreur est survenue. Veuillez réessayer." },
};

export const PORTAL_ADMIN_DICT: Record<AdminLocale, PortalAdminDictionary> = { en, fr, es: en };
