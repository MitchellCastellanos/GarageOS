import type { AdminLocale } from "@/lib/admin-locale";

const MONTH_NAMES: Record<AdminLocale, string[]> = {
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fr: ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juill", "Août", "Sept", "Oct", "Nov", "Déc"],
};

export function monthShort(monthIndex: number, locale: AdminLocale): string {
  return MONTH_NAMES[locale][monthIndex];
}

export interface DashboardDictionary {
  intlLocale: string;
  loadingShop: string;
  title: string;
  welcome: (name: string) => string;
  metrics: {
    clients: string;
    invoices: string;
    revenueThisMonth: string;
    pendingReminders: string;
    vsLastMonth: string;
  };
  breakdown: {
    title: string;
    subtitle: string;
    totalRevenue: string;
    cardPayments: string;
    cashPayments: string;
    mixedPayments: string;
  };
  revenueChart: {
    title: string;
    subtitle: string;
    empty: string;
  };
  statusChart: {
    title: string;
    subtitle: string;
    empty: string;
    total: string;
    invoicesCount: (count: number) => string;
  };
  topClients: {
    title: string;
    subtitle: string;
    empty: string;
  };
  recentInvoices: {
    title: string;
    viewAll: string;
    empty: string;
  };
  quickActions: {
    title: string;
    newClient: string;
    newInvoice: string;
    newReminder: string;
    uploadDocument: string;
    cashRegister: string;
  };
  remindersAlert: {
    pending: (count: number) => string;
    viewReminders: string;
  };
}

export const DASHBOARD_DICT: Record<AdminLocale, DashboardDictionary> = {
  es: {
    intlLocale: "es-CA",
    loadingShop: "Configurando tu taller...",
    title: "Dashboard",
    welcome: (name) => `Bienvenido, ${name}`,
    metrics: {
      clients: "Clientes registrados",
      invoices: "Facturas totales",
      revenueThisMonth: "Ingresos este mes",
      pendingReminders: "Recordatorios pendientes",
      vsLastMonth: "vs mes anterior",
    },
    breakdown: {
      title: "Ingresos del mes — desglose",
      subtitle:
        "Método de pago y visibilidad contable son independientes. Solo interno no se exporta automáticamente a contabilidad.",
      totalRevenue: "Ingreso total",
      cardPayments: "Pagos con tarjeta",
      cashPayments: "Pagos en efectivo",
      mixedPayments: "Pagos mixtos",
    },
    revenueChart: {
      title: "Ingresos (últimos 6 meses)",
      subtitle: "Solo facturas marcadas como pagadas",
      empty: "Sin ingresos registrados aún",
    },
    statusChart: {
      title: "Estado de facturas",
      subtitle: "Distribución actual",
      empty: "Sin facturas todavía",
      total: "total",
      invoicesCount: (count) => `${count} facturas`,
    },
    topClients: {
      title: "Top clientes",
      subtitle: "Por ingresos (facturas pagadas)",
      empty: "Sin datos todavía",
    },
    recentInvoices: {
      title: "Facturas recientes",
      viewAll: "Ver todas →",
      empty: "Sin facturas todavía",
    },
    quickActions: {
      title: "Acciones rápidas",
      newClient: "Nuevo cliente",
      newInvoice: "Nueva factura",
      newReminder: "Nuevo recordatorio",
      uploadDocument: "Subir documento",
      cashRegister: "Caja / efectivo",
    },
    remindersAlert: {
      pending: (count) =>
        `${count} recordatorio${count !== 1 ? "s" : ""} pendiente${count !== 1 ? "s" : ""}`,
      viewReminders: "Ver recordatorios →",
    },
  },
  en: {
    intlLocale: "en-CA",
    loadingShop: "Setting up your garage...",
    title: "Dashboard",
    welcome: (name) => `Welcome, ${name}`,
    metrics: {
      clients: "Registered clients",
      invoices: "Total invoices",
      revenueThisMonth: "Revenue this month",
      pendingReminders: "Pending reminders",
      vsLastMonth: "vs last month",
    },
    breakdown: {
      title: "This month's revenue — breakdown",
      subtitle:
        "Payment method and accounting visibility are independent. Internal-only entries aren't automatically exported to accounting.",
      totalRevenue: "Total revenue",
      cardPayments: "Card payments",
      cashPayments: "Cash payments",
      mixedPayments: "Mixed payments",
    },
    revenueChart: {
      title: "Revenue (last 6 months)",
      subtitle: "Invoices marked as paid only",
      empty: "No revenue recorded yet",
    },
    statusChart: {
      title: "Invoice status",
      subtitle: "Current distribution",
      empty: "No invoices yet",
      total: "total",
      invoicesCount: (count) => `${count} invoice${count !== 1 ? "s" : ""}`,
    },
    topClients: {
      title: "Top clients",
      subtitle: "By revenue (paid invoices)",
      empty: "No data yet",
    },
    recentInvoices: {
      title: "Recent invoices",
      viewAll: "View all →",
      empty: "No invoices yet",
    },
    quickActions: {
      title: "Quick actions",
      newClient: "New client",
      newInvoice: "New invoice",
      newReminder: "New reminder",
      uploadDocument: "Upload document",
      cashRegister: "Cash register",
    },
    remindersAlert: {
      pending: (count) => `${count} pending reminder${count !== 1 ? "s" : ""}`,
      viewReminders: "View reminders →",
    },
  },
  fr: {
    intlLocale: "fr-CA",
    loadingShop: "Configuration de votre garage...",
    title: "Tableau de bord",
    welcome: (name) => `Bienvenue, ${name}`,
    metrics: {
      clients: "Clients enregistrés",
      invoices: "Factures totales",
      revenueThisMonth: "Revenus ce mois-ci",
      pendingReminders: "Rappels en attente",
      vsLastMonth: "par rapport au mois dernier",
    },
    breakdown: {
      title: "Revenus du mois — répartition",
      subtitle:
        "Le mode de paiement et la visibilité comptable sont indépendants. Ce qui est interne seulement n'est pas exporté automatiquement à la comptabilité.",
      totalRevenue: "Revenu total",
      cardPayments: "Paiements par carte",
      cashPayments: "Paiements en espèces",
      mixedPayments: "Paiements mixtes",
    },
    revenueChart: {
      title: "Revenus (6 derniers mois)",
      subtitle: "Factures marquées payées seulement",
      empty: "Aucun revenu enregistré pour l'instant",
    },
    statusChart: {
      title: "Statut des factures",
      subtitle: "Répartition actuelle",
      empty: "Aucune facture pour l'instant",
      total: "total",
      invoicesCount: (count) => `${count} facture${count !== 1 ? "s" : ""}`,
    },
    topClients: {
      title: "Meilleurs clients",
      subtitle: "Par revenus (factures payées)",
      empty: "Aucune donnée pour l'instant",
    },
    recentInvoices: {
      title: "Factures récentes",
      viewAll: "Voir toutes →",
      empty: "Aucune facture pour l'instant",
    },
    quickActions: {
      title: "Actions rapides",
      newClient: "Nouveau client",
      newInvoice: "Nouvelle facture",
      newReminder: "Nouveau rappel",
      uploadDocument: "Téléverser un document",
      cashRegister: "Caisse / espèces",
    },
    remindersAlert: {
      pending: (count) => `${count} rappel${count !== 1 ? "s" : ""} en attente`,
      viewReminders: "Voir les rappels →",
    },
  },
};
