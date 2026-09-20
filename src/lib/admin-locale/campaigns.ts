import type { AdminLocale } from "@/lib/admin-locale";

export interface CampaignsDictionary {
  /** Campaign status labels — shared by the list and detail pages. */
  statusLabels: Record<string, string>;
  list: {
    pageTitle: string;
    upgradeTitle: string;
    upgradeDescription: string;
    countLabel: (count: number) => string;
    newCampaign: string;
    emptyTitle: string;
    createFirst: string;
  };
  newPage: {
    backLink: string;
    title: string;
    subtitle: string;
  };
  detailPage: {
    backLink: string;
    subtitle: (statusLabel: string, date: string) => string;
    subjectLabel: string;
    messageLabel: string;
    audienceHeading: (total: number) => string;
    recipientStatusLabels: Record<string, string>;
  };
  form: {
    nameLabel: string;
    namePlaceholder: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
    messageHint: string;
    audienceLabel: string;
    segmentOptions: {
      ALL_CONSENTED: string;
      LANGUAGE: string;
      INACTIVE_MONTHS: string;
      MANUAL: string;
    };
    languageOptions: { EN: string; FR: string };
    manualPlaceholder: string;
    viewAudienceButton: string;
    recipientCountLabel: (count: number) => string;
    sampleSuffix: (names: string) => string;
    saveDraftButton: string;
    toastSavedAsDraft: string;
  };
  actions: {
    heading: string;
    sendTestButton: string;
    toastTestSent: string;
    scheduleButton: string;
    sendNowButton: string;
    cancelButton: string;
    confirmSendNow: string;
    confirmCancel: string;
    toastChooseDateTime: string;
    toastQueued: string;
    toastScheduled: string;
    toastCancelled: string;
  };
}

