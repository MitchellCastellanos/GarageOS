import type { AdminLocale } from "@/lib/admin-locale";

export interface CajaDictionary {
  cashDrawerPage: {
    title: string;
    subtitle: string;
  };
  cashDrawer: {
    dateLabel: string;
    summary: {
      openingToday: string;
      cashReceived: string;
      cashPaidOut: string;
      adjustments: string;
      expectedBalance: string;
    };
    form: {
      heading: string;
      typeLabel: string;
      amountLabel: string;
      amountPlaceholder: string;
      adjustmentHint: string;
      dateTimeLabel: string;
      noteLabel: string;
      notePlaceholder: string;
      genericError: string;
      submitting: string;
      submit: string;
    };
    table: {
      heading: string;
      hint: string;
      empty: string;
      colTime: string;
      colType: string;
      colAmount: string;
      colNoteInvoice: string;
      deleteTitle: string;
      deleteConfirm: string;
      dash: string;
    };
  };
  accountingPage: {
    title: string;
    subtitle: string;
  };
  accounting: {
    driveFolderTitle: string;
    driveFolderSubtitle: string;
    docFilterLabel: string;
    uploadHeading: (categoryLabel: string) => string;
    uploadHintPrefix: string;
    uploadHintSuffix: string;
    noDocuments: string;
    driveLink: string;
    autoExported: string;
    manualUpload: string;
  };
  uploadZone: {
    dropHere: string;
    dragInstructionsPrefix: string;
    dragInstructionsCta: string;
    fileTypeHint: string;
    uploading: string;
    done: string;
    genericError: string;
    toastSuccess: (fileName: string) => string;
    toastError: string;
  };
}

