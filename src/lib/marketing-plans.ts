/**
 * Fuente única de la superficie pública de planes (Block 14): precios, límites y comparación salen de
 * src/config/entitlements.ts — lo que se anuncia = lo que el código hace cumplir. Cada fila de la tabla
 * que depende de una capacidad se DERIVA de `CAPABILITY_MIN_PLAN`; un test (tests/public-surface.test.ts)
 * verifica que ninguna fila contradiga el mapa de entitlements ni el modelo comercial.
 */
import {
  PLANS,
  PLAN_LIMITS,
  PLAN_PRICING_CAD,
  planIncludes,
  type CapabilityKey,
  type Plan,
} from "@/config/entitlements";
import { IMPORT_LIMITS } from "@/domain/import";
import type { MarketingLocale } from "@/lib/marketing-locale";

export type Localized = Record<MarketingLocale, string>;
export type PlanCell = boolean | Localized;

export const TRIAL_DAYS = 14;
export const MOST_POPULAR_PLAN: Plan = "PRO";

export const PLAN_NAMES: Record<Plan, string> = { CORE: "Core", PRO: "Pro", COMPLETE: "Complete" };

export const PLAN_PRICES = PLAN_PRICING_CAD;

// ── Tarjetas de precio ──────────────────────────────────────

export interface PlanCard {
  plan: Plan;
  tagline: Localized;
  features: Record<MarketingLocale, string[]>;
}

const usersLine = (plan: Plan): Localized => {
  const n = PLAN_LIMITS[plan].users;
  return n == null
    ? { en: "Unlimited users", fr: "Utilisateurs illimités" }
    : { en: `Up to ${n} users`, fr: `Jusqu'à ${n} utilisateurs` };
};

export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "CORE",
    tagline: {
      en: "Everything a small independent shop needs to run day to day.",
      fr: "Tout ce qu'il faut à un petit atelier indépendant pour gérer son quotidien.",
    },
    features: {
      en: [
        `${usersLine("CORE").en} · 1 location`,
        "Customers, vehicles, appointments & branded online booking",
        "Estimates with customer approval, Work Orders & job status",
        "Invoices, payments, refunds & GST/QST-ready taxes",
        "Basic inspections (DVI) & vehicle service history",
        "Customer portal, email & two-way SMS",
        "Basic reminders & basic reporting",
        "Self-service data import (CSV / Excel)",
      ],
      fr: [
        `${usersLine("CORE").fr} · 1 emplacement`,
        "Clients, véhicules, rendez-vous et réservation en ligne à votre image",
        "Devis avec approbation du client, ordres de travail et statut des travaux",
        "Factures, paiements, remboursements et taxes TPS/TVQ",
        "Inspections de base (DVI) et historique d'entretien",
        "Portail client, courriel et SMS bidirectionnel",
        "Rappels de base et rapports de base",
        "Importation libre-service des données (CSV / Excel)",
      ],
    },
  },
  {
    plan: "PRO",
    tagline: {
      en: "Run, automate and grow your entire shop.",
      fr: "Gérez, automatisez et faites croître tout votre atelier.",
    },
    features: {
      en: [
        `${usersLine("PRO").en} · 1 location`,
        "Everything in Core",
        "Advanced DVI: photos, reusable templates & shareable customer report",
        "Inventory with automatic use on Work Orders, and tire storage",
        "Automated service reminders & customer campaigns",
        "Advanced reports with CSV export, and Accounting Light",
        "QuickBooks Online sync",
        "Fine-grained team permissions & full data import",
        "Custom domain, sender identity & advanced booking-page design",
        "Larger SMS allowance, assisted onboarding & priority support",
      ],
      fr: [
        `${usersLine("PRO").fr} · 1 emplacement`,
        "Tout ce qui est inclus dans Core",
        "DVI avancé : photos, modèles réutilisables et rapport partageable avec le client",
        "Inventaire avec utilisation automatique dans les ordres de travail, et entreposage de pneus",
        "Rappels d'entretien automatisés et campagnes clients",
        "Rapports avancés avec export CSV et Comptabilité allégée",
        "Synchronisation QuickBooks Online",
        "Permissions d'équipe détaillées et importation complète des données",
        "Domaine personnalisé, identité d'expéditeur et page de réservation avancée",
        "Allocation SMS plus élevée, accompagnement au démarrage et soutien prioritaire",
      ],
    },
  },
  {
    plan: "COMPLETE",
    tagline: {
      en: "Built for multi-location and high-volume operations.",
      fr: "Conçu pour les entreprises multi-emplacements et à volume élevé.",
    },
    features: {
      en: [
        `${usersLine("COMPLETE").en} · Multi-Shop`,
        "Everything in Pro",
        "Multiple locations under one organization, with one-click switching",
        "Centralized administration & per-location team access",
        "Consolidated reporting and location comparison",
        "Largest SMS allowance",
        "Standard data migration included",
        "White-glove onboarding & priority support",
      ],
      fr: [
        `${usersLine("COMPLETE").fr} · Multi-atelier`,
        "Tout ce qui est inclus dans Pro",
        "Plusieurs emplacements sous une même organisation, avec changement en un clic",
        "Administration centralisée et accès d'équipe par emplacement",
        "Rapports consolidés et comparaison entre emplacements",
        "Allocation SMS la plus élevée",
        "Migration de données standard incluse",
        "Accompagnement personnalisé au démarrage et soutien prioritaire",
      ],
    },
  },
];

