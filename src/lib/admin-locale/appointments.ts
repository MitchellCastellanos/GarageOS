import type { AdminLocale } from "@/lib/admin-locale";
import type { AppointmentView } from "@/lib/shop-timezone";

export interface AppointmentsDictionary {
  list: {
    pageTitle: string;
    newAppointment: string;
    viewLabels: Record<AppointmentView, string>;
    countLabel: (count: number, viewLabel: string) => string;
    emptyForView: (viewLabel: string) => string;
    editButton: string;
    completedButton: string;
    noShowButton: string;
    reopenButton: string;
    confirmButton: string;
    sendLinkButton: string;
    cancelButton: string;
    webBadge: string;
    cancelConfirmPrompt: string;
    toastCompleted: string;
    toastNoShow: string;
    toastReopened: string;
    viaSuffix: (channels: string[]) => string;
    toastConfirmationSent: (via: string) => string;
    toastLinkSent: (via: string) => string;
    toastCancelled: string;
  };
  newPage: {
    title: string;
    subtitle: string;
  };
  editPage: {
    title: string;
  };
  history: {
    title: string;
    subtitle: string;
    empty: string;
    by: (name: string) => string;
    client: string;
    system: string;
    events: Record<
      | "CREATED"
      | "RESCHEDULED"
      | "UPDATED"
      | "CANCELLED"
      | "REOPENED"
      | "STATUS_CHANGED"
      | "CONFIRMED_BY_CLIENT"
      | "NOTICE_RESENT"
      | "REMINDER_SENT",
      string
    >;
    notices: Record<"confirmation" | "update" | "reminder" | "cancellation", string>;
    outcomes: Record<"SENT" | "FAILED" | "SKIPPED_NO_CONTACT" | "SKIPPED_DISABLED" | "SKIPPED_PAST", string>;
    deliveryStatus: Record<string, string>;
    fields: Record<string, string>;
  };
  form: {
    sectionTitle: string;
    statusLabel: string;
    titleLabel: string;
    titlePlaceholder: string;
    clientLabel: string;
    selectClientPlaceholder: string;
    vehicleLabel: string;
    selectClientFirst: string;
    noVehicles: string;
    noSpecificVehicle: string;
    mechanicLabel: string;
    unassigned: string;
    dateLabel: string;
    timeLabel: string;
    durationLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    saving: string;
    saveChanges: string;
    createAppointment: string;
    cancel: string;
  };
  viewControls: {
    viewOptions: Record<AppointmentView, string>;
    previous: string;
    next: string;
    intlLocale: string;
  };
  monthCalendar: {
    weekdays: string[];
    more: (count: number) => string;
  };
  manageLink: {
    slugMissingTitle: string;
    slugMissingBody: string;
    linkTitle: string;
    linkBody: string;
    copy: string;
    copied: string;
  };
  reminders: {
    page: {
      title: string;
      newReminder: string;
      countLabel: (count: number) => string;
      statusSuffix: (label: string) => string;
      cronBannerBefore: string;
      cronBannerAfter: string;
      tabs: { all: string; pending: string; sent: string; dismissed: string };
      statusLabels: { PENDING: string; SENT: string; ACKNOWLEDGED: string; DISMISSED: string };
      emptyTitle: string;
      createFirst: string;
      licensePlateLabel: string;
      dueLabel: string;
      mileageLimitLabel: string;
      sentLabel: string;
      sendNowButton: string;
      sendNowTooltip: string;
      dismissTooltip: string;
    };
    newPage: {
      title: string;
      subtitle: string;
    };
    form: {
      serviceTypes: string[];
      vehicleSectionTitle: string;
      selectVehicleLabel: string;
      selectVehiclePlaceholder: string;
      serviceSectionTitle: string;
      serviceLabel: string;
      selectServicePlaceholder: string;
      customHint: string;
      dueDateLabel: string;
      mileageLabel: string;
      mileagePlaceholder: string;
      cronHint: string;
      notesLabel: string;
      notesPlaceholder: string;
      saving: string;
      createReminder: string;
      cancel: string;
    };
  };
}

