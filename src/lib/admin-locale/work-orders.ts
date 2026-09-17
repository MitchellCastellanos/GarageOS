import type { AdminLocale } from "@/lib/admin-locale";

export interface WorkOrdersDictionary {
  status: {
    OPEN: string;
    AWAITING_APPROVAL: string;
    APPROVED: string;
    IN_PROGRESS: string;
    COMPLETED: string;
    INVOICED: string;
    CANCELLED: string;
  };
  itemTypes: {
    LABOUR: string;
    PART: string;
    OTHER: string;
  };
  list: {
    title: string;
    countSuffix: string;
    countSuffixSingular: string;
    statusTabAll: string;
    newWorkOrder: string;
    emptyAll: string;
    emptyStatus: (status: string) => string;
    createFirst: string;
    colOrderClient: string;
    colVehicle: string;
    colMechanic: string;
    colDate: string;
    colStatus: string;
    unassigned: string;
  };
  new: {
    title: string;
    subtitle: string;
  };
  edit: {
    title: (orderNumber: string) => string;
    subtitle: string;
  };
  form: {
    clientSectionTitle: string;
    clientLabel: string;
    vehicleLabel: string;
    selectClientFirst: string;
    noVehiclesAvailable: string;
    selectVehiclePlaceholder: string;
    mechanicLabel: string;
    unassignedOption: string;
    mileageInLabel: string;
    mileageOutLabel: string;
    concernLabel: string;
    concernPlaceholder: string;
    diagnosisLabel: string;
    diagnosisPlaceholder: string;
    lineItemsTitle: string;
    lineItemsHint: string;
    addLine: string;
    removeLineTitle: string;
    tableHeaders: {
      description: string;
      type: string;
      warranty: string;
      quantity: string;
      unitPrice: string;
      total: string;
    };
    warrantyPlaceholder: string;
    subtotalLabel: string;
    saving: string;
    saveChanges: string;
    createDraft: string;
    cancel: string;
  };
  detail: {
    editButton: string;
    openedOn: (date: string) => string;
    client: string;
    vehicle: string;
    plate: (plate: string) => string;
    mechanic: string;
    unassigned: string;
    mileageIn: (value: string, unit: string) => string;
    mileageOut: (value: string, unit: string) => string;
    concernTitle: string;
    diagnosisTitle: string;
    lineItemsTitle: string;
    noLineItems: string;
    colDescription: string;
    colType: string;
    colQty: string;
    colUnitPrice: string;
    colTotal: string;
    subtotal: string;
    fromQuote: (quoteNumber: string) => string;
    linkedInvoice: (invoiceNumber: string) => string;
  };
  actions: {
    confirmDelete: (orderNumber: string) => string;
    confirmConvert: (orderNumber: string) => string;
    deleted: string;
    convertedError: string;
    viewInvoice: string;
    delete: string;
    convertToInvoice: string;
    markAwaitingApproval: string;
    approve: string;
    start: string;
    complete: string;
    cancel: string;
    reopenForApproval: string;
    statusUpdated: string;
    cannotDelete: string;
  };
}