export const CAJA_DICT: Record<AdminLocale, CajaDictionary> = {
  es: {
    cashDrawerPage: {
      title: "Caja",
      subtitle:
        "Seguimiento interno de efectivo en el taller — saldo de apertura, cobros, gastos y ajustes",
    },
    cashDrawer: {
      dateLabel: "Fecha",
      summary: {
        openingToday: "Apertura hoy",
        cashReceived: "Efectivo recibido",
        cashPaidOut: "Efectivo pagado",
        adjustments: "Ajustes",
        expectedBalance: "Saldo esperado en caja",
      },
      form: {
        heading: "Nuevo movimiento",
        typeLabel: "Tipo",
        amountLabel: "Monto",
        amountPlaceholder: "0.00",
        adjustmentHint: "Usa valores negativos para reducir el saldo.",
        dateTimeLabel: "Fecha y hora",
        noteLabel: "Nota (opcional)",
        notePlaceholder: "Ej. compra de repuestos en efectivo",
        genericError: "No se pudo guardar el movimiento",
        submitting: "Guardando...",
        submit: "Registrar movimiento",
      },
      table: {
        heading: "Movimientos del día",
        hint: "Las entradas por cobros en efectivo se crean al marcar facturas como pagadas.",
        empty: "Sin movimientos para esta fecha",
        colTime: "Hora",
        colType: "Tipo",
        colAmount: "Monto",
        colNoteInvoice: "Nota / Factura",
        deleteTitle: "Eliminar",
        deleteConfirm: "¿Eliminar este movimiento manual?",
        dash: "—",
      },
    },
    accountingPage: {
      title: "Contabilidad",
      subtitle: "Sube documentos directamente a Google Drive · La contadora recibe una notificación por email",
    },
    accounting: {
      driveFolderTitle: "Carpeta de Drive compartida con tu contadora",
      driveFolderSubtitle:
        "Las facturas se exportan automáticamente a esta carpeta al marcarlas como pagadas.",
      docFilterLabel: "Filtro de documentos",
      uploadHeading: (categoryLabel) => `Subir a ${categoryLabel}`,
      uploadHintPrefix: "Se subirá a la carpeta ",
      uploadHintSuffix: " en Google Drive",
      noDocuments: "No hay documentos con este filtro",
      driveLink: "Drive",
      autoExported: "Exportado automáticamente",
      manualUpload: "Subida manual",
    },
    uploadZone: {
      dropHere: "Suelta los archivos aquí",
      dragInstructionsPrefix: "Arrastra archivos aquí o ",
      dragInstructionsCta: "haz clic para seleccionar",
      fileTypeHint: "PDF, imágenes, Word, Excel · Máximo 20 MB por archivo",
      uploading: "Subiendo a Drive...",
      done: "Subido y enviado a la contadora ✓",
      genericError: "Error al subir",
      toastSuccess: (fileName) => `${fileName} subido a Drive`,
      toastError: "Error al subir el archivo",
    },
  },
  en: {
    cashDrawerPage: {
      title: "Cash drawer",
      subtitle:
        "Internal cash tracking for the shop — opening balance, payments received, expenses, and adjustments",
    },
    cashDrawer: {
      dateLabel: "Date",
      summary: {
        openingToday: "Opening today",
        cashReceived: "Cash received",
        cashPaidOut: "Cash paid out",
        adjustments: "Adjustments",
        expectedBalance: "Expected cash balance",
      },
      form: {
        heading: "New entry",
        typeLabel: "Type",
        amountLabel: "Amount",
        amountPlaceholder: "0.00",
        adjustmentHint: "Use negative values to reduce the balance.",
        dateTimeLabel: "Date and time",
        noteLabel: "Note (optional)",
        notePlaceholder: "E.g. cash purchase of parts",
        genericError: "Could not save the entry",
        submitting: "Saving...",
        submit: "Record entry",
      },
      table: {
        heading: "Today's entries",
        hint: "Entries for cash payments are created automatically when an invoice is marked as paid.",
        empty: "No entries for this date",
        colTime: "Time",
        colType: "Type",
        colAmount: "Amount",
        colNoteInvoice: "Note / Invoice",
        deleteTitle: "Delete",
        deleteConfirm: "Delete this manual entry?",
        dash: "—",
      },
    },
    accountingPage: {
      title: "Accounting",
      subtitle: "Upload documents directly to Google Drive · Your accountant gets notified by email",
    },
    accounting: {
      driveFolderTitle: "Drive folder shared with your accountant",
      driveFolderSubtitle:
        "Invoices are exported automatically to this folder when marked as paid.",
      docFilterLabel: "Document filter",
      uploadHeading: (categoryLabel) => `Upload to ${categoryLabel}`,
      uploadHintPrefix: "This will be uploaded to the ",
      uploadHintSuffix: " folder in Google Drive",
      noDocuments: "No documents match this filter",
      driveLink: "Drive",
      autoExported: "Exported automatically",
      manualUpload: "Manual upload",
    },
    uploadZone: {
      dropHere: "Drop the files here",
      dragInstructionsPrefix: "Drag files here or ",
      dragInstructionsCta: "click to select",
      fileTypeHint: "PDF, images, Word, Excel · Max 20 MB per file",
      uploading: "Uploading to Drive...",
      done: "Uploaded and sent to your accountant ✓",
      genericError: "Upload failed",
      toastSuccess: (fileName) => `${fileName} uploaded to Drive`,
      toastError: "Error uploading the file",
    },
  },
  fr: {
    cashDrawerPage: {
      title: "Caisse",
      subtitle:
        "Suivi interne de l'argent comptant du garage — solde d'ouverture, encaissements, dépenses et ajustements",
    },
    cashDrawer: {
      dateLabel: "Date",
      summary: {
        openingToday: "Ouverture aujourd'hui",
        cashReceived: "Argent reçu",
        cashPaidOut: "Argent versé",
        adjustments: "Ajustements",
        expectedBalance: "Solde attendu en caisse",
      },
      form: {
        heading: "Nouvelle transaction",
        typeLabel: "Type",
        amountLabel: "Montant",
        amountPlaceholder: "0.00",
        adjustmentHint: "Utilisez des valeurs négatives pour réduire le solde.",
        dateTimeLabel: "Date et heure",
        noteLabel: "Note (optionnel)",
        notePlaceholder: "Ex. achat de pièces en argent comptant",
        genericError: "Impossible d'enregistrer la transaction",
        submitting: "Enregistrement...",
        submit: "Enregistrer la transaction",
      },
      table: {
        heading: "Transactions du jour",
        hint: "Les entrées pour les encaissements comptants sont créées automatiquement lorsqu'une facture est marquée comme payée.",
        empty: "Aucune transaction pour cette date",
        colTime: "Heure",
        colType: "Type",
        colAmount: "Montant",
        colNoteInvoice: "Note / Facture",
        deleteTitle: "Supprimer",
        deleteConfirm: "Supprimer cette transaction manuelle ?",
        dash: "—",
      },
    },
    accountingPage: {
      title: "Comptabilité",
      subtitle: "Téléversez vos documents directement sur Google Drive · Votre comptable reçoit une notification par courriel",
    },
    accounting: {
      driveFolderTitle: "Dossier Drive partagé avec votre comptable",
      driveFolderSubtitle:
        "Les factures sont exportées automatiquement vers ce dossier lorsqu'elles sont marquées comme payées.",
      docFilterLabel: "Filtre de documents",
      uploadHeading: (categoryLabel) => `Téléverser vers ${categoryLabel}`,
      uploadHintPrefix: "Le fichier sera téléversé dans le dossier ",
      uploadHintSuffix: " sur Google Drive",
      noDocuments: "Aucun document pour ce filtre",
      driveLink: "Drive",
      autoExported: "Exporté automatiquement",
      manualUpload: "Téléversement manuel",
    },
    uploadZone: {
      dropHere: "Déposez les fichiers ici",
      dragInstructionsPrefix: "Glissez des fichiers ici ou ",
      dragInstructionsCta: "cliquez pour en sélectionner",
      fileTypeHint: "PDF, images, Word, Excel · Maximum 20 Mo par fichier",
      uploading: "Téléversement vers Drive...",
      done: "Téléversé et envoyé à votre comptable ✓",
      genericError: "Échec du téléversement",
      toastSuccess: (fileName) => `${fileName} téléversé sur Drive`,
      toastError: "Erreur lors du téléversement du fichier",
    },
  },
};
