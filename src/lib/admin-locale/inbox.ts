import type { AdminLocale } from "@/lib/admin-locale";

export interface InboxDictionary {
  list: {
    pageTitle: string;
    countLabel: (count: number) => string;
    tabs: { open: string; archived: string };
    emptyOpen: string;
    emptyArchived: string;
    noSubject: string;
    relative: {
      now: string;
      minutesAgo: (min: number) => string;
      hoursAgo: (hr: number) => string;
      daysAgo: (day: number) => string;
    };
  };
  thread: {
    fallbackTitle: string;
    noSubject: string;
    youTo: (to: string) => string;
    clientHistoryTitle: string;
  };
  compose: {
    newMessageButton: string;
    dialogTitle: string;
    dialogSubtitle: string;
    sendFromLabel: string;
    toPlaceholder: string;
    ccPlaceholder: string;
    bccPlaceholder: string;
    subjectPlaceholder: string;
    cancel: string;
    send: string;
    sending: string;
    maxAttachments: (max: number) => string;
    toastSent: string;
  };
  reply: {
    title: string;
    archiveButton: string;
    toLabel: string;
    addCcBcc: string;
    ccPlaceholder: string;
    bccPlaceholder: string;
    sendFromLabel: string;
    subjectPlaceholder: string;
    bodyPlaceholder: string;
    send: string;
    sending: string;
    maxAttachments: (max: number) => string;
    toastReplySent: string;
    toastArchived: string;
  };
  sms: {
    channelSms: string;
    channelEmail: string;
    unread: string;
    replyTitle: string;
    bodyPlaceholder: string;
    send: string;
    sending: string;
    segments: (count: number, special: boolean) => string;
    toastSent: string;
    noDedicatedNumber: string;
    optedOut: string;
    newSmsButton: string;
    dialogTitle: string;
    dialogSubtitle: string;
    phoneLabel: string;
    phonePlaceholder: string;
    cancel: string;
  };
  editor: {
    bold: string;
    italic: string;
    list: string;
    orderedList: string;
    undo: string;
    redo: string;
    preview: string;
    edit: string;
    defaultPlaceholder: string;
    emptyPreview: string;
    previewHeader: string;
    sentBy: (shop: string) => string;
    poweredBy: string;
    bodyAriaLabel: string;
  };
}

