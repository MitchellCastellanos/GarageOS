import type { AdminLocale } from "@/lib/admin-locale";

export interface LayoutDictionary {
  nav: {
    dashboard: string;
    inbox: string;
    appointments: string;
    clients: string;
    quotes: string;
    invoices: string;
    campaigns: string;
    notifications: string;
    caja: string;
    accounting: string;
    reminders: string;
    settings: string;
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
      invoices: "Facturas",
      campaigns: "Campañas",
      notifications: "Notificaciones",
      caja: "Caja",
      accounting: "Contabilidad",
      reminders: "Recordatorios",
      settings: "Configuración",
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
      invoices: "Invoices",
      campaigns: "Campaigns",
      notifications: "Notifications",
      caja: "Cash drawer",
      accounting: "Accounting",
      reminders: "Reminders",
      settings: "Settings",
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
      invoices: "Factures",
      campaigns: "Campagnes",
      notifications: "Notifications",
      caja: "Caisse",
      accounting: "Comptabilité",
      reminders: "Rappels",
      settings: "Configuration",
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
