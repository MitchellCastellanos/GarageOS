import type { AdminLocale } from "@/lib/admin-locale";

export interface SupportDictionary {
  page: { title: string; subtitle: string };
  contactCard: { needHelp: string };
}

export const SUPPORT_DICT: Record<AdminLocale, SupportDictionary> = {
  es: {
    page: {
      title: "Ayuda",
      subtitle: "Escríbele directo al equipo de GarageOS — te respondemos por aquí.",
    },
    contactCard: { needHelp: "¿Necesita ayuda?" },
  },
  en: {
    page: {
      title: "Help",
      subtitle: "Message the GarageOS team directly — we'll reply right here.",
    },
    contactCard: { needHelp: "Need help?" },
  },
  fr: {
    page: {
      title: "Aide",
      subtitle: "Écrivez directement à l'équipe GarageOS — nous répondons ici même.",
    },
    contactCard: { needHelp: "Besoin d'aide?" },
  },
};