export const CAMPAIGNS_DICT: Record<AdminLocale, CampaignsDictionary> = {
  es: {
    statusLabels: {
      DRAFT: "Borrador",
      SCHEDULED: "Programada",
      SENDING: "Enviando",
      SENT: "Enviada",
      CANCELLED: "Cancelada",
    },
    list: {
      pageTitle: "Campañas",
      upgradeTitle: "Las campañas son una función Pro",
      upgradeDescription:
        "Envía correos segmentados a tus clientes (inactivos, por idioma, listas manuales). Incluido en Pro y Complete.",
      countLabel: (count) => `${count} campaña${count !== 1 ? "s" : ""}`,
      newCampaign: "Nueva campaña",
      emptyTitle: "No hay campañas todavía",
      createFirst: "Crear primera campaña",
    },
    newPage: {
      backLink: "Campañas",
      title: "Nueva campaña",
      subtitle: "Se guarda como borrador — revisa la audiencia y envía una prueba antes de programarla.",
    },
    detailPage: {
      backLink: "Campañas",
      subtitle: (statusLabel, date) => `${statusLabel} · Creada ${date}`,
      subjectLabel: "Asunto",
      messageLabel: "Mensaje",
      audienceHeading: (total) => `Audiencia (${total})`,
      recipientStatusLabels: {
        PENDING: "Pendientes",
        SENT: "Enviados",
        DELIVERED: "Entregados",
        FAILED: "Fallidos",
        BOUNCED: "Rebotados",
        SKIPPED_SUPPRESSED: "Omitidos (suprimidos)",
        SKIPPED_NO_CONSENT: "Omitidos (sin consentimiento)",
      },
    },
    form: {
      nameLabel: "Nombre interno",
      namePlaceholder: "Promoción de invierno 2026",
      subjectLabel: "Asunto del correo",
      subjectPlaceholder: "¡Prepara tu auto para el invierno!",
      messageLabel: "Mensaje",
      messagePlaceholder: "Escribe el mensaje de la campaña…",
      messageHint:
        "Se envía como texto simple dentro de la plantilla de marca del taller, con enlace de baja incluido automáticamente.",
      audienceLabel: "Audiencia",
      segmentOptions: {
        ALL_CONSENTED: "Todos los clientes con consentimiento",
        LANGUAGE: "Por idioma",
        INACTIVE_MONTHS: "Inactivos hace X meses",
        MANUAL: "IDs de cliente específicos",
      },
      languageOptions: { EN: "English", FR: "Français" },
      manualPlaceholder: "id1, id2, id3",
      viewAudienceButton: "Ver audiencia",
      recipientCountLabel: (count) => `${count} destinatario${count !== 1 ? "s" : ""}`,
      sampleSuffix: (names) => ` — ej. ${names}`,
      saveDraftButton: "Guardar borrador",
      toastSavedAsDraft: "Campaña guardada como borrador",
    },
    actions: {
      heading: "Enviar",
      sendTestButton: "Enviar prueba a mi correo",
      toastTestSent: "Prueba enviada a tu correo",
      scheduleButton: "Programar",
      sendNowButton: "Enviar ahora",
      cancelButton: "Cancelar campaña",
      confirmSendNow: "¿Enviar esta campaña ahora a toda la audiencia?",
      confirmCancel: "¿Cancelar esta campaña?",
      toastChooseDateTime: "Elige fecha y hora",
      toastQueued: "Campaña en cola de envío",
      toastScheduled: "Campaña programada",
      toastCancelled: "Campaña cancelada",
    },
  },
  en: {
    statusLabels: {
      DRAFT: "Draft",
      SCHEDULED: "Scheduled",
      SENDING: "Sending",
      SENT: "Sent",
      CANCELLED: "Cancelled",
    },
    list: {
      pageTitle: "Campaigns",
      upgradeTitle: "Campaigns are a Pro feature",
      upgradeDescription:
        "Send segmented emails to your clients (inactive, by language, manual lists). Included in Pro and Complete.",
      countLabel: (count) => `${count} campaign${count !== 1 ? "s" : ""}`,
      newCampaign: "New campaign",
      emptyTitle: "No campaigns yet",
      createFirst: "Create your first campaign",
    },
    newPage: {
      backLink: "Campaigns",
      title: "New campaign",
      subtitle: "Saved as a draft — review the audience and send a test before scheduling it.",
    },
    detailPage: {
      backLink: "Campaigns",
      subtitle: (statusLabel, date) => `${statusLabel} · Created ${date}`,
      subjectLabel: "Subject",
      messageLabel: "Message",
      audienceHeading: (total) => `Audience (${total})`,
      recipientStatusLabels: {
        PENDING: "Pending",
        SENT: "Sent",
        DELIVERED: "Delivered",
        FAILED: "Failed",
        BOUNCED: "Bounced",
        SKIPPED_SUPPRESSED: "Skipped (suppressed)",
        SKIPPED_NO_CONSENT: "Skipped (no consent)",
      },
    },
    form: {
      nameLabel: "Internal name",
      namePlaceholder: "Winter promotion 2026",
      subjectLabel: "Email subject",
      subjectPlaceholder: "Get your car ready for winter!",
      messageLabel: "Message",
      messagePlaceholder: "Write the campaign message…",
      messageHint:
        "Sent as plain text inside the shop's branded template, with an unsubscribe link included automatically.",
      audienceLabel: "Audience",
      segmentOptions: {
        ALL_CONSENTED: "All clients with consent",
        LANGUAGE: "By language",
        INACTIVE_MONTHS: "Inactive for X months",
        MANUAL: "Specific client IDs",
      },
      languageOptions: { EN: "English", FR: "Français" },
      manualPlaceholder: "id1, id2, id3",
      viewAudienceButton: "View audience",
      recipientCountLabel: (count) => `${count} recipient${count !== 1 ? "s" : ""}`,
      sampleSuffix: (names) => ` — e.g. ${names}`,
      saveDraftButton: "Save draft",
      toastSavedAsDraft: "Campaign saved as a draft",
    },
    actions: {
      heading: "Send",
      sendTestButton: "Send test to my email",
      toastTestSent: "Test sent to your email",
      scheduleButton: "Schedule",
      sendNowButton: "Send now",
      cancelButton: "Cancel campaign",
      confirmSendNow: "Send this campaign now to the entire audience?",
      confirmCancel: "Cancel this campaign?",
      toastChooseDateTime: "Choose a date and time",
      toastQueued: "Campaign queued to send",
      toastScheduled: "Campaign scheduled",
      toastCancelled: "Campaign cancelled",
    },
  },
  fr: {
    statusLabels: {
      DRAFT: "Brouillon",
      SCHEDULED: "Planifiée",
      SENDING: "Envoi en cours",
      SENT: "Envoyée",
      CANCELLED: "Annulée",
    },
    list: {
      pageTitle: "Campagnes",
      upgradeTitle: "Les campagnes sont une fonctionnalité Pro",
      upgradeDescription:
        "Envoyez des courriels segmentés à vos clients (inactifs, par langue, listes manuelles). Inclus dans Pro et Complete.",
      countLabel: (count) => `${count} campagne${count !== 1 ? "s" : ""}`,
      newCampaign: "Nouvelle campagne",
      emptyTitle: "Aucune campagne pour le moment",
      createFirst: "Créer la première campagne",
    },
    newPage: {
      backLink: "Campagnes",
      title: "Nouvelle campagne",
      subtitle: "Enregistrée comme brouillon — vérifiez l'audience et envoyez un test avant de la planifier.",
    },
    detailPage: {
      backLink: "Campagnes",
      subtitle: (statusLabel, date) => `${statusLabel} · Créée le ${date}`,
      subjectLabel: "Sujet",
      messageLabel: "Message",
      audienceHeading: (total) => `Audience (${total})`,
      recipientStatusLabels: {
        PENDING: "En attente",
        SENT: "Envoyés",
        DELIVERED: "Livrés",
        FAILED: "Échoués",
        BOUNCED: "Rejetés",
        SKIPPED_SUPPRESSED: "Ignorés (supprimés)",
        SKIPPED_NO_CONSENT: "Ignorés (sans consentement)",
      },
    },
    form: {
      nameLabel: "Nom interne",
      namePlaceholder: "Promotion d'hiver 2026",
      subjectLabel: "Sujet du courriel",
      subjectPlaceholder: "Préparez votre auto pour l'hiver !",
      messageLabel: "Message",
      messagePlaceholder: "Rédigez le message de la campagne…",
      messageHint:
        "Envoyé en texte simple dans le modèle de marque de l'atelier, avec un lien de désabonnement inclus automatiquement.",
      audienceLabel: "Audience",
      segmentOptions: {
        ALL_CONSENTED: "Tous les clients avec consentement",
        LANGUAGE: "Par langue",
        INACTIVE_MONTHS: "Inactifs depuis X mois",
        MANUAL: "IDs de clients spécifiques",
      },
      languageOptions: { EN: "English", FR: "Français" },
      manualPlaceholder: "id1, id2, id3",
      viewAudienceButton: "Voir l'audience",
      recipientCountLabel: (count) => `${count} destinataire${count !== 1 ? "s" : ""}`,
      sampleSuffix: (names) => ` — ex. ${names}`,
      saveDraftButton: "Enregistrer le brouillon",
      toastSavedAsDraft: "Campagne enregistrée comme brouillon",
    },
    actions: {
      heading: "Envoyer",
      sendTestButton: "Envoyer un test à mon courriel",
      toastTestSent: "Test envoyé à votre courriel",
      scheduleButton: "Planifier",
      sendNowButton: "Envoyer maintenant",
      cancelButton: "Annuler la campagne",
      confirmSendNow: "Envoyer cette campagne maintenant à toute l'audience ?",
      confirmCancel: "Annuler cette campagne ?",
      toastChooseDateTime: "Choisissez une date et une heure",
      toastQueued: "Campagne mise en file d'envoi",
      toastScheduled: "Campagne planifiée",
      toastCancelled: "Campagne annulée",
    },
  },
};
