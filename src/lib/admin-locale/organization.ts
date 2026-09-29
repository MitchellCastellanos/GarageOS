import type { AdminLocale } from "@/lib/admin-locale";

export interface OrganizationDictionary {
  title: string;
  subtitle: string;
  upgradeTitle: string;
  upgradeDescription: string;
  notAdmin: string;
  noOrgTitle: string;
  noOrgBody: string;
  createFirst: string;
  activeBadge: string;
  mainBadge: string;
  switchTo: string;
  switching: string;
  openWo: string;
  customers: string;
  team: string;
  locationsHeading: string;
  additionalLocations: (n: number) => string;
  billingNote: string;
  reportsCta: string;
  compareCta: string;
  manageAccess: string;
  addLocation: string;
  namePlaceholder: string;
  adding: string;
  errorGeneric: string;
  isolation: string;
}

const en: OrganizationDictionary = {
  title: "Organization",
  subtitle: "One business, several shops: see every location you manage, switch between them and compare results. Each location keeps its own customers, work orders, invoices and inventory.",
  upgradeTitle: "Multi-Shop is included in Complete",
  upgradeDescription: "Add locations, switch between them, and see consolidated reports and a location comparison.",
  notAdmin: "Only the organization administrator (the owner of the main location) can manage the organization.",
  noOrgTitle: "Add your first additional location",
  noOrgBody: "Your current shop stays as the main location. New locations get their own customers, work orders, invoices and inventory, share your plan and appear in consolidated reports.",
  createFirst: "Create organization and location",
  activeBadge: "Active now",
  mainBadge: "Main location",
  switchTo: "Switch to this location",
  switching: "Switching…",
  openWo: "Open work orders",
  customers: "Customers",
  team: "Team members",
  locationsHeading: "Locations",
  additionalLocations: (n) => `${n} additional ${n === 1 ? "location" : "locations"} besides the main one`,
  billingNote: "Additional-location pricing is handled with your GarageOS plan; nothing is charged automatically for extra locations.",
  reportsCta: "Consolidated reports",
  compareCta: "Compare locations",
  manageAccess: "Manage team access",
  addLocation: "Add location",
  namePlaceholder: "Location name (e.g. Downtown Shop)",
  adding: "Adding…",
  errorGeneric: "We couldn't complete that action. Please try again.",
  isolation: "Locations are isolated: staff only see the locations they've been given access to.",
};

const fr: OrganizationDictionary = {
  title: "Organisation",
  subtitle: "Une entreprise, plusieurs ateliers : consultez tous vos emplacements, passez de l'un à l'autre et comparez les résultats. Chaque emplacement garde ses propres clients, bons de travail, factures et inventaire.",
  upgradeTitle: "Multi-atelier est inclus dans Complete",
  upgradeDescription: "Ajoutez des emplacements, passez de l'un à l'autre et consultez des rapports consolidés et une comparaison entre emplacements.",
  notAdmin: "Seul l'administrateur de l'organisation (le propriétaire de l'emplacement principal) peut gérer l'organisation.",
  noOrgTitle: "Ajoutez votre premier emplacement supplémentaire",
  noOrgBody: "Votre atelier actuel reste l'emplacement principal. Chaque nouvel emplacement a ses propres clients, bons de travail, factures et inventaire, partage votre forfait et apparaît dans les rapports consolidés.",
  createFirst: "Créer l'organisation et l'emplacement",
  activeBadge: "Actif maintenant",
  mainBadge: "Emplacement principal",
  switchTo: "Passer à cet emplacement",
  switching: "Changement…",
  openWo: "Bons de travail ouverts",
  customers: "Clients",
  team: "Membres de l'équipe",
  locationsHeading: "Emplacements",
  additionalLocations: (n) => `${n} emplacement${n === 1 ? "" : "s"} supplémentaire${n === 1 ? "" : "s"} en plus de l'emplacement principal`,
  billingNote: "La tarification des emplacements supplémentaires est traitée avec votre forfait GarageOS; rien n'est facturé automatiquement pour des emplacements additionnels.",
  reportsCta: "Rapports consolidés",
  compareCta: "Comparer les emplacements",
  manageAccess: "Gérer les accès de l'équipe",
  addLocation: "Ajouter un emplacement",
  namePlaceholder: "Nom de l'emplacement (p. ex. Atelier Centre-ville)",
  adding: "Ajout…",
  errorGeneric: "Nous n'avons pas pu effectuer cette action. Veuillez réessayer.",
  isolation: "Les emplacements sont isolés : le personnel ne voit que les emplacements auxquels il a accès.",
};

export const ORGANIZATION_DICT: Record<AdminLocale, OrganizationDictionary> = { en, fr, es: en };
