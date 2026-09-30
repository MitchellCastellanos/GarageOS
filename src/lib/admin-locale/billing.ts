import type { AdminLocale } from "@/lib/admin-locale";
import type { Plan } from "@/config/entitlements";

export interface BillingDictionary {
  banners: {
    checkoutSuccess: string;
    checkoutCancelled: string;
  };
  currentPlan: {
    label: string;
    manageBilling: string;
    trialUntil: (date: string) => string;
    trialExpired: string;
    renewsOn: (date: string) => string;
    cancelsOn: (date: string) => string;
  };
  status: {
    noPlan: string;
    setupRequired: string;
    trialLeft: (days: number) => string;
    trialEnds: (date: string) => string;
    firstCharge: (date: string, amount: string, per: string) => string;
    noCard: (plan: string, date: string) => string;
    nextPayment: (date: string, amount: string, per: string) => string;
    cancelsOn: (date: string) => string;
    pastDue: string;
    restricted: string;
    restrictedNoPlan: string;
    managePortal: string;
    updatePayment: string;
    portalChangeHint: string;
    cancelSubscription: string;
    cancelConfirm: (date: string) => string;
    keepSubscription: string;
    reactivateTitle: string;
    chooseTitle: string;
  };
  summary: {
    todayLabel: string;
    dueLabel: (date: string) => string;
    plusTax: string;
    autoBilling: (date: string) => string;
    noTrialToday: string;
    noTrialNote: string;
    trialBadge: (days: number) => string;
    securePayment: string;
  };
  cta: {
    startTrial: (plan: string) => string;
    subscribeNow: (plan: string) => string;
    redirecting: string;
  };
  statusLabel: Record<"AWAITING_PLAN" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "INCOMPLETE" | "NONE", string>;
  interval: { monthly: string; yearly: string };
  mostPopular: string;
  perMonth: string;
  perYear: string;
  features: Record<Plan, string[]>;
  currentPlanButton: string;
  choosePlan: (planLabel: string) => string;
  errors: {
    invalidPlanOrInterval: string;
    noActiveSubscription: string;
    checkoutGeneric: string;
    portalGeneric: string;
    cancelGeneric: string;
    resumeGeneric: string;
    checkoutNoUrl: string;
    alreadySubscribed: string;
  };
}