// ── Comparaison de planes ───────────────────────────────────

export interface ComparisonRow {
  id: string;
  label: Localized;
  /** Fila booleana derivada de `CAPABILITY_MIN_PLAN`: incluida desde el plan mínimo de la capacidad. */
  capability?: CapabilityKey;
  /** Nivel Básico → Avanzado: el texto avanzado aparece desde el plan mínimo de `gate`. */
  tier?: { gate: CapabilityKey; basic: Localized; advanced: Localized };
  /** Valor literal por plan (solo para lo que no es una capacidad gateada). */
  values?: Record<Plan, PlanCell>;
}

export interface ComparisonGroup {
  id: string;
  title: Localized;
  rows: ComparisonRow[];
}

const ALL: Record<Plan, PlanCell> = { CORE: true, PRO: true, COMPLETE: true };
const L = (en: string, fr: string): Localized => ({ en, fr });

export const COMPARISON: ComparisonGroup[] = [
  {
    id: "shop",
    title: L("Run the shop", "Gérer l'atelier"),
    rows: [
      { id: "customers", label: L("Customers, vehicles & service history", "Clients, véhicules et historique d'entretien"), values: ALL },
      { id: "booking", label: L("Appointments & branded online booking page", "Rendez-vous et page de réservation en ligne à votre image"), values: ALL },
      { id: "bookingDesign", label: L("Advanced booking-page design (templates, typography)", "Design avancé de la page de réservation (modèles, typographie)"), capability: "bookingPage.advancedDesign" },
      { id: "estimates", label: L("Estimates with customer approval trail", "Devis avec suivi de l'approbation du client"), values: ALL },
      { id: "workOrders", label: L("Work Orders, job status & Ready for Pickup", "Ordres de travail, statut des travaux et « Prêt à récupérer »"), values: ALL },
      { id: "invoices", label: L("Invoices, payments, refunds & receipts", "Factures, paiements, remboursements et reçus"), values: ALL },
      { id: "taxes", label: L("GST/QST and other Canadian taxes, stored per invoice", "TPS/TVQ et autres taxes canadiennes, conservées sur chaque facture"), values: ALL },
      { id: "portal", label: L("Customer portal (vehicles, estimates, invoices, history)", "Portail client (véhicules, devis, factures, historique)"), values: ALL },
      {
        id: "import",
        label: L("Data import (CSV / Excel)", "Importation des données (CSV / Excel)"),
        tier: {
          gate: "import.full",
          basic: L(`Customers & vehicles · ${IMPORT_LIMITS.basicMaxRows} rows per file`, `Clients et véhicules · ${IMPORT_LIMITS.basicMaxRows} lignes par fichier`),
          advanced: L(`Also inventory · ${IMPORT_LIMITS.fullMaxRows.toLocaleString("en-CA")} rows per file`, `Aussi l'inventaire · ${IMPORT_LIMITS.fullMaxRows.toLocaleString("fr-CA")} lignes par fichier`),
        },
      },
    ],
  },
  {
    id: "workshop",
    title: L("Inspect & work", "Inspecter et travailler"),
    rows: [
      {
        id: "dvi",
        label: L("Digital vehicle inspection (DVI)", "Inspection numérique du véhicule (DVI)"),
        tier: {
          gate: "dvi.photos",
          basic: L("Standard checklist, notes & estimate from findings", "Liste standard, notes et devis à partir des constats"),
          advanced: L("Photos, reusable templates & shareable customer report", "Photos, modèles réutilisables et rapport partageable avec le client"),
        },
      },
      { id: "inventory", label: L("Inventory with automatic use on Work Orders", "Inventaire avec utilisation automatique dans les ordres de travail"), capability: "inventory.manage" },
      { id: "tires", label: L("Tire storage", "Entreposage de pneus"), capability: "tireStorage.manage" },
    ],
  },
  {
    id: "customers",
    title: L("Communicate & retain", "Communiquer et fidéliser"),
    rows: [
      { id: "email", label: L("Branded email to customers", "Courriels à l'image de votre atelier"), values: ALL },
      {
        id: "sms",
        label: L("Two-way SMS on a dedicated number", "SMS bidirectionnel sur un numéro dédié"),
        values: {
          CORE: L("Included allowance", "Allocation incluse"),
          PRO: L("Larger allowance", "Allocation plus élevée"),
          COMPLETE: L("Largest allowance", "Allocation la plus élevée"),
        },
      },
      {
        id: "reminders",
        label: L("Maintenance reminders", "Rappels d'entretien"),
        tier: {
          gate: "reminders.automation",
          basic: L("Manual reminders by vehicle", "Rappels manuels par véhicule"),
          advanced: L("Automated, service-based recurring rules", "Règles récurrentes automatisées selon le service effectué"),
        },
      },
      { id: "campaigns", label: L("Customer campaigns", "Campagnes clients"), capability: "communications.campaigns" },
      { id: "domain", label: L("Custom domain & sender identity", "Domaine personnalisé et identité d'expéditeur"), capability: "branding.customDomain" },
    ],
  },
  {
    id: "finance",
    title: L("Reports & books", "Rapports et comptabilité"),
    rows: [
      {
        id: "reports",
        label: L("Reports", "Rapports"),
        tier: {
          gate: "reports.advanced",
          basic: L("Overview: this month, last month, last 30 days", "Aperçu : ce mois-ci, le mois dernier, 30 derniers jours"),
          advanced: L("Sales, receivables, jobs, customers, inventory · custom ranges · CSV export", "Ventes, comptes à recevoir, travaux, clients, inventaire · périodes libres · export CSV"),
        },
      },
      { id: "accounting", label: L("Accounting Light: sales & tax summaries, ledgers, CSV exports", "Comptabilité allégée : sommaires des ventes et des taxes, journaux, exports CSV"), capability: "accounting.light" },
      { id: "quickbooks", label: L("QuickBooks Online sync (invoices, payments, refunds)", "Synchronisation QuickBooks Online (factures, paiements, remboursements)"), capability: "quickbooks.sync" },
    ],
  },
  {
    id: "team",
    title: L("Team & control", "Équipe et contrôle"),
    rows: [
      {
        id: "users",
        label: L("Users", "Utilisateurs"),
        values: Object.fromEntries(
          PLANS.map((p) => [p, PLAN_LIMITS[p].users == null ? L("Unlimited", "Illimités") : L(String(PLAN_LIMITS[p].users), String(PLAN_LIMITS[p].users))])
        ) as Record<Plan, PlanCell>,
      },
      { id: "roles", label: L("Owner, mechanic & viewer roles", "Rôles propriétaire, mécanicien et lecture seule"), values: ALL },
      { id: "permissions", label: L("Fine-grained permissions per team member", "Permissions détaillées par membre de l'équipe"), capability: "permissions.advanced" },
    ],
  },
  {
    id: "multishop",
    title: L("Multi-Shop", "Multi-atelier"),
    rows: [
      {
        id: "locations",
        label: L("Locations", "Emplacements"),
        values: {
          CORE: L("1", "1"),
          PRO: L("1", "1"),
          COMPLETE: L("Multiple, one organization", "Plusieurs, une seule organisation"),
        },
      },
      { id: "central", label: L("Centralized administration & location switching", "Administration centralisée et changement d'emplacement"), capability: "organization.multiLocation" },
      { id: "consolidated", label: L("Consolidated reporting & location comparison", "Rapports consolidés et comparaison entre emplacements"), capability: "reports.multiLocation" },
    ],
  },
  {
    id: "support",
    title: L("Onboarding & support", "Démarrage et soutien"),
    rows: [
      {
        id: "onboarding",
        label: L("Onboarding", "Démarrage"),
        values: {
          CORE: L("Self-service", "Libre-service"),
          PRO: L("Assisted", "Accompagné"),
          COMPLETE: L("White-glove + standard data migration", "Personnalisé + migration de données standard"),
        },
      },
      {
        id: "support",
        label: L("Support", "Soutien"),
        values: { CORE: L("Standard", "Standard"), PRO: L("Priority", "Prioritaire"), COMPLETE: L("Priority", "Prioritaire") },
      },
    ],
  },
];