export const APPOINTMENTS_DICT: Record<AdminLocale, AppointmentsDictionary> = {
  es: {
    list: {
      pageTitle: "Citas",
      newAppointment: "Nueva cita",
      viewLabels: { month: "este mes", week: "esta semana", day: "este día" },
      countLabel: (count, viewLabel) => `${count} cita${count !== 1 ? "s" : ""} ${viewLabel}`,
      emptyForView: (viewLabel) => `No hay citas ${viewLabel}`,
      editButton: "Editar",
      completedButton: "Completada",
      noShowButton: "No asistió",
      reopenButton: "Reabrir",
      confirmButton: "Confirmar",
      sendLinkButton: "Enviar enlace",
      cancelButton: "Cancelar",
      webBadge: "Web",
      cancelConfirmPrompt: "¿Cancelar esta cita?",
      toastCompleted: "Cita marcada como completada",
      toastNoShow: "Cita marcada como no asistió",
      toastReopened: "Cita marcada como programada",
      viaSuffix: (channels) => (channels.length ? ` por ${channels.join(" y ")}` : ""),
      toastConfirmationSent: (via) => `Confirmación enviada${via}`,
      toastLinkSent: (via) => `Enlace enviado al cliente${via}`,
      toastCancelled: "Cita cancelada",
    },
    newPage: {
      title: "Nueva cita",
      subtitle: "Programa una cita con un cliente",
    },
    editPage: {
      title: "Editar cita",
    },
    history: {
      title: "Historial",
      subtitle: "Cada cambio de la cita y el aviso que se le envió al cliente.",
      empty: "Sin eventos registrados todavía.",
      by: (name) => `por ${name}`,
      client: "el cliente",
      system: "automático",
      events: {
        CREATED: "Cita creada",
        RESCHEDULED: "Cita reprogramada",
        UPDATED: "Cita modificada",
        CANCELLED: "Cita cancelada",
        REOPENED: "Cita reabierta",
        STATUS_CHANGED: "Estado cambiado",
        CONFIRMED_BY_CLIENT: "Confirmada por el cliente",
        NOTICE_RESENT: "Confirmación reenviada",
        REMINDER_SENT: "Recordatorio",
      },
      notices: {
        confirmation: "Aviso de confirmación",
        update: "Aviso de cambio",
        reminder: "Recordatorio",
        cancellation: "Aviso de cancelación",
      },
      outcomes: {
        SENT: "enviado",
        FAILED: "no se pudo enviar",
        SKIPPED_NO_CONTACT: "no enviado: el cliente no tiene teléfono ni email",
        SKIPPED_DISABLED: "no enviado: avisos de citas desactivados",
        SKIPPED_PAST: "no enviado: la cita ya pasó",
      },
      deliveryStatus: {
        QUEUED: "en cola",
        SENDING: "enviando",
        SENT: "enviado",
        DELIVERED: "entregado",
        FAILED: "falló",
        BOUNCED: "rebotó",
      },
      fields: {
        startsAt: "Fecha y hora",
        title: "Servicio",
        durationMinutes: "Duración",
        mechanicId: "Mecánico",
        vehicleId: "Vehículo",
        clientId: "Cliente",
        notes: "Notas",
        status: "Estado",
      },
    },
    form: {
      sectionTitle: "Datos de la cita",
      statusLabel: "Estado",
      titleLabel: "Título / servicio *",
      titlePlaceholder: "Cambio de aceite, revisión de frenos...",
      clientLabel: "Cliente *",
      selectClientPlaceholder: "Seleccionar cliente...",
      vehicleLabel: "Vehículo (opcional)",
      selectClientFirst: "Selecciona un cliente primero",
      noVehicles: "Sin vehículos",
      noSpecificVehicle: "Sin vehículo específico",
      mechanicLabel: "Mecánico (opcional)",
      unassigned: "Sin asignar",
      dateLabel: "Fecha *",
      timeLabel: "Hora *",
      durationLabel: "Duración (min)",
      notesLabel: "Notas (opcionales)",
      notesPlaceholder: "Instrucciones, piezas a pedir...",
      saving: "Guardando...",
      saveChanges: "Guardar cambios",
      createAppointment: "Crear cita",
      cancel: "Cancelar",
    },
    viewControls: {
      viewOptions: { month: "Mes", week: "Semana", day: "Día" },
      previous: "Anterior",
      next: "Siguiente",
      intlLocale: "es",
    },
    monthCalendar: {
      weekdays: ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."],
      more: (count) => `+${count} más`,
    },
    manageLink: {
      slugMissingTitle: "El cliente no puede gestionar la cita en línea todavía",
      slugMissingBody:
        "Configura el enlace público (slug) en Configuración → Citas para generar el link de confirmación/cancelación.",
      linkTitle: "Link para que el cliente confirme o cancele su cita",
      linkBody:
        "El cliente verá los detalles y podrá confirmar asistencia o cancelar. Los cambios de fecha u horario los hace el admin.",
      copy: "Copiar",
      copied: "Copiado",
    },
    reminders: {
      page: {
        title: "Recordatorios",
        newReminder: "Nuevo recordatorio",
        countLabel: (count) => `${count} recordatorio${count !== 1 ? "s" : ""}`,
        statusSuffix: (label) => ` · ${label}`,
        cronBannerBefore:
          "El sistema envía emails automáticos cada noche para recordatorios con vencimiento en ≤7 días. También puedes enviar manualmente con el botón ",
        cronBannerAfter: ".",
        tabs: { all: "Todos", pending: "Pendiente", sent: "Enviado", dismissed: "Descartado" },
        statusLabels: {
          PENDING: "Pendiente",
          SENT: "Enviado",
          ACKNOWLEDGED: "Confirmado",
          DISMISSED: "Descartado",
        },
        emptyTitle: "No hay recordatorios",
        createFirst: "Crear primer recordatorio",
        licensePlateLabel: "Placa: ",
        dueLabel: "📅 Vence: ",
        mileageLimitLabel: "🛞 Km límite: ",
        sentLabel: "✓ Enviado el ",
        sendNowButton: "Enviar ahora",
        sendNowTooltip: "Enviar email ahora",
        dismissTooltip: "Descartar",
      },
      newPage: {
        title: "Nuevo recordatorio",
        subtitle: "Programa un aviso de servicio para el cliente",
      },
      form: {
        serviceTypes: [
          "Cambio de aceite",
          "Cambio de frenos",
          "Alineación y balanceo",
          "Revisión general",
          "Cambio de llantas",
          "Revisión de batería",
          "Cambio de filtros",
          "Revisión de transmisión",
          "Otro",
        ],
        vehicleSectionTitle: "Vehículo",
        selectVehicleLabel: "Seleccionar vehículo *",
        selectVehiclePlaceholder: "Seleccionar vehículo...",
        serviceSectionTitle: "Tipo de servicio",
        serviceLabel: "Servicio *",
        selectServicePlaceholder: "Seleccionar servicio...",
        customHint: "También puedes escribir uno personalizado",
        dueDateLabel: "Fecha límite",
        mileageLabel: "Kilometraje límite",
        mileagePlaceholder: "ej: 80,000",
        cronHint:
          "Puedes definir fecha, kilometraje, o ambos. El cron nocturno envía el email cuando la fecha límite esté a ≤7 días.",
        notesLabel: "Notas (opcionales)",
        notesPlaceholder: "Detalles adicionales del servicio...",
        saving: "Guardando...",
        createReminder: "Crear recordatorio",
        cancel: "Cancelar",
      },
    },
  },
  en: {
    list: {
      pageTitle: "Appointments",
      newAppointment: "New appointment",
      viewLabels: { month: "this month", week: "this week", day: "this day" },
      countLabel: (count, viewLabel) => `${count} appointment${count !== 1 ? "s" : ""} ${viewLabel}`,
      emptyForView: (viewLabel) => `No appointments ${viewLabel}`,
      editButton: "Edit",
      completedButton: "Completed",
      noShowButton: "No-show",
      reopenButton: "Reopen",
      confirmButton: "Confirm",
      sendLinkButton: "Send link",
      cancelButton: "Cancel",
      webBadge: "Web",
      cancelConfirmPrompt: "Cancel this appointment?",
      toastCompleted: "Appointment marked as completed",
      toastNoShow: "Appointment marked as no-show",
      toastReopened: "Appointment marked as scheduled",
      viaSuffix: (channels) => (channels.length ? ` via ${channels.join(" and ")}` : ""),
      toastConfirmationSent: (via) => `Confirmation sent${via}`,
      toastLinkSent: (via) => `Link sent to the client${via}`,
      toastCancelled: "Appointment cancelled",
    },
    newPage: {
      title: "New appointment",
      subtitle: "Schedule an appointment with a client",
    },
    editPage: {
      title: "Edit appointment",
    },
    history: {
      title: "History",
      subtitle: "Every change to this appointment and the notice the client received.",
      empty: "No events recorded yet.",
      by: (name) => `by ${name}`,
      client: "the client",
      system: "automatic",
      events: {
        CREATED: "Appointment created",
        RESCHEDULED: "Appointment rescheduled",
        UPDATED: "Appointment updated",
        CANCELLED: "Appointment cancelled",
        REOPENED: "Appointment reopened",
        STATUS_CHANGED: "Status changed",
        CONFIRMED_BY_CLIENT: "Confirmed by the client",
        NOTICE_RESENT: "Confirmation resent",
        REMINDER_SENT: "Reminder",
      },
      notices: {
        confirmation: "Confirmation notice",
        update: "Change notice",
        reminder: "Reminder",
        cancellation: "Cancellation notice",
      },
      outcomes: {
        SENT: "sent",
        FAILED: "could not be sent",
        SKIPPED_NO_CONTACT: "not sent: the client has no phone or email",
        SKIPPED_DISABLED: "not sent: appointment notices are turned off",
        SKIPPED_PAST: "not sent: the appointment is in the past",
      },
      deliveryStatus: {
        QUEUED: "queued",
        SENDING: "sending",
        SENT: "sent",
        DELIVERED: "delivered",
        FAILED: "failed",
        BOUNCED: "bounced",
      },
      fields: {
        startsAt: "Date and time",
        title: "Service",
        durationMinutes: "Duration",
        mechanicId: "Mechanic",
        vehicleId: "Vehicle",
        clientId: "Client",
        notes: "Notes",
        status: "Status",
      },
    },
    form: {
      sectionTitle: "Appointment details",
      statusLabel: "Status",
      titleLabel: "Title / service *",
      titlePlaceholder: "Oil change, brake inspection...",
      clientLabel: "Client *",
      selectClientPlaceholder: "Select a client...",
      vehicleLabel: "Vehicle (optional)",
      selectClientFirst: "Select a client first",
      noVehicles: "No vehicles",
      noSpecificVehicle: "No specific vehicle",
      mechanicLabel: "Mechanic (optional)",
      unassigned: "Unassigned",
      dateLabel: "Date *",
      timeLabel: "Time *",
      durationLabel: "Duration (min)",
      notesLabel: "Notes (optional)",
      notesPlaceholder: "Instructions, parts to order...",
      saving: "Saving...",
      saveChanges: "Save changes",
      createAppointment: "Create appointment",
      cancel: "Cancel",
    },
    viewControls: {
      viewOptions: { month: "Month", week: "Week", day: "Day" },
      previous: "Previous",
      next: "Next",
      intlLocale: "en-CA",
    },
    monthCalendar: {
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      more: (count) => `+${count} more`,
    },
    manageLink: {
      slugMissingTitle: "The client can't manage this appointment online yet",
      slugMissingBody:
        "Set up the public link (slug) in Settings → Appointments to generate the confirm/cancel link.",
      linkTitle: "Link for the client to confirm or cancel their appointment",
      linkBody:
        "The client will see the details and can confirm attendance or cancel. Date or time changes are made by the admin.",
      copy: "Copy",
      copied: "Copied",
    },
    reminders: {
      page: {
        title: "Reminders",
        newReminder: "New reminder",
        countLabel: (count) => `${count} reminder${count !== 1 ? "s" : ""}`,
        statusSuffix: (label) => ` · ${label}`,
        cronBannerBefore:
          "The system automatically sends emails every night for reminders due within 7 days. You can also send one manually with the ",
        cronBannerAfter: " button.",
        tabs: { all: "All", pending: "Pending", sent: "Sent", dismissed: "Dismissed" },
        statusLabels: {
          PENDING: "Pending",
          SENT: "Sent",
          ACKNOWLEDGED: "Acknowledged",
          DISMISSED: "Dismissed",
        },
        emptyTitle: "No reminders yet",
        createFirst: "Create your first reminder",
        licensePlateLabel: "Plate: ",
        dueLabel: "📅 Due: ",
        mileageLimitLabel: "🛞 Mileage limit: ",
        sentLabel: "✓ Sent on ",
        sendNowButton: "Send now",
        sendNowTooltip: "Send email now",
        dismissTooltip: "Dismiss",
      },
      newPage: {
        title: "New reminder",
        subtitle: "Schedule a service reminder for the client",
      },
      form: {
        serviceTypes: [
          "Oil change",
          "Brake change",
          "Alignment and balancing",
          "General inspection",
          "Tire change",
          "Battery check",
          "Filter change",
          "Transmission check",
          "Other",
        ],
        vehicleSectionTitle: "Vehicle",
        selectVehicleLabel: "Select vehicle *",
        selectVehiclePlaceholder: "Select a vehicle...",
        serviceSectionTitle: "Service type",
        serviceLabel: "Service *",
        selectServicePlaceholder: "Select a service...",
        customHint: "You can also enter a custom one",
        dueDateLabel: "Due date",
        mileageLabel: "Mileage limit",
        mileagePlaceholder: "e.g. 80,000",
        cronHint:
          "You can set a date, mileage, or both. The nightly job sends the email once the due date is within 7 days.",
        notesLabel: "Notes (optional)",
        notesPlaceholder: "Additional service details...",
        saving: "Saving...",
        createReminder: "Create reminder",
        cancel: "Cancel",
      },
    },
  },
  fr: {
    list: {
      pageTitle: "Rendez-vous",
      newAppointment: "Nouveau rendez-vous",
      viewLabels: { month: "ce mois-ci", week: "cette semaine", day: "ce jour" },
      countLabel: (count, viewLabel) => `${count} rendez-vous ${viewLabel}`,
      emptyForView: (viewLabel) => `Aucun rendez-vous ${viewLabel}`,
      editButton: "Modifier",
      completedButton: "Terminé",
      noShowButton: "Absence",
      reopenButton: "Rouvrir",
      confirmButton: "Confirmer",
      sendLinkButton: "Envoyer le lien",
      cancelButton: "Annuler",
      webBadge: "Web",
      cancelConfirmPrompt: "Annuler ce rendez-vous ?",
      toastCompleted: "Rendez-vous marqué comme terminé",
      toastNoShow: "Rendez-vous marqué comme absence",
      toastReopened: "Rendez-vous marqué comme planifié",
      viaSuffix: (channels) => (channels.length ? ` par ${channels.join(" et ")}` : ""),
      toastConfirmationSent: (via) => `Confirmation envoyée${via}`,
      toastLinkSent: (via) => `Lien envoyé au client${via}`,
      toastCancelled: "Rendez-vous annulé",
    },
    newPage: {
      title: "Nouveau rendez-vous",
      subtitle: "Planifiez un rendez-vous avec un client",
    },
    editPage: {
      title: "Modifier le rendez-vous",
    },
    history: {
      title: "Historique",
      subtitle: "Chaque modification du rendez-vous et l'avis envoyé au client.",
      empty: "Aucun événement enregistré pour l'instant.",
      by: (name) => `par ${name}`,
      client: "le client",
      system: "automatique",
      events: {
        CREATED: "Rendez-vous créé",
        RESCHEDULED: "Rendez-vous déplacé",
        UPDATED: "Rendez-vous modifié",
        CANCELLED: "Rendez-vous annulé",
        REOPENED: "Rendez-vous rouvert",
        STATUS_CHANGED: "Statut modifié",
        CONFIRMED_BY_CLIENT: "Confirmé par le client",
        NOTICE_RESENT: "Confirmation renvoyée",
        REMINDER_SENT: "Rappel",
      },
      notices: {
        confirmation: "Avis de confirmation",
        update: "Avis de modification",
        reminder: "Rappel",
        cancellation: "Avis d'annulation",
      },
      outcomes: {
        SENT: "envoyé",
        FAILED: "n'a pas pu être envoyé",
        SKIPPED_NO_CONTACT: "non envoyé : le client n'a ni téléphone ni courriel",
        SKIPPED_DISABLED: "non envoyé : les avis de rendez-vous sont désactivés",
        SKIPPED_PAST: "non envoyé : le rendez-vous est passé",
      },
      deliveryStatus: {
        QUEUED: "en file",
        SENDING: "en cours",
        SENT: "envoyé",
        DELIVERED: "livré",
        FAILED: "échec",
        BOUNCED: "rejeté",
      },
      fields: {
        startsAt: "Date et heure",
        title: "Service",
        durationMinutes: "Durée",
        mechanicId: "Mécanicien",
        vehicleId: "Véhicule",
        clientId: "Client",
        notes: "Notes",
        status: "Statut",
      },
    },
    form: {
      sectionTitle: "Détails du rendez-vous",
      statusLabel: "Statut",
      titleLabel: "Titre / service *",
      titlePlaceholder: "Changement d'huile, inspection des freins...",
      clientLabel: "Client *",
      selectClientPlaceholder: "Sélectionner un client...",
      vehicleLabel: "Véhicule (optionnel)",
      selectClientFirst: "Sélectionnez d'abord un client",
      noVehicles: "Aucun véhicule",
      noSpecificVehicle: "Aucun véhicule spécifique",
      mechanicLabel: "Mécanicien (optionnel)",
      unassigned: "Non assigné",
      dateLabel: "Date *",
      timeLabel: "Heure *",
      durationLabel: "Durée (min)",
      notesLabel: "Notes (optionnel)",
      notesPlaceholder: "Instructions, pièces à commander...",
      saving: "Enregistrement...",
      saveChanges: "Enregistrer les changements",
      createAppointment: "Créer le rendez-vous",
      cancel: "Annuler",
    },
    viewControls: {
      viewOptions: { month: "Mois", week: "Semaine", day: "Jour" },
      previous: "Précédent",
      next: "Suivant",
      intlLocale: "fr-CA",
    },
    monthCalendar: {
      weekdays: ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."],
      more: (count) => `+${count} de plus`,
    },
    manageLink: {
      slugMissingTitle: "Le client ne peut pas encore gérer ce rendez-vous en ligne",
      slugMissingBody:
        "Configurez le lien public (slug) dans Configuration → Rendez-vous pour générer le lien de confirmation/annulation.",
      linkTitle: "Lien pour que le client confirme ou annule son rendez-vous",
      linkBody:
        "Le client verra les détails et pourra confirmer sa présence ou annuler. Les changements de date ou d'heure sont faits par l'administrateur.",
      copy: "Copier",
      copied: "Copié",
    },
    reminders: {
      page: {
        title: "Rappels",
        newReminder: "Nouveau rappel",
        countLabel: (count) => `${count} rappel${count !== 1 ? "s" : ""}`,
        statusSuffix: (label) => ` · ${label}`,
        cronBannerBefore:
          "Le système envoie automatiquement des courriels chaque soir pour les rappels dont l'échéance est dans ≤7 jours. Vous pouvez aussi en envoyer un manuellement avec le bouton ",
        cronBannerAfter: ".",
        tabs: { all: "Tous", pending: "En attente", sent: "Envoyé", dismissed: "Ignoré" },
        statusLabels: {
          PENDING: "En attente",
          SENT: "Envoyé",
          ACKNOWLEDGED: "Confirmé",
          DISMISSED: "Ignoré",
        },
        emptyTitle: "Aucun rappel",
        createFirst: "Créer le premier rappel",
        licensePlateLabel: "Plaque : ",
        dueLabel: "📅 Échéance : ",
        mileageLimitLabel: "🛞 Kilométrage limite : ",
        sentLabel: "✓ Envoyé le ",
        sendNowButton: "Envoyer maintenant",
        sendNowTooltip: "Envoyer le courriel maintenant",
        dismissTooltip: "Ignorer",
      },
      newPage: {
        title: "Nouveau rappel",
        subtitle: "Planifiez un avis de service pour le client",
      },
      form: {
        serviceTypes: [
          "Changement d'huile",
          "Changement de freins",
          "Alignement et balancement",
          "Révision générale",
          "Changement de pneus",
          "Vérification de la batterie",
          "Changement de filtres",
          "Vérification de la transmission",
          "Autre",
        ],
        vehicleSectionTitle: "Véhicule",
        selectVehicleLabel: "Sélectionner un véhicule *",
        selectVehiclePlaceholder: "Sélectionner un véhicule...",
        serviceSectionTitle: "Type de service",
        serviceLabel: "Service *",
        selectServicePlaceholder: "Sélectionner un service...",
        customHint: "Vous pouvez aussi en écrire un personnalisé",
        dueDateLabel: "Date d'échéance",
        mileageLabel: "Kilométrage limite",
        mileagePlaceholder: "ex. 80 000",
        cronHint:
          "Vous pouvez définir une date, un kilométrage, ou les deux. La tâche nocturne envoie le courriel lorsque l'échéance est à ≤7 jours.",
        notesLabel: "Notes (optionnel)",
        notesPlaceholder: "Détails supplémentaires sur le service...",
        saving: "Enregistrement...",
        createReminder: "Créer le rappel",
        cancel: "Annuler",
      },
    },
  },
};