export const WORK_ORDERS_DICT: Record<AdminLocale, WorkOrdersDictionary> = {
  es: {
    status: {
      OPEN: "Abierta",
      AWAITING_APPROVAL: "Esperando aprobación",
      APPROVED: "Aprobada",
      IN_PROGRESS: "En proceso",
      COMPLETED: "Completada",
      INVOICED: "Facturada",
      CANCELLED: "Cancelada",
    },
    itemTypes: {
      LABOUR: "Mano de obra",
      PART: "Repuesto",
      OTHER: "Otro",
    },
    list: {
      title: "Órdenes de trabajo",
      countSuffix: "órdenes",
      countSuffixSingular: "orden",
      statusTabAll: "Todas",
      newWorkOrder: "Nueva orden",
      emptyAll: "No hay órdenes de trabajo todavía",
      emptyStatus: (status) => `No hay órdenes en estado "${status}"`,
      createFirst: "Crear primera orden",
      colOrderClient: "Orden / Cliente",
      colVehicle: "Vehículo",
      colMechanic: "Mecánico",
      colDate: "Fecha",
      colStatus: "Estado",
      unassigned: "Sin asignar",
    },
    new: {
      title: "Nueva orden de trabajo",
      subtitle: "Registra el vehículo, el problema reportado y las líneas de trabajo",
    },
    edit: {
      title: (orderNumber) => `Editar ${orderNumber}`,
      subtitle: "Actualiza los datos de la orden",
    },
    form: {
      clientSectionTitle: "Cliente y vehículo",
      clientLabel: "Cliente *",
      vehicleLabel: "Vehículo *",
      selectClientFirst: "Selecciona un cliente primero",
      noVehiclesAvailable: "Sin vehículos disponibles",
      selectVehiclePlaceholder: "Seleccionar vehículo...",
      mechanicLabel: "Técnico asignado",
      unassignedOption: "Sin asignar",
      mileageInLabel: "Km entrada (opcional)",
      mileageOutLabel: "Km salida (opcional)",
      concernLabel: "Motivo / queja del cliente *",
      concernPlaceholder: "Ej: Ruido al frenar, cambio de aceite programado...",
      diagnosisLabel: "Diagnóstico (opcional)",
      diagnosisPlaceholder: "Notas técnicas del mecánico...",
      lineItemsTitle: "Trabajo y repuestos",
      lineItemsHint: "Puedes dejarlo vacío al abrir la orden y completarlo durante el diagnóstico",
      addLine: "Agregar línea",
      removeLineTitle: "Eliminar línea",
      tableHeaders: {
        description: "Descripción",
        type: "Tipo",
        warranty: "Garantía",
        quantity: "Cantidad",
        unitPrice: "P. unitario",
        total: "Total",
      },
      warrantyPlaceholder: "12 meses",
      subtotalLabel: "Subtotal estimado",
      saving: "Guardando...",
      saveChanges: "Guardar cambios",
      createDraft: "Crear orden",
      cancel: "Cancelar",
    },
    detail: {
      editButton: "Editar",
      openedOn: (date) => `Abierta el ${date}`,
      client: "Cliente",
      vehicle: "Vehículo",
      plate: (plate) => `Placa: ${plate}`,
      mechanic: "Técnico asignado",
      unassigned: "Sin asignar",
      mileageIn: (value, unit) => `Entrada: ${value} ${unit}`,
      mileageOut: (value, unit) => `Salida: ${value} ${unit}`,
      concernTitle: "Motivo del cliente",
      diagnosisTitle: "Diagnóstico",
      lineItemsTitle: "Trabajo y repuestos",
      noLineItems: "Sin líneas registradas todavía",
      colDescription: "Descripción",
      colType: "Tipo",
      colQty: "Cant.",
      colUnitPrice: "P. Unit.",
      colTotal: "Total",
      subtotal: "Subtotal estimado",
      fromQuote: (quoteNumber) => `Generada desde la cotización ${quoteNumber}`,
      linkedInvoice: (invoiceNumber) => `Facturada como ${invoiceNumber}`,
    },
    actions: {
      confirmDelete: (orderNumber) => `¿Eliminar definitivamente la orden ${orderNumber}?`,
      confirmConvert: (orderNumber) => `¿Convertir la orden ${orderNumber} en factura borrador?`,
      deleted: "Orden eliminada",
      convertedError: "No se pudo convertir la orden",
      viewInvoice: "Ver factura",
      delete: "Eliminar",
      convertToInvoice: "Facturar",
      markAwaitingApproval: "Enviar a aprobación",
      approve: "Aprobar",
      start: "Iniciar trabajo",
      complete: "Marcar completada",
      cancel: "Cancelar orden",
      reopenForApproval: "Requiere nueva aprobación",
      statusUpdated: "Estado actualizado",
      cannotDelete: "No se puede eliminar una orden ya facturada",
    },
  },
  en: {
    status: {
      OPEN: "Open",
      AWAITING_APPROVAL: "Awaiting approval",
      APPROVED: "Approved",
      IN_PROGRESS: "In progress",
      COMPLETED: "Completed",
      INVOICED: "Invoiced",
      CANCELLED: "Cancelled",
    },
    itemTypes: {
      LABOUR: "Labour",
      PART: "Part",
      OTHER: "Other",
    },
    list: {
      title: "Work orders",
      countSuffix: "work orders",
      countSuffixSingular: "work order",
      statusTabAll: "All",
      newWorkOrder: "New work order",
      emptyAll: "No work orders yet",
      emptyStatus: (status) => `No work orders with status "${status}"`,
      createFirst: "Create your first work order",
      colOrderClient: "Order / Client",
      colVehicle: "Vehicle",
      colMechanic: "Mechanic",
      colDate: "Date",
      colStatus: "Status",
      unassigned: "Unassigned",
    },
    new: {
      title: "New work order",
      subtitle: "Record the vehicle, the reported concern, and the work lines",
    },
    edit: {
      title: (orderNumber) => `Edit ${orderNumber}`,
      subtitle: "Update the work order's details",
    },
    form: {
      clientSectionTitle: "Client and vehicle",
      clientLabel: "Client *",
      vehicleLabel: "Vehicle *",
      selectClientFirst: "Select a client first",
      noVehiclesAvailable: "No vehicles available",
      selectVehiclePlaceholder: "Select a vehicle...",
      mechanicLabel: "Assigned technician",
      unassignedOption: "Unassigned",
      mileageInLabel: "Mileage in (optional)",
      mileageOutLabel: "Mileage out (optional)",
      concernLabel: "Customer concern *",
      concernPlaceholder: "E.g.: Noise when braking, scheduled oil change...",
      diagnosisLabel: "Diagnosis (optional)",
      diagnosisPlaceholder: "Technician's notes...",
      lineItemsTitle: "Labour and parts",
      lineItemsHint: "You can leave this empty when opening the order and fill it in during diagnosis",
      addLine: "Add line",
      removeLineTitle: "Remove line",
      tableHeaders: {
        description: "Description",
        type: "Type",
        warranty: "Warranty",
        quantity: "Quantity",
        unitPrice: "Unit price",
        total: "Total",
      },
      warrantyPlaceholder: "12 months",
      subtotalLabel: "Estimated subtotal",
      saving: "Saving...",
      saveChanges: "Save changes",
      createDraft: "Create work order",
      cancel: "Cancel",
    },
    detail: {
      editButton: "Edit",
      openedOn: (date) => `Opened on ${date}`,
      client: "Client",
      vehicle: "Vehicle",
      plate: (plate) => `Plate: ${plate}`,
      mechanic: "Assigned technician",
      unassigned: "Unassigned",
      mileageIn: (value, unit) => `In: ${value} ${unit}`,
      mileageOut: (value, unit) => `Out: ${value} ${unit}`,
      concernTitle: "Customer concern",
      diagnosisTitle: "Diagnosis",
      lineItemsTitle: "Labour and parts",
      noLineItems: "No lines recorded yet",
      colDescription: "Description",
      colType: "Type",
      colQty: "Qty",
      colUnitPrice: "Unit price",
      colTotal: "Total",
      subtotal: "Estimated subtotal",
      fromQuote: (quoteNumber) => `Generated from quote ${quoteNumber}`,
      linkedInvoice: (invoiceNumber) => `Invoiced as ${invoiceNumber}`,
    },
    actions: {
      confirmDelete: (orderNumber) => `Permanently delete work order ${orderNumber}?`,
      confirmConvert: (orderNumber) => `Convert work order ${orderNumber} to a draft invoice?`,
      deleted: "Work order deleted",
      convertedError: "Could not convert the work order",
      viewInvoice: "View invoice",
      delete: "Delete",
      convertToInvoice: "Invoice",
      markAwaitingApproval: "Send for approval",
      approve: "Approve",
      start: "Start work",
      complete: "Mark completed",
      cancel: "Cancel order",
      reopenForApproval: "Needs re-approval",
      statusUpdated: "Status updated",
      cannotDelete: "An already-invoiced work order cannot be deleted",
    },
  },
  fr: {
    status: {
      OPEN: "Ouvert",
      AWAITING_APPROVAL: "En attente d'approbation",
      APPROVED: "Approuvé",
      IN_PROGRESS: "En cours",
      COMPLETED: "Terminé",
      INVOICED: "Facturé",
      CANCELLED: "Annulé",
    },
    itemTypes: {
      LABOUR: "Main-d'œuvre",
      PART: "Pièce",
      OTHER: "Autre",
    },
    list: {
      title: "Ordres de travail",
      countSuffix: "ordres de travail",
      countSuffixSingular: "ordre de travail",
      statusTabAll: "Tous",
      newWorkOrder: "Nouvel ordre",
      emptyAll: "Aucun ordre de travail pour l'instant",
      emptyStatus: (status) => `Aucun ordre avec le statut « ${status} »`,
      createFirst: "Créer le premier ordre",
      colOrderClient: "Ordre / Client",
      colVehicle: "Véhicule",
      colMechanic: "Mécanicien",
      colDate: "Date",
      colStatus: "Statut",
      unassigned: "Non assigné",
    },
    new: {
      title: "Nouvel ordre de travail",
      subtitle: "Enregistrez le véhicule, le problème signalé et les lignes de travail",
    },
    edit: {
      title: (orderNumber) => `Modifier ${orderNumber}`,
      subtitle: "Mettez à jour les informations de l'ordre de travail",
    },
    form: {
      clientSectionTitle: "Client et véhicule",
      clientLabel: "Client *",
      vehicleLabel: "Véhicule *",
      selectClientFirst: "Sélectionnez d'abord un client",
      noVehiclesAvailable: "Aucun véhicule disponible",
      selectVehiclePlaceholder: "Sélectionner un véhicule...",
      mechanicLabel: "Technicien assigné",
      unassignedOption: "Non assigné",
      mileageInLabel: "Km à l'entrée (optionnel)",
      mileageOutLabel: "Km à la sortie (optionnel)",
      concernLabel: "Plainte du client *",
      concernPlaceholder: "Ex. : Bruit au freinage, changement d'huile prévu...",
      diagnosisLabel: "Diagnostic (optionnel)",
      diagnosisPlaceholder: "Notes techniques du mécanicien...",
      lineItemsTitle: "Main-d'œuvre et pièces",
      lineItemsHint: "Vous pouvez laisser vide à l'ouverture et compléter pendant le diagnostic",
      addLine: "Ajouter une ligne",
      removeLineTitle: "Supprimer la ligne",
      tableHeaders: {
        description: "Description",
        type: "Type",
        warranty: "Garantie",
        quantity: "Quantité",
        unitPrice: "Prix unit.",
        total: "Total",
      },
      warrantyPlaceholder: "12 mois",
      subtotalLabel: "Sous-total estimé",
      saving: "Enregistrement...",
      saveChanges: "Enregistrer les changements",
      createDraft: "Créer l'ordre",
      cancel: "Annuler",
    },
    detail: {
      editButton: "Modifier",
      openedOn: (date) => `Ouvert le ${date}`,
      client: "Client",
      vehicle: "Véhicule",
      plate: (plate) => `Plaque : ${plate}`,
      mechanic: "Technicien assigné",
      unassigned: "Non assigné",
      mileageIn: (value, unit) => `Entrée : ${value} ${unit}`,
      mileageOut: (value, unit) => `Sortie : ${value} ${unit}`,
      concernTitle: "Plainte du client",
      diagnosisTitle: "Diagnostic",
      lineItemsTitle: "Main-d'œuvre et pièces",
      noLineItems: "Aucune ligne enregistrée pour l'instant",
      colDescription: "Description",
      colType: "Type",
      colQty: "Qté",
      colUnitPrice: "Prix unit.",
      colTotal: "Total",
      subtotal: "Sous-total estimé",
      fromQuote: (quoteNumber) => `Généré depuis la soumission ${quoteNumber}`,
      linkedInvoice: (invoiceNumber) => `Facturé sous ${invoiceNumber}`,
    },
    actions: {
      confirmDelete: (orderNumber) => `Supprimer définitivement l'ordre ${orderNumber} ?`,
      confirmConvert: (orderNumber) => `Convertir l'ordre ${orderNumber} en facture brouillon ?`,
      deleted: "Ordre de travail supprimé",
      convertedError: "Impossible de convertir l'ordre de travail",
      viewInvoice: "Voir la facture",
      delete: "Supprimer",
      convertToInvoice: "Facturer",
      markAwaitingApproval: "Envoyer pour approbation",
      approve: "Approuver",
      start: "Démarrer le travail",
      complete: "Marquer terminé",
      cancel: "Annuler l'ordre",
      reopenForApproval: "Nécessite une nouvelle approbation",
      statusUpdated: "Statut mis à jour",
      cannotDelete: "Un ordre de travail déjà facturé ne peut pas être supprimé",
    },
  },
};
