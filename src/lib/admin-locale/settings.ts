import type { AdminLocale } from "@/lib/admin-locale";

export interface SettingsDictionary {
  page: { title: string; subtitle: string };
  tabs: {
    general: string;
    calendar: string;
    services: string;
    team: string;
    domain: string;
    support: string;
  };
  appointmentReminders: {
    title: string;
    reminderHours: string;
    reminderHoursHint: string;
    smsLabel: string;
    emailNotifLabel: string;
    smsHint: string;
    save: string;
    saving: string;
    saved: string;
  };
  language: {
    title: string;
    hint: string;
    saved: string;
    error: string;
  };
  logo: {
    title: string;
    change: string;
    uploading: string;
    hint1: string;
    hint2: string;
    uploaded: string;
  };
  shopInfo: {
    title: string;
    name: string;
    address: string;
    addressPlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    emailHint: string;
    taxId: string;
    taxIdPlaceholder: string;
    taxIdHint: string;
    save: string;
    saving: string;
    saved: string;
  };
  password: {
    title: string;
    current: string;
    next: string;
    confirm: string;
    submit: string;
    submitting: string;
    saved: string;
  };
  emailRouting: {
    title: string;
    subtitle: string;
    channel: string;
    from: string;
    replyTo: string;
    status: string;
    comingSoon: string;
    ready: string;
    missingConfig: string;
    newsletterHint: (address: string) => string;
  };
  booking: {
    title: string;
    subtitle: string;
    enableLabel: string;
    slotMinutes: string;
    leadTime: string;
    advanceDays: string;
    timezone: string;
    copyLink: string;
    openPage: string;
    linkCopied: string;
    saveBooking: string;
    saved: string;
    hoursTitle: string;
    hoursSubtitle: string;
    closed: string;
    saveHours: string;
    hoursSaved: string;
    mechanicsTitle: string;
    mechanicsSubtitle: string;
    noMechanics: string;
    owner: string;
    mechanic: string;
    followsShopHours: string;
    ownHours: string;
    receivesWebBookings: string;
    scheduleButton: string;
    ownHoursCheckbox: string;
    notWorking: string;
    saveMechanicSchedule: (name: string) => string;
    mechanicVisible: string;
    mechanicHidden: string;
    mechanicFollowsShop: (name: string) => string;
    mechanicScheduleSaved: (name: string) => string;
  };
  services: {
    title: string;
    subtitle: string;
    active: string;
    remove: string;
    french: string;
    english: string;
    spanish: string;
    duration: string;
    addService: string;
    saveServices: string;
    saved: string;
    needOneService: string;
    needAllLanguages: string;
  };
  team: {
    title: string;
    subtitle: string;
    newUser: string;
    newAccount: string;
    fullName: string;
    email: string;
    tempPassword: string;
    roleMechanicOption: string;
    roleViewerOption: string;
    roleOwnerOption: string;
    cancel: string;
    createAccount: string;
    you: string;
    resetPassword: string;
    deleteUser: string;
    newPasswordFor: (name: string) => string;
    minChars: string;
    savePassword: string;
    roleOwner: string;
    roleMechanic: string;
    roleViewer: string;
    legend: string;
    userCreated: string;
    passwordReset: string;
    roleUpdated: string;
    userDeleted: string;
    confirmDelete: (name: string) => string;
  };
  support: {
    needHelp: string;
  };
}

