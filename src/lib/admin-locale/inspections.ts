import type { AdminLocale } from "@/lib/admin-locale";

export interface InspectionsDictionary {
  categories: Record<string, string>;
  condition: {
    GOOD: string;
    ATTENTION: string;
    SERVICE_REQUIRED: string;
  };
  categoryLabel: (category: string) => string;
  conditionLabel: (condition: string) => string;
  list: {
    title: string;
    countSuffix: string;
    countSuffixSingular: string;
    newInspection: string;
    emptyAll: string;
    createFirst: string;
    colVehicleClient: string;
    colMechanic: string;
    colDate: string;
    colFindings: string;
    findingsCount: (n: number) => string;
    noFindings: string;
  };
  new: {
    title: string;
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
    workOrderLabel: string;
    noWorkOrderOption: string;
    mileageLabel: string;
    createButton: string;
    creating: string;
    cancel: string;
  };
  detail: {
    openedOn: (date: string) => string;
    client: string;
    vehicle: string;
    plate: (plate: string) => string;
    mechanic: string;
    unassigned: string;
    mileage: (value: string, unit: string) => string;
    fromWorkOrder: (orderNumber: string) => string;
    checklistTitle: string;
    addCustomItemPlaceholder: string;
    addCustomItem: string;
    notesPlaceholder: string;
    uploadPhoto: string;
    deletePhotoTitle: string;
    deleteItemTitle: string;
    findingsSummary: (n: number) => string;
    noFindings: string;
    createQuote: string;
  };
  actions: {
    confirmDelete: string;
    deleted: string;
    confirmDeleteItem: string;
    confirmDeletePhoto: string;
    confirmCreateQuote: string;
    delete: string;
    updated: string;
  };
}

const CATEGORY_LABELS: Record<AdminLocale, Record<string, string>> = {
  es: {
    TIRES: "Neumáticos",
    BRAKES: "Frenos",
    BATTERY: "Batería",
    LIGHTS: "Luces",
    FLUIDS: "Fluidos",
    WIPERS: "Limpiaparabrisas",
    SUSPENSION: "Suspensión",
    EXHAUST: "Escape",
    BELTS_HOSES: "Bandas y mangueras",
    MIRRORS_GLASS: "Espejos y vidrios",
  },
  en: {
    TIRES: "Tires",
    BRAKES: "Brakes",
    BATTERY: "Battery",
    LIGHTS: "Lights",
    FLUIDS: "Fluids",
    WIPERS: "Wipers",
    SUSPENSION: "Suspension",
    EXHAUST: "Exhaust",
    BELTS_HOSES: "Belts & hoses",
    MIRRORS_GLASS: "Mirrors & glass",
  },
  fr: {
    TIRES: "Pneus",
    BRAKES: "Freins",
    BATTERY: "Batterie",
    LIGHTS: "Feux",
    FLUIDS: "Fluides",
    WIPERS: "Essuie-glaces",
    SUSPENSION: "Suspension",
    EXHAUST: "Échappement",
    BELTS_HOSES: "Courroies et durites",
    MIRRORS_GLASS: "Rétroviseurs et vitres",
  },
};

function buildDictionary(locale: AdminLocale, base: Omit<InspectionsDictionary, "categoryLabel" | "conditionLabel">): InspectionsDictionary {
  return {
    ...base,
    categoryLabel: (category) => CATEGORY_LABELS[locale][category] ?? category,
    conditionLabel: (condition) => base.condition[condition as keyof typeof base.condition] ?? condition,
  };
}

