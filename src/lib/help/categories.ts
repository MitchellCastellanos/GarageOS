import type { HelpCategory, HelpCategoryId } from "./types";

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: "getting-started",
    slug: { en: "getting-started", fr: "premiers-pas" },
    name: { en: "Getting started", fr: "Premiers pas" },
    description: { en: "Set up your shop, your team and your data.", fr: "Configurez votre atelier, votre équipe et vos données." },
  },
  {
    id: "appointments",
    slug: { en: "appointments", fr: "rendez-vous" },
    name: { en: "Appointments", fr: "Rendez-vous" },
    description: { en: "Online booking and the shop calendar.", fr: "Réservation en ligne et calendrier de l'atelier." },
  },
  {
    id: "client-records",
    slug: { en: "client-records", fr: "dossiers-clients" },
    name: { en: "Client records", fr: "Dossiers clients" },
    description: { en: "Customers, vehicles and service history.", fr: "Clients, véhicules et historique d'entretien." },
  },
  {
    id: "inspect-authorize",
    slug: { en: "inspect-and-authorize", fr: "inspecter-et-faire-approuver" },
    name: { en: "Inspect & authorize", fr: "Inspecter et faire approuver" },
    description: { en: "Digital inspections and customer decisions.", fr: "Inspections numériques et décisions des clients." },
  },
  {
    id: "estimates-invoices",
    slug: { en: "estimates-and-invoices", fr: "devis-et-factures" },
    name: { en: "Estimates & invoices", fr: "Devis et factures" },
    description: { en: "From the estimate to the invoice, and how customer approvals work.", fr: "Du devis à la facture, et fonctionnement des approbations client." },
  },
  {
    id: "run-the-shop",
    slug: { en: "run-the-shop", fr: "gerer-l-atelier" },
    name: { en: "Run the shop", fr: "Gérer l'atelier" },
    description: { en: "Work Orders, inventory and multiple locations.", fr: "Ordres de travail, inventaire et plusieurs emplacements." },
  },
  {
    id: "communicate-retain",
    slug: { en: "communicate-and-retain", fr: "communiquer-et-fideliser" },
    name: { en: "Communicate & retain", fr: "Communiquer et fidéliser" },
    description: { en: "Reminders, the customer portal and branded messages.", fr: "Rappels, portail client et messages à votre image." },
  },
];

export const CATEGORY_BY_ID = new Map<HelpCategoryId, HelpCategory>(HELP_CATEGORIES.map((c) => [c.id, c]));
