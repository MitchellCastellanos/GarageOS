import type { AdminLocale } from "@/lib/admin-locale";
import type { Permission } from "@/domain/permissions";

export interface PermissionsDictionary {
  title: string;
  hint: string;
  locked: string;
  save: string;
  saved: string;
  roleDefault: string;
  labels: Partial<Record<Permission, string>>;
}

const en: PermissionsDictionary = {
  title: "Permissions",
  hint: "Fine-tune what this person can do beyond their role. Shop settings, team and billing always stay with owners.",
  locked: "Per-person permissions are included in Pro and Complete. Your plan uses the standard permissions of each role.",
  save: "Save permissions",
  saved: "Permissions saved",
  roleDefault: "role default",
  labels: {
    "ops.write": "Create and edit work (appointments, work orders, estimates, messages)",
    "customers.write": "Create and edit customers and vehicles",
    "invoices.view": "See invoices",
    "invoices.write": "Create, send and edit invoices",
    "payments.write": "Record payments and refunds",
    "inventory.write": "Manage inventory",
    "dvi.write": "Do inspections (photos, templates, reports)",
    "financial.view": "See accounting, cash drawer and revenue",
    "reports.view": "See reports and analytics",
    "campaigns.manage": "Create and send campaigns",
    "import.run": "Import data",
  },
};

const fr: PermissionsDictionary = {
  title: "Permissions",
  hint: "Ajustez ce que cette personne peut faire en plus de son rôle. Les paramètres du commerce, l'équipe et la facturation restent réservés aux propriétaires.",
  locked: "Les permissions par personne sont incluses dans Pro et Complete. Votre forfait utilise les permissions standard de chaque rôle.",
  save: "Enregistrer les permissions",
  saved: "Permissions enregistrées",
  roleDefault: "par défaut du rôle",
  labels: {
    "ops.write": "Créer et modifier le travail (rendez-vous, ordres, estimations, messages)",
    "customers.write": "Créer et modifier clients et véhicules",
    "invoices.view": "Voir les factures",
    "invoices.write": "Créer, envoyer et modifier les factures",
    "payments.write": "Enregistrer paiements et remboursements",
    "inventory.write": "Gérer l'inventaire",
    "dvi.write": "Faire des inspections (photos, modèles, rapports)",
    "financial.view": "Voir la comptabilité, la caisse et les revenus",
    "reports.view": "Voir les rapports et analyses",
    "campaigns.manage": "Créer et envoyer des campagnes",
    "import.run": "Importer des données",
  },
};

export const PERMISSIONS_DICT: Record<AdminLocale, PermissionsDictionary> = { en, fr, es: en };
