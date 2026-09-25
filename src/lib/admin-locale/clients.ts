import type { AdminLocale } from "@/lib/admin-locale";

export interface ClientsDictionary {
  common: {
    saveChanges: string;
    cancel: string;
    saving: string;
    deleting: string;
    delete: string;
    plateLabel: string;
    dateLabel: string;
  };
  list: {
    title: string;
    count: (n: number) => string;
    newClient: string;
    searchPlaceholder: string;
    tableClient: string;
    tableContact: string;
    tableVehicles: string;
    tableInvoices: string;
    tableRegistered: string;
    emptySearchTitle: string;
    emptySearchBody: string;
    viewAll: string;
    emptyTitle: string;
    emptyBody: string;
    addClient: string;
  };
  new: {
    subtitle: string;
  };
  detail: {
    clientSince: (date: string) => string;
    edit: string;
    infoTitle: string;
    languageSuffix: string;
    smsOptedOut: string;
    noContactInfo: string;
    notesTitle: string;
    add: string;
    noVehiclesRegistered: string;
    addVehicleArrow: string;
    recentInvoicesTitle: string;
    viewAllArrow: string;
  };
  marketingConsent: {
    label: string;
    hintWithEmail: string;
    hintNoEmail: string;
    toastIncluded: string;
    toastExcluded: string;
  };
  edit: {
    title: string;
    subtitle: (name: string) => string;
  };
  vehicleNew: {
    title: string;
    subtitle: (name: string) => string;
  };
  vehicleDetail: {
    historyTitle: string;
    newInvoice: string;
    noHistory: string;
    remindersTitle: string;
    reminderStatus: {
      pending: string;
      sent: string;
      acknowledged: string;
    };
    workOrdersTitle: string;
    newWorkOrder: string;
    noWorkOrders: string;
  };
  vehicleEdit: {
    title: string;
    subtitle: (vehicleLabel: string) => string;
  };
  clientForm: {
    nameLabel: string;
    namePlaceholder: string;
    lastNameLabel: string;
    lastNamePlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    languageLabel: string;
    notifyChannelLabel: string;
    notifyChannelOptions: { auto: string; sms: string; email: string; both: string };
    notifyChannelHint: string;
    addressLabel: string;
    addressPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    saveDefault: string;
  };
  vehicleForm: {
    makeLabel: string;
    makePlaceholder: string;
    modelLabel: string;
    modelPlaceholder: string;
    yearLabel: string;
    yearPlaceholder: string;
    plateLabel: string;
    platePlaceholder: string;
    vinLabel: string;
    vinPlaceholder: string;
    colorLabel: string;
    colorPlaceholder: string;
    mileageUnitLabel: string;
    km: string;
    miles: string;
    saveDefault: string;
  };
  deleteClient: {
    confirm: (name: string) => string;
  };
  deleteVehicle: {
    confirm: (name: string) => string;
  };
}