export const BILLING_DICT: Record<AdminLocale, BillingDictionary> = {
  es: {
    banners: {
      checkoutSuccess: "Método de pago guardado — tu suscripción se está activando.",
      checkoutCancelled: "Checkout cancelado — no se hizo ningún cambio a tu plan.",
    },
    currentPlan: {
      label: "Plan actual",
      manageBilling: "Administrar facturación",
      trialUntil: (date) => `Prueba gratuita hasta el ${date}`,
      trialExpired: "Tu prueba gratuita terminó — elige un plan abajo para seguir con esas funciones.",
      renewsOn: (date) => `Próximo cobro el ${date}`,
      cancelsOn: (date) => `Se cancela el ${date}`,
    },
    status: {
      noPlan: "Sin plan",
      setupRequired: "Todavía no has elegido un plan.",
      trialLeft: (d) => `${d} ${d === 1 ? "día restante" : "días restantes"} de prueba gratuita`,
      trialEnds: (date) => `La prueba termina el ${date}`,
      firstCharge: (date, amount, per) => `Primer cobro el ${date}: ${amount} CAD/${per} + impuestos`,
      noCard: (plan, date) => `Sin método de pago — agrégalo antes del ${date} para conservar ${plan}`,
      nextPayment: (date, amount, per) => `Próximo pago el ${date}: ${amount} CAD/${per} + impuestos`,
      cancelsOn: (date) => `Se cancela el ${date}`,
      pastDue: "No pudimos cobrar tu suscripción. Actualiza tu método de pago — Stripe reintentará el cobro automáticamente.",
      restricted: "Cuenta en solo lectura: puedes ver y exportar tus datos, pero no editar hasta reactivar tu suscripción.",
      restrictedNoPlan: "No hay una suscripción activa. Elige un plan para volver a editar — tus datos siguen intactos.",
      managePortal: "Administrar facturación",
      updatePayment: "Actualizar método de pago",
      portalChangeHint: "Usa el portal de facturación para tu método de pago, tus facturas y tus datos de facturación.",
      cancelSubscription: "Cancelar suscripción",
      cancelConfirm: (date) => `Tu suscripción seguirá activa hasta el ${date} y luego se cancelará. ¿Confirmas?`,
      keepSubscription: "Mantener mi suscripción",
      reactivateTitle: "Reactivar tu cuenta",
      chooseTitle: "Elige tu plan",
    },
    summary: {
      todayLabel: "Hoy",
      dueLabel: (date) => `El ${date}`,
      plusTax: "+ impuestos aplicables",
      autoBilling: (date) => `La facturación empieza automáticamente el ${date}, salvo que canceles antes.`,
      noTrialToday: "Hoy se cobra",
      noTrialNote: "Como ya tuviste una prueba o suscripción, el cobro empieza hoy.",
      trialBadge: (d) => `${d} días gratis`,
      securePayment: "El método de pago lo captura Stripe de forma segura — GarageOS nunca ve ni guarda tu tarjeta.",
    },
    cta: {
      startTrial: (plan) => `Iniciar prueba gratuita de 14 días — ${plan}`,
      subscribeNow: (plan) => `Suscribirme a ${plan}`,
      redirecting: "Redirigiendo a Stripe…",
    },
    statusLabel: {
      AWAITING_PLAN: "Sin plan elegido",
      TRIALING: "En prueba",
      ACTIVE: "Activa",
      PAST_DUE: "Pago pendiente",
      CANCELED: "Cancelada",
      UNPAID: "Sin pagar",
      INCOMPLETE: "Incompleta",
      NONE: "Sin suscripción",
    },
    interval: { monthly: "Mensual", yearly: "Anual (2 meses gratis)" },
    mostPopular: "Más popular",
    perMonth: "/ mes",
    perYear: "/ año",
    features: {
      CORE: [
        "Hasta 3 usuarios · 1 ubicación",
        "Citas, clientes, cotizaciones, órdenes y facturas",
        "DVI básica, recordatorios y portal de cliente",
        "Página de reservas con tu logo, color y fotos",
      ],
      PRO: [
        "Usuarios ilimitados · 1 ubicación",
        "Inventario, campañas y DVI completa",
        "Dominio propio, identidad de envío y reportes avanzados",
        "Personalización avanzada de la página de reservas",
      ],
      COMPLETE: [
        "Todo lo de Pro",
        "Multi-sucursal y administración centralizada",
        "Migración estándar y soporte prioritario",
      ],
    },
    currentPlanButton: "Plan actual",
    choosePlan: (planLabel) => `Elegir ${planLabel}`,
    errors: {
      invalidPlanOrInterval: "Plan o intervalo inválido",
      noActiveSubscription: "Este taller todavía no tiene una suscripción de Stripe activa",
      checkoutGeneric: "Error al iniciar el checkout",
      portalGeneric: "Error al abrir el portal de facturación",
      cancelGeneric: "No se pudo cancelar la suscripción — intenta de nuevo",
      resumeGeneric: "No se pudo mantener la suscripción — intenta de nuevo",
      checkoutNoUrl: "Stripe no devolvió una URL de checkout",
      alreadySubscribed: "Ya tienes una suscripción activa — cámbiala desde el portal de facturación.",
    },
  },
  en: {
    banners: {
      checkoutSuccess: "Payment method saved — your subscription is being activated.",
      checkoutCancelled: "Checkout cancelled — no changes were made to your plan.",
    },
    currentPlan: {
      label: "Current plan",
      manageBilling: "Manage billing",
      trialUntil: (date) => `Free trial until ${date}`,
      trialExpired: "Your free trial has ended — pick a plan below to keep those features.",
      renewsOn: (date) => `Next charge on ${date}`,
      cancelsOn: (date) => `Cancels on ${date}`,
    },
    status: {
      noPlan: "No plan",
      setupRequired: "You haven't chosen a plan yet.",
      trialLeft: (d) => `${d} ${d === 1 ? "day" : "days"} left in your free trial`,
      trialEnds: (date) => `Trial ends on ${date}`,
      firstCharge: (date, amount, per) => `First charge on ${date}: ${amount} CAD/${per} + tax`,
      noCard: (plan, date) => `No payment method — add one before ${date} to keep ${plan}`,
      nextPayment: (date, amount, per) => `Next payment on ${date}: ${amount} CAD/${per} + tax`,
      cancelsOn: (date) => `Cancels on ${date}`,
      pastDue: "We couldn't charge your subscription. Update your payment method — Stripe will retry automatically.",
      restricted: "Read-only account: you can view and export your data, but not edit until you reactivate your subscription.",
      restrictedNoPlan: "There is no active subscription. Choose a plan to edit again — your data is safe.",
      managePortal: "Manage billing",
      updatePayment: "Update payment method",
      portalChangeHint: "Use the billing portal for your payment method, invoices and billing details.",
      cancelSubscription: "Cancel subscription",
      cancelConfirm: (date) => `Your subscription stays active until ${date} and then ends. Confirm?`,
      keepSubscription: "Keep my subscription",
      reactivateTitle: "Reactivate your account",
      chooseTitle: "Choose your plan",
    },
    summary: {
      todayLabel: "Today",
      dueLabel: (date) => `Due ${date}`,
      plusTax: "+ applicable tax",
      autoBilling: (date) => `Billing starts automatically on ${date} unless you cancel before then.`,
      noTrialToday: "Charged today",
      noTrialNote: "Since you've already had a trial or subscription, billing starts today.",
      trialBadge: (d) => `${d}-day free trial`,
      securePayment: "Your payment method is captured securely by Stripe — GarageOS never sees or stores your card.",
    },
    cta: {
      startTrial: (plan) => `Start 14-day free trial — ${plan}`,
      subscribeNow: (plan) => `Subscribe to ${plan}`,
      redirecting: "Redirecting to Stripe…",
    },
    statusLabel: {
      AWAITING_PLAN: "No plan chosen",
      TRIALING: "Trialing",
      ACTIVE: "Active",
      PAST_DUE: "Past due",
      CANCELED: "Cancelled",
      UNPAID: "Unpaid",
      INCOMPLETE: "Incomplete",
      NONE: "No subscription",
    },
    interval: { monthly: "Monthly", yearly: "Yearly (2 months free)" },
    mostPopular: "Most popular",
    perMonth: "/ month",
    perYear: "/ year",
    features: {
      CORE: [
        "Up to 3 users · 1 location",
        "Appointments, clients, estimates, work orders and invoices",
        "Basic DVI, reminders and customer portal",
        "Booking page with your logo, color and photos",
      ],
      PRO: [
        "Unlimited users · 1 location",
        "Inventory, campaigns and full DVI",
        "Custom domain, sender identity and advanced reports",
        "Advanced booking page customization",
      ],
      COMPLETE: [
        "Everything in Pro",
        "Multi-location and centralized administration",
        "Standard migration and priority support",
      ],
    },
    currentPlanButton: "Current plan",
    choosePlan: (planLabel) => `Choose ${planLabel}`,
    errors: {
      invalidPlanOrInterval: "Invalid plan or interval",
      noActiveSubscription: "This shop doesn't have an active Stripe subscription yet",
      checkoutGeneric: "Error starting checkout",
      portalGeneric: "Error opening the billing portal",
      cancelGeneric: "Could not cancel the subscription — please try again",
      resumeGeneric: "Could not keep the subscription — please try again",
      checkoutNoUrl: "Stripe didn't return a checkout URL",
      alreadySubscribed: "You already have an active subscription — change it from the billing portal.",
    },
  },
  fr: {
    banners: {
      checkoutSuccess: "Mode de paiement enregistré — votre abonnement est en cours d'activation.",
      checkoutCancelled: "Paiement annulé — aucun changement n'a été apporté à votre forfait.",
    },
    currentPlan: {
      label: "Forfait actuel",
      manageBilling: "Gérer la facturation",
      trialUntil: (date) => `Essai gratuit jusqu'au ${date}`,
      trialExpired: "Votre essai gratuit est terminé — choisissez un forfait ci-dessous pour conserver ces fonctions.",
      renewsOn: (date) => `Prochain paiement le ${date}`,
      cancelsOn: (date) => `Se termine le ${date}`,
    },
    status: {
      noPlan: "Aucun forfait",
      setupRequired: "Vous n'avez pas encore choisi de forfait.",
      trialLeft: (d) => `${d} ${d === 1 ? "jour restant" : "jours restants"} dans votre essai gratuit`,
      trialEnds: (date) => `L'essai se termine le ${date}`,
      firstCharge: (date, amount, per) => `Premier prélèvement le ${date} : ${amount} CAD/${per} + taxes`,
      noCard: (plan, date) => `Aucun mode de paiement — ajoutez-en un avant le ${date} pour conserver ${plan}`,
      nextPayment: (date, amount, per) => `Prochain paiement le ${date} : ${amount} CAD/${per} + taxes`,
      cancelsOn: (date) => `Se termine le ${date}`,
      pastDue: "Nous n'avons pas pu prélever votre abonnement. Mettez à jour votre mode de paiement — Stripe réessaiera automatiquement.",
      restricted: "Compte en lecture seule : vous pouvez consulter et exporter vos données, mais pas les modifier avant de réactiver votre abonnement.",
      restrictedNoPlan: "Aucun abonnement actif. Choisissez un forfait pour modifier à nouveau — vos données sont conservées.",
      managePortal: "Gérer la facturation",
      updatePayment: "Mettre à jour le mode de paiement",
      portalChangeHint: "Utilisez le portail de facturation pour votre mode de paiement, vos factures et vos coordonnées de facturation.",
      cancelSubscription: "Annuler l'abonnement",
      cancelConfirm: (date) => `Votre abonnement reste actif jusqu'au ${date}, puis prend fin. Confirmer ?`,
      keepSubscription: "Conserver mon abonnement",
      reactivateTitle: "Réactiver votre compte",
      chooseTitle: "Choisissez votre forfait",
    },
    summary: {
      todayLabel: "Aujourd'hui",
      dueLabel: (date) => `Dû le ${date}`,
      plusTax: "+ taxes applicables",
      autoBilling: (date) => `La facturation commence automatiquement le ${date}, sauf annulation avant.`,
      noTrialToday: "Facturé aujourd'hui",
      noTrialNote: "Comme vous avez déjà eu un essai ou un abonnement, la facturation commence aujourd'hui.",
      trialBadge: (d) => `Essai gratuit de ${d} jours`,
      securePayment: "Le mode de paiement est saisi de façon sécurisée par Stripe — GarageOS ne voit ni ne conserve votre carte.",
    },
    cta: {
      startTrial: (plan) => `Commencer l'essai gratuit de 14 jours — ${plan}`,
      subscribeNow: (plan) => `S'abonner à ${plan}`,
      redirecting: "Redirection vers Stripe…",
    },
    statusLabel: {
      AWAITING_PLAN: "Aucun forfait choisi",
      TRIALING: "À l'essai",
      ACTIVE: "Actif",
      PAST_DUE: "Paiement en retard",
      CANCELED: "Annulé",
      UNPAID: "Impayé",
      INCOMPLETE: "Incomplet",
      NONE: "Aucun abonnement",
    },
    interval: { monthly: "Mensuel", yearly: "Annuel (2 mois gratuits)" },
    mostPopular: "Le plus populaire",
    perMonth: "/ mois",
    perYear: "/ an",
    features: {
      CORE: [
        "Jusqu'à 3 utilisateurs · 1 emplacement",
        "Rendez-vous, clients, soumissions, bons de travail et factures",
        "DVI de base, rappels et portail client",
        "Page de réservation avec votre logo, couleur et photos",
      ],
      PRO: [
        "Utilisateurs illimités · 1 emplacement",
        "Inventaire, campagnes et DVI complète",
        "Domaine personnalisé, identité d'envoi et rapports avancés",
        "Personnalisation avancée de la page de réservation",
      ],
      COMPLETE: [
        "Tout ce qui est inclus dans Pro",
        "Multi-emplacements et administration centralisée",
        "Migration standard et support prioritaire",
      ],
    },
    currentPlanButton: "Forfait actuel",
    choosePlan: (planLabel) => `Choisir ${planLabel}`,
    errors: {
      invalidPlanOrInterval: "Forfait ou intervalle invalide",
      noActiveSubscription: "Ce garage n'a pas encore d'abonnement Stripe actif",
      checkoutGeneric: "Erreur lors du démarrage du paiement",
      portalGeneric: "Erreur lors de l'ouverture du portail de facturation",
      cancelGeneric: "Impossible d'annuler l'abonnement — réessayez",
      resumeGeneric: "Impossible de conserver l'abonnement — réessayez",
      checkoutNoUrl: "Stripe n'a pas renvoyé d'URL de paiement",
      alreadySubscribed: "Vous avez déjà un abonnement actif — modifiez-le depuis le portail de facturation.",
    },
  },
};
