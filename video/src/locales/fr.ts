import type { LocaleCopy } from "./types";

// Français québécois.
export const fr: LocaleCopy = {
  locale: "fr",
  hook: {
    headline: "Gérer un garage ne devrait pas être compliqué.",
    areas: ["Rendez-vous", "Soumissions", "Bons de travail", "Factures", "Clients"],
    tag: "Un seul système connecté",
  },
  booking: {
    headline: "Des rendez-vous organisés. Des clients connectés.",
    steps: ["Horaire du jour", "Agenda du jour", "Réservation en ligne"],
    mobileLabel: "Sur le téléphone du client",
  },
  inspection: {
    headline: "Montrez clairement les travaux à effectuer.",
    steps: ["Inspection numérique", "Rapport du client", "Éditeur de soumission", "Soumission du client"],
  },
  work: {
    headline: "Du bon de travail à la facture.",
    steps: ["Bon de travail", "Facture à votre image", "Courriel de facture", "Paiement consigné"],
  },
  retention: {
    headline: "Gardez le contact avec vos clients.",
    steps: ["Portail client", "Rappels d’entretien", "Éditeur de campagne"],
  },
  closing: {
    headline: "Tout votre garage. Un seul système connecté.",
    cta: "Réservez votre démo personnalisée.",
    website: "garage-os.ca",
    sampleNote: "Écrans présentés : Garage Laurent, un atelier fictif.",
  },
  provenance: {
    sampleShop: "Atelier fictif · Garage Laurent",
    anotherVisit: "Un autre exemple de visite",
    sampleVisits: "Exemples de visites",
  },
  teaser: {
    hook: { headline: "Gérer un garage ne devrait pas être compliqué." },
    booking: { headline: "Des rendez-vous organisés.", sub: "Réservation en ligne." },
    inspection: { headline: "Des inspections et soumissions claires." },
    invoice: { headline: "Du bon de travail à la facture." },
    closing: { headline: "Tout votre garage. Un seul système connecté.", sub: "Réservez votre démo personnalisée." },
  },
  narration: {
    hook: "Gérer un garage, c’est déjà assez compliqué. Votre logiciel devrait vous simplifier la vie.",
    booking: "Organisez vos rendez-vous et permettez à vos clients de réserver facilement en ligne.",
    inspection: "Présentez des inspections claires et des soumissions professionnelles faciles à comprendre.",
    work: "Gérez vos bons de travail, créez des factures à votre image et suivez vos paiements au même endroit.",
    retention: "Gardez le contact avec vos clients grâce aux rappels d’entretien et aux communications de suivi.",
    closing: "GarageOS. Tout votre garage, connecté.",
  },
  teaserNarration: {
    hook: "Gérer un garage, c’est déjà compliqué.",
    booking: "Organisez vos rendez-vous, réservez en ligne.",
    inspection: "Inspections et soumissions claires.",
    invoice: "Facturez au même endroit.",
    closing: "GarageOS. Tout votre garage, connecté.",
  },
};
