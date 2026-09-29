import type { AdminLocale } from "@/lib/admin-locale";

export interface SubscriptionBannerDictionary {
  /** "13 días restantes en tu prueba de Pro" */
  trialLeft: (days: number, plan: string) => string;
  trialEndsToday: (plan: string) => string;
  /** "Tu plan Pro empieza el 13 de octubre — 299 $ CAD/mes + impuestos." */
  planStarts: (plan: string, date: string, amount: string, interval: "MONTHLY" | "YEARLY") => string;
  /** Prueba heredada sin método de pago. */
  addPaymentMethod: (plan: string, date: string) => string;
  pastDue: (plan: string) => string;
  restricted: string;
  restrictedNoPlan: string;
  cta: string;
  ctaPayment: string;
  ctaFix: string;
}

export const SUBSCRIPTION_BANNER_DICT: Record<AdminLocale, SubscriptionBannerDictionary> = {
  es: {
    trialLeft: (d, plan) => `${d} ${d === 1 ? "día restante" : "días restantes"} en tu prueba de ${plan}.`,
    trialEndsToday: (plan) => `Tu prueba de ${plan} termina hoy.`,
    planStarts: (plan, date, amount, interval) =>
      `Tu plan ${plan} empieza el ${date} — ${amount} CAD/${interval === "YEARLY" ? "año" : "mes"} + impuestos.`,
    addPaymentMethod: (plan, date) => `Agrega un método de pago antes del ${date} para conservar tu plan ${plan}.`,
    pastDue: (plan) => `No pudimos cobrar tu plan ${plan} — actualiza tu método de pago para evitar que tu cuenta pase a solo lectura.`,
    restricted: "Tu cuenta está en modo de solo lectura porque no hay un pago vigente. Reactiva tu suscripción para volver a editar.",
    restrictedNoPlan: "Tu cuenta no tiene una suscripción activa — elige un plan para volver a editar. Tus datos siguen intactos.",
    cta: "Ver facturación",
    ctaPayment: "Agregar método de pago",
    ctaFix: "Reactivar",
  },
  en: {
    trialLeft: (d, plan) => `${d} ${d === 1 ? "day" : "days"} left in your ${plan} trial.`,
    trialEndsToday: (plan) => `Your ${plan} trial ends today.`,
    planStarts: (plan, date, amount, interval) =>
      `Your ${plan} plan starts on ${date} — ${amount} CAD/${interval === "YEARLY" ? "year" : "month"} + tax.`,
    addPaymentMethod: (plan, date) => `Add a payment method before ${date} to keep your ${plan} plan.`,
    pastDue: (plan) => `We couldn't charge your ${plan} plan — update your payment method to keep your account from going read-only.`,
    restricted: "Your account is read-only because there is no active payment. Reactivate your subscription to edit again.",
    restrictedNoPlan: "Your account has no active subscription — choose a plan to edit again. Your data is safe.",
    cta: "View billing",
    ctaPayment: "Add payment method",
    ctaFix: "Reactivate",
  },
  fr: {
    trialLeft: (d, plan) => `${d} ${d === 1 ? "jour restant" : "jours restants"} dans votre essai ${plan}.`,
    trialEndsToday: (plan) => `Votre essai ${plan} se termine aujourd'hui.`,
    planStarts: (plan, date, amount, interval) =>
      `Votre forfait ${plan} commence le ${date} — ${amount} CAD/${interval === "YEARLY" ? "an" : "mois"} + taxes.`,
    addPaymentMethod: (plan, date) => `Ajoutez un mode de paiement avant le ${date} pour conserver votre forfait ${plan}.`,
    pastDue: (plan) => `Nous n'avons pas pu prélever votre forfait ${plan} — mettez à jour votre mode de paiement pour éviter le mode lecture seule.`,
    restricted: "Votre compte est en lecture seule faute de paiement valide. Réactivez votre abonnement pour modifier à nouveau.",
    restrictedNoPlan: "Votre compte n'a pas d'abonnement actif — choisissez un forfait pour modifier à nouveau. Vos données sont conservées.",
    cta: "Voir la facturation",
    ctaPayment: "Ajouter un mode de paiement",
    ctaFix: "Réactiver",
  },
};