export const INSPECTIONS_DICT: Record<AdminLocale, InspectionsDictionary> = {
  es: buildDictionary("es", {
    categories: CATEGORY_LABELS.es,
    condition: {
      GOOD: "Bien",
      ATTENTION: "Atención",
      SERVICE_REQUIRED: "Requiere servicio",
    },
    list: {
      title: "Inspecciones",
      countSuffix: "inspecciones",
      countSuffixSingular: "inspección",
      newInspection: "Nueva inspección",
      emptyAll: "No hay inspecciones todavía",
      createFirst: "Crear primera inspección",
      colVehicleClient: "Vehículo / Cliente",
      colMechanic: "Mecánico",
      colDate: "Fecha",
      colFindings: "Hallazgos",
      findingsCount: (n) => (n === 0 ? "Sin hallazgos" : `${n} hallazgo${n !== 1 ? "s" : ""}`),
      noFindings: "Sin hallazgos",
    },
    new: {
      title: "Nueva inspección",
      subtitle: "Selecciona el vehículo para iniciar el checklist digital",
    },
    form: {
      clientSectionTitle: "Cliente y vehículo",
      clientLabel: "Cliente *",
      vehicleLabel: "Vehículo *",
      selectClientFirst: "Selecciona un cliente primero",
      noVehiclesAvailable: "Sin vehículos disponibles",
      selectVehiclePlaceholder: "Seleccionar vehículo...",
      mechanicLabel: "Realizada por",
      unassignedOption: "Sin asignar",
      workOrderLabel: "Orden de trabajo asociada (opcional)",
      noWorkOrderOption: "Ninguna",
      mileageLabel: "Kilometraje (opcional)",
      createButton: "Iniciar inspección",
      creating: "Creando...",
      cancel: "Cancelar",
    },
    detail: {
      openedOn: (date) => `Realizada el ${date}`,
      client: "Cliente",
      vehicle: "Vehículo",
      plate: (plate) => `Placa: ${plate}`,
      mechanic: "Realizada por",
      unassigned: "Sin asignar",
      mileage: (value, unit) => `Kilometraje: ${value} ${unit}`,
      fromWorkOrder: (orderNumber) => `Vinculada a la orden ${orderNumber}`,
      checklistTitle: "Checklist",
      addCustomItemPlaceholder: "Agregar elemento personalizado...",
      addCustomItem: "Agregar",
      notesPlaceholder: "Notas...",
      uploadPhoto: "Agregar foto",
      deletePhotoTitle: "Eliminar foto",
      deleteItemTitle: "Eliminar elemento",
      findingsSummary: (n) => (n === 0 ? "Sin hallazgos" : `${n} hallazgo${n !== 1 ? "s" : ""} que requieren atención`),
      noFindings: "Todo en buen estado",
      createQuote: "Crear cotización de hallazgos",
    },
    actions: {
      confirmDelete: "¿Eliminar definitivamente esta inspección?",
      deleted: "Inspección eliminada",
      confirmDeleteItem: "¿Eliminar este elemento del checklist?",
      confirmDeletePhoto: "¿Eliminar esta foto?",
      confirmCreateQuote: "¿Crear una cotización borrador con los hallazgos?",
      delete: "Eliminar",
      updated: "Guardado",
    },
  }),
  en: buildDictionary("en", {
    categories: CATEGORY_LABELS.en,
    condition: {
      GOOD: "Good",
      ATTENTION: "Attention",
      SERVICE_REQUIRED: "Service required",
    },
    list: {
      title: "Inspections",
      countSuffix: "inspections",
      countSuffixSingular: "inspection",
      newInspection: "New inspection",
      emptyAll: "No inspections yet",
      createFirst: "Create first inspection",
      colVehicleClient: "Vehicle / Client",
      colMechanic: "Mechanic",
      colDate: "Date",
      colFindings: "Findings",
      findingsCount: (n) => (n === 0 ? "No findings" : `${n} finding${n !== 1 ? "s" : ""}`),
      noFindings: "No findings",
    },
    new: {
      title: "New inspection",
      subtitle: "Select the vehicle to start the digital checklist",
    },
    form: {
      clientSectionTitle: "Client and vehicle",
      clientLabel: "Client *",
      vehicleLabel: "Vehicle *",
      selectClientFirst: "Select a client first",
      noVehiclesAvailable: "No vehicles available",
      selectVehiclePlaceholder: "Select a vehicle...",
      mechanicLabel: "Performed by",
      unassignedOption: "Unassigned",
      workOrderLabel: "Linked work order (optional)",
      noWorkOrderOption: "None",
      mileageLabel: "Mileage (optional)",
      createButton: "Start inspection",
      creating: "Creating...",
      cancel: "Cancel",
    },
    detail: {
      openedOn: (date) => `Performed on ${date}`,
      client: "Client",
      vehicle: "Vehicle",
      plate: (plate) => `Plate: ${plate}`,
      mechanic: "Performed by",
      unassigned: "Unassigned",
      mileage: (value, unit) => `Mileage: ${value} ${unit}`,
      fromWorkOrder: (orderNumber) => `Linked to order ${orderNumber}`,
      checklistTitle: "Checklist",
      addCustomItemPlaceholder: "Add a custom item...",
      addCustomItem: "Add",
      notesPlaceholder: "Notes...",
      uploadPhoto: "Add photo",
      deletePhotoTitle: "Delete photo",
      deleteItemTitle: "Delete item",
      findingsSummary: (n) => (n === 0 ? "No findings" : `${n} finding${n !== 1 ? "s" : ""} need attention`),
      noFindings: "Everything in good shape",
      createQuote: "Create quote from findings",
    },
    actions: {
      confirmDelete: "Permanently delete this inspection?",
      deleted: "Inspection deleted",
      confirmDeleteItem: "Delete this checklist item?",
      confirmDeletePhoto: "Delete this photo?",
      confirmCreateQuote: "Create a draft quote from the findings?",
      delete: "Delete",
      updated: "Saved",
    },
  }),
  fr: buildDictionary("fr", {
    categories: CATEGORY_LABELS.fr,
    condition: {
      GOOD: "Bon",
      ATTENTION: "Attention",
      SERVICE_REQUIRED: "Service requis",
    },
    list: {
      title: "Inspections",
      countSuffix: "inspections",
      countSuffixSingular: "inspection",
      newInspection: "Nouvelle inspection",
      emptyAll: "Aucune inspection pour l'instant",
      createFirst: "Créer la première inspection",
      colVehicleClient: "Véhicule / Client",
      colMechanic: "Mécanicien",
      colDate: "Date",
      colFindings: "Constats",
      findingsCount: (n) => (n === 0 ? "Aucun constat" : `${n} constat${n !== 1 ? "s" : ""}`),
      noFindings: "Aucun constat",
    },
    new: {
      title: "Nouvelle inspection",
      subtitle: "Sélectionnez le véhicule pour démarrer la liste de vérification numérique",
    },
    form: {
      clientSectionTitle: "Client et véhicule",
      clientLabel: "Client *",
      vehicleLabel: "Véhicule *",
      selectClientFirst: "Sélectionnez d'abord un client",
      noVehiclesAvailable: "Aucun véhicule disponible",
      selectVehiclePlaceholder: "Sélectionner un véhicule...",
      mechanicLabel: "Effectuée par",
      unassignedOption: "Non assigné",
      workOrderLabel: "Ordre de travail lié (optionnel)",
      noWorkOrderOption: "Aucun",
      mileageLabel: "Kilométrage (optionnel)",
      createButton: "Démarrer l'inspection",
      creating: "Création...",
      cancel: "Annuler",
    },
    detail: {
      openedOn: (date) => `Effectuée le ${date}`,
      client: "Client",
      vehicle: "Véhicule",
      plate: (plate) => `Plaque : ${plate}`,
      mechanic: "Effectuée par",
      unassigned: "Non assigné",
      mileage: (value, unit) => `Kilométrage : ${value} ${unit}`,
      fromWorkOrder: (orderNumber) => `Liée à l'ordre ${orderNumber}`,
      checklistTitle: "Liste de vérification",
      addCustomItemPlaceholder: "Ajouter un élément personnalisé...",
      addCustomItem: "Ajouter",
      notesPlaceholder: "Notes...",
      uploadPhoto: "Ajouter une photo",
      deletePhotoTitle: "Supprimer la photo",
      deleteItemTitle: "Supprimer l'élément",
      findingsSummary: (n) => (n === 0 ? "Aucun constat" : `${n} constat${n !== 1 ? "s" : ""} nécessitent une attention`),
      noFindings: "Tout est en bon état",
      createQuote: "Créer une soumission à partir des constats",
    },
    actions: {
      confirmDelete: "Supprimer définitivement cette inspection ?",
      deleted: "Inspection supprimée",
      confirmDeleteItem: "Supprimer cet élément de la liste ?",
      confirmDeletePhoto: "Supprimer cette photo ?",
      confirmCreateQuote: "Créer une soumission brouillon à partir des constats ?",
      delete: "Supprimer",
      updated: "Enregistré",
    },
  }),
};
