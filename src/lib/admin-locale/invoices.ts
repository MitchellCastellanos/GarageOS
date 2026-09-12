import type { AdminLocale } from "@/lib/admin-locale";

export interface InvoicesDictionary {
  itemTypes: {
    LABOUR: string;
    PART: string;
    OTHER: string;
  };
  list: {
    title: string;
    invoiceCount: (n: number) => string;
    newInvoice: string;
    createFirst: string;
    emptyAll: string;
    emptyStatus: (label: string) => string;
    tableHeaders: {
      invoiceClient: string;
      vehicle: string;
      date: string;
      status: string;
      total: string;
    };
  };
  detail: {
    editLabel: string;
    downloadPdf: string;
    downloadFileSuffix: string;
    issuedOn: (date: string) => string;
    dueOn: (date: string) => string;
    languageLabel: (label: string) => string;
    emailSentLabel: (date: string, count: number) => string;
    smsSentLabel: (date: string, count: number) => string;
    accounting: {
      title: string;
      exportLabel: string;
      exportIncluded: string;
      paymentMethodLabel: string;
      cashMovementLabel: string;
    };
    paymentModeLabels: { CARD: string; CASH: string; MIXED: string };
    clientTitle: string;
    vehicleTitle: string;
    vehicleNumbered: (n: number) => string;
    plateLabel: string;
    mileageIn: (value: string, unit: string) => string;
    mileageOut: (value: string, unit: string) => string;
    servicesTitle: string;
    tableHeaders: {
      description: string;
      type: string;
      qty: string;
      unitPrice: string;
      total: string;
    };
    warrantyLabel: string;
    notesTitle: string;
    summary: {
      title: string;
      subtotal: string;
      tps: (pct: string) => string;
      tvq: (pct: string) => string;
      totalTaxes: string;
      totalCad: string;
    };
    paidOn: (date: string) => string;
    paymentBreakdownTitle: string;
    terminalReceiptsTitle: string;
    receiptFallbackName: string;
  };
  form: {
    newTitle: string;
    newSubtitle: string;
    editTitle: (invoiceNumber: string) => string;
    editSubtitle: string;
    clientSectionTitle: string;
    clientLabel: string;
    dueDateLabel: string;
    validUntilLabel: string;
    invoiceLanguageLabel: string;
    quoteLanguageLabel: string;
    addVehicle: string;
    notesLabel: string;
    notesPlaceholder: string;
    summaryTitle: string;
    taxRateLabel: string;
    subtotal: string;
    tps: (pct: string) => string;
    tvq: (pct: string) => string;
    totalTaxes: (pct: string) => string;
    totalCad: string;
    saving: string;
    saveChanges: string;
    createQuoteDraft: string;
    createInvoiceDraft: string;
    cancel: string;
    vehicle: {
      numbered: (n: number) => string;
      remove: string;
      removeTitle: string;
      vehicleLabel: string;
      selectClientFirst: string;
      noVehiclesAvailable: string;
      selectPlaceholder: string;
      mileageInLabel: string;
      mileageOutLabel: string;
      servicesTitle: string;
      tableHeaders: {
        description: string;
        type: string;
        warranty: string;
        quantity: string;
        unitPrice: string;
        total: string;
      };
      warrantyPlaceholderMobile: string;
      warrantyPlaceholderDesktop: string;
      addLine: string;
      removeLineTitle: string;
    };
  };
  actions: {
    noContactTitle: string;
    noContactLabel: string;
    revertToPending: string;
    revertedToast: string;
    cancelButton: string;
    cancelConfirm: (invoiceNumber: string) => string;
    cancelledToast: string;
    deleteButton: string;
    deleteConfirm: (invoiceNumber: string) => string;
  };
  sendDialog: {
    sendInvoice: string;
    resendInvoice: string;
    maxExtraDocs: (n: number) => string;
    tabEmailLabel: string;
    tabSmsLabel: string;
    emailDescription: (isPaid: boolean) => string;
    smsDescription: (isPaid: boolean, hasFiles: boolean) => string;
    cancel: string;
    sending: string;
    sendByEmail: string;
    sendBySms: string;
    maxDocsHint: (max: number) => string;
    emailAttachHint: string;
    smsAttachHint: string;
    sentToast: (channelLabel: string, destination: string) => string;
    resentToast: (channelLabel: string, destination: string) => string;
    channelEmail: string;
    channelSms: string;
  };
  markPaidDialog: {
    button: string;
    dialogTitle: string;
    pdfNote: string;
    totalToCover: string;
    registered: string;
    missing: string;
    paymentMethodTitle: string;
    modes: {
      card: { label: string; hint: string };
      cash: { label: string; hint: string };
      mixed: { label: string; hint: string };
    };
    amountPlaceholder: string;
    addButton: string;
    receiptLabel: (fileName: string) => string;
    noReceipt: string;
    receiptOptional: string;
    askUploadReceipt: string;
    yesUpload: string;
    noContinue: string;
    uploadReceiptLabel: string;
    cameraReceiptLabel: string;
    uploadReceiptLink: string;
    extraDocsTitle: string;
    extraDocsHint: string;
    remove: string;
    cancel: string;
    confirmPayment: string;
    invalidAmount: string;
    missingAmount: (amount: string) => string;
    uploadingReceipts: string;
    uploadError: string;
    markedPaidToast: string;
  };
  paymentReceipts: {
    viewPdfReceipt: string;
    openNewTab: string;
    previewAlt: string;
  };
  clientCombobox: {
    searchPlaceholder: string;
    clearSelectionTitle: string;
    noResults: string;
  };
  lineItemInput: {
    placeholder: string;
    usedCount: (n: number) => string;
  };
}

