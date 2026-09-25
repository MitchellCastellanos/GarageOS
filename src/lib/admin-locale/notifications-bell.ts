import type { AdminLocale } from "@/lib/admin-locale";

export interface NotificationBellDictionary {
  ariaLabel: string;
  title: string;
  empty: string;
  markAllRead: string;
  viewAll: string;
}

export const NOTIFICATION_BELL_DICT: Record<AdminLocale, NotificationBellDictionary> = {
  es: {
    ariaLabel: "Notificaciones",
    title: "Notificaciones",
    empty: "No hay notificaciones todavía.",
    markAllRead: "Marcar todo como leído",
    viewAll: "Ver todas",
  },
  en: {
    ariaLabel: "Notifications",
    title: "Notifications",
    empty: "No notifications yet.",
    markAllRead: "Mark all as read",
    viewAll: "View all",
  },
  fr: {
    ariaLabel: "Notifications",
    title: "Notifications",
    empty: "Aucune notification pour l'instant.",
    markAllRead: "Tout marquer comme lu",
    viewAll: "Voir tout",
  },
};
