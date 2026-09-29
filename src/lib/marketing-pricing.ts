import type { MarketingLocale } from "@/lib/marketing-locale";
import { PLANS } from "@/config/entitlements";
import { PLAN_CARDS, PLAN_NAMES, PLAN_PRICES, PRICING_PAGE_COPY, TRIAL_DAYS } from "@/lib/marketing-plans";

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
  compare: string;
  plans: MarketingPlan[];
  multiShop: {
    title: string;
    description: string;
  };
};

const CTA: Record<MarketingLocale, string> = {
  en: `Start ${TRIAL_DAYS}-day free trial`,
  fr: `Essai gratuit de ${TRIAL_DAYS} jours`,
};

const plansFor = (locale: MarketingLocale): MarketingPlan[] =>
  PLANS.map((plan) => {
    const card = PLAN_CARDS.find((c) => c.plan === plan)!;
    return {
      name: PLAN_NAMES[plan],
      tagline: card.tagline[locale],
      monthlyPrice: PLAN_PRICES[plan].monthly,
      yearlyPrice: PLAN_PRICES[plan].yearly,
      features: card.features[locale],
      cta: CTA[locale],
    };
  });

/** Precios y funciones salen de src/config/entitlements.ts + src/lib/marketing-plans.ts (fuente única). */
export const MARKETING_PRICING: Record<MarketingLocale, MarketingPricingCopy> = {
  en: {
    eyebrow: "Simple pricing",
    heading: "A complete shop system, without enterprise pricing.",
    subheading: `Start with a ${TRIAL_DAYS}-day free trial. Choose the level of automation and control your shop needs — $0 today, with no limits on core shop transactions.`,
    monthly: "Monthly",
    yearly: "Yearly",
    annualBadge: "2 months free",
    perMonth: "/ month",
    perYear: "/ year",
    mostPopular: "Most Popular",
    currencyNote: "All prices in CAD, plus applicable taxes.",
    annualNote: "Annual plans are billed upfront and priced at 10 months for 12 months of service.",
    compare: "Compare all features",
    plans: plansFor("en"),
    multiShop: { title: PRICING_PAGE_COPY.en.multiShopTitle, description: PRICING_PAGE_COPY.en.multiShopBody },
  },
  fr: {
    eyebrow: "Tarification simple",
    heading: "Un système complet pour l’atelier, sans tarification d’entreprise.",
    subheading: `Commencez avec un essai gratuit de ${TRIAL_DAYS} jours. Choisissez le niveau d’automatisation et de contrôle dont votre atelier a besoin — 0 $ aujourd’hui, sans limite sur les opérations de base.`,
    monthly: "Mensuel",
    yearly: "Annuel",
    annualBadge: "2 mois gratuits",
    perMonth: "/ mois",
    perYear: "/ année",
    mostPopular: "Le plus populaire",
    currencyNote: "Tous les prix sont en CAD, plus les taxes applicables.",
    annualNote: "Les forfaits annuels sont facturés à l’avance au prix de 10 mois pour 12 mois de service.",
    compare: "Comparer toutes les fonctionnalités",
    plans: plansFor("fr"),
    multiShop: { title: PRICING_PAGE_COPY.fr.multiShopTitle, description: PRICING_PAGE_COPY.fr.multiShopBody },
  },
};
