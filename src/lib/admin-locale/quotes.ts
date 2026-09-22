import type { AdminLocale } from "@/lib/admin-locale";

export interface QuotesDictionary {
  status: {
    DRAFT: string;
    SENT: string;
    ACCEPTED: string;
    REJECTED: string;
    EXPIRED: string;
    CONVERTED: string;
    CANCELLED: string;
  };
  itemType: {
    LABOUR: string;
    PART: string;
    OTHER: string;
  };
  list: {
    title: string;
    countSuffix: string;
    countSuffixSingular: string;
    countWithStatus: (count: string, status: string) => string;
    statusTabAll: string;
    newQuote: string;
    emptyAll: string;
    emptyStatus: (status: string) => string;
    createFirst: string;
    colQuoteClient: string;
    colVehicle: string;
    colDate: string;
    colStatus: string;
    colTotal: string;
  };
  new: {
    title: string;
    subtitle: string;
  };
  edit: {
    title: (quoteNumber: string) => string;
    subtitle: string;
  };
  detail: {
    editButton: string;
    downloadPdf: string;
    issuedOn: (date: string) => string;
    validUntil: (date: string) => string;
    languageLabel: (lang: string) => string;
    emailSent: (date: string) => string;
    emailSentCount: (count: number) => string;
    client: string;
    vehicle: string;
    vehicleN: (n: number) => string;
    plate: (plate: string) => string;
    mileageIn: (value: string, unit: string) => string;
    mileageOut: (value: string, unit: string) => string;
    lineItemsTitle: string;
    colDescription: string;
    colType: string;
    colQty: string;
    colUnitPrice: string;
    colTotal: string;
    notes: string;
    summary: string;
    subtotal: string;
    taxLine: (name: string, pct: string) => string;
    totalCad: string;
  };
  actions: {
    confirmCancel: (quoteNumber: string) => string;
    confirmDelete: (quoteNumber: string) => string;
    confirmConvert: (quoteNumber: string) => string;
    cancelled: string;
    convertedError: string;
    viewInvoice: string;
    noClientEmail: string;
    markSentNoEmail: string;
    markedSent: string;
    accepted: string;
    rejected: string;
    convertToInvoice: string;
    createWorkOrder: string;
    viewWorkOrder: (orderNumber: string) => string;
    cancel: string;
    delete: string;
    smsSent: (phone: string) => string;
    smsResent: (phone: string) => string;
    smsSendButton: string;
    smsResendButton: string;
  };
  sendDialog: {
    maxAttachments: string;
    resend: string;
    send: string;
    resendTitle: string;
    sendTitle: string;
    attachInfo: string;
    attachmentsHint: string;
    close: string;
    sendNow: string;
    sending: string;
    resentTo: (email: string) => string;
    sentTo: (email: string) => string;
  };
}

