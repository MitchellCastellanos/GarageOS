import type { AdminLocale } from "@/lib/admin-locale";

export interface InventoryDictionary {
  page: {
    title: string;
    countLabel: (count: number) => string;
    newPart: string;
    lowStockBanner: (count: number) => string;
    searchPlaceholder: string;
  };
  table: {
    colName: string;
    colSku: string;
    colStock: string;
    colReorder: string;
    colPrice: string;
    colActions: string;
    lowStockBadge: string;
    emptyTitle: string;
    emptyCta: string;
    noSku: string;
  };
  form: {
    titleNew: string;
    titleEdit: string;
    subtitleNew: string;
    subtitleEdit: string;
    nameLabel: string;
    skuLabel: string;
    skuHint: string;
    descriptionLabel: string;
    unitCostLabel: string;
    unitPriceLabel: string;
    quantityOnHandLabel: string;
    quantityOnHandHint: string;
    reorderThresholdLabel: string;
    reorderThresholdHint: string;
    submit: string;
    submitting: string;
    cancel: string;
  };
  detail: {
    backToList: string;
    stockHeading: string;
    costLabel: string;
    priceLabel: string;
    reorderLabel: string;
    editButton: string;
    deleteButton: string;
    deleteConfirm: string;
    adjustStockHeading: string;
    movementTypeLabel: string;
    movementQuantityLabel: string;
    movementQuantityHint: string;
    movementNoteLabel: string;
    movementSubmit: string;
    movementSubmitting: string;
    movementTypes: {
      RECEIVE: string;
      ADJUSTMENT: string;
      CONSUMED: string;
      RETURN: string;
    };
    historyHeading: string;
    historyEmpty: string;
  };
  errors: {
    duplicateSku: string;
    negativeStock: string;
    partNotFound: string;
    genericError: string;
  };
  movements: {
    initialStockNote: string;
  };
}

