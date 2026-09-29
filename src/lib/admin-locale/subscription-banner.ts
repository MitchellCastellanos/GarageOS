import type { AdminLocale } from "@/lib/admin-locale";

export interface SubscriptionBannerDictionary {
  trialEnding: (days: number) => string;
  trialEndsToday: string;
  trialExpired: string;
  pastDue: string;
  cta: string;
}

export const SUBSCRIPTION_BANNER_DICT: Record<AdminLocale, SubscriptionBannerDictionary> = {
  es: {
    trialEnding: (days) => `Tu prueba gratuita de Pro termina en ${days} ${days === 1 ? "día" : "días"}.`,
    trialEndsToday: "Tu prueba gratuita de Pro termina hoy.",
    trialExpired: "Tu prueba de Pro terminó — elige un plan para recuperar esas funciones.",
    pastDue: "No pudimos cobrar tu suscripción — actualiza tu método de pago.",
    cta: "Ver planes",
  },
  en: {
    trialEnding: (days) => `Your free Pro trial ends in ${days} ${days === 1 ? "day" : "days"}.`,
    trialEndsToday: "Your free Pro trial ends today.",
    trialExpired: "Your Pro trial has ended — pick a plan to get those features back.",
    pastDue: "We couldn't charge your subscription — update your payment method.",
    cta: "See plans",
  },
  fr: {
    trialEnding: (days) => `Votre essai gratuit de Pro se termine dans ${days} ${days === 1 ? "jour" : "jours"}.`,
    trialEndsToday: "Votre essai gratuit de Pro se termine aujourd'hui.",
    trialExpired: "Votre essai de Pro est terminé — choisissez un forfait pour retrouver ces fonctions.",
    pastDue: "Nous n'avons pas pu prélever votre abonnement — mettez à jour votre mode de paiement.",
    cta: "Voir les forfaits",
  },
};
