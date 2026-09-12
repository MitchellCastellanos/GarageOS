import type { AdminLocale } from "@/lib/admin-locale";

export interface LayoutDictionary {
  nav: {
    dashboard: string;
    appointments: string;
    clients: string;
    quotes: string;
    invoices: string;
    caja: string;
    accounting: string;
    reminders: string;
    settings: string;
  };
  topbar: {
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
      appointments: "Citas",
      clients: "Clientes",
      quotes: "Cotizaciones",
      invoices: "Facturas",
      caja: "Caja",
      accounting: "Contabilidad",
      reminders: "Recordatorios",
      settings: "Configuración",
    },
    topbar: {
      searchPlaceholder: "Buscar clientes, vehículos...",
      defaultUserName: "Usuario",
      settings: "Configuración",
      signOut: "Salir",
    },
  },
  en: {
    nav: {
      dashboard: "Dashboard",
      appointments: "Appointments",
      clients: "Clients",
      quotes: "Quotes",
      invoices: "Invoices",
      caja: "Cash drawer",
      accounting: "Accounting",
      reminders: "Reminders",
      settings: "Settings",
    },
    topbar: {
      searchPlaceholder: "Search clients, vehicles...",
      defaultUserName: "User",
      settings: "Settings",
      signOut: "Sign out",
    },
  },
  fr: {
    nav: {
      dashboard: "Tableau de bord",
      appointments: "Rendez-vous",
      clients: "Clients",
      quotes: "Soumissions",
      invoices: "Factures",
      caja: "Caisse",
      accounting: "Comptabilité",
      reminders: "Rappels",
      settings: "Configuration",
    },
    topbar: {
      searchPlaceholder: "Rechercher clients, véhicules...",
      defaultUserName: "Utilisateur",
      settings: "Configuration",
      signOut: "Déconnexion",
    },
  },
};
