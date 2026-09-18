import type { AdminLocale } from "@/lib/admin-locale";

export interface NotificationsDictionary {
  page: { title: string; subtitle: string };
  mailboxes: {
    title: string;
    billingLabel: string;
    billingHint: string;
    infoLabel: string;
    newsletterLabel: string;
    newsletterHint: string;
    save: string;
    saving: string;
    saved: string;
  };
}

export const NOTIFICATIONS_DICT: Record<AdminLocale, NotificationsDictionary> = {
  es: {
    page: {
      title: "Notificaciones",
      subtitle: "Buzones de correo, remitentes automáticos y dominio de envío",
    },
    mailboxes: {
      title: "Buzones del dominio",
      billingLabel: "billing@ — Sin uso",
      billingHint: "Las facturas y contabilidad ahora salen de info@",
      infoLabel: "info@ — Facturas, cotizaciones, recordatorios y web",
      newsletterLabel: "newsletter@ — Marketing",
      newsletterHint: "Para Brevo/Mailchimp más adelante",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
  },
  en: {
    page: {
      title: "Notifications",
      subtitle: "Mailboxes, automatic senders, and sending domain",
    },
    mailboxes: {
      title: "Domain mailboxes",
      billingLabel: "billing@ — Unused",
      billingHint: "Invoices and accounting now go out from info@",
      infoLabel: "info@ — Invoices, quotes, reminders, and web",
      newsletterLabel: "newsletter@ — Marketing",
      newsletterHint: "For Brevo/Mailchimp later on",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
  },
  fr: {
    page: {
      title: "Notifications",
      subtitle: "Boîtes courriel, expéditeurs automatiques et domaine d'envoi",
    },
    mailboxes: {
      title: "Boîtes courriel du domaine",
      billingLabel: "billing@ — Inutilisée",
      billingHint: "Les factures et la comptabilité proviennent maintenant de info@",
      infoLabel: "info@ — Factures, soumissions, rappels et site web",
      newsletterLabel: "newsletter@ — Marketing",
      newsletterHint: "Pour Brevo/Mailchimp plus tard",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
  },
};
