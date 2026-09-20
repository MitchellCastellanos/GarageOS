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
  },
};
