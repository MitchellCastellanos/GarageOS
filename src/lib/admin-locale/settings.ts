import type { AdminLocale } from "@/lib/admin-locale";

export interface SettingsDictionary {
  page: { title: string; subtitle: string };
  tabs: {
    general: string;
    calendar: string;
    services: string;
    team: string;
    locations: string;
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
  shopSlug: {
    title: string;
    subtitle: string;
    placeholder: string;
    emptyWarning: string;
    save: string;
    saved: string;
  };
  brandColor: {
    title: string;
    subtitle: string;
    hint: string;
    previewLabel: string;
    reset: string;
    save: string;
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
  embed: {
    title: string;
    description: string;
    hint: string;
    iframeTitle: string;
    copy: string;
    copied: string;
    copyError: string;
  };
  qr: {
    title: string;
    subtitle: string;
    download: string;
  };
  booking: {
    toggling: string;
    enabledStatus: string;
    disabledStatus: string;
    toggleHint: string;
    toggleError: string;
    copyError: string;
    publicLink: string;
    rulesTitle: string;
    rulesSubtitle: string;
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
    shareTitle: string;
    shareSubtitle: string;
    shareCaption: (shopName: string) => string;
    shareCopyCaption: string;
    shareCaptionCopied: string;
    buttonSnippetTitle: string;
    buttonSnippetHint: string;
    missingSlugHint: string;
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
  locations: {
    title: string;
    subtitle: string;
    addFirstTitle: string;
    addFirstSubtitle: string;
    namePlaceholder: string;
    createButton: string;
    creating: string;
    currentBadge: string;
    userCountLabel: (n: number) => string;
    switchButton: string;
    switching: string;
    accessHeading: string;
    addAccessLabel: string;
    addAccessButton: string;
    revokeButton: string;
    noOtherUsers: string;
    errors: {
      noAccess: string;
      shopNotFound: string;
      crossOrganization: string;
      genericError: string;
    };
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
      locations: "Ubicaciones",
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
    shopSlug: {
      title: "Enlace público de reservas",
      subtitle: "Este identificador define la URL donde los clientes reservan citas en línea, y habilita compartir el enlace, el botón para tu sitio y el widget embebido en la pestaña Calendario y Horarios.",
      placeholder: "tu-taller",
      emptyWarning: "Sin este identificador no tienes enlace público — el botón, el widget y las opciones de compartir no aparecerán hasta que lo definas.",
      save: "Guardar identificador",
      saved: "Identificador guardado",
    },
    brandColor: {
      title: "Color de tu página de citas",
      subtitle: "Personaliza el fondo del encabezado, portada, sección \"El taller\" y pie de página de tu enlace público — el acento rojo de GarageOS se mantiene.",
      hint: "Si el color es muy claro lo oscurecemos automáticamente para que el texto blanco se siga leyendo bien.",
      previewLabel: "Tu taller",
      reset: "Usar el de GarageOS",
      save: "Guardar color",
      saved: "Color guardado",
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
    embed: {
      title: "Formulario para tu sitio web",
      description: "Pega este código donde quieras mostrar «Reservar cita». Usa el mismo interruptor que el enlace público; puedes instalarlo aunque las reservas estén apagadas.",
      hint: "Al reactivar las reservas no necesitas cambiar el código. Ajusta el ancho y alto del formulario a tu sitio.",
      iframeTitle: "Reservar cita",
      copy: "Copiar código",
      copied: "Código copiado",
      copyError: "No se pudo copiar el código",
    },
    qr: {
      title: "Código QR para imprimir",
      subtitle: "Con el logo de tu taller en el centro, para volantes, la puerta del taller o tarjetas de presentación.",
      download: "Descargar PNG",
    },
    booking: {
      toggling: "Guardando...",
      enabledStatus: "Reservas por internet activadas",
      disabledStatus: "Reservas por internet desactivadas",
      toggleHint: "Se guarda al cambiar el interruptor. Al desactivarlo, ambos dejan de aceptar citas nuevas; el enlace y el código se conservan. Las citas existentes y las creadas desde el admin no cambian.",
      toggleError: "No se pudo cambiar el estado de las reservas",
      copyError: "No se pudo copiar el enlace",
      publicLink: "Enlace de tu taller",
      rulesTitle: "Reglas de las reservas",
      rulesSubtitle: "Define la anticipación, el período disponible y la frecuencia de los horarios para reservar.",
      title: "Reservas por internet",
      subtitle: "Tu enlace público y el formulario insertado en tu sitio web reciben citas con el mismo interruptor.",
      enableLabel: "Recibir citas por internet",
      slotMinutes: "Duración de cada cita (min)",
      leadTime: "Anticipación mínima (horas)",
      advanceDays: "Reservar hasta (días adelante)",
      timezone: "Zona horaria",
      copyLink: "Copiar enlace",
      openPage: "Abrir página de reservas",
      linkCopied: "Enlace copiado",
      shareTitle: "Compartir en redes",
      shareSubtitle: "Comparte tu enlace con un texto ya armado, o cópialo para pegarlo donde quieras (ej. la bio de Instagram).",
      shareCaption: (shopName) => `¡Reserva tu cita en ${shopName} en línea! 🔧🚗`,
      shareCopyCaption: "Copiar texto",
      shareCaptionCopied: "Texto copiado",
      buttonSnippetTitle: "Botón para tu sitio web",
      buttonSnippetHint: "Un botón simple que lleva a tu página de reservas — pégalo donde quieras un botón de \"Reservar cita\".",
      missingSlugHint: "Todavía no tienes enlace público. Ve a la pestaña General y define el identificador de tu taller para activar el enlace, el botón, el widget y las opciones de compartir.",
      saveBooking: "Guardar reservas web",
      saved: "Configuración de reservas guardada",
      hoursTitle: "Horario de apertura",
      hoursSubtitle: "Define cuándo el taller acepta citas. Los slots se generan dentro de este horario.",
      closed: "Cerrado",
      saveHours: "Guardar horario",
      hoursSaved: "Horario del taller guardado",
      mechanicsTitle: "Mecánicos disponibles para citas",
      mechanicsSubtitle: "Elige qué mecánicos reciben citas web y configura sus horarios semanales. La disponibilidad combina sus horarios, el horario del taller, la duración del servicio y las citas ocupadas. Crea o elimina cuentas en la pestaña Equipo.",
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
    locations: {
      title: "Ubicaciones",
      subtitle: "Administra las sucursales de tu taller y quién tiene acceso a cada una",
      addFirstTitle: "¿Tienes más de una sucursal?",
      addFirstSubtitle: "Agrega tu primera ubicación adicional — tu taller actual queda como la principal",
      namePlaceholder: "Nombre de la ubicación (ej. Taller Centro)",
      createButton: "Agregar ubicación",
      creating: "Agregando...",
      currentBadge: "Activa ahora",
      userCountLabel: (n) => `${n} persona${n !== 1 ? "s" : ""} con acceso`,
      switchButton: "Cambiar a esta ubicación",
      switching: "Cambiando...",
      accessHeading: "Acceso del equipo",
      addAccessLabel: "Dar acceso a",
      addAccessButton: "Agregar",
      revokeButton: "Quitar",
      noOtherUsers: "No hay otros miembros del equipo en tu organización todavía",
      errors: {
        noAccess: "No tienes acceso a esa ubicación",
        shopNotFound: "Taller no encontrado",
        crossOrganization: "Esa persona o ubicación no pertenece a tu organización",
        genericError: "No pudimos completar la acción. Intenta de nuevo.",
      },
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
      locations: "Locations",
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
    shopSlug: {
      title: "Public booking link",
      subtitle: "This identifier sets the URL where clients book appointments online, and unlocks sharing the link, the website button, and the embedded widget in the Calendar & Hours tab.",
      placeholder: "your-shop",
      emptyWarning: "Without this identifier you have no public link — the button, widget, and share options won't appear until you set it.",
      save: "Save identifier",
      saved: "Identifier saved",
    },
    brandColor: {
      title: "Your booking page color",
      subtitle: "Customize the header, hero, \"Our shop\" section and footer background on your public link — GarageOS's red accent stays as-is.",
      hint: "If the color is too light we darken it automatically so white text stays readable.",
      previewLabel: "Your shop",
      reset: "Use GarageOS's default",
      save: "Save color",
      saved: "Color saved",
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
    embed: {
      title: "Booking form for your website",
      description: "Paste this code wherever you want to show “Book an appointment”. It uses the same switch as your public link; you can install it while bookings are turned off.",
      hint: "You do not need to change the code when you turn bookings back on. Adjust the form width and height to fit your website.",
      iframeTitle: "Book an appointment",
      copy: "Copy code",
      copied: "Code copied",
      copyError: "Could not copy the code",
    },
    qr: {
      title: "Printable QR code",
      subtitle: "With your shop's logo in the center, for flyers, your storefront, or business cards.",
      download: "Download PNG",
    },
    booking: {
      toggling: "Saving...",
      enabledStatus: "Online appointments enabled",
      disabledStatus: "Online appointments disabled",
      toggleHint: "Changes save immediately. Turning this off stops new bookings through both options; your link and code stay the same. Existing appointments and those created in the admin are unaffected.",
      toggleError: "Could not change online booking status",
      copyError: "Could not copy the link",
      publicLink: "Your shop link",
      rulesTitle: "Booking rules",
      rulesSubtitle: "Set the lead time, booking window, and interval between available start times.",
      title: "Online appointments",
      subtitle: "Your public link and the booking form embedded on your website use the same switch.",
      enableLabel: "Accept online appointments",
      slotMinutes: "Duration of each appointment (min)",
      leadTime: "Minimum lead time (hours)",
      advanceDays: "Bookable up to (days ahead)",
      timezone: "Timezone",
      copyLink: "Copy link",
      openPage: "Open booking page",
      linkCopied: "Link copied",
      shareTitle: "Share on social media",
      shareSubtitle: "Share your link with a ready-made caption, or copy it to paste wherever you like (e.g. your Instagram bio).",
      shareCaption: (shopName) => `Book your appointment at ${shopName} online! 🔧🚗`,
      shareCopyCaption: "Copy text",
      shareCaptionCopied: "Text copied",
      buttonSnippetTitle: "Button for your website",
      buttonSnippetHint: "A simple button that links to your booking page — paste it anywhere you want a \"Book an appointment\" button.",
      missingSlugHint: "You don't have a public link yet. Go to the General tab and set your shop's identifier to unlock the link, the button, the widget, and the share options.",
      saveBooking: "Save web booking settings",
      saved: "Booking settings saved",
      hoursTitle: "Opening hours",
      hoursSubtitle: "Defines when the shop accepts appointments. Slots are generated within these hours.",
      closed: "Closed",
      saveHours: "Save hours",
      hoursSaved: "Shop hours saved",
      mechanicsTitle: "Mechanics available for appointments",
      mechanicsSubtitle: "Choose which mechanics receive online appointments and set their weekly hours. Availability combines their hours, shop hours, service duration, and existing appointments. Create or remove accounts in the Team tab.",
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
    locations: {
      title: "Locations",
      subtitle: "Manage your shop's locations and who has access to each one",
      addFirstTitle: "Have more than one location?",
      addFirstSubtitle: "Add your first additional location — your current shop stays as the main one",
      namePlaceholder: "Location name (e.g. Downtown Shop)",
      createButton: "Add location",
      creating: "Adding...",
      currentBadge: "Active now",
      userCountLabel: (n) => `${n} ${n !== 1 ? "people" : "person"} with access`,
      switchButton: "Switch to this location",
      switching: "Switching...",
      accessHeading: "Team access",
      addAccessLabel: "Give access to",
      addAccessButton: "Add",
      revokeButton: "Remove",
      noOtherUsers: "No other team members in your organization yet",
      errors: {
        noAccess: "You don't have access to that location",
        shopNotFound: "Shop not found",
        crossOrganization: "That person or location isn't part of your organization",
        genericError: "We couldn't complete that action. Please try again.",
      },
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
      locations: "Emplacements",
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
    shopSlug: {
      title: "Lien public de réservation",
      subtitle: "Cet identifiant définit l'URL où les clients réservent en ligne, et active le partage du lien, le bouton pour votre site et le widget intégré dans l'onglet Calendrier et horaires.",
      placeholder: "votre-garage",
      emptyWarning: "Sans cet identifiant, vous n'avez pas de lien public — le bouton, le widget et les options de partage n'apparaîtront pas tant que vous ne l'aurez pas défini.",
      save: "Enregistrer l'identifiant",
      saved: "Identifiant enregistré",
    },
    brandColor: {
      title: "Couleur de votre page de rendez-vous",
      subtitle: "Personnalisez le fond de l'en-tête, de la page d'accueil, de la section « Notre garage » et du pied de page de votre lien public — l'accent rouge de GarageOS reste inchangé.",
      hint: "Si la couleur est trop claire, nous l'assombrissons automatiquement pour que le texte blanc reste lisible.",
      previewLabel: "Votre garage",
      reset: "Utiliser celle de GarageOS",
      save: "Enregistrer la couleur",
      saved: "Couleur enregistrée",
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
    embed: {
      title: "Formulaire pour votre site web",
      description: "Collez ce code là où vous souhaitez afficher « Prendre rendez-vous ». Il utilise le même interrupteur que votre lien public; vous pouvez l’installer même lorsque les réservations sont désactivées.",
      hint: "Vous n’avez pas besoin de changer le code lors de la réactivation. Ajustez la largeur et la hauteur du formulaire à votre site.",
      iframeTitle: "Prendre rendez-vous",
      copy: "Copier le code",
      copied: "Code copié",
      copyError: "Impossible de copier le code",
    },
    qr: {
      title: "Code QR à imprimer",
      subtitle: "Avec le logo de votre garage au centre, pour vos dépliants, la porte du garage ou vos cartes professionnelles.",
      download: "Télécharger en PNG",
    },
    booking: {
      toggling: "Enregistrement...",
      enabledStatus: "Rendez-vous en ligne activés",
      disabledStatus: "Rendez-vous en ligne désactivés",
      toggleHint: "Le changement est enregistré immédiatement. La désactivation bloque les nouvelles réservations par les deux moyens; votre lien et votre code restent identiques. Les rendez-vous existants et ceux créés dans le panneau admin ne changent pas.",
      toggleError: "Impossible de modifier le statut des réservations",
      copyError: "Impossible de copier le lien",
      publicLink: "Lien de votre garage",
      rulesTitle: "Règles de réservation",
      rulesSubtitle: "Définissez le délai minimum, la période de réservation et l’intervalle entre les heures de début.",
      title: "Rendez-vous en ligne",
      subtitle: "Votre lien public et le formulaire intégré à votre site web utilisent le même interrupteur.",
      enableLabel: "Accepter les rendez-vous en ligne",
      slotMinutes: "Durée de chaque rendez-vous (min)",
      leadTime: "Délai minimum (heures)",
      advanceDays: "Réservable jusqu'à (jours à l'avance)",
      timezone: "Fuseau horaire",
      copyLink: "Copier le lien",
      openPage: "Ouvrir la page de réservation",
      linkCopied: "Lien copié",
      shareTitle: "Partager sur les réseaux sociaux",
      shareSubtitle: "Partagez votre lien avec un texte déjà rédigé, ou copiez-le pour le coller où vous voulez (ex. la bio Instagram).",
      shareCaption: (shopName) => `Prenez rendez-vous chez ${shopName} en ligne ! 🔧🚗`,
      shareCopyCaption: "Copier le texte",
      shareCaptionCopied: "Texte copié",
      buttonSnippetTitle: "Bouton pour votre site web",
      buttonSnippetHint: "Un bouton simple qui mène à votre page de réservation — collez-le où vous voulez un bouton « Prendre rendez-vous ».",
      missingSlugHint: "Vous n'avez pas encore de lien public. Allez dans l'onglet Général et définissez l'identifiant de votre garage pour activer le lien, le bouton, le widget et les options de partage.",
      saveBooking: "Enregistrer les réservations web",
      saved: "Configuration des réservations enregistrée",
      hoursTitle: "Heures d'ouverture",
      hoursSubtitle: "Définit quand le garage accepte les rendez-vous. Les plages sont générées dans cet horaire.",
      closed: "Fermé",
      saveHours: "Enregistrer l'horaire",
      hoursSaved: "Horaire du garage enregistré",
      mechanicsTitle: "Mécaniciens disponibles pour les rendez-vous",
      mechanicsSubtitle: "Choisissez les mécaniciens qui reçoivent des rendez-vous en ligne et configurez leur horaire hebdomadaire. La disponibilité tient compte de leurs heures, des heures du garage, de la durée du service et des rendez-vous existants. Créez ou supprimez des comptes dans l’onglet Équipe.",
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
    locations: {
      title: "Emplacements",
      subtitle: "Gérez les succursales de votre atelier et qui a accès à chacune",
      addFirstTitle: "Plus d'une succursale?",
      addFirstSubtitle: "Ajoutez votre premier emplacement supplémentaire — votre atelier actuel reste le principal",
      namePlaceholder: "Nom de l'emplacement (ex. Atelier Centre-ville)",
      createButton: "Ajouter un emplacement",
      creating: "Ajout en cours...",
      currentBadge: "Actif maintenant",
      userCountLabel: (n) => `${n} personne${n !== 1 ? "s" : ""} avec accès`,
      switchButton: "Passer à cet emplacement",
      switching: "Changement...",
      accessHeading: "Accès de l'équipe",
      addAccessLabel: "Donner accès à",
      addAccessButton: "Ajouter",
      revokeButton: "Retirer",
      noOtherUsers: "Aucun autre membre de l'équipe dans votre organisation pour l'instant",
      errors: {
        noAccess: "Vous n'avez pas accès à cet emplacement",
        shopNotFound: "Atelier introuvable",
        crossOrganization: "Cette personne ou cet emplacement ne fait pas partie de votre organisation",
        genericError: "Impossible de terminer cette action. Réessayez.",
      },
    },
    support: { needHelp: "Besoin d'aide?" },
  },
};
