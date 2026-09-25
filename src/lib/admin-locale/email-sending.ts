import type { AdminLocale } from "@/lib/admin-locale";

export interface EmailSendingDictionary {
  /** Aviso simple para talleres sin dominio propio ni identidades extra (plan Core). */
  banner: {
    title: string;
    bodyWithAddress: (address: string) => string;
    bodyNoSlug: string;
    linkText: string;
    upgradeHint: string;
    upgradeLinkText: string;
  };
}

export const EMAIL_SENDING_DICT: Record<AdminLocale, EmailSendingDictionary> = {
  es: {
    banner: {
      title: "Tu remitente de correo",
      bodyWithAddress: (address) =>
        `Todos tus correos (citas, facturas, cotizaciones, mensajes) salen desde ${address}.`,
      bodyNoSlug:
        "Todavía no tienes un identificador configurado, así que tus correos usan un remitente compartido de GarageOS.",
      linkText: "Configura tu identificador en la pestaña Página de reservas",
      upgradeHint: "¿Quieres usar tu propio dominio (ej. citas@tutaller.com)?",
      upgradeLinkText: "Mejora tu plan →",
    },
  },
  en: {
    banner: {
      title: "Your email sender",
      bodyWithAddress: (address) =>
        `All your emails (appointments, invoices, quotes, messages) go out from ${address}.`,
      bodyNoSlug:
        "You haven't set up an identifier yet, so your emails use a shared GarageOS sender.",
      linkText: "Set up your identifier in the Booking page tab",
      upgradeHint: "Want to use your own domain (e.g. appointments@yourshop.com)?",
      upgradeLinkText: "Upgrade your plan →",
    },
  },
  fr: {
    banner: {
      title: "Votre expéditeur de courriel",
      bodyWithAddress: (address) =>
        `Tous vos courriels (rendez-vous, factures, soumissions, messages) proviennent de ${address}.`,
      bodyNoSlug:
        "Vous n'avez pas encore configuré d'identifiant, donc vos courriels utilisent un expéditeur partagé de GarageOS.",
      linkText: "Configurez votre identifiant dans l'onglet Page de réservation",
      upgradeHint: "Vous voulez utiliser votre propre domaine (ex. rendezvous@votregarage.com) ?",
      upgradeLinkText: "Améliorez votre plan →",
    },
  },
};
