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
  statusLabel: Record<"TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "INCOMPLETE" | "NONE", string>;
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
    checkoutNoUrl: string;
  };
}

export const BILLING_DICT: Record<AdminLocale, BillingDictionary> = {
  es: {
    banners: {
      checkoutSuccess: "Pago recibido — tu plan se actualiza en unos segundos.",
      checkoutCancelled: "Checkout cancelado — no se hizo ningún cambio a tu plan.",
    },
    currentPlan: {
      label: "Plan actual",
      manageBilling: "Administrar facturación",
      trialUntil: (date) => `Prueba gratuita hasta el ${date}`,
      trialExpired: "Tu prueba de Pro terminó — elige un plan abajo para seguir con esas funciones.",
      renewsOn: (date) => `Próximo cobro el ${date}`,
      cancelsOn: (date) => `Se cancela el ${date}`,
    },
    statusLabel: {
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
      checkoutNoUrl: "Stripe no devolvió una URL de checkout",
    },
  },
  en: {
    banners: {
      checkoutSuccess: "Payment received — your plan will update in a few seconds.",
      checkoutCancelled: "Checkout cancelled — no changes were made to your plan.",
    },
    currentPlan: {
      label: "Current plan",
      manageBilling: "Manage billing",
      trialUntil: (date) => `Free trial until ${date}`,
      trialExpired: "Your Pro trial has ended — pick a plan below to keep those features.",
      renewsOn: (date) => `Next charge on ${date}`,
      cancelsOn: (date) => `Cancels on ${date}`,
    },
    statusLabel: {
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
      checkoutNoUrl: "Stripe didn't return a checkout URL",
    },
  },
  fr: {
    banners: {
      checkoutSuccess: "Paiement reçu — votre forfait sera mis à jour dans quelques secondes.",
      checkoutCancelled: "Paiement annulé — aucun changement n'a été apporté à votre forfait.",
    },
    currentPlan: {
      label: "Forfait actuel",
      manageBilling: "Gérer la facturation",
      trialUntil: (date) => `Essai gratuit jusqu'au ${date}`,
      trialExpired: "Votre essai Pro est terminé — choisissez un forfait ci-dessous pour conserver ces fonctions.",
      renewsOn: (date) => `Prochain paiement le ${date}`,
      cancelsOn: (date) => `Se termine le ${date}`,
    },
    statusLabel: {
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
      checkoutNoUrl: "Stripe n'a pas renvoyé d'URL de paiement",
    },
  },
};