export const SETTINGS_DICT: Record<AdminLocale, SettingsDictionary> = {
  es: {
    page: {
      title: "Configuración",
      subtitle: "Logo, datos del taller, equipo y catálogo de servicios",
    },
    tabs: {
      general: "General",
      calendar: "Calendario y Horarios",
      services: "Servicios",
      team: "Equipo",
      domain: "Dominio",
      support: "Soporte",
    },
    language: {
      title: "Idioma",
      hint: "El idioma en el que ves este panel. No afecta el idioma que ven tus clientes.",
      saved: "Idioma actualizado",
      error: "No se pudo actualizar el idioma",
    },
    logo: {
      title: "Logo del taller",
      change: "Cambiar logo",
      uploading: "Subiendo...",
      hint1: "JPG, PNG, WebP o SVG · Máximo 5 MB",
      hint2: "El logo aparece en todas las facturas PDF",
      uploaded: "Logo actualizado",
    },
    shopInfo: {
      title: "Datos del taller",
      name: "Nombre del taller *",
      address: "Dirección",
      addressPlaceholder: "123 Rue Principale, Montréal, QC",
      phone: "Teléfono",
      phonePlaceholder: "(514) 000-0000",
      email: "Email principal",
      emailPlaceholder: "info@tutaller.com",
      emailHint: "Contacto general y fallback si no hay buzón específico",
      taxId: "Número de impuestos (NEQ / TPS / TVQ)",
      taxIdPlaceholder: "TPS: 123456789 RT0001 · TVQ: 1234567890 TQ0001",
      taxIdHint: "Aparece en el pie de página de las facturas PDF",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
    appointmentReminders: {
      title: "Citas — notificaciones (SMS y email)",
      reminderHours: "Horas antes de la cita",
      reminderHoursHint: "El cron envía recordatorio cuando falten estas horas (por defecto 24 h)",
      smsLabel: "Enviar notificaciones de citas por SMS (canal principal)",
      emailNotifLabel: "Enviar también por email (secundario)",
      smsHint:
        "El SMS requiere una cuenta de Twilio configurada por el equipo técnico (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
    password: {
      title: "Cambiar contraseña",
      current: "Contraseña actual",
      next: "Nueva contraseña",
      confirm: "Confirmar contraseña",
      submit: "Cambiar contraseña",
      submitting: "Cambiando...",
      saved: "Contraseña actualizada",
    },
    emailRouting: {
      title: "Correos automáticos",
      subtitle:
        "Todos los correos al cliente salen de info@ — el mismo que aparece en la factura. Configura el buzón en IONOS y Resend enviará en tu nombre.",
      channel: "Canal",
      from: "Remitente (FROM)",
      replyTo: "Respuestas (Reply-To)",
      status: "Estado",
      comingSoon: "Próximamente",
      ready: "Listo",
      missingConfig: "Falta config",
      newsletterHint: (address) =>
        `Newsletter usará ${address} con Brevo/Mailchimp cuando esté activo — no pasa por Resend.`,
    },
    booking: {
      title: "Citas — reservas desde el website",
      subtitle:
        "Cuando entregues el sitio web del taller, enlaza a esta página pública para que los clientes agenden citas en línea. También puedes compartir el enlace directo.",
      enableLabel: "Activar reservas en línea (visible en /book/…)",
      slotMinutes: "Duración de cada cita (min)",
      leadTime: "Anticipación mínima (horas)",
      advanceDays: "Reservar hasta (días adelante)",
      timezone: "Zona horaria",
      copyLink: "Copiar enlace",
      openPage: "Abrir página de reservas",
      linkCopied: "Enlace copiado",
      saveBooking: "Guardar reservas web",
      saved: "Configuración de reservas guardada",
      hoursTitle: "Horario de apertura",
      hoursSubtitle: "Define cuándo el taller acepta citas. Los slots se generan dentro de este horario.",
      closed: "Cerrado",
      saveHours: "Guardar horario",
      hoursSaved: "Horario del taller guardado",
      mechanicsTitle: "Mecánicos disponibles para citas",
      mechanicsSubtitle:
        "Crea cuentas de mecánico en Equipo del taller (abajo). Aquí eliges quién aparece en el calendario de reservas y recibe citas automáticamente.",
      noMechanics: "No hay mecánicos. Ve a Equipo del taller y crea al menos un usuario con rol Mecánico.",
      owner: "Dueño",
      mechanic: "Mecánico",
      followsShopHours: "sigue el horario del taller",
      ownHours: "horario propio",
      receivesWebBookings: "Recibe citas web",
      scheduleButton: "Horario",
      ownHoursCheckbox: "Horario propio (si no, sigue el horario del taller)",
      notWorking: "No trabaja",
      saveMechanicSchedule: (name) => `Guardar horario de ${name}`,
      mechanicVisible: "Mecánico visible en reservas",
      mechanicHidden: "Mecánico oculto en reservas",
      mechanicFollowsShop: (name) => `${name} sigue el horario del taller`,
      mechanicScheduleSaved: (name) => `Horario de ${name} guardado`,
    },
    services: {
      title: "Servicios del calendario público",
      subtitle:
        "Estos son los servicios que el cliente elige en /book/… — cada uno con su nombre en francés, inglés y español (el sitio se lo muestra en el idioma que el visitante tenga elegido) y su duración, que es la que bloquea el horario del mecánico. Agrega, edita o quita servicios; desmarca “activo” para ocultar uno sin borrarlo.",
      active: "Activo",
      remove: "Quitar servicio",
      french: "Francés (FR)",
      english: "Inglés (EN)",
      spanish: "Español (ES)",
      duration: "min",
      addService: "Agregar servicio",
      saveServices: "Guardar servicios",
      saved: "Servicios guardados",
      needOneService: "Agrega al menos un servicio",
      needAllLanguages: "Completa el nombre del servicio en los 3 idiomas",
    },
    team: {
      title: "Equipo del taller",
      subtitle:
        "Crea cuentas para empleados (mecánicos, recepción). Luego en Citas — reservas desde el website activa quién recibe citas en línea.",
      newUser: "Nuevo usuario",
      newAccount: "Nueva cuenta",
      fullName: "Nombre completo",
      email: "Correo electrónico",
      tempPassword: "Contraseña temporal (mín. 8)",
      roleMechanicOption: "Mecánico — puede crear y editar",
      roleViewerOption: "Solo lectura — ver sin modificar",
      roleOwnerOption: "Dueño — acceso total",
      cancel: "Cancelar",
      createAccount: "Crear cuenta",
      you: "tú",
      resetPassword: "Restablecer contraseña",
      deleteUser: "Eliminar usuario",
      newPasswordFor: (name) => `Nueva contraseña para ${name}`,
      minChars: "Mínimo 8 caracteres",
      savePassword: "Guardar contraseña",
      roleOwner: "Dueño",
      roleMechanic: "Mecánico",
      roleViewer: "Solo lectura",
      legend: "Dueño: configuración, equipo y todo el sistema. Mecánico: clientes, facturas y recordatorios. Solo lectura: consulta sin modificar.",
      userCreated: "Usuario creado",
      passwordReset: "Contraseña restablecida",
      roleUpdated: "Rol actualizado",
      userDeleted: "Usuario eliminado",
      confirmDelete: (name) => `¿Eliminar la cuenta de ${name}? Esta acción no se puede deshacer.`,
    },
    support: { needHelp: "¿Necesita ayuda?" },
  },
  en: {
    page: {
      title: "Settings",
      subtitle: "Logo, shop details, team, and service catalog",
    },
    tabs: {
      general: "General",
      calendar: "Calendar & Hours",
      services: "Services",
      team: "Team",
      domain: "Domain",
      support: "Support",
    },
    language: {
      title: "Language",
      hint: "The language you see this panel in. It does not change the language your clients see.",
      saved: "Language updated",
      error: "Could not update the language",
    },
    logo: {
      title: "Shop logo",
      change: "Change logo",
      uploading: "Uploading...",
      hint1: "JPG, PNG, WebP, or SVG · Max 5 MB",
      hint2: "The logo appears on every PDF invoice",
      uploaded: "Logo updated",
    },
    shopInfo: {
      title: "Shop details",
      name: "Shop name *",
      address: "Address",
      addressPlaceholder: "123 Main Street, Montréal, QC",
      phone: "Phone",
      phonePlaceholder: "(514) 000-0000",
      email: "Main email",
      emailPlaceholder: "info@yourshop.com",
      emailHint: "General contact and fallback when no specific mailbox is set",
      taxId: "Tax number (NEQ / GST / QST)",
      taxIdPlaceholder: "GST: 123456789 RT0001 · QST: 1234567890 TQ0001",
      taxIdHint: "Shown in the footer of PDF invoices",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
    appointmentReminders: {
      title: "Appointments — notifications (SMS and email)",
      reminderHours: "Hours before the appointment",
      reminderHoursHint: "The cron sends a reminder when this many hours are left (default 24h)",
      smsLabel: "Send appointment notifications by SMS (main channel)",
      emailNotifLabel: "Also send by email (secondary)",
      smsHint:
        "SMS requires a Twilio account set up by the technical team (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
    password: {
      title: "Change password",
      current: "Current password",
      next: "New password",
      confirm: "Confirm password",
      submit: "Change password",
      submitting: "Changing...",
      saved: "Password updated",
    },
    emailRouting: {
      title: "Automatic emails",
      subtitle:
        "All emails to clients are sent from info@ — the same address shown on invoices. Set up the mailbox in IONOS and Resend will send on your behalf.",
      channel: "Channel",
      from: "Sender (FROM)",
      replyTo: "Replies (Reply-To)",
      status: "Status",
      comingSoon: "Coming soon",
      ready: "Ready",
      missingConfig: "Missing setup",
      newsletterHint: (address) =>
        `Newsletter will use ${address} with Brevo/Mailchimp once active — it doesn't go through Resend.`,
    },
    booking: {
      title: "Appointments — bookings from the website",
      subtitle:
        "Once you hand off the shop's website, link to this public page so clients can book appointments online. You can also share the direct link.",
      enableLabel: "Enable online booking (visible at /book/…)",
      slotMinutes: "Duration of each appointment (min)",
      leadTime: "Minimum lead time (hours)",
      advanceDays: "Bookable up to (days ahead)",
      timezone: "Timezone",
      copyLink: "Copy link",
      openPage: "Open booking page",
      linkCopied: "Link copied",
      saveBooking: "Save web booking settings",
      saved: "Booking settings saved",
      hoursTitle: "Opening hours",
      hoursSubtitle: "Defines when the shop accepts appointments. Slots are generated within these hours.",
      closed: "Closed",
      saveHours: "Save hours",
      hoursSaved: "Shop hours saved",
      mechanicsTitle: "Mechanics available for appointments",
      mechanicsSubtitle:
        "Create mechanic accounts under Shop team (below). Here you choose who appears on the booking calendar and automatically receives appointments.",
      noMechanics: "No mechanics yet. Go to Shop team and create at least one user with the Mechanic role.",
      owner: "Owner",
      mechanic: "Mechanic",
      followsShopHours: "follows the shop's hours",
      ownHours: "own hours",
      receivesWebBookings: "Receives web bookings",
      scheduleButton: "Schedule",
      ownHoursCheckbox: "Own schedule (otherwise follows the shop's hours)",
      notWorking: "Not working",
      saveMechanicSchedule: (name) => `Save ${name}'s schedule`,
      mechanicVisible: "Mechanic visible in bookings",
      mechanicHidden: "Mechanic hidden from bookings",
      mechanicFollowsShop: (name) => `${name} now follows the shop's hours`,
      mechanicScheduleSaved: (name) => `${name}'s schedule saved`,
    },
    services: {
      title: "Public booking calendar services",
      subtitle:
        "These are the services a client picks at /book/… — each with its name in French, English, and Spanish (the site shows it in the visitor's chosen language) and its duration, which blocks time on the mechanic's schedule. Add, edit, or remove services; uncheck “active” to hide one without deleting it.",
      active: "Active",
      remove: "Remove service",
      french: "French (FR)",
      english: "English (EN)",
      spanish: "Spanish (ES)",
      duration: "min",
      addService: "Add service",
      saveServices: "Save services",
      saved: "Services saved",
      needOneService: "Add at least one service",
      needAllLanguages: "Fill in the service name in all 3 languages",
    },
    team: {
      title: "Shop team",
      subtitle:
        "Create accounts for staff (mechanics, front desk). Then, under Appointments — bookings from the website, choose who receives online appointments.",
      newUser: "New user",
      newAccount: "New account",
      fullName: "Full name",
      email: "Email",
      tempPassword: "Temporary password (min. 8)",
      roleMechanicOption: "Mechanic — can create and edit",
      roleViewerOption: "Read only — view without editing",
      roleOwnerOption: "Owner — full access",
      cancel: "Cancel",
      createAccount: "Create account",
      you: "you",
      resetPassword: "Reset password",
      deleteUser: "Delete user",
      newPasswordFor: (name) => `New password for ${name}`,
      minChars: "Minimum 8 characters",
      savePassword: "Save password",
      roleOwner: "Owner",
      roleMechanic: "Mechanic",
      roleViewer: "Read only",
      legend: "Owner: settings, team, and the whole system. Mechanic: clients, invoices, and reminders. Read only: view without editing.",
      userCreated: "User created",
      passwordReset: "Password reset",
      roleUpdated: "Role updated",
      userDeleted: "User deleted",
      confirmDelete: (name) => `Delete ${name}'s account? This cannot be undone.`,
    },
    support: { needHelp: "Need help?" },
  },
  fr: {
    page: {
      title: "Configuration",
      subtitle: "Logo, infos du garage, équipe et catalogue de services",
    },
    tabs: {
      general: "Général",
      calendar: "Calendrier et horaires",
      services: "Services",
      team: "Équipe",
      domain: "Domaine",
      support: "Assistance",
    },
    language: {
      title: "Langue",
      hint: "La langue dans laquelle vous voyez ce panneau. Elle ne change pas la langue vue par vos clients.",
      saved: "Langue mise à jour",
      error: "Impossible de mettre à jour la langue",
    },
    logo: {
      title: "Logo du garage",
      change: "Changer le logo",
      uploading: "Téléversement...",
      hint1: "JPG, PNG, WebP ou SVG · Max 5 Mo",
      hint2: "Le logo apparaît sur toutes les factures PDF",
      uploaded: "Logo mis à jour",
    },
    shopInfo: {
      title: "Informations du garage",
      name: "Nom du garage *",
      address: "Adresse",
      addressPlaceholder: "123 rue Principale, Montréal, QC",
      phone: "Téléphone",
      phonePlaceholder: "(514) 000-0000",
      email: "Courriel principal",
      emailPlaceholder: "info@votregarage.com",
      emailHint: "Contact général et solution de repli s'il n'y a pas de boîte spécifique",
      taxId: "Numéro de taxes (NEQ / TPS / TVQ)",
      taxIdPlaceholder: "TPS : 123456789 RT0001 · TVQ : 1234567890 TQ0001",
      taxIdHint: "Apparaît en bas des factures PDF",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
    appointmentReminders: {
      title: "Rendez-vous — notifications (SMS et courriel)",
      reminderHours: "Heures avant le rendez-vous",
      reminderHoursHint: "La tâche planifiée envoie un rappel quand il reste ce nombre d'heures (24 h par défaut)",
      smsLabel: "Envoyer les notifications de rendez-vous par SMS (canal principal)",
      emailNotifLabel: "Envoyer aussi par courriel (secondaire)",
      smsHint:
        "Le SMS nécessite un compte Twilio configuré par l'équipe technique (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
    password: {
      title: "Changer le mot de passe",
      current: "Mot de passe actuel",
      next: "Nouveau mot de passe",
      confirm: "Confirmer le mot de passe",
      submit: "Changer le mot de passe",
      submitting: "Changement...",
      saved: "Mot de passe mis à jour",
    },
    emailRouting: {
      title: "Courriels automatiques",
      subtitle:
        "Tous les courriels au client proviennent de info@ — la même adresse affichée sur la facture. Configurez la boîte dans IONOS et Resend enverra en votre nom.",
      channel: "Canal",
      from: "Expéditeur (FROM)",
      replyTo: "Réponses (Reply-To)",
      status: "Statut",
      comingSoon: "Bientôt disponible",
      ready: "Prêt",
      missingConfig: "Configuration manquante",
      newsletterHint: (address) =>
        `L'infolettre utilisera ${address} avec Brevo/Mailchimp une fois active — elle ne passe pas par Resend.`,
    },
    booking: {
      title: "Rendez-vous — réservations depuis le site web",
      subtitle:
        "Lorsque vous livrez le site web du garage, référez cette page publique pour que les clients prennent rendez-vous en ligne. Vous pouvez aussi partager le lien direct.",
      enableLabel: "Activer les réservations en ligne (visible à /book/…)",
      slotMinutes: "Durée de chaque rendez-vous (min)",
      leadTime: "Délai minimum (heures)",
      advanceDays: "Réservable jusqu'à (jours à l'avance)",
      timezone: "Fuseau horaire",
      copyLink: "Copier le lien",
      openPage: "Ouvrir la page de réservation",
      linkCopied: "Lien copié",
      saveBooking: "Enregistrer les réservations web",
      saved: "Configuration des réservations enregistrée",
      hoursTitle: "Heures d'ouverture",
      hoursSubtitle: "Définit quand le garage accepte les rendez-vous. Les plages sont générées dans cet horaire.",
      closed: "Fermé",
      saveHours: "Enregistrer l'horaire",
      hoursSaved: "Horaire du garage enregistré",
      mechanicsTitle: "Mécaniciens disponibles pour les rendez-vous",
      mechanicsSubtitle:
        "Créez des comptes de mécanicien dans Équipe du garage (ci-dessous). Choisissez ici qui apparaît au calendrier de réservation et reçoit des rendez-vous automatiquement.",
      noMechanics: "Aucun mécanicien. Allez dans Équipe du garage et créez au moins un utilisateur avec le rôle Mécanicien.",
      owner: "Propriétaire",
      mechanic: "Mécanicien",
      followsShopHours: "suit l'horaire du garage",
      ownHours: "horaire propre",
      receivesWebBookings: "Reçoit les rendez-vous web",
      scheduleButton: "Horaire",
      ownHoursCheckbox: "Horaire propre (sinon, suit l'horaire du garage)",
      notWorking: "Ne travaille pas",
      saveMechanicSchedule: (name) => `Enregistrer l'horaire de ${name}`,
      mechanicVisible: "Mécanicien visible dans les réservations",
      mechanicHidden: "Mécanicien masqué des réservations",
      mechanicFollowsShop: (name) => `${name} suit maintenant l'horaire du garage`,
      mechanicScheduleSaved: (name) => `Horaire de ${name} enregistré`,
    },
    services: {
      title: "Services du calendrier de réservation public",
      subtitle:
        "Ce sont les services que le client choisit sur /book/… — chacun avec son nom en français, anglais et espagnol (le site l'affiche dans la langue choisie par le visiteur) et sa durée, qui bloque l'horaire du mécanicien. Ajoutez, modifiez ou retirez des services; décochez « actif » pour en cacher un sans le supprimer.",
      active: "Actif",
      remove: "Retirer le service",
      french: "Français (FR)",
      english: "Anglais (EN)",
      spanish: "Espagnol (ES)",
      duration: "min",
      addService: "Ajouter un service",
      saveServices: "Enregistrer les services",
      saved: "Services enregistrés",
      needOneService: "Ajoutez au moins un service",
      needAllLanguages: "Complétez le nom du service dans les 3 langues",
    },
    team: {
      title: "Équipe du garage",
      subtitle:
        "Créez des comptes pour les employés (mécaniciens, réception). Ensuite, dans Rendez-vous — réservations depuis le site web, choisissez qui reçoit les rendez-vous en ligne.",
      newUser: "Nouvel utilisateur",
      newAccount: "Nouveau compte",
      fullName: "Nom complet",
      email: "Courriel",
      tempPassword: "Mot de passe temporaire (min. 8)",
      roleMechanicOption: "Mécanicien — peut créer et modifier",
      roleViewerOption: "Lecture seule — consulter sans modifier",
      roleOwnerOption: "Propriétaire — accès complet",
      cancel: "Annuler",
      createAccount: "Créer le compte",
      you: "vous",
      resetPassword: "Réinitialiser le mot de passe",
      deleteUser: "Supprimer l'utilisateur",
      newPasswordFor: (name) => `Nouveau mot de passe pour ${name}`,
      minChars: "Minimum 8 caractères",
      savePassword: "Enregistrer le mot de passe",
      roleOwner: "Propriétaire",
      roleMechanic: "Mécanicien",
      roleViewer: "Lecture seule",
      legend: "Propriétaire : configuration, équipe et tout le système. Mécanicien : clients, factures et rappels. Lecture seule : consultation sans modification.",
      userCreated: "Utilisateur créé",
      passwordReset: "Mot de passe réinitialisé",
      roleUpdated: "Rôle mis à jour",
      userDeleted: "Utilisateur supprimé",
      confirmDelete: (name) => `Supprimer le compte de ${name}? Cette action est irréversible.`,
    },
    support: { needHelp: "Besoin d'aide?" },
  },
};