export const INBOX_DICT: Record<AdminLocale, InboxDictionary> = {
  es: {
    list: {
      pageTitle: "Bandeja de entrada",
      countLabel: (count) => `${count} conversación${count !== 1 ? "es" : ""}`,
      tabs: { open: "Abiertas", archived: "Archivadas" },
      emptyOpen: "No hay conversaciones abiertas",
      emptyArchived: "No hay conversaciones archivadas",
      noSubject: "Sin asunto",
      relative: {
        now: "ahora",
        minutesAgo: (min) => `hace ${min} min`,
        hoursAgo: (hr) => `hace ${hr} h`,
        daysAgo: (day) => `hace ${day} d`,
      },
    },
    thread: {
      fallbackTitle: "Conversación",
      noSubject: "Sin asunto",
      youTo: (to) => `Tú → ${to}`,
      clientHistoryTitle: "Historial automatizado del cliente",
    },
    compose: {
      newMessageButton: "Nuevo mensaje",
      dialogTitle: "Nuevo mensaje",
      dialogSubtitle: "El editor muestra el contenido dentro del branding que recibirá el cliente.",
      sendFromLabel: "Enviar desde",
      toPlaceholder: "Para (separa varios con coma)",
      ccPlaceholder: "CC (opcional)",
      bccPlaceholder: "CCO (opcional)",
      subjectPlaceholder: "Asunto",
      cancel: "Cancelar",
      send: "Enviar",
      sending: "Enviando…",
      maxAttachments: (max) => `Máximo ${max} adjuntos`,
      toastSent: "Mensaje enviado",
    },
    reply: {
      title: "Responder",
      archiveButton: "Archivar conversación",
      toLabel: "Para:",
      addCcBcc: "+ CC/CCO",
      ccPlaceholder: "CC",
      bccPlaceholder: "CCO",
      sendFromLabel: "Enviar desde",
      subjectPlaceholder: "Asunto",
      bodyPlaceholder: "Escribe tu respuesta…",
      send: "Enviar",
      sending: "Enviando…",
      maxAttachments: (max) => `Máximo ${max} adjuntos`,
      toastReplySent: "Respuesta enviada",
      toastArchived: "Conversación archivada",
    },
    sms: {
      channelSms: "SMS",
      channelEmail: "Email",
      unread: "Sin leer",
      replyTitle: "Responder por SMS",
      bodyPlaceholder: "Escribe tu mensaje…",
      send: "Enviar SMS",
      sending: "Enviando…",
      segments: (count, special) =>
        `${count} segmento${count !== 1 ? "s" : ""}${special ? " · caracteres especiales (70 por segmento)" : ""}`,
      toastSent: "SMS enviado",
      noDedicatedNumber:
        "Para conversar por SMS el taller necesita un número propio. Solicítalo en Configuración → Notificaciones.",
      optedOut: "Este contacto respondió STOP: no puede recibir SMS hasta que responda START.",
      newSmsButton: "Nuevo SMS",
      dialogTitle: "Nuevo SMS",
      dialogSubtitle: "Se envía desde el número del taller; las respuestas llegan a esta bandeja.",
      phoneLabel: "Teléfono",
      phonePlaceholder: "+1 514 555 1234",
      cancel: "Cancelar",
    },
    editor: {
      bold: "Negrita",
      italic: "Cursiva",
      list: "Lista",
      orderedList: "Lista numerada",
      undo: "Deshacer",
      redo: "Rehacer",
      preview: "Vista previa",
      edit: "Editar",
      defaultPlaceholder: "Escribe tu mensaje…",
      emptyPreview: "Tu mensaje aparecerá aquí.",
      previewHeader: "Mensaje",
      sentBy: (shop) => `Este correo fue enviado por ${shop}.`,
      poweredBy: "Enviado con GarageOS",
      bodyAriaLabel: "Cuerpo del correo",
    },
  },
  en: {
    list: {
      pageTitle: "Inbox",
      countLabel: (count) => `${count} conversation${count !== 1 ? "s" : ""}`,
      tabs: { open: "Open", archived: "Archived" },
      emptyOpen: "No open conversations",
      emptyArchived: "No archived conversations",
      noSubject: "No subject",
      relative: {
        now: "now",
        minutesAgo: (min) => `${min} min ago`,
        hoursAgo: (hr) => `${hr} h ago`,
        daysAgo: (day) => `${day} d ago`,
      },
    },
    thread: {
      fallbackTitle: "Conversation",
      noSubject: "No subject",
      youTo: (to) => `You → ${to}`,
      clientHistoryTitle: "Automated client history",
    },
    compose: {
      newMessageButton: "New message",
      dialogTitle: "New message",
      dialogSubtitle: "The editor shows the content inside the branding the client will receive.",
      sendFromLabel: "Send from",
      toPlaceholder: "To (separate several with a comma)",
      ccPlaceholder: "CC (optional)",
      bccPlaceholder: "BCC (optional)",
      subjectPlaceholder: "Subject",
      cancel: "Cancel",
      send: "Send",
      sending: "Sending…",
      maxAttachments: (max) => `Maximum ${max} attachments`,
      toastSent: "Message sent",
    },
    reply: {
      title: "Reply",
      archiveButton: "Archive conversation",
      toLabel: "To:",
      addCcBcc: "+ CC/BCC",
      ccPlaceholder: "CC",
      bccPlaceholder: "BCC",
      sendFromLabel: "Send from",
      subjectPlaceholder: "Subject",
      bodyPlaceholder: "Write your reply…",
      send: "Send",
      sending: "Sending…",
      maxAttachments: (max) => `Maximum ${max} attachments`,
      toastReplySent: "Reply sent",
      toastArchived: "Conversation archived",
    },
    sms: {
      channelSms: "SMS",
      channelEmail: "Email",
      unread: "Unread",
      replyTitle: "Reply by SMS",
      bodyPlaceholder: "Type your message…",
      send: "Send SMS",
      sending: "Sending…",
      segments: (count, special) =>
        `${count} segment${count !== 1 ? "s" : ""}${special ? " · special characters (70 per segment)" : ""}`,
      toastSent: "SMS sent",
      noDedicatedNumber:
        "Two-way SMS needs a dedicated shop number. Request one under Settings → Notifications.",
      optedOut: "This contact replied STOP: they can't receive SMS until they reply START.",
      newSmsButton: "New SMS",
      dialogTitle: "New SMS",
      dialogSubtitle: "Sent from your shop number; replies arrive in this inbox.",
      phoneLabel: "Phone",
      phonePlaceholder: "+1 514 555 1234",
      cancel: "Cancel",
    },
    editor: {
      bold: "Bold",
      italic: "Italic",
      list: "List",
      orderedList: "Numbered list",
      undo: "Undo",
      redo: "Redo",
      preview: "Preview",
      edit: "Edit",
      defaultPlaceholder: "Write your message…",
      emptyPreview: "Your message will appear here.",
      previewHeader: "Message",
      sentBy: (shop) => `This email was sent by ${shop}.`,
      poweredBy: "Sent with GarageOS",
      bodyAriaLabel: "Email body",
    },
  },
  fr: {
    list: {
      pageTitle: "Boîte de réception",
      countLabel: (count) => `${count} conversation${count !== 1 ? "s" : ""}`,
      tabs: { open: "Ouvertes", archived: "Archivées" },
      emptyOpen: "Aucune conversation ouverte",
      emptyArchived: "Aucune conversation archivée",
      noSubject: "Aucun objet",
      relative: {
        now: "à l'instant",
        minutesAgo: (min) => `il y a ${min} min`,
        hoursAgo: (hr) => `il y a ${hr} h`,
        daysAgo: (day) => `il y a ${day} j`,
      },
    },
    thread: {
      fallbackTitle: "Conversation",
      noSubject: "Aucun objet",
      youTo: (to) => `Vous → ${to}`,
      clientHistoryTitle: "Historique automatisé du client",
    },
    compose: {
      newMessageButton: "Nouveau message",
      dialogTitle: "Nouveau message",
      dialogSubtitle: "L'éditeur affiche le contenu dans l'image de marque que le client recevra.",
      sendFromLabel: "Envoyer depuis",
      toPlaceholder: "À (séparez plusieurs adresses par une virgule)",
      ccPlaceholder: "CC (optionnel)",
      bccPlaceholder: "CCI (optionnel)",
      subjectPlaceholder: "Objet",
      cancel: "Annuler",
      send: "Envoyer",
      sending: "Envoi…",
      maxAttachments: (max) => `Maximum ${max} pièces jointes`,
      toastSent: "Message envoyé",
    },
    reply: {
      title: "Répondre",
      archiveButton: "Archiver la conversation",
      toLabel: "À :",
      addCcBcc: "+ CC/CCI",
      ccPlaceholder: "CC",
      bccPlaceholder: "CCI",
      sendFromLabel: "Envoyer depuis",
      subjectPlaceholder: "Objet",
      bodyPlaceholder: "Écrivez votre réponse…",
      send: "Envoyer",
      sending: "Envoi…",
      maxAttachments: (max) => `Maximum ${max} pièces jointes`,
      toastReplySent: "Réponse envoyée",
      toastArchived: "Conversation archivée",
    },
    sms: {
      channelSms: "SMS",
      channelEmail: "Courriel",
      unread: "Non lu",
      replyTitle: "Répondre par SMS",
      bodyPlaceholder: "Écrivez votre message…",
      send: "Envoyer le SMS",
      sending: "Envoi…",
      segments: (count, special) =>
        `${count} segment${count !== 1 ? "s" : ""}${special ? " · caractères spéciaux (70 par segment)" : ""}`,
      toastSent: "SMS envoyé",
      noDedicatedNumber:
        "Les SMS bidirectionnels exigent un numéro dédié. Demandez-en un dans Paramètres → Notifications.",
      optedOut: "Ce contact a répondu STOP : il ne peut plus recevoir de SMS tant qu'il ne répond pas START.",
      newSmsButton: "Nouveau SMS",
      dialogTitle: "Nouveau SMS",
      dialogSubtitle: "Envoyé depuis le numéro de l'atelier; les réponses arrivent dans cette boîte.",
      phoneLabel: "Téléphone",
      phonePlaceholder: "+1 514 555 1234",
      cancel: "Annuler",
    },
    editor: {
      bold: "Gras",
      italic: "Italique",
      list: "Liste",
      orderedList: "Liste numérotée",
      undo: "Annuler",
      redo: "Rétablir",
      preview: "Aperçu",
      edit: "Modifier",
      defaultPlaceholder: "Écrivez votre message…",
      emptyPreview: "Votre message apparaîtra ici.",
      previewHeader: "Message",
      sentBy: (shop) => `Ce courriel a été envoyé par ${shop}.`,
      poweredBy: "Envoyé avec GarageOS",
      bodyAriaLabel: "Corps du courriel",
    },
  },
};
