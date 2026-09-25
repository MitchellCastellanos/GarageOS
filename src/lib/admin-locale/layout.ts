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
    caja: string;
    accounting: string;
    reminders: string;
    settings: string;
    support: string;
  };
  topbar: {
    openMenu: string;
    closeMenu: string;
    closeSearch: string;
    searchPlaceholder: string;
    defaultUserName: string;
    settings: string;
    signOut: string;
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
      caja: "Caja",
      accounting: "Contabilidad",
      reminders: "Recordatorios",
      settings: "Configuración",
      support: "Ayuda",
    },
    topbar: {
      openMenu: "Abrir menú",
      closeMenu: "Cerrar menú",
      closeSearch: "Cerrar búsqueda",
      searchPlaceholder: "Buscar clientes, vehículos...",
      defaultUserName: "Usuario",
      settings: "Configuración",
      signOut: "Salir",
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
      caja: "Cash drawer",
      accounting: "Accounting",
      reminders: "Reminders",
      settings: "Settings",
      support: "Help",
    },
    topbar: {
      openMenu: "Open menu",
      closeMenu: "Close menu",
      closeSearch: "Close search",
      searchPlaceholder: "Search clients, vehicles...",
      defaultUserName: "User",
      settings: "Settings",
      signOut: "Sign out",
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
      caja: "Caisse",
      accounting: "Comptabilité",
      reminders: "Rappels",
      settings: "Configuration",
      support: "Aide",
    },
    topbar: {
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
      closeSearch: "Fermer la recherche",
      searchPlaceholder: "Rechercher clients, véhicules...",
      defaultUserName: "Utilisateur",
      settings: "Configuration",
      signOut: "Déconnexion",
    },
  },
};