/** Valor de una celda para un plan: boolean, o texto localizado. */
export function comparisonCell(row: ComparisonRow, plan: Plan): PlanCell {
  if (row.capability) return planIncludes(plan, row.capability);
  if (row.tier) return planIncludes(plan, row.tier.gate) ? row.tier.advanced : row.tier.basic;
  return row.values![plan];
}

// ── Textos de la página de precios ──────────────────────────

export const TRIAL_COPY: Record<MarketingLocale, { title: string; steps: string[]; note: string }> = {
  en: {
    title: `How the ${TRIAL_DAYS}-day free trial works`,
    steps: [
      "Create your account and choose your plan and billing interval during setup.",
      "Add a payment method — you pay $0 today. Card details are handled by Stripe, never stored by GarageOS.",
      `Use everything in your plan for ${TRIAL_DAYS} days. We show the exact date and amount of your first charge.`,
      "Your subscription starts automatically after the trial. You can cancel from Billing before it ends.",
    ],
    note: "All prices in CAD, plus applicable taxes. Annual plans are billed upfront and priced at 10 months for 12 months of service.",
  },
  fr: {
    title: `Comment fonctionne l'essai gratuit de ${TRIAL_DAYS} jours`,
    steps: [
      "Créez votre compte et choisissez votre forfait et votre fréquence de facturation pendant la configuration.",
      "Ajoutez un mode de paiement — vous payez 0 $ aujourd'hui. Les données de carte sont traitées par Stripe, jamais conservées par GarageOS.",
      `Profitez de tout votre forfait pendant ${TRIAL_DAYS} jours. Nous affichons la date et le montant exacts de votre premier prélèvement.`,
      "Votre abonnement débute automatiquement après l'essai. Vous pouvez annuler depuis la facturation avant sa fin.",
    ],
    note: "Tous les prix sont en CAD, taxes applicables en sus. Les forfaits annuels sont facturés à l'avance au prix de 10 mois pour 12 mois de service.",
  },
};