export const QUOTES_DICT: Record<AdminLocale, QuotesDictionary> = {
  es: {
    status: {
      DRAFT: "Borrador",
      SENT: "Enviada",
      ACCEPTED: "Aceptada",
      REJECTED: "Rechazada",
      EXPIRED: "Vencida",
      CONVERTED: "Convertida",
      CANCELLED: "Cancelada",
    },
    itemType: {
      LABOUR: "Mano de obra",
      PART: "Repuesto",
      OTHER: "Otro",
    },
    list: {
      title: "Cotizaciones",
      countSuffix: "cotizaciones",
      countSuffixSingular: "cotización",
      countWithStatus: (count, status) => `${count} · ${status}`,
      statusTabAll: "Todas",
      newQuote: "Nueva cotización",
      emptyAll: "No hay cotizaciones todavía",
      emptyStatus: (status) => `No hay cotizaciones en estado "${status}"`,
      createFirst: "Crear primera cotización",
      colQuoteClient: "Cotización / Cliente",
      colVehicle: "Vehículo",
      colDate: "Fecha",
      colStatus: "Estado",
      colTotal: "Total",
    },
    new: {
      title: "Nueva cotización",
      subtitle: "Completa los datos para crear una cotización",
    },
    edit: {
      title: (quoteNumber) => `Editar ${quoteNumber}`,
      subtitle: "Modifica los datos del borrador antes de enviarlo",
    },
    detail: {
      editButton: "Editar",
      downloadPdf: "Descargar PDF",
      issuedOn: (date) => `Emitida el ${date}`,
      validUntil: (date) => `Válida hasta ${date}`,
      languageLabel: (lang) => `Idioma: ${lang}`,
      emailSent: (date) => `Email: ${date}`,
      emailSentCount: (count) => `(${count}×)`,
      client: "Cliente",
      vehicle: "Vehículo",
      vehicleN: (n) => `Vehículo ${n}`,
      plate: (plate) => `Placa: ${plate}`,
      mileageIn: (value, unit) => `Entrada: ${value} ${unit}`,
      mileageOut: (value, unit) => `Salida: ${value} ${unit}`,
      lineItemsTitle: "Servicios y repuestos",
      colDescription: "Descripción",
      colType: "Tipo",
      colQty: "Cant.",
      colUnitPrice: "P. Unit.",
      colTotal: "Total",
      notes: "Notas",
      summary: "Resumen",
      subtotal: "Subtotal",
      taxLine: (name, pct) => `${name} (${pct}%)`,
      totalCad: "Total CAD",
    },
    actions: {
      confirmCancel: (quoteNumber) => `¿Anular la cotización ${quoteNumber}?`,
      confirmDelete: (quoteNumber) => `¿Eliminar definitivamente ${quoteNumber}?`,
      confirmConvert: (quoteNumber) => `¿Convertir ${quoteNumber} a factura borrador?`,
      cancelled: "Cotización anulada",
      convertedError: "No se pudo convertir la cotización",
      viewInvoice: "Ver factura",
      noClientEmail: "Sin email del cliente",
      markSentNoEmail: "Marcar enviada (sin email)",
      markedSent: "Cotización marcada como enviada",
      accepted: "Cotización aceptada",
      rejected: "Cotización rechazada",
      convertToInvoice: "Convertir a factura",
      createWorkOrder: "Crear orden de trabajo",
      viewWorkOrder: (orderNumber) => `Ver orden ${orderNumber}`,
      cancel: "Anular",
      delete: "Eliminar",
      smsSent: (phone) => `Cotización enviada por SMS a ${phone}`,
      smsResent: (phone) => `Cotización reenviada por SMS a ${phone}`,
      smsSendButton: "Enviar por SMS",
      smsResendButton: "Reenviar por SMS",
    },
    sendDialog: {
      maxAttachments: "Máximo 5 archivos adjuntos",
      resend: "Reenviar por email",
      send: "Enviar por email",
      resendTitle: "Reenviar cotización",
      sendTitle: "Enviar cotización",
      attachInfo:
        "La cotización PDF se adjunta automáticamente. Aquí puedes agregar documentos extra si lo necesitas.",
      attachmentsHint: "PDF o imágenes · Máx. 5 archivos · 5 MB c/u",
      close: "Cancelar",
      sendNow: "Enviar ahora",
      sending: "Enviando…",
      resentTo: (email) => `Cotización reenviada a ${email}`,
      sentTo: (email) => `Cotización enviada a ${email}`,
    },
  },
  en: {
    status: {
      DRAFT: "Draft",
      SENT: "Sent",
      ACCEPTED: "Accepted",
      REJECTED: "Rejected",
      EXPIRED: "Expired",
      CONVERTED: "Converted",
      CANCELLED: "Cancelled",
    },
    itemType: {
      LABOUR: "Labour",
      PART: "Part",
      OTHER: "Other",
    },
    list: {
      title: "Quotes",
      countSuffix: "quotes",
      countSuffixSingular: "quote",
      countWithStatus: (count, status) => `${count} · ${status}`,
      statusTabAll: "All",
      newQuote: "New quote",
      emptyAll: "No quotes yet",
      emptyStatus: (status) => `No quotes with status "${status}"`,
      createFirst: "Create your first quote",
      colQuoteClient: "Quote / Client",
      colVehicle: "Vehicle",
      colDate: "Date",
      colStatus: "Status",
      colTotal: "Total",
    },
    new: {
      title: "New quote",
      subtitle: "Fill in the details to create a quote",
    },
    edit: {
      title: (quoteNumber) => `Edit ${quoteNumber}`,
      subtitle: "Update the draft's details before sending it",
    },
    detail: {
      editButton: "Edit",
      downloadPdf: "Download PDF",
      issuedOn: (date) => `Issued on ${date}`,
      validUntil: (date) => `Valid until ${date}`,
      languageLabel: (lang) => `Language: ${lang}`,
      emailSent: (date) => `Email: ${date}`,
      emailSentCount: (count) => `(${count}×)`,
      client: "Client",
      vehicle: "Vehicle",
      vehicleN: (n) => `Vehicle ${n}`,
      plate: (plate) => `Plate: ${plate}`,
      mileageIn: (value, unit) => `In: ${value} ${unit}`,
      mileageOut: (value, unit) => `Out: ${value} ${unit}`,
      lineItemsTitle: "Services and parts",
      colDescription: "Description",
      colType: "Type",
      colQty: "Qty.",
      colUnitPrice: "Unit price",
      colTotal: "Total",
      notes: "Notes",
      summary: "Summary",
      subtotal: "Subtotal",
      taxLine: (name, pct) => `${name} (${pct}%)`,
      totalCad: "Total CAD",
    },
    actions: {
      confirmCancel: (quoteNumber) => `Void quote ${quoteNumber}?`,
      confirmDelete: (quoteNumber) => `Permanently delete ${quoteNumber}?`,
      confirmConvert: (quoteNumber) => `Convert ${quoteNumber} to a draft invoice?`,
      cancelled: "Quote voided",
      convertedError: "Could not convert the quote",
      viewInvoice: "View invoice",
      noClientEmail: "No client email",
      markSentNoEmail: "Mark as sent (no email)",
      markedSent: "Quote marked as sent",
      accepted: "Quote accepted",
      rejected: "Quote rejected",
      convertToInvoice: "Convert to invoice",
      createWorkOrder: "Create work order",
      viewWorkOrder: (orderNumber) => `View order ${orderNumber}`,
      cancel: "Void",
      delete: "Delete",
      smsSent: (phone) => `Quote sent by SMS to ${phone}`,
      smsResent: (phone) => `Quote resent by SMS to ${phone}`,
      smsSendButton: "Send by SMS",
      smsResendButton: "Resend by SMS",
    },
    sendDialog: {
      maxAttachments: "Maximum 5 attached files",
      resend: "Resend by email",
      send: "Send by email",
      resendTitle: "Resend quote",
      sendTitle: "Send quote",
      attachInfo:
        "The quote PDF is attached automatically. You can add extra documents here if you need to.",
      attachmentsHint: "PDF or images · Max. 5 files · 5 MB each",
      close: "Cancel",
      sendNow: "Send now",
      sending: "Sending…",
      resentTo: (email) => `Quote resent to ${email}`,
      sentTo: (email) => `Quote sent to ${email}`,
    },
  },
  fr: {
    status: {
      DRAFT: "Brouillon",
      SENT: "Envoyée",
      ACCEPTED: "Acceptée",
      REJECTED: "Refusée",
      EXPIRED: "Expirée",
      CONVERTED: "Convertie",
      CANCELLED: "Annulée",
    },
    itemType: {
      LABOUR: "Main-d'œuvre",
      PART: "Pièce",
      OTHER: "Autre",
    },
    list: {
      title: "Soumissions",
      countSuffix: "soumissions",
      countSuffixSingular: "soumission",
      countWithStatus: (count, status) => `${count} · ${status}`,
      statusTabAll: "Toutes",
      newQuote: "Nouvelle soumission",
      emptyAll: "Aucune soumission pour l'instant",
      emptyStatus: (status) => `Aucune soumission avec le statut « ${status} »`,
      createFirst: "Créer la première soumission",
      colQuoteClient: "Soumission / Client",
      colVehicle: "Véhicule",
      colDate: "Date",
      colStatus: "Statut",
      colTotal: "Total",
    },
    new: {
      title: "Nouvelle soumission",
      subtitle: "Remplissez les informations pour créer une soumission",
    },
    edit: {
      title: (quoteNumber) => `Modifier ${quoteNumber}`,
      subtitle: "Modifiez les données du brouillon avant de l'envoyer",
    },
    detail: {
      editButton: "Modifier",
      downloadPdf: "Télécharger le PDF",
      issuedOn: (date) => `Émise le ${date}`,
      validUntil: (date) => `Valide jusqu'au ${date}`,
      languageLabel: (lang) => `Langue : ${lang}`,
      emailSent: (date) => `Courriel : ${date}`,
      emailSentCount: (count) => `(${count}×)`,
      client: "Client",
      vehicle: "Véhicule",
      vehicleN: (n) => `Véhicule ${n}`,
      plate: (plate) => `Plaque : ${plate}`,
      mileageIn: (value, unit) => `Entrée : ${value} ${unit}`,
      mileageOut: (value, unit) => `Sortie : ${value} ${unit}`,
      lineItemsTitle: "Services et pièces",
      colDescription: "Description",
      colType: "Type",
      colQty: "Qté",
      colUnitPrice: "Prix unit.",
      colTotal: "Total",
      notes: "Notes",
      summary: "Résumé",
      subtotal: "Sous-total",
      taxLine: (name, pct) => `${name} (${pct} %)`,
      totalCad: "Total CAD",
    },
    actions: {
      confirmCancel: (quoteNumber) => `Annuler la soumission ${quoteNumber} ?`,
      confirmDelete: (quoteNumber) => `Supprimer définitivement ${quoteNumber} ?`,
      confirmConvert: (quoteNumber) => `Convertir ${quoteNumber} en facture brouillon ?`,
      cancelled: "Soumission annulée",
      convertedError: "Impossible de convertir la soumission",
      viewInvoice: "Voir la facture",
      noClientEmail: "Aucun courriel client",
      markSentNoEmail: "Marquer comme envoyée (sans courriel)",
      markedSent: "Soumission marquée comme envoyée",
      accepted: "Soumission acceptée",
      rejected: "Soumission refusée",
      convertToInvoice: "Convertir en facture",
      createWorkOrder: "Créer un ordre de travail",
      viewWorkOrder: (orderNumber) => `Voir l'ordre ${orderNumber}`,
      cancel: "Annuler",
      delete: "Supprimer",
      smsSent: (phone) => `Soumission envoyée par SMS à ${phone}`,
      smsResent: (phone) => `Soumission renvoyée par SMS à ${phone}`,
      smsSendButton: "Envoyer par SMS",
      smsResendButton: "Renvoyer par SMS",
    },
    sendDialog: {
      maxAttachments: "Maximum 5 fichiers joints",
      resend: "Renvoyer par courriel",
      send: "Envoyer par courriel",
      resendTitle: "Renvoyer la soumission",
      sendTitle: "Envoyer la soumission",
      attachInfo:
        "Le PDF de la soumission est joint automatiquement. Vous pouvez ajouter des documents supplémentaires ici au besoin.",
      attachmentsHint: "PDF ou images · Max. 5 fichiers · 5 Mo chacun",
      close: "Annuler",
      sendNow: "Envoyer maintenant",
      sending: "Envoi…",
      resentTo: (email) => `Soumission renvoyée à ${email}`,
      sentTo: (email) => `Soumission envoyée à ${email}`,
    },
  },
};