export const INVENTORY_DICT: Record<AdminLocale, InventoryDictionary> = {
  es: {
    page: {
      title: "Inventario",
      countLabel: (count) => `${count} refacción${count !== 1 ? "es" : ""} registrada${count !== 1 ? "s" : ""}`,
      newPart: "Nueva refacción",
      lowStockBanner: (count) =>
        `${count} refacción${count !== 1 ? "es" : ""} en o por debajo del punto de reorden`,
      searchPlaceholder: "Buscar por nombre o SKU...",
    },
    table: {
      colName: "Refacción",
      colSku: "SKU",
      colStock: "Existencia",
      colReorder: "Reorden",
      colPrice: "Precio",
      colActions: "",
      lowStockBadge: "Stock bajo",
      emptyTitle: "Sin refacciones registradas todavía",
      emptyCta: "Agregar la primera",
      noSku: "—",
    },
    form: {
      titleNew: "Nueva refacción",
      titleEdit: "Editar refacción",
      subtitleNew: "Agrega una parte a tu inventario",
      subtitleEdit: "Actualiza los datos de esta refacción",
      nameLabel: "Nombre",
      skuLabel: "SKU / código",
      skuHint: "Opcional — debe ser único dentro de tu taller",
      descriptionLabel: "Descripción",
      unitCostLabel: "Costo unitario",
      unitPriceLabel: "Precio de venta",
      quantityOnHandLabel: "Existencia inicial",
      quantityOnHandHint: "Cuántas unidades tienes hoy en el taller",
      reorderThresholdLabel: "Punto de reorden",
      reorderThresholdHint: "Se marca como stock bajo en o por debajo de este número",
      submit: "Guardar",
      submitting: "Guardando...",
      cancel: "Cancelar",
    },
    detail: {
      backToList: "← Volver a inventario",
      stockHeading: "Existencia actual",
      costLabel: "Costo",
      priceLabel: "Precio",
      reorderLabel: "Reorden en",
      editButton: "Editar",
      deleteButton: "Eliminar",
      deleteConfirm: "¿Eliminar esta refacción? Esta acción no se puede deshacer.",
      adjustStockHeading: "Ajustar existencia",
      movementTypeLabel: "Tipo de movimiento",
      movementQuantityLabel: "Cantidad",
      movementQuantityHint: "Usa un número positivo; para \"Ajuste\" puedes escribir uno negativo para restar",
      movementNoteLabel: "Nota (opcional)",
      movementSubmit: "Registrar movimiento",
      movementSubmitting: "Registrando...",
      movementTypes: {
        RECEIVE: "Recepción de stock",
        ADJUSTMENT: "Ajuste manual",
        CONSUMED: "Usado en un trabajo",
        RETURN: "Devolución",
      },
      historyHeading: "Historial de movimientos",
      historyEmpty: "Sin movimientos todavía",
    },
    errors: {
      duplicateSku: "Ya existe una refacción con ese SKU en tu taller",
      negativeStock: "No hay suficiente existencia para ese movimiento",
      partNotFound: "Refacción no encontrada",
      genericError: "No pudimos guardar los cambios. Intenta de nuevo.",
    },
    movements: {
      initialStockNote: "Existencia inicial al crear la refacción",
    },
  },
  en: {
    page: {
      title: "Inventory",
      countLabel: (count) => `${count} part${count !== 1 ? "s" : ""} on file`,
      newPart: "New part",
      lowStockBanner: (count) => `${count} part${count !== 1 ? "s" : ""} at or below reorder point`,
      searchPlaceholder: "Search by name or SKU...",
    },
    table: {
      colName: "Part",
      colSku: "SKU",
      colStock: "In stock",
      colReorder: "Reorder at",
      colPrice: "Price",
      colActions: "",
      lowStockBadge: "Low stock",
      emptyTitle: "No parts on file yet",
      emptyCta: "Add your first one",
      noSku: "—",
    },
    form: {
      titleNew: "New part",
      titleEdit: "Edit part",
      subtitleNew: "Add a part to your inventory",
      subtitleEdit: "Update this part's details",
      nameLabel: "Name",
      skuLabel: "SKU / code",
      skuHint: "Optional — must be unique within your shop",
      descriptionLabel: "Description",
      unitCostLabel: "Unit cost",
      unitPriceLabel: "Sale price",
      quantityOnHandLabel: "Starting quantity",
      quantityOnHandHint: "How many units you have on hand today",
      reorderThresholdLabel: "Reorder point",
      reorderThresholdHint: "Flagged as low stock at or below this number",
      submit: "Save",
      submitting: "Saving...",
      cancel: "Cancel",
    },
    detail: {
      backToList: "← Back to inventory",
      stockHeading: "Current stock",
      costLabel: "Cost",
      priceLabel: "Price",
      reorderLabel: "Reorder at",
      editButton: "Edit",
      deleteButton: "Delete",
      deleteConfirm: "Delete this part? This cannot be undone.",
      adjustStockHeading: "Adjust stock",
      movementTypeLabel: "Movement type",
      movementQuantityLabel: "Quantity",
      movementQuantityHint: "Use a positive number; for \"Adjustment\" you can enter a negative one to subtract",
      movementNoteLabel: "Note (optional)",
      movementSubmit: "Record movement",
      movementSubmitting: "Recording...",
      movementTypes: {
        RECEIVE: "Stock received",
        ADJUSTMENT: "Manual adjustment",
        CONSUMED: "Used on a job",
        RETURN: "Return",
      },
      historyHeading: "Movement history",
      historyEmpty: "No movements yet",
    },
    errors: {
      duplicateSku: "A part with that SKU already exists in your shop",
      negativeStock: "Not enough stock for that movement",
      partNotFound: "Part not found",
      genericError: "We couldn't save your changes. Please try again.",
    },
    movements: {
      initialStockNote: "Starting quantity when the part was created",
    },
  },
  fr: {
    page: {
      title: "Inventaire",
      countLabel: (count) => `${count} pièce${count !== 1 ? "s" : ""} enregistrée${count !== 1 ? "s" : ""}`,
      newPart: "Nouvelle pièce",
      lowStockBanner: (count) =>
        `${count} pièce${count !== 1 ? "s" : ""} au seuil de réapprovisionnement ou en dessous`,
      searchPlaceholder: "Rechercher par nom ou SKU...",
    },
    table: {
      colName: "Pièce",
      colSku: "SKU",
      colStock: "En stock",
      colReorder: "Seuil",
      colPrice: "Prix",
      colActions: "",
      lowStockBadge: "Stock bas",
      emptyTitle: "Aucune pièce enregistrée pour l'instant",
      emptyCta: "Ajouter la première",
      noSku: "—",
    },
    form: {
      titleNew: "Nouvelle pièce",
      titleEdit: "Modifier la pièce",
      subtitleNew: "Ajoutez une pièce à votre inventaire",
      subtitleEdit: "Mettez à jour les détails de cette pièce",
      nameLabel: "Nom",
      skuLabel: "SKU / code",
      skuHint: "Facultatif — doit être unique dans votre atelier",
      descriptionLabel: "Description",
      unitCostLabel: "Coût unitaire",
      unitPriceLabel: "Prix de vente",
      quantityOnHandLabel: "Quantité de départ",
      quantityOnHandHint: "Combien d'unités vous avez en main aujourd'hui",
      reorderThresholdLabel: "Seuil de réapprovisionnement",
      reorderThresholdHint: "Marqué comme stock bas à ce nombre ou en dessous",
      submit: "Enregistrer",
      submitting: "Enregistrement...",
      cancel: "Annuler",
    },
    detail: {
      backToList: "← Retour à l'inventaire",
      stockHeading: "Stock actuel",
      costLabel: "Coût",
      priceLabel: "Prix",
      reorderLabel: "Seuil",
      editButton: "Modifier",
      deleteButton: "Supprimer",
      deleteConfirm: "Supprimer cette pièce? Cette action est irréversible.",
      adjustStockHeading: "Ajuster le stock",
      movementTypeLabel: "Type de mouvement",
      movementQuantityLabel: "Quantité",
      movementQuantityHint: "Utilisez un nombre positif; pour « Ajustement » vous pouvez entrer un nombre négatif pour soustraire",
      movementNoteLabel: "Note (facultatif)",
      movementSubmit: "Enregistrer le mouvement",
      movementSubmitting: "Enregistrement...",
      movementTypes: {
        RECEIVE: "Réception de stock",
        ADJUSTMENT: "Ajustement manuel",
        CONSUMED: "Utilisé sur un travail",
        RETURN: "Retour",
      },
      historyHeading: "Historique des mouvements",
      historyEmpty: "Aucun mouvement pour l'instant",
    },
    errors: {
      duplicateSku: "Une pièce avec ce SKU existe déjà dans votre atelier",
      negativeStock: "Stock insuffisant pour ce mouvement",
      partNotFound: "Pièce introuvable",
      genericError: "Impossible d'enregistrer les modifications. Réessayez.",
    },
    movements: {
      initialStockNote: "Quantité de départ à la création de la pièce",
    },
  },
};