export const CLIENTS_DICT: Record<AdminLocale, ClientsDictionary> = {
  es: {
    common: {
      saveChanges: "Guardar cambios",
      cancel: "Cancelar",
      saving: "Guardando...",
      deleting: "Eliminando...",
      delete: "Eliminar",
      plateLabel: "Placa:",
      dateLabel: "Fecha:",
    },
    list: {
      title: "Clientes",
      count: (n) => `${n} cliente${n !== 1 ? "s" : ""} registrado${n !== 1 ? "s" : ""}`,
      newClient: "Nuevo cliente",
      searchPlaceholder: "Buscar por nombre, email o teléfono...",
      tableClient: "Cliente",
      tableContact: "Contacto",
      tableVehicles: "Vehículos",
      tableInvoices: "Facturas",
      tableRegistered: "Registrado",
      emptySearchTitle: "Sin resultados",
      emptySearchBody: "Intenta con otro nombre, email o teléfono",
      viewAll: "Ver todos los clientes",
      emptyTitle: "No hay clientes todavía",
      emptyBody: "Registra tu primer cliente para comenzar",
      addClient: "Agregar cliente",
    },
    new: {
      subtitle: "Registra los datos del cliente. Los campos marcados con * son requeridos.",
    },
    detail: {
      clientSince: (date) => `Cliente desde ${date}`,
      edit: "Editar",
      infoTitle: "Información",
      languageSuffix: "— SMS y email",
      smsOptedOut: "Respondió STOP: no recibe SMS (los avisos le llegan por email).",
      noContactInfo: "Sin información de contacto",
      notesTitle: "Notas",
      add: "Agregar",
      noVehiclesRegistered: "Sin vehículos registrados",
      addVehicleArrow: "Agregar vehículo →",
      recentInvoicesTitle: "Últimas facturas",
      viewAllArrow: "Ver todas →",
    },
    marketingConsent: {
      label: "Recibir campañas por email",
      hintWithEmail: "Marca solo si el cliente dio su consentimiento.",
      hintNoEmail: "El cliente no tiene email registrado.",
      toastIncluded: "Cliente incluido en campañas",
      toastExcluded: "Cliente excluido de campañas",
    },
    edit: {
      title: "Editar cliente",
      subtitle: (name) => `Actualiza los datos de ${name}.`,
    },
    vehicleNew: {
      title: "Nuevo vehículo",
      subtitle: (name) => `Registra un vehículo para ${name}.`,
    },
    vehicleDetail: {
      historyTitle: "Historial de servicio",
      newInvoice: "Nueva factura",
      noHistory: "Sin historial de servicio",
      remindersTitle: "Recordatorios activos",
      reminderStatus: {
        pending: "Pendiente",
        sent: "Enviado",
        acknowledged: "Confirmado",
      },
      workOrdersTitle: "Órdenes de trabajo",
      newWorkOrder: "Nueva orden",
      noWorkOrders: "Sin órdenes de trabajo activas",
    },
    vehicleEdit: {
      title: "Editar vehículo",
      subtitle: (vehicleLabel) => `Actualiza los datos de ${vehicleLabel}.`,
    },
    clientForm: {
      nameLabel: "Nombre / Empresa *",
      namePlaceholder: "Juan Pérez o Acme Inc.",
      lastNameLabel: "Apellido (opcional)",
      lastNamePlaceholder: "Rodríguez — dejar vacío para empresas",
      phoneLabel: "Teléfono *",
      phonePlaceholder: "514-555-0100",
      emailLabel: "Email (opcional)",
      emailPlaceholder: "cliente@email.com",
      languageLabel: "Idioma preferido",
      notifyChannelLabel: "Cómo avisarle",
      notifyChannelOptions: {
        auto: "Automático (SMS primero, email de respaldo)",
        sms: "Preferir SMS",
        email: "Preferir email",
        both: "Ambos siempre",
      },
      notifyChannelHint: "Aplica a avisos de citas y de vehículo listo — no a campañas.",
      addressLabel: "Dirección",
      addressPlaceholder: "123 Rue Principale, Montréal, QC",
      notesLabel: "Notas internas",
      notesPlaceholder: "Observaciones sobre el cliente (solo visibles en el sistema)...",
      saveDefault: "Guardar cliente",
    },
    vehicleForm: {
      makeLabel: "Marca *",
      makePlaceholder: "Toyota",
      modelLabel: "Modelo *",
      modelPlaceholder: "Corolla",
      yearLabel: "Año *",
      yearPlaceholder: "2020",
      plateLabel: "Placa *",
      platePlaceholder: "ABC 1234",
      vinLabel: "VIN",
      vinPlaceholder: "1HGBH41JXMN109186",
      colorLabel: "Color",
      colorPlaceholder: "Blanco",
      mileageUnitLabel: "Unidad de kilometraje",
      km: "Kilómetros (km)",
      miles: "Millas (mi)",
      saveDefault: "Guardar vehículo",
    },
    deleteClient: {
      confirm: (name) =>
        `¿Eliminar a ${name} y todos sus vehículos e historial? Esta acción no se puede deshacer.`,
    },
    deleteVehicle: {
      confirm: (name) => `¿Eliminar ${name}? Se eliminará el historial de servicio del vehículo.`,
    },
  },
  en: {
    common: {
      saveChanges: "Save changes",
      cancel: "Cancel",
      saving: "Saving...",
      deleting: "Deleting...",
      delete: "Delete",
      plateLabel: "Plate:",
      dateLabel: "Date:",
    },
    list: {
      title: "Clients",
      count: (n) => `${n} client${n !== 1 ? "s" : ""} registered`,
      newClient: "New client",
      searchPlaceholder: "Search by name, email, or phone...",
      tableClient: "Client",
      tableContact: "Contact",
      tableVehicles: "Vehicles",
      tableInvoices: "Invoices",
      tableRegistered: "Registered",
      emptySearchTitle: "No results",
      emptySearchBody: "Try a different name, email, or phone number",
      viewAll: "View all clients",
      emptyTitle: "No clients yet",
      emptyBody: "Register your first client to get started",
      addClient: "Add client",
    },
    new: {
      subtitle: "Enter the client's details. Fields marked with * are required.",
    },
    detail: {
      clientSince: (date) => `Client since ${date}`,
      edit: "Edit",
      infoTitle: "Information",
      languageSuffix: "— SMS and email",
      smsOptedOut: "Replied STOP: no SMS (notices go to email instead).",
      noContactInfo: "No contact information",
      notesTitle: "Notes",
      add: "Add",
      noVehiclesRegistered: "No vehicles registered",
      addVehicleArrow: "Add vehicle →",
      recentInvoicesTitle: "Recent invoices",
      viewAllArrow: "View all →",
    },
    marketingConsent: {
      label: "Receive email campaigns",
      hintWithEmail: "Only check this if the client gave their consent.",
      hintNoEmail: "The client has no email on file.",
      toastIncluded: "Client included in campaigns",
      toastExcluded: "Client excluded from campaigns",
    },
    edit: {
      title: "Edit client",
      subtitle: (name) => `Update ${name}'s details.`,
    },
    vehicleNew: {
      title: "New vehicle",
      subtitle: (name) => `Register a vehicle for ${name}.`,
    },
    vehicleDetail: {
      historyTitle: "Service history",
      newInvoice: "New invoice",
      noHistory: "No service history",
      remindersTitle: "Active reminders",
      reminderStatus: {
        pending: "Pending",
        sent: "Sent",
        acknowledged: "Confirmed",
      },
      workOrdersTitle: "Work orders",
      newWorkOrder: "New work order",
      noWorkOrders: "No active work orders",
    },
    vehicleEdit: {
      title: "Edit vehicle",
      subtitle: (vehicleLabel) => `Update the details for ${vehicleLabel}.`,
    },
    clientForm: {
      nameLabel: "Name / Company *",
      namePlaceholder: "John Smith or Acme Inc.",
      lastNameLabel: "Last name (optional)",
      lastNamePlaceholder: "Smith — leave blank for companies",
      phoneLabel: "Phone *",
      phonePlaceholder: "514-555-0100",
      emailLabel: "Email (optional)",
      emailPlaceholder: "client@email.com",
      languageLabel: "Preferred language",
      notifyChannelLabel: "How to notify them",
      notifyChannelOptions: {
        auto: "Automatic (SMS first, email fallback)",
        sms: "Prefer SMS",
        email: "Prefer email",
        both: "Always both",
      },
      notifyChannelHint: "Applies to appointment and vehicle-ready notices — not campaigns.",
      addressLabel: "Address",
      addressPlaceholder: "123 Main Street, Montréal, QC",
      notesLabel: "Internal notes",
      notesPlaceholder: "Notes about the client (visible only in the system)...",
      saveDefault: "Save client",
    },
    vehicleForm: {
      makeLabel: "Make *",
      makePlaceholder: "Toyota",
      modelLabel: "Model *",
      modelPlaceholder: "Corolla",
      yearLabel: "Year *",
      yearPlaceholder: "2020",
      plateLabel: "License plate *",
      platePlaceholder: "ABC 1234",
      vinLabel: "VIN",
      vinPlaceholder: "1HGBH41JXMN109186",
      colorLabel: "Color",
      colorPlaceholder: "White",
      mileageUnitLabel: "Mileage unit",
      km: "Kilometers (km)",
      miles: "Miles (mi)",
      saveDefault: "Save vehicle",
    },
    deleteClient: {
      confirm: (name) =>
        `Delete ${name} and all their vehicles and history? This action cannot be undone.`,
    },
    deleteVehicle: {
      confirm: (name) => `Delete ${name}? This will remove the vehicle's service history.`,
    },
  },
  fr: {
    common: {
      saveChanges: "Enregistrer les modifications",
      cancel: "Annuler",
      saving: "Enregistrement...",
      deleting: "Suppression...",
      delete: "Supprimer",
      plateLabel: "Plaque :",
      dateLabel: "Date :",
    },
    list: {
      title: "Clients",
      count: (n) => `${n} client${n !== 1 ? "s" : ""} enregistré${n !== 1 ? "s" : ""}`,
      newClient: "Nouveau client",
      searchPlaceholder: "Rechercher par nom, courriel ou téléphone...",
      tableClient: "Client",
      tableContact: "Contact",
      tableVehicles: "Véhicules",
      tableInvoices: "Factures",
      tableRegistered: "Inscrit",
      emptySearchTitle: "Aucun résultat",
      emptySearchBody: "Essayez un autre nom, courriel ou numéro de téléphone",
      viewAll: "Voir tous les clients",
      emptyTitle: "Aucun client pour le moment",
      emptyBody: "Enregistrez votre premier client pour commencer",
      addClient: "Ajouter un client",
    },
    new: {
      subtitle: "Saisissez les informations du client. Les champs marqués d'un * sont obligatoires.",
    },
    detail: {
      clientSince: (date) => `Client depuis ${date}`,
      edit: "Modifier",
      infoTitle: "Renseignements",
      languageSuffix: "— SMS et courriel",
      smsOptedOut: "A répondu STOP : aucun SMS (les avis partent par courriel).",
      noContactInfo: "Aucune information de contact",
      notesTitle: "Notes",
      add: "Ajouter",
      noVehiclesRegistered: "Aucun véhicule enregistré",
      addVehicleArrow: "Ajouter un véhicule →",
      recentInvoicesTitle: "Factures récentes",
      viewAllArrow: "Voir toutes →",
    },
    marketingConsent: {
      label: "Recevoir les campagnes par courriel",
      hintWithEmail: "Cochez seulement si le client a donné son consentement.",
      hintNoEmail: "Le client n'a pas de courriel enregistré.",
      toastIncluded: "Client inclus dans les campagnes",
      toastExcluded: "Client exclu des campagnes",
    },
    edit: {
      title: "Modifier le client",
      subtitle: (name) => `Mettez à jour les informations de ${name}.`,
    },
    vehicleNew: {
      title: "Nouveau véhicule",
      subtitle: (name) => `Enregistrez un véhicule pour ${name}.`,
    },
    vehicleDetail: {
      historyTitle: "Historique de service",
      newInvoice: "Nouvelle facture",
      noHistory: "Aucun historique de service",
      remindersTitle: "Rappels actifs",
      reminderStatus: {
        pending: "En attente",
        sent: "Envoyé",
        acknowledged: "Confirmé",
      },
      workOrdersTitle: "Ordres de travail",
      newWorkOrder: "Nouvel ordre",
      noWorkOrders: "Aucun ordre de travail actif",
    },
    vehicleEdit: {
      title: "Modifier le véhicule",
      subtitle: (vehicleLabel) => `Mettez à jour les informations de ${vehicleLabel}.`,
    },
    clientForm: {
      nameLabel: "Nom / Entreprise *",
      namePlaceholder: "Jean Tremblay ou Acme inc.",
      lastNameLabel: "Nom de famille (optionnel)",
      lastNamePlaceholder: "Tremblay — laissez vide pour une entreprise",
      phoneLabel: "Téléphone *",
      phonePlaceholder: "514-555-0100",
      emailLabel: "Courriel (optionnel)",
      emailPlaceholder: "client@courriel.com",
      languageLabel: "Langue préférée",
      notifyChannelLabel: "Comment l'aviser",
      notifyChannelOptions: {
        auto: "Automatique (SMS d'abord, courriel en secours)",
        sms: "Préférer le SMS",
        email: "Préférer le courriel",
        both: "Toujours les deux",
      },
      notifyChannelHint: "S'applique aux avis de rendez-vous et de véhicule prêt — pas aux campagnes.",
      addressLabel: "Adresse",
      addressPlaceholder: "123 rue Principale, Montréal, QC",
      notesLabel: "Notes internes",
      notesPlaceholder: "Remarques sur le client (visibles seulement dans le système)...",
      saveDefault: "Enregistrer le client",
    },
    vehicleForm: {
      makeLabel: "Marque *",
      makePlaceholder: "Toyota",
      modelLabel: "Modèle *",
      modelPlaceholder: "Corolla",
      yearLabel: "Année *",
      yearPlaceholder: "2020",
      plateLabel: "Plaque *",
      platePlaceholder: "ABC 1234",
      vinLabel: "NIV",
      vinPlaceholder: "1HGBH41JXMN109186",
      colorLabel: "Couleur",
      colorPlaceholder: "Blanc",
      mileageUnitLabel: "Unité de kilométrage",
      km: "Kilomètres (km)",
      miles: "Milles (mi)",
      saveDefault: "Enregistrer le véhicule",
    },
    deleteClient: {
      confirm: (name) =>
        `Supprimer ${name} ainsi que tous ses véhicules et son historique? Cette action est irréversible.`,
    },
    deleteVehicle: {
      confirm: (name) => `Supprimer ${name}? L'historique de service du véhicule sera supprimé.`,
    },
  },
};