export const PRICING_PAGE_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string;
  compareTitle: string; compareIntro: string; feature: string; included: string; notIncluded: string;
  multiShopTitle: string; multiShopBody: string; contact: string;
}> = {
  en: {
    meta: { title: "Pricing", description: "GarageOS plans: Core $199, Pro $299 and Complete $449 CAD per month. Start with a 14-day free trial." },
    eyebrow: "Pricing",
    heading: "Pick the plan your shop runs on.",
    description: `Every plan includes the full job workflow — booking to invoice, with a customer portal. Start with a ${TRIAL_DAYS}-day free trial, $0 today.`,
    compareTitle: "Compare plans",
    compareIntro: "Everything below is what each plan includes today.",
    feature: "Feature", included: "Included", notIncluded: "Not included",
    multiShopTitle: "Multi-Shop",
    multiShopBody: "Complete supports multi-location organizations: add locations, switch between them, and see consolidated and per-location reports. Additional-location pricing is confirmed with your plan.",
    contact: "Talk to us about multiple locations",
  },
  fr: {
    meta: { title: "Tarifs", description: "Forfaits GarageOS : Core 199 $, Pro 299 $ et Complete 449 $ CAD par mois. Commencez avec un essai gratuit de 14 jours." },
    eyebrow: "Tarifs",
    heading: "Choisissez le forfait qui convient à votre atelier.",
    description: `Chaque forfait inclut tout le flux de travail — de la réservation à la facture, avec un portail client. Commencez par un essai gratuit de ${TRIAL_DAYS} jours, 0 $ aujourd'hui.`,
    compareTitle: "Comparer les forfaits",
    compareIntro: "Voici ce que chaque forfait inclut aujourd'hui.",
    feature: "Fonctionnalité", included: "Inclus", notIncluded: "Non inclus",
    multiShopTitle: "Multi-atelier",
    multiShopBody: "Complete prend en charge les organisations multi-emplacements : ajoutez des emplacements, passez de l'un à l'autre et consultez des rapports consolidés et par emplacement. La tarification des emplacements supplémentaires est confirmée avec votre forfait.",
    contact: "Parlez-nous de vos emplacements multiples",
  },
};