export const INVOICES_DICT: Record<AdminLocale, InvoicesDictionary> = {
  es: {
    itemTypes: {
      LABOUR: "Mano de obra",
      PART: "Repuesto",
      OTHER: "Otro",
    },
    list: {
      title: "Facturas",
      invoiceCount: (n) => `${n} factura${n !== 1 ? "s" : ""}`,
      newInvoice: "Nueva factura",
      createFirst: "Crear primera factura",
      emptyAll: "No hay facturas todavía",
      emptyStatus: (label) => `No hay facturas en estado "${label}"`,
      tableHeaders: {
        invoiceClient: "Factura / Cliente",
        vehicle: "Vehículo",
        date: "Fecha",
        status: "Estado",
        total: "Total",
      },
    },
    detail: {
      editLabel: "Editar",
      downloadPdf: "Descargar PDF",
      downloadFileSuffix: "-completo",
      issuedOn: (date) => `Emitida el ${date}`,
      dueOn: (date) => `Vence el ${date}`,
      languageLabel: (label) => `Idioma: ${label}`,
      emailSentLabel: (date, count) => `Email: ${date}${count > 1 ? ` (${count}×)` : ""}`,
      smsSentLabel: (date, count) => `SMS: ${date}${count > 1 ? ` (${count}×)` : ""}`,
      accounting: {
        title: "Registro y contabilidad",
        exportLabel: "Exportación a contabilidad",
        exportIncluded: "Incluida al marcar como pagada",
        paymentMethodLabel: "Método de pago",
        cashMovementLabel: "Movimiento en caja",
      },
      paymentModeLabels: { CARD: "Tarjeta", CASH: "Efectivo", MIXED: "Tarjeta + efectivo" },
      clientTitle: "Cliente",
      vehicleTitle: "Vehículo",
      vehicleNumbered: (n) => `Vehículo ${n}`,
      plateLabel: "Placa: ",
      mileageIn: (value, unit) => `Entrada: ${value} ${unit}`,
      mileageOut: (value, unit) => `Salida: ${value} ${unit}`,
      servicesTitle: "Servicios y repuestos",
      tableHeaders: {
        description: "Descripción",
        type: "Tipo",
        qty: "Cant.",
        unitPrice: "P. Unit.",
        total: "Total",
      },
      warrantyLabel: "Garantía: ",
      notesTitle: "Notas",
      summary: {
        title: "Resumen",
        subtotal: "Subtotal",
        tps: (pct) => `TPS (${pct}%)`,
        tvq: (pct) => `TVQ (${pct}%)`,
        totalTaxes: "Total impuestos",
        totalCad: "Total CAD",
      },
      paidOn: (date) => `Pagada el ${date}`,
      paymentBreakdownTitle: "Desglose de pago",
      terminalReceiptsTitle: "Comprobantes de terminal",
      receiptFallbackName: "comprobante",
    },
    form: {
      newTitle: "Nueva factura",
      newSubtitle: "Completa los datos para crear una factura electrónica",
      editTitle: (invoiceNumber) => `Editar ${invoiceNumber}`,
      editSubtitle: "Modifica los datos del borrador antes de enviarlo",
      clientSectionTitle: "Cliente y vigencia",
      clientLabel: "Cliente *",
      dueDateLabel: "Fecha de vencimiento",
      validUntilLabel: "Válida hasta",
      invoiceLanguageLabel: "Idioma de la factura *",
      quoteLanguageLabel: "Idioma de la cotización *",
      addVehicle: "Agregar otro vehículo",
      notesLabel: "Notas (opcionales)",
      notesPlaceholder: "Observaciones, garantía, instrucciones de pago...",
      summaryTitle: "Resumen",
      taxRateLabel: "Tasa de impuestos (TPS+TVQ)",
      subtotal: "Subtotal",
      tps: (pct) => `TPS (${pct}%)`,
      tvq: (pct) => `TVQ (${pct}%)`,
      totalTaxes: (pct) => `Total impuestos (${pct}%)`,
      totalCad: "Total CAD",
      saving: "Guardando...",
      saveChanges: "Guardar cambios",
      createQuoteDraft: "Crear cotización borrador",
      createInvoiceDraft: "Crear factura borrador",
      cancel: "Cancelar",
      vehicle: {
        numbered: (n) => `Vehículo ${n}`,
        remove: "Quitar",
        removeTitle: "Quitar vehículo",
        vehicleLabel: "Vehículo *",
        selectClientFirst: "Selecciona un cliente primero",
        noVehiclesAvailable: "Sin vehículos disponibles",
        selectPlaceholder: "Seleccionar vehículo...",
        mileageInLabel: "Km entrada (opcional)",
        mileageOutLabel: "Km salida (opcional)",
        servicesTitle: "Servicios y repuestos",
        tableHeaders: {
          description: "Descripción",
          type: "Tipo",
          warranty: "Garantía",
          quantity: "Cantidad",
          unitPrice: "P. unitario",
          total: "Total",
        },
        warrantyPlaceholderMobile: "Garantía ej: 12 meses",
        warrantyPlaceholderDesktop: "12 meses",
        addLine: "Agregar línea",
        removeLineTitle: "Eliminar línea",
      },
    },
    actions: {
      noContactTitle: "Agrega email o teléfono al cliente para enviar la factura",
      noContactLabel: "Sin contacto del cliente",
      revertToPending: "Regresar a pendiente",
      revertedToast: "Factura regresada a pendiente",
      cancelButton: "Anular",
      cancelConfirm: (invoiceNumber) =>
        `¿Anular la factura ${invoiceNumber}? Dejará de contar como pagada o activa, pero permanecerá en el historial.`,
      cancelledToast: "Factura anulada",
      deleteButton: "Eliminar",
      deleteConfirm: (invoiceNumber) =>
        `¿Eliminar definitivamente ${invoiceNumber}? Esta acción no se puede deshacer.`,
    },
    sendDialog: {
      sendInvoice: "Enviar factura",
      resendInvoice: "Reenviar factura",
      maxExtraDocs: (n) => `Máximo ${n} documentos extra`,
      tabEmailLabel: "Email",
      tabSmsLabel: "SMS",
      emailDescription: (isPaid) =>
        isPaid
          ? "Se envía un solo PDF con la factura, los documentos que agregues aquí y los comprobantes de pago al final."
          : "Se envía un solo PDF con la factura y los documentos que agregues aquí.",
      smsDescription: (isPaid, hasFiles) => {
        let s = "Se envía un SMS con un enlace para descargar la factura en PDF";
        if (isPaid) s += " (incluye comprobantes de pago si aplica)";
        if (hasFiles) s += " y los documentos extra que agregues aquí";
        return `${s}.`;
      },
      cancel: "Cancelar",
      sending: "Enviando…",
      sendByEmail: "Enviar por email",
      sendBySms: "Enviar por SMS",
      maxDocsHint: (max) => `PDF o imágenes · Máx. ${max} documentos · 5 MB c/u`,
      emailAttachHint: " · un solo archivo adjunto al correo",
      smsAttachHint: " · incluidos en el PDF del enlace",
      sentToast: (channel, dest) => `Factura enviada por ${channel} a ${dest}`,
      resentToast: (channel, dest) => `Factura reenviada por ${channel} a ${dest}`,
      channelEmail: "email",
      channelSms: "SMS",
    },
    markPaidDialog: {
      button: "Marcar como pagada",
      dialogTitle: "Registrar pago",
      pdfNote: "Al confirmar se genera un solo PDF: factura, documentos extra y comprobantes al final.",
      totalToCover: "Total a cubrir",
      registered: "Registrado",
      missing: "Falta",
      paymentMethodTitle: "Forma de pago",
      modes: {
        card: { label: "Tarjeta", hint: "Comprobante de terminal opcional por cada cobro" },
        cash: { label: "Efectivo", hint: "Cuenta en ingresos de caja del negocio" },
        mixed: { label: "Ambos", hint: "Parte en tarjeta, parte en efectivo" },
      },
      amountPlaceholder: "Monto",
      addButton: "Agregar",
      receiptLabel: (fileName) => `Comprobante: ${fileName}`,
      noReceipt: "Sin comprobante de terminal",
      receiptOptional: "Comprobante de terminal (opcional)",
      askUploadReceipt: "¿Deseas subir el recibo de la terminal?",
      yesUpload: "Sí, subir recibo",
      noContinue: "No, continuar sin recibo",
      uploadReceiptLabel: "Subir comprobante",
      cameraReceiptLabel: "Foto comprobante",
      uploadReceiptLink: "Subir recibo de la terminal",
      extraDocsTitle: "Documentos adicionales (opcional)",
      extraDocsHint: "Alineación, cotización, fotos de servicio, etc. Van en el PDF después de la factura.",
      remove: "Quitar",
      cancel: "Cancelar",
      confirmPayment: "Confirmar pago",
      invalidAmount: "Ingresa un monto válido",
      missingAmount: (amount) => `Falta por registrar ${amount}`,
      uploadingReceipts: "Subiendo comprobantes…",
      uploadError: "Error al subir archivo",
      markedPaidToast: "Factura marcada como pagada",
    },
    paymentReceipts: {
      viewPdfReceipt: "Ver comprobante PDF",
      openNewTab: "Abrir en pestaña nueva",
      previewAlt: "Comprobante",
    },
    clientCombobox: {
      searchPlaceholder: "Buscar por nombre, teléfono o email...",
      clearSelectionTitle: "Quitar selección",
      noResults: "Sin resultados",
    },
    lineItemInput: {
      placeholder: "Ej: Ball joint, Cambio de aceite…",
      usedCount: (n) => ` · usado ${n}×`,
    },
  },
  en: {
    itemTypes: {
      LABOUR: "Labour",
      PART: "Part",
      OTHER: "Other",
    },
    list: {
      title: "Invoices",
      invoiceCount: (n) => `${n} invoice${n !== 1 ? "s" : ""}`,
      newInvoice: "New invoice",
      createFirst: "Create first invoice",
      emptyAll: "No invoices yet",
      emptyStatus: (label) => `No invoices with status "${label}"`,
      tableHeaders: {
        invoiceClient: "Invoice / Client",
        vehicle: "Vehicle",
        date: "Date",
        status: "Status",
        total: "Total",
      },
    },
    detail: {
      editLabel: "Edit",
      downloadPdf: "Download PDF",
      downloadFileSuffix: "-complete",
      issuedOn: (date) => `Issued on ${date}`,
      dueOn: (date) => `Due on ${date}`,
      languageLabel: (label) => `Language: ${label}`,
      emailSentLabel: (date, count) => `Email: ${date}${count > 1 ? ` (${count}×)` : ""}`,
      smsSentLabel: (date, count) => `SMS: ${date}${count > 1 ? ` (${count}×)` : ""}`,
      accounting: {
        title: "Record and accounting",
        exportLabel: "Export to accounting",
        exportIncluded: "Included when marked as paid",
        paymentMethodLabel: "Payment method",
        cashMovementLabel: "Cash drawer movement",
      },
      paymentModeLabels: { CARD: "Card", CASH: "Cash", MIXED: "Card + cash" },
      clientTitle: "Client",
      vehicleTitle: "Vehicle",
      vehicleNumbered: (n) => `Vehicle ${n}`,
      plateLabel: "Plate: ",
      mileageIn: (value, unit) => `In: ${value} ${unit}`,
      mileageOut: (value, unit) => `Out: ${value} ${unit}`,
      servicesTitle: "Services and parts",
      tableHeaders: {
        description: "Description",
        type: "Type",
        qty: "Qty",
        unitPrice: "Unit price",
        total: "Total",
      },
      warrantyLabel: "Warranty: ",
      notesTitle: "Notes",
      summary: {
        title: "Summary",
        subtotal: "Subtotal",
        tps: (pct) => `GST (${pct}%)`,
        tvq: (pct) => `QST (${pct}%)`,
        totalTaxes: "Total taxes",
        totalCad: "Total CAD",
      },
      paidOn: (date) => `Paid on ${date}`,
      paymentBreakdownTitle: "Payment breakdown",
      terminalReceiptsTitle: "Terminal receipts",
      receiptFallbackName: "receipt",
    },
    form: {
      newTitle: "New invoice",
      newSubtitle: "Fill in the details to create an electronic invoice",
      editTitle: (invoiceNumber) => `Edit ${invoiceNumber}`,
      editSubtitle: "Update the draft's details before sending it",
      clientSectionTitle: "Client and validity",
      clientLabel: "Client *",
      dueDateLabel: "Due date",
      validUntilLabel: "Valid until",
      invoiceLanguageLabel: "Invoice language *",
      quoteLanguageLabel: "Quote language *",
      addVehicle: "Add another vehicle",
      notesLabel: "Notes (optional)",
      notesPlaceholder: "Remarks, warranty, payment instructions...",
      summaryTitle: "Summary",
      taxRateLabel: "Tax rate (GST+QST)",
      subtotal: "Subtotal",
      tps: (pct) => `GST (${pct}%)`,
      tvq: (pct) => `QST (${pct}%)`,
      totalTaxes: (pct) => `Total taxes (${pct}%)`,
      totalCad: "Total CAD",
      saving: "Saving...",
      saveChanges: "Save changes",
      createQuoteDraft: "Create draft quote",
      createInvoiceDraft: "Create draft invoice",
      cancel: "Cancel",
      vehicle: {
        numbered: (n) => `Vehicle ${n}`,
        remove: "Remove",
        removeTitle: "Remove vehicle",
        vehicleLabel: "Vehicle *",
        selectClientFirst: "Select a client first",
        noVehiclesAvailable: "No vehicles available",
        selectPlaceholder: "Select a vehicle...",
        mileageInLabel: "Mileage in (optional)",
        mileageOutLabel: "Mileage out (optional)",
        servicesTitle: "Services and parts",
        tableHeaders: {
          description: "Description",
          type: "Type",
          warranty: "Warranty",
          quantity: "Quantity",
          unitPrice: "Unit price",
          total: "Total",
        },
        warrantyPlaceholderMobile: "Warranty e.g.: 12 months",
        warrantyPlaceholderDesktop: "12 months",
        addLine: "Add line",
        removeLineTitle: "Remove line",
      },
    },
    actions: {
      noContactTitle: "Add an email or phone number to the client to send the invoice",
      noContactLabel: "No client contact info",
      revertToPending: "Revert to pending",
      revertedToast: "Invoice reverted to pending",
      cancelButton: "Void",
      cancelConfirm: (invoiceNumber) =>
        `Void invoice ${invoiceNumber}? It will no longer count as paid or active, but will stay in the history.`,
      cancelledToast: "Invoice voided",
      deleteButton: "Delete",
      deleteConfirm: (invoiceNumber) =>
        `Permanently delete ${invoiceNumber}? This cannot be undone.`,
    },
    sendDialog: {
      sendInvoice: "Send invoice",
      resendInvoice: "Resend invoice",
      maxExtraDocs: (n) => `Maximum ${n} extra documents`,
      tabEmailLabel: "Email",
      tabSmsLabel: "SMS",
      emailDescription: (isPaid) =>
        isPaid
          ? "A single PDF is sent with the invoice, the documents you add here, and the payment receipts at the end."
          : "A single PDF is sent with the invoice and the documents you add here.",
      smsDescription: (isPaid, hasFiles) => {
        let s = "An SMS is sent with a link to download the invoice PDF";
        if (isPaid) s += " (includes payment receipts if applicable)";
        if (hasFiles) s += " and the extra documents you add here";
        return `${s}.`;
      },
      cancel: "Cancel",
      sending: "Sending…",
      sendByEmail: "Send by email",
      sendBySms: "Send by SMS",
      maxDocsHint: (max) => `PDF or images · Max. ${max} documents · 5 MB each`,
      emailAttachHint: " · a single file attached to the email",
      smsAttachHint: " · included in the linked PDF",
      sentToast: (channel, dest) => `Invoice sent by ${channel} to ${dest}`,
      resentToast: (channel, dest) => `Invoice resent by ${channel} to ${dest}`,
      channelEmail: "email",
      channelSms: "SMS",
    },
    markPaidDialog: {
      button: "Mark as paid",
      dialogTitle: "Record payment",
      pdfNote: "Confirming generates a single PDF: invoice, extra documents, and receipts at the end.",
      totalToCover: "Total to cover",
      registered: "Recorded",
      missing: "Missing",
      paymentMethodTitle: "Payment method",
      modes: {
        card: { label: "Card", hint: "Optional terminal receipt for each charge" },
        cash: { label: "Cash", hint: "Counted in the business's cash drawer income" },
        mixed: { label: "Both", hint: "Part by card, part in cash" },
      },
      amountPlaceholder: "Amount",
      addButton: "Add",
      receiptLabel: (fileName) => `Receipt: ${fileName}`,
      noReceipt: "No terminal receipt",
      receiptOptional: "Terminal receipt (optional)",
      askUploadReceipt: "Do you want to upload the terminal receipt?",
      yesUpload: "Yes, upload receipt",
      noContinue: "No, continue without a receipt",
      uploadReceiptLabel: "Upload receipt",
      cameraReceiptLabel: "Photo of receipt",
      uploadReceiptLink: "Upload terminal receipt",
      extraDocsTitle: "Additional documents (optional)",
      extraDocsHint: "Alignment report, quote, service photos, etc. Added to the PDF after the invoice.",
      remove: "Remove",
      cancel: "Cancel",
      confirmPayment: "Confirm payment",
      invalidAmount: "Enter a valid amount",
      missingAmount: (amount) => `${amount} still needs to be recorded`,
      uploadingReceipts: "Uploading receipts…",
      uploadError: "Error uploading file",
      markedPaidToast: "Invoice marked as paid",
    },
    paymentReceipts: {
      viewPdfReceipt: "View PDF receipt",
      openNewTab: "Open in new tab",
      previewAlt: "Receipt",
    },
    clientCombobox: {
      searchPlaceholder: "Search by name, phone, or email...",
      clearSelectionTitle: "Clear selection",
      noResults: "No results",
    },
    lineItemInput: {
      placeholder: "E.g.: Ball joint, Oil change…",
      usedCount: (n) => ` · used ${n}×`,
    },
  },
  fr: {
    itemTypes: {
      LABOUR: "Main-d'œuvre",
      PART: "Pièce",
      OTHER: "Autre",
    },
    list: {
      title: "Factures",
      invoiceCount: (n) => `${n} facture${n !== 1 ? "s" : ""}`,
      newInvoice: "Nouvelle facture",
      createFirst: "Créer la première facture",
      emptyAll: "Aucune facture pour le moment",
      emptyStatus: (label) => `Aucune facture avec le statut « ${label} »`,
      tableHeaders: {
        invoiceClient: "Facture / Client",
        vehicle: "Véhicule",
        date: "Date",
        status: "Statut",
        total: "Total",
      },
    },
    detail: {
      editLabel: "Modifier",
      downloadPdf: "Télécharger le PDF",
      downloadFileSuffix: "-complet",
      issuedOn: (date) => `Émise le ${date}`,
      dueOn: (date) => `Échéance le ${date}`,
      languageLabel: (label) => `Langue : ${label}`,
      emailSentLabel: (date, count) => `Courriel : ${date}${count > 1 ? ` (${count}×)` : ""}`,
      smsSentLabel: (date, count) => `SMS : ${date}${count > 1 ? ` (${count}×)` : ""}`,
      accounting: {
        title: "Registre et comptabilité",
        exportLabel: "Exportation vers la comptabilité",
        exportIncluded: "Incluse lorsque marquée comme payée",
        paymentMethodLabel: "Méthode de paiement",
        cashMovementLabel: "Mouvement de caisse",
      },
      paymentModeLabels: { CARD: "Carte", CASH: "Comptant", MIXED: "Carte + comptant" },
      clientTitle: "Client",
      vehicleTitle: "Véhicule",
      vehicleNumbered: (n) => `Véhicule ${n}`,
      plateLabel: "Plaque : ",
      mileageIn: (value, unit) => `Entrée : ${value} ${unit}`,
      mileageOut: (value, unit) => `Sortie : ${value} ${unit}`,
      servicesTitle: "Services et pièces",
      tableHeaders: {
        description: "Description",
        type: "Type",
        qty: "Qté",
        unitPrice: "Prix unit.",
        total: "Total",
      },
      warrantyLabel: "Garantie : ",
      notesTitle: "Notes",
      summary: {
        title: "Résumé",
        subtotal: "Sous-total",
        tps: (pct) => `TPS (${pct} %)`,
        tvq: (pct) => `TVQ (${pct} %)`,
        totalTaxes: "Total des taxes",
        totalCad: "Total CAD",
      },
      paidOn: (date) => `Payée le ${date}`,
      paymentBreakdownTitle: "Détail du paiement",
      terminalReceiptsTitle: "Reçus de terminal",
      receiptFallbackName: "reçu",
    },
    form: {
      newTitle: "Nouvelle facture",
      newSubtitle: "Remplissez les informations pour créer une facture électronique",
      editTitle: (invoiceNumber) => `Modifier ${invoiceNumber}`,
      editSubtitle: "Modifiez les informations du brouillon avant de l'envoyer",
      clientSectionTitle: "Client et validité",
      clientLabel: "Client *",
      dueDateLabel: "Date d'échéance",
      validUntilLabel: "Valide jusqu'au",
      invoiceLanguageLabel: "Langue de la facture *",
      quoteLanguageLabel: "Langue de la soumission *",
      addVehicle: "Ajouter un autre véhicule",
      notesLabel: "Notes (optionnelles)",
      notesPlaceholder: "Observations, garantie, instructions de paiement...",
      summaryTitle: "Résumé",
      taxRateLabel: "Taux de taxes (TPS+TVQ)",
      subtotal: "Sous-total",
      tps: (pct) => `TPS (${pct} %)`,
      tvq: (pct) => `TVQ (${pct} %)`,
      totalTaxes: (pct) => `Total des taxes (${pct} %)`,
      totalCad: "Total CAD",
      saving: "Enregistrement...",
      saveChanges: "Enregistrer les changements",
      createQuoteDraft: "Créer une soumission brouillon",
      createInvoiceDraft: "Créer une facture brouillon",
      cancel: "Annuler",
      vehicle: {
        numbered: (n) => `Véhicule ${n}`,
        remove: "Retirer",
        removeTitle: "Retirer le véhicule",
        vehicleLabel: "Véhicule *",
        selectClientFirst: "Sélectionnez d'abord un client",
        noVehiclesAvailable: "Aucun véhicule disponible",
        selectPlaceholder: "Sélectionner un véhicule...",
        mileageInLabel: "Km à l'entrée (optionnel)",
        mileageOutLabel: "Km à la sortie (optionnel)",
        servicesTitle: "Services et pièces",
        tableHeaders: {
          description: "Description",
          type: "Type",
          warranty: "Garantie",
          quantity: "Quantité",
          unitPrice: "Prix unit.",
          total: "Total",
        },
        warrantyPlaceholderMobile: "Garantie ex. : 12 mois",
        warrantyPlaceholderDesktop: "12 mois",
        addLine: "Ajouter une ligne",
        removeLineTitle: "Supprimer la ligne",
      },
    },
    actions: {
      noContactTitle: "Ajoutez un courriel ou un téléphone au client pour envoyer la facture",
      noContactLabel: "Aucun contact client",
      revertToPending: "Remettre en attente",
      revertedToast: "Facture remise en attente",
      cancelButton: "Annuler",
      cancelConfirm: (invoiceNumber) =>
        `Annuler la facture ${invoiceNumber} ? Elle ne comptera plus comme payée ou active, mais restera dans l'historique.`,
      cancelledToast: "Facture annulée",
      deleteButton: "Supprimer",
      deleteConfirm: (invoiceNumber) =>
        `Supprimer définitivement ${invoiceNumber} ? Cette action est irréversible.`,
    },
    sendDialog: {
      sendInvoice: "Envoyer la facture",
      resendInvoice: "Renvoyer la facture",
      maxExtraDocs: (n) => `Maximum ${n} documents supplémentaires`,
      tabEmailLabel: "Courriel",
      tabSmsLabel: "SMS",
      emailDescription: (isPaid) =>
        isPaid
          ? "Un seul PDF est envoyé avec la facture, les documents que vous ajoutez ici et les reçus de paiement à la fin."
          : "Un seul PDF est envoyé avec la facture et les documents que vous ajoutez ici.",
      smsDescription: (isPaid, hasFiles) => {
        let s = "Un SMS est envoyé avec un lien pour télécharger la facture en PDF";
        if (isPaid) s += " (inclut les reçus de paiement le cas échéant)";
        if (hasFiles) s += " et les documents supplémentaires que vous ajoutez ici";
        return `${s}.`;
      },
      cancel: "Annuler",
      sending: "Envoi en cours…",
      sendByEmail: "Envoyer par courriel",
      sendBySms: "Envoyer par SMS",
      maxDocsHint: (max) => `PDF ou images · Max. ${max} documents · 5 Mo chacun`,
      emailAttachHint: " · un seul fichier joint au courriel",
      smsAttachHint: " · inclus dans le PDF du lien",
      sentToast: (channel, dest) => `Facture envoyée par ${channel} à ${dest}`,
      resentToast: (channel, dest) => `Facture renvoyée par ${channel} à ${dest}`,
      channelEmail: "courriel",
      channelSms: "SMS",
    },
    markPaidDialog: {
      button: "Marquer comme payée",
      dialogTitle: "Enregistrer le paiement",
      pdfNote: "En confirmant, un seul PDF est généré : facture, documents supplémentaires et reçus à la fin.",
      totalToCover: "Total à couvrir",
      registered: "Enregistré",
      missing: "Manquant",
      paymentMethodTitle: "Mode de paiement",
      modes: {
        card: { label: "Carte", hint: "Reçu de terminal optionnel pour chaque paiement" },
        cash: { label: "Comptant", hint: "Compté dans les revenus de caisse du commerce" },
        mixed: { label: "Les deux", hint: "Une partie par carte, une partie comptant" },
      },
      amountPlaceholder: "Montant",
      addButton: "Ajouter",
      receiptLabel: (fileName) => `Reçu : ${fileName}`,
      noReceipt: "Aucun reçu de terminal",
      receiptOptional: "Reçu de terminal (optionnel)",
      askUploadReceipt: "Voulez-vous téléverser le reçu du terminal ?",
      yesUpload: "Oui, téléverser le reçu",
      noContinue: "Non, continuer sans reçu",
      uploadReceiptLabel: "Téléverser le reçu",
      cameraReceiptLabel: "Photo du reçu",
      uploadReceiptLink: "Téléverser le reçu du terminal",
      extraDocsTitle: "Documents supplémentaires (optionnel)",
      extraDocsHint: "Alignement, soumission, photos du service, etc. Ajoutés au PDF après la facture.",
      remove: "Retirer",
      cancel: "Annuler",
      confirmPayment: "Confirmer le paiement",
      invalidAmount: "Entrez un montant valide",
      missingAmount: (amount) => `Il reste ${amount} à enregistrer`,
      uploadingReceipts: "Téléversement des reçus…",
      uploadError: "Erreur lors du téléversement du fichier",
      markedPaidToast: "Facture marquée comme payée",
    },
    paymentReceipts: {
      viewPdfReceipt: "Voir le reçu PDF",
      openNewTab: "Ouvrir dans un nouvel onglet",
      previewAlt: "Reçu",
    },
    clientCombobox: {
      searchPlaceholder: "Rechercher par nom, téléphone ou courriel...",
      clearSelectionTitle: "Retirer la sélection",
      noResults: "Aucun résultat",
    },
    lineItemInput: {
      placeholder: "Ex. : Rotule, changement d'huile…",
      usedCount: (n) => ` · utilisé ${n}×`,
    },
  },
};
