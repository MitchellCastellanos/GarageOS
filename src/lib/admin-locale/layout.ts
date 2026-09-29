import type { AdminLocale } from "@/lib/admin-locale";

export interface LayoutDictionary {
  nav: {
    dashboard: string;
    inbox: string;
    appointments: string;
    clients: string;
    quotes: string;
    workOrders: string;
    inspections: string;
    invoices: string;
    campaigns: string;
    notifications: string;
    inventory: string;
    importData: string;
    tireStorage: string;
    caja: string;
    accounting: string;
    reports: string;
    organization: string;
    reminders: string;
    settings: string;
    support: string;
  };
  navGroups: {
    operations: string;
    customers: string;
    communications: string;
    finance: string;
  };
  topbar: {
    openMenu: string;
    closeMenu: string;
    closeSearch: string;
    searchPlaceholder: string;
    defaultUserName: string;
    settings: string;
    signOut: string;
    plan: {
      trial: (days: number) => string;
      trialExpired: string;
      pastDue: string;
      active: string;
      free: string;
      upgrade: string;
      manage: string;
    };
  };
}

export const LAYOUT_DICT: Record<AdminLocale, LayoutDictionary> = {
  es: {
    nav: {
      dashboard: "Dashboard",
      inbox: "Bandeja",
      appointments: "Citas",
      clients: "Clientes",
      quotes: "Cotizaciones",
      workOrders: "Órdenes de trabajo",
      inspections: "Inspecciones",
      invoices: "Facturas",
      campaigns: "Campañas",
      notifications: "Email y dominio",
      inventory: "Inventario",
      importData: "Importar datos",
      tireStorage: "Almacén de llantas",
      caja: "Caja",
      accounting: "Contabilidad",
      reports: "Reportes",
      organization: "Organización",
      reminders: "Recordatorios",
      settings: "Configuración",
      support: "Ayuda",
    },
    navGroups: {
      operations: "Operación",
      customers: "Clientes",
      communications: "Comunicación",
      finance: "Finanzas",
    },
    topbar: {
      openMenu: "Abrir menú",
      closeMenu: "Cerrar menú",
      closeSearch: "Cerrar búsqueda",
      searchPlaceholder: "Buscar clientes, vehículos...",
      defaultUserName: "Usuario",
      settings: "Configuración",
      signOut: "Salir",
      plan: {
        trial: (days) => `Prueba · ${days} ${days === 1 ? "día" : "días"}`,
        trialExpired: "Prueba vencida",
        pastDue: "Pago pendiente",
        active: "Activo",
        free: "Sin plan activo",
        upgrade: "Mejorar",
        manage: "Administrar",
      },
    },
  },
  en: {
    nav: {
      dashboard: "Dashboard",
      inbox: "Inbox",
      appointments: "Appointments",
      clients: "Clients",
      quotes: "Quotes",
      workOrders: "Work orders",
      inspections: "Inspections",
      invoices: "Invoices",
      campaigns: "Campaigns",
      notifications: "Email & domain",
      inventory: "Inventory",
      importData: "Import data",
      tireStorage: "Tire storage",
      caja: "Cash drawer",
      accounting: "Accounting",
      reports: "Reports",
      organization: "Organization",
      reminders: "Reminders",
      settings: "Settings",
      support: "Help",
    },
    navGroups: {
      operations: "Operations",
      customers: "Customers",
      communications: "Communications",
      finance: "Finance",
    },
    topbar: {
      openMenu: "Open menu",
      closeMenu: "Close menu",
      closeSearch: "Close search",
      searchPlaceholder: "Search clients, vehicles...",
      defaultUserName: "User",
      settings: "Settings",
      signOut: "Sign out",
      plan: {
        trial: (days) => `Trial · ${days} ${days === 1 ? "day" : "days"} left`,
        trialExpired: "Trial ended",
        pastDue: "Payment due",
        active: "Active",
        free: "No active plan",
        upgrade: "Upgrade",
        manage: "Manage",
      },
    },
  },
  fr: {
    nav: {
      dashboard: "Tableau de bord",
      inbox: "Boîte de réception",
      appointments: "Rendez-vous",
      clients: "Clients",
      quotes: "Soumissions",
      workOrders: "Ordres de travail",
      inspections: "Inspections",
      invoices: "Factures",
      campaigns: "Campagnes",
      notifications: "Courriel et domaine",
      inventory: "Inventaire",
      importData: "Importer des données",
      tireStorage: "Entreposage de pneus",
      caja: "Caisse",
      accounting: "Comptabilité",
      reports: "Rapports",
      organization: "Organisation",
      reminders: "Rappels",
      settings: "Configuration",
      support: "Aide",
    },
    navGroups: {
      operations: "Opérations",
      customers: "Clients",
      communications: "Communications",
      finance: "Finances",
    },
    topbar: {
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
      closeSearch: "Fermer la recherche",
      searchPlaceholder: "Rechercher clients, véhicules...",
      defaultUserName: "Utilisateur",
      settings: "Configuration",
      signOut: "Déconnexion",
      plan: {
        trial: (days) => `Essai · ${days} ${days === 1 ? "jour" : "jours"}`,
        trialExpired: "Essai terminé",
        pastDue: "Paiement en attente",
        active: "Actif",
        free: "Aucun forfait actif",
        upgrade: "Améliorer",
        manage: "Gérer",
      },
    },
  },
};
