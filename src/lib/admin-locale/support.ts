import type { AdminLocale } from "@/lib/admin-locale";

export interface SupportDictionary {
  page: { title: string; subtitle: string };
  contactCard: { needHelp: string; defaultTagline: string };
  chat: { empty: string; placeholder: string };
}

export const SUPPORT_DICT: Record<AdminLocale, SupportDictionary> = {
  es: {
    page: {
      title: "Ayuda",
      subtitle: "Escríbele directo al equipo de GarageOS — te respondemos por aquí.",
    },
    contactCard: {
      needHelp: "¿Necesita ayuda?",
      defaultTagline: "Soporte técnico, actualizaciones y nuevas funciones",
    },
    chat: {
      empty: "Escríbenos aquí — un miembro del equipo de GarageOS te va a responder.",
      placeholder: "Escribe un mensaje...",
    },
  },
  en: {
    page: {
      title: "Help",
      subtitle: "Message the GarageOS team directly — we'll reply right here.",
    },
    contactCard: {
      needHelp: "Need help?",
      defaultTagline: "Technical support, updates, and new features",
    },
    chat: {
      empty: "Write to us here — someone from the GarageOS team will reply.",
      placeholder: "Write a message...",
    },
  },
  fr: {
    page: {
      title: "Aide",
      subtitle: "Écrivez directement à l'équipe GarageOS — nous répondons ici même.",
    },
    contactCard: {
      needHelp: "Besoin d'aide?",
      defaultTagline: "Soutien technique, mises à jour et nouvelles fonctionnalités",
    },
    chat: {
      empty: "Écrivez-nous ici — un membre de l'équipe GarageOS vous répondra.",
      placeholder: "Écrivez un message...",
    },
  },
};
