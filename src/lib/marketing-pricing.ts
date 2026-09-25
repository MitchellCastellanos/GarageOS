import type { MarketingLocale } from "@/lib/marketing-locale";

export type MarketingPlan = {
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  cta: string;
};

type MarketingPricingCopy = {
  eyebrow: string;
  heading: string;
  subheading: string;
  monthly: string;
  yearly: string;
  annualBadge: string;
  perMonth: string;
  perYear: string;
  mostPopular: string;
  currencyNote: string;
  annualNote: string;
  plans: MarketingPlan[];
  multiShop: {
    title: string;
    description: string;
  };
  founding: {
    eyebrow: string;
    title: string;
    description: string;
    details: string[];
  };
};

export const MARKETING_PRICING: Record<MarketingLocale, MarketingPricingCopy> = {
  en: {
    eyebrow: "Simple pricing",
    heading: "A complete shop system, without enterprise pricing.",
    subheading:
      "Choose the level of automation and control your shop needs. Core transactions stay unlimited — we do not meter customers, vehicles, estimates, work orders, invoices or inspections.",
    monthly: "Monthly",
    yearly: "Yearly",
    annualBadge: "2 months free",
    perMonth: "/ month",
    perYear: "/ year",
    mostPopular: "Most Popular",
    currencyNote: "All prices in CAD, plus applicable taxes.",
    annualNote: "Annual plans are billed upfront and priced at 10 months for 12 months of service.",
    plans: [
      {
        name: "Core",
        tagline: "Everything a small independent shop needs to run day to day.",
        monthlyPrice: 149,
        yearlyPrice: 1490,
        features: [
          "Up to 3 users · 1 location",
          "Customers, vehicles, appointments & online booking",
          "Branded booking page with your logo, color & shop photos",
          "Estimates, approvals, work orders, invoices & payments",
          "Basic DVI, job status & vehicle history",
          "Maintenance reminders & branded email communications",
          "Customer portal when available",
          "Basic dashboard & reporting",
          "$0 self-service setup",
        ],
        cta: "Get Started",
      },
      {
        name: "Pro",
        tagline: "Run, automate and grow your entire shop.",
        monthlyPrice: 249,
        yearlyPrice: 2490,
        features: [
          "Unlimited users · 1 location",
          "Everything in Core",
          "Full DVI with photos, media & reusable templates",
          "Inventory, parts movement & tire storage",
          "SMS notifications, campaigns & advanced reminders",
          "Advanced reports, permissions & accounting tools",
          "QuickBooks Online sync",
          "Custom domain, sender identity & branded shop site",
          "Advanced booking page customization",
          "Assisted onboarding & priority support",
        ],
        cta: "Choose Pro",
      },
      {
        name: "Complete",
        tagline: "Advanced control for high-volume and more complex operations.",
        monthlyPrice: 399,
        yearlyPrice: 3990,
        features: [
          "Unlimited users · 1 location",
          "Everything in Pro",
          "Advanced business analytics & controls",
          "Larger communication allowances",
          "Advanced integrations & API access when available",
          "Standard data migration included",
          "White-glove onboarding",
          "Priority support",
          "Multi-location expansion available",
        ],
        cta: "Choose Complete",
      },
    ],
    multiShop: {
      title: "Multi-Shop",
      description:
        "Complete supports multi-location organizations with centralized administration and consolidated reporting. Additional locations: $199 CAD/month each.",
    },
    founding: {
      eyebrow: "Founding Shops Offer",
      title: "GarageOS Pro for $149 CAD/month for your first 12 months.",
      description:
        "Available to the first 25 founding shops. Your regular Pro price remains clearly established at $249 CAD/month after the introductory period.",
      details: [
        "$0 setup",
        "Assisted onboarding included",
        "Standard data migration included",
        "Founding annual option: $1,490 CAD for the first year",
      ],
    },
  },
  fr: {
    eyebrow: "Tarification simple",
    heading: "Un système complet pour l’atelier, sans tarification d’entreprise.",
    subheading:
      "Choisissez le niveau d’automatisation et de contrôle dont votre atelier a besoin. Les opérations de base restent illimitées — nous ne facturons pas selon le nombre de clients, véhicules, soumissions, ordres de travail, factures ou inspections.",
    monthly: "Mensuel",
    yearly: "Annuel",
    annualBadge: "2 mois gratuits",
    perMonth: "/ mois",
    perYear: "/ année",
    mostPopular: "Le plus populaire",
    currencyNote: "Tous les prix sont en CAD, plus les taxes applicables.",
    annualNote: "Les forfaits annuels sont facturés à l’avance au prix de 10 mois pour 12 mois de service.",
    plans: [
      {
        name: "Core",
        tagline: "Tout ce qu’il faut à un petit atelier indépendant pour gérer ses opérations quotidiennes.",
        monthlyPrice: 149,
        yearlyPrice: 1490,
        features: [
          "Jusqu’à 3 utilisateurs · 1 établissement",
          "Clients, véhicules, rendez-vous et réservation en ligne",
          "Page de réservation à votre image : logo, couleur et photos",
          "Soumissions, approbations, ordres de travail, factures et paiements",
          "DVI de base, statut des travaux et historique du véhicule",
          "Rappels d’entretien et communications courriel à votre image",
          "Portail client lorsqu’il sera disponible",
          "Tableau de bord et rapports de base",
          "Configuration libre-service à 0 $",
        ],
        cta: "Commencer",
      },
      {
        name: "Pro",
        tagline: "Gérez, automatisez et développez tout votre atelier.",
        monthlyPrice: 249,
        yearlyPrice: 2490,
        features: [
          "Utilisateurs illimités · 1 établissement",
          "Tout ce qui est inclus dans Core",
          "DVI complet avec photos, médias et modèles réutilisables",
          "Inventaire, mouvements de pièces et entreposage de pneus",
          "Notifications SMS, campagnes et rappels avancés",
          "Rapports avancés, permissions et outils comptables",
          "Synchronisation QuickBooks Online",
          "Domaine personnalisé, identité d’expéditeur et site d’atelier à votre image",
          "Personnalisation avancée de la page de réservation",
          "Accompagnement au démarrage et soutien prioritaire",
        ],
        cta: "Choisir Pro",
      },
      {
        name: "Complete",
        tagline: "Contrôle avancé pour les opérations à haut volume ou plus complexes.",
        monthlyPrice: 399,
        yearlyPrice: 3990,
        features: [
          "Utilisateurs illimités · 1 établissement",
          "Tout ce qui est inclus dans Pro",
          "Analyses d’affaires et contrôles avancés",
          "Allocations de communication plus élevées",
          "Intégrations avancées et accès API lorsqu’ils seront disponibles",
          "Migration de données standard incluse",
          "Accompagnement personnalisé au démarrage",
          "Soutien prioritaire",
          "Expansion multi-établissements disponible",
        ],
        cta: "Choisir Complete",
      },
    ],
    multiShop: {
      title: "Multi-Shop",
      description:
        "Complete prend en charge les organisations multi-établissements avec administration centralisée et rapports consolidés. Établissements supplémentaires : 199 $ CAD/mois chacun.",
    },
    founding: {
      eyebrow: "Offre ateliers fondateurs",
      title: "GarageOS Pro à 149 $ CAD/mois pendant vos 12 premiers mois.",
      description:
        "Offert aux 25 premiers ateliers fondateurs. Le prix régulier de Pro demeure clairement établi à 249 $ CAD/mois après la période de lancement.",
      details: [
        "Configuration à 0 $",
        "Accompagnement au démarrage inclus",
        "Migration de données standard incluse",
        "Option annuelle fondateur : 1 490 $ CAD pour la première année",
      ],
    },
  },
};
