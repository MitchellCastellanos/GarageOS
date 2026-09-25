import type { AdminLocale } from "@/lib/admin-locale";
import type { ServiceIconKey } from "@/lib/booking-page";

export interface SettingsDictionary {
  page: { title: string; subtitle: string };
  tabs: {
    general: string;
    calendar: string;
    notifications: string;
    services: string;
    bookingPage: string;
    team: string;
    locations: string;
    domain: string;
    billing: string;
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
  smsNumber: {
    title: string;
    subtitle: string;
    dedicatedLabel: string;
    sharedLabel: string;
    sharedBody: string;
    noSmsBody: string;
    provisioningBody: string;
    releaseScheduled: (date: string) => string;
    twoWayHint: string;
    requestButton: string;
    requestSent: string;
    requestMessage: string;
    usageTitle: string;
    usageLine: (used: number, allowance: number) => string;
    usageRenews: (date: string) => string;
    usageFullHint: string;
    segmentsHint: string;
    optedOut: (count: number) => string;
  };
  workOrderNotifications: {
    title: string;
    emailLabel: string;
    smsLabel: string;
    hint: string;
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
    tooLarge: string;
    invalidFile: string;
    failed: string;
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
  etransfer: {
    title: string;
    enableLabel: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailRequired: string;
    infoNote: string;
    save: string;
    saving: string;
    saved: string;
  };
  taxes: {
    title: string;
    subtitle: string;
    presetLabel: string;
    presetPlaceholder: string;
    presetHint: string;
    empty: string;
    namePlaceholder: string;
    addLine: string;
    remove: string;
    infoNote: string;
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
    downloadError: string;
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
    icon: string;
    chooseIcon: string;
    featured: string;
    featuredHint: (max: number) => string;
    featuredLimit: (max: number) => string;
    moveUp: string;
    moveDown: string;
    iconLabels: Record<ServiceIconKey, string>;
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
    verifyEmailSuccess: string;
    verifyEmailExpired: string;
    verifyEmailInvalid: string;
    resendVerificationSuccess: (name: string) => string;
    resendVerificationError: string;
    billingNotifToggleError: string;
    emailConfirmedTooltip: string;
    emailUnconfirmedTooltip: string;
    unconfirmedResendLabel: string;
    receivesBillingEmails: string;
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
  billingCta: {
    seatLimitTitle: string;
    seatLimitDescription: (limit: number) => string;
    multiLocationTitle: string;
    multiLocationDescription: string;
  };
  shopEmailVerification: {
    mainConfirmed: string;
    linkExpired: string;
    linkInvalid: string;
    useLoginEmailButton: (email: string) => string;
    useLoginEmailSuccess: string;
    useLoginEmailError: string;
    confirmedTooltip: string;
    unconfirmedLabel: string;
    unconfirmedPrefix: string;
    unconfirmedFallbackContact: string;
    unconfirmedSuffix: string;
    resendButton: string;
    resendSentLabel: string;
    resendSuccess: string;
    resendError: string;
  };
  senderIdentities: {
    title: string;
    subtitle: string;
    customDomainBadge: string;
    defaultDomainBadge: string;
    upgradeTitle: string;
    upgradeDescription: string;
    newAddressButton: string;
    noDomainsAvailable: string;
    noDomainsSlugHint: string;
    noDomainsVerifyHint: string;
    localPartPlaceholder: string;
    displayNamePlaceholder: string;
    createButton: string;
    createSuccess: string;
    createError: string;
    slugHint: (slug: string) => string;
  };
  senderRoutes: {
    title: string;
    subtitle: string;
    channelEmail: string;
    channelSms: string;
    updateSuccess: string;
    updateError: string;
    singleAddressPrefix: (channelLabel: string) => string;
    singleAddressSuffix: string;
    noAddressConfigured: string;
    customizeButton: (channelLabel: string) => string;
    messageTypeHeader: string;
    addressHeader: string;
    chooseAddressOption: string;
  };
  domain: {
    booking: {
      title: string;
      subtitleWithSlug: string;
      subtitleNoSlug: string;
      shorterUrlLabel: string;
      shortUrlNotEnabled: string;
      upgradeTitle: string;
      upgradeDescription: string;
      domainPlaceholder: string;
      updateButton: string;
      useMyDomainButton: string;
      subdomainOnlyHint: string;
      downgradedHint: string;
      savedToast: string;
      saveErrorToast: string;
      verifiedToast: string;
      notVerifiedToast: string;
      verifyErrorToast: string;
      removedToast: string;
      removeErrorToast: string;
    };
    email: {
      title: string;
      description: string;
      upgradeTitle: string;
      upgradeDescription: string;
      domainPlaceholder: string;
      updateButton: string;
      registerButton: string;
      downgradedHint: string;
      dnsInstructionsHint: string;
      savedToast: string;
      saveErrorToast: string;
      verifiedToast: string;
      notVerifiedToast: string;
      verifyErrorToast: string;
      removedToast: string;
      removeErrorToast: string;
    };
    shared: {
      verifyButton: string;
      removeButton: string;
      statusVerified: string;
      statusPending: string;
      statusFailed: string;
      dnsType: string;
      dnsName: string;
      dnsValue: string;
    };
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
      notifications: "Notificaciones",
      services: "Servicios",
      bookingPage: "Página de reservas",
      team: "Equipo",
      locations: "Ubicaciones",
      domain: "Dominio y Email",
      billing: "Facturación",
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
      hint1: "JPG, PNG, WebP o SVG · Máximo 4 MB",
      hint2: "El logo aparece en todas las facturas PDF",
      uploaded: "Logo actualizado",
      tooLarge: "El logo no puede superar 4 MB",
      invalidFile: "Selecciona un archivo JPG, PNG, WebP o SVG válido",
      failed: "No se pudo subir el logo. Inténtalo de nuevo.",
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
      emailHint: "Aquí llegan las respuestas de tus clientes cuando les escribes desde GarageOS",
      taxId: "Número de impuestos (NEQ / TPS / TVQ)",
      taxIdPlaceholder: "TPS: 123456789 RT0001 · TVQ: 1234567890 TQ0001",
      taxIdHint: "Aparece en el pie de página de las facturas PDF",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
    etransfer: {
      title: "E-transfer (Interac)",
      enableLabel: "Mostrar un correo de e-transfer en las facturas de mis clientes",
      emailLabel: "Correo para recibir e-transfers",
      emailPlaceholder: "pagos@tutaller.com",
      emailRequired: "Ingresa un correo para poder activar esta opción",
      infoNote: "Esto es solo informativo para tus clientes: les muestra a qué correo enviar su e-transfer. GarageOS no cobra, recibe ni procesa ese pago — la transferencia queda entre tu taller y tus clientes.",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
    taxes: {
      title: "Impuestos",
      subtitle: "Define los impuestos que aplicas en tus facturas y cotizaciones — uno, varios, o ninguno.",
      presetLabel: "Preset por provincia (opcional)",
      presetPlaceholder: "— Selecciona tu provincia —",
      presetHint: "Solo para talleres en Canadá — precarga las líneas de abajo, que puedes editar antes de guardar. Confirma las tasas con tu contador(a), pueden cambiar.",
      empty: "Sin impuestos configurados — tus facturas se emitirán sin impuestos.",
      namePlaceholder: "Ej. IVA, GST, Sales Tax",
      addLine: "Agregar impuesto",
      remove: "Eliminar",
      infoNote: "Esta es la tasa por defecto para facturas y cotizaciones nuevas — puedes ajustarla en cada documento si un cliente está exento.",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Impuestos guardados",
    },
    shopSlug: {
      title: "Enlace público de reservas",
      subtitle: "Este identificador define la URL donde los clientes reservan citas en línea, y habilita compartir el enlace, el botón para tu sitio y el widget embebido en la pestaña Calendario y Horarios.",
      placeholder: "tu-taller",
      emptyWarning: "Sin este identificador no tienes enlace público — el botón, el widget y las opciones de compartir no aparecerán hasta que lo definas.",
      save: "Guardar identificador",
      saved: "Identificador guardado",
    },
    appointmentReminders: {
      title: "Citas — notificaciones (SMS y email)",
      reminderHours: "Horas antes de la cita",
      reminderHoursHint: "El cron envía recordatorio cuando falten estas horas (por defecto 24 h)",
      smsLabel: "Enviar notificaciones de citas por SMS (canal principal)",
      emailNotifLabel: "Usar email como respaldo (cuando no hay teléfono o el SMS falla)",
      smsHint:
        "El SMS requiere una cuenta de Twilio configurada por el equipo técnico (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Guardar cambios",
      saving: "Guardando...",
      saved: "Configuración guardada",
    },
    smsNumber: {
      title: "SMS — número y uso",
      subtitle: "Desde qué número salen tus SMS y cuánto llevas este mes.",
      dedicatedLabel: "Número propio del taller",
      sharedLabel: "Número compartido de GarageOS",
      sharedBody:
        "Tus avisos salen de un número compartido: funcionan, pero los clientes no pueden conversar contigo por SMS. Con un número propio, sus respuestas llegan a tu Bandeja de entrada.",
      noSmsBody: "El SMS no está configurado todavía; los avisos salen por email.",
      provisioningBody: "Estamos activando tu número propio. Te avisaremos cuando esté listo.",
      releaseScheduled: (date) => `Tu suscripción no está activa: el número se liberará el ${date} si no se reactiva.`,
      twoWayHint: "Los clientes pueden responder a este número; sus mensajes llegan a la Bandeja de entrada.",
      requestButton: "Solicitar número propio",
      requestSent: "Solicitud enviada — el equipo de GarageOS te contactará por Ayuda.",
      requestMessage: "Hola, quisiera activar un número SMS propio para mi taller (SMS bidireccional).",
      usageTitle: "Uso de SMS este mes",
      usageLine: (used, allowance) => `${used} de ${allowance} segmentos`,
      usageRenews: (date) => `Se renueva el ${date}.`,
      usageFullHint: "Cupo agotado: los avisos automáticos salen por email hasta el próximo mes.",
      segmentsHint:
        "Un SMS de hasta 160 caracteres es 1 segmento; con acentos como ê, ô o ç el límite baja a 70 por segmento.",
      optedOut: (count) => `${count} contacto${count !== 1 ? "s" : ""} respondieron STOP y no reciben SMS.`,
    },
    workOrderNotifications: {
      title: "Órdenes de trabajo — avisar cuando el vehículo esté listo",
      emailLabel: "Notificar por email al marcar \"Listo para retirar\"",
      smsLabel: "Notificar por SMS al marcar \"Listo para retirar\"",
      hint: "Se envía una sola vez por orden y por un solo canal: SMS si está activo y el cliente tiene teléfono; si no, email.",
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
      downloadError: "No se pudo descargar — el logo bloqueó la exportación del PNG",
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
      icon: "Ícono",
      chooseIcon: "Elegir ícono",
      featured: "Destacado",
      featuredHint: (max) => `Los destacados (máx. ${max}) aparecen en la franja principal de tu página de reservas.`,
      featuredLimit: (max) => `Ya tienes ${max} servicios destacados — quita uno para destacar otro.`,
      moveUp: "Subir",
      moveDown: "Bajar",
      iconLabels: {
        wrench: "Mecánica general",
        oil: "Aceite",
        tires: "Neumáticos",
        brakes: "Frenos",
        battery: "Batería",
        diagnostics: "Diagnóstico",
        engine: "Motor",
        alignment: "Alineación",
        suspension: "Suspensión",
        ac: "Aire acondicionado",
        transmission: "Transmisión",
        exhaust: "Escape",
        inspection: "Inspección",
        electrical: "Eléctrico",
        detailing: "Estética",
        car: "Vehículo",
      },
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
      verifyEmailSuccess: "Correo confirmado",
      verifyEmailExpired: "Ese link de confirmación venció — pide que te reenvíen uno",
      verifyEmailInvalid: "Ese link de confirmación no es válido",
      resendVerificationSuccess: (name) => `Correo de confirmación reenviado a ${name}`,
      resendVerificationError: "No se pudo reenviar el correo",
      billingNotifToggleError: "No se pudo actualizar",
      emailConfirmedTooltip: "Correo confirmado",
      emailUnconfirmedTooltip: "Correo sin confirmar — clic para reenviar",
      unconfirmedResendLabel: "Sin confirmar · reenviar",
      receivesBillingEmails: "Recibe correos de facturación/plan",
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
    billingCta: {
      seatLimitTitle: "Límite de usuarios alcanzado",
      seatLimitDescription: (limit) =>
        `Tu plan actual permite hasta ${limit} usuarios. Actualiza a Pro para usuarios ilimitados.`,
      multiLocationTitle: "Multi-sucursal es una función Complete",
      multiLocationDescription:
        "Agregar más de una ubicación requiere el plan Complete — incluye administración centralizada y reportes consolidados.",
    },
    shopEmailVerification: {
      mainConfirmed: "Correo principal confirmado",
      linkExpired: "Ese link venció — pide que se reenvíe la confirmación",
      linkInvalid: "Ese link de confirmación no es válido",
      useLoginEmailButton: (email) =>
        `Usar mi correo de acceso (${email}) — queda confirmado al instante`,
      useLoginEmailSuccess: "Listo — tu correo de acceso ya es el email principal, confirmado",
      useLoginEmailError: "No se pudo actualizar",
      confirmedTooltip: "Confirmado",
      unconfirmedLabel: "Sin confirmar",
      unconfirmedPrefix: "Mientras no se confirme, tus clientes verán/contestarán a",
      unconfirmedFallbackContact: "el correo del dueño del taller",
      unconfirmedSuffix: "en su lugar — nada se pierde.",
      resendButton: "Reenviar confirmación",
      resendSentLabel: "Confirmación reenviada",
      resendSuccess: "Confirmación reenviada",
      resendError: "No se pudo reenviar",
    },
    senderIdentities: {
      title: "Tus direcciones",
      subtitle:
        "Direcciones desde las que puede salir tu correo. Con más de una, podrás elegir cuál usar al redactar en la Bandeja de entrada.",
      customDomainBadge: "Dominio propio",
      defaultDomainBadge: "GarageOS",
      upgradeTitle: "Direcciones de envío adicionales",
      upgradeDescription:
        "Agregar remitentes propios (más allá de los de GarageOS) está disponible en Pro y Complete.",
      newAddressButton: "Nueva dirección",
      noDomainsAvailable: "Todavía no hay ningún dominio disponible para crear direcciones nuevas.",
      noDomainsSlugHint: " Configura primero el identificador (slug) de tu taller en Configuración.",
      noDomainsVerifyHint: " Conecta y verifica tu dominio arriba.",
      localPartPlaceholder: "ventas",
      displayNamePlaceholder: "Nombre a mostrar (opcional)",
      createButton: "Crear",
      createSuccess: "Dirección creada",
      createError: "Error al crear la dirección",
      slugHint: (slug) =>
        `Debe empezar con "${slug}" (ej. ${slug} o ${slug}-citas) — así no choca con otros talleres que comparten este dominio. Las respuestas de tus clientes llegarán a tu correo de contacto configurado en Datos del taller.`,
    },
    senderRoutes: {
      title: "Reglas automáticas",
      subtitle: "Qué dirección usa cada tipo de correo o SMS automático (facturas, citas, recordatorios...).",
      channelEmail: "correo",
      channelSms: "SMS",
      updateSuccess: "Regla actualizada",
      updateError: "Error al actualizar la regla",
      singleAddressPrefix: (channelLabel) => `Todo tu ${channelLabel} automático sale de`,
      singleAddressSuffix: ".",
      noAddressConfigured: "— sin dirección configurada —",
      customizeButton: (channelLabel) => `Personalizar por tipo (${channelLabel})`,
      messageTypeHeader: "Tipo de mensaje",
      addressHeader: "Dirección",
      chooseAddressOption: "Elegir dirección",
    },
    domain: {
      booking: {
        title: "Dominio propio para tu landing de citas",
        subtitleWithSlug: "Sin dominio propio, tu landing pública ya funciona en:",
        subtitleNoSlug: "Activa un slug de taller en Configuración para tener una landing pública.",
        shorterUrlLabel: "O con una URL más corta:",
        shortUrlNotEnabled: "(la URL corta {taller}.garageos.com aún no está activada en este servidor)",
        upgradeTitle: "Dominio propio para tu landing",
        upgradeDescription: "Disponible en Pro y Complete.",
        domainPlaceholder: "citas.tudominio.com",
        updateButton: "Actualizar",
        useMyDomainButton: "Usar mi dominio",
        subdomainOnlyHint:
          "Solo soportamos subdominios (ej. citas.tudominio.com) — un dominio raíz necesita un tipo de registro que la mayoría de proveedores DNS no ofrece.",
        downgradedHint:
          "Tu plan ya no incluye dominio propio — este dominio se mantiene activo, pero no puedes editarlo ni agregar uno nuevo hasta actualizar tu plan.",
        savedToast: "Dominio guardado — agrega el registro DNS",
        saveErrorToast: "Error al guardar el dominio",
        verifiedToast: "Dominio verificado",
        notVerifiedToast: "Todavía no verifica — revisa el registro CNAME",
        verifyErrorToast: "Error al verificar",
        removedToast: "Dominio eliminado",
        removeErrorToast: "Error al eliminar",
      },
      email: {
        title: "Dominio propio para tus correos",
        description:
          "Verifica tu dominio para que las confirmaciones de citas, facturas y cotizaciones salgan desde tu propia dirección (ej. citas@tudominio.com) en vez de la de GarageOS. Si no lo configuras, seguimos usando el remitente compartido de GarageOS con tu nombre de taller.",
        upgradeTitle: "Dominio propio de correo",
        upgradeDescription: "Disponible en Pro y Complete.",
        domainPlaceholder: "tudominio.com",
        updateButton: "Actualizar",
        registerButton: "Registrar dominio",
        downgradedHint:
          "Tu plan ya no incluye dominio propio de correo — este dominio se mantiene activo, pero no puedes editarlo ni agregar uno nuevo hasta actualizar tu plan.",
        dnsInstructionsHint: "Agrega estos registros en el DNS de tu dominio, luego verifica:",
        savedToast: "Dominio registrado — agrega los registros DNS",
        saveErrorToast: "Error al registrar el dominio",
        verifiedToast: "Dominio verificado",
        notVerifiedToast: "Todavía no verifica — revisa los registros DNS",
        verifyErrorToast: "Error al verificar",
        removedToast: "Dominio eliminado",
        removeErrorToast: "Error al eliminar",
      },
      shared: {
        verifyButton: "Verificar",
        removeButton: "Quitar",
        statusVerified: "Verificado",
        statusPending: "Pendiente",
        statusFailed: "Falló",
        dnsType: "Tipo",
        dnsName: "Nombre",
        dnsValue: "Valor",
      },
    },
  },
  en: {
    page: {
      title: "Settings",
      subtitle: "Logo, shop details, team, and service catalog",
    },
    tabs: {
      general: "General",
      calendar: "Calendar & Hours",
      notifications: "Notifications",
      services: "Services",
      bookingPage: "Booking page",
      team: "Team",
      locations: "Locations",
      domain: "Domain & Email",
      billing: "Billing",
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
      hint1: "JPG, PNG, WebP, or SVG · Max 4 MB",
      hint2: "The logo appears on every PDF invoice",
      uploaded: "Logo updated",
      tooLarge: "The logo cannot exceed 4 MB",
      invalidFile: "Choose a valid JPG, PNG, WebP or SVG file",
      failed: "Could not upload the logo. Please try again.",
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
      emailHint: "Your customers' replies land here when you message them from GarageOS",
      taxId: "Tax number (NEQ / GST / QST)",
      taxIdPlaceholder: "GST: 123456789 RT0001 · QST: 1234567890 TQ0001",
      taxIdHint: "Shown in the footer of PDF invoices",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
    etransfer: {
      title: "E-transfer (Interac)",
      enableLabel: "Show an e-transfer email on my clients' invoices",
      emailLabel: "Email to receive e-transfers",
      emailPlaceholder: "payments@yourshop.com",
      emailRequired: "Enter an email to turn this on",
      infoNote: "This is just for your clients' information — it shows them which email to send their e-transfer to. GarageOS doesn't charge, receive, or process that payment — the transfer stays between your shop and your clients.",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
    taxes: {
      title: "Taxes",
      subtitle: "Set the tax(es) you apply on your invoices and quotes — one, several, or none.",
      presetLabel: "Province preset (optional)",
      presetPlaceholder: "— Select your province —",
      presetHint: "For Canadian shops only — prefills the lines below, which you can edit before saving. Confirm rates with your accountant, they can change.",
      empty: "No taxes configured — your invoices will be issued tax-free.",
      namePlaceholder: "E.g. VAT, GST, Sales Tax",
      addLine: "Add tax",
      remove: "Remove",
      infoNote: "This is the default rate for new invoices and quotes — you can adjust it on any document if a client is tax-exempt.",
      save: "Save changes",
      saving: "Saving...",
      saved: "Taxes saved",
    },
    shopSlug: {
      title: "Public booking link",
      subtitle: "This identifier sets the URL where clients book appointments online, and unlocks sharing the link, the website button, and the embedded widget in the Calendar & Hours tab.",
      placeholder: "your-shop",
      emptyWarning: "Without this identifier you have no public link — the button, widget, and share options won't appear until you set it.",
      save: "Save identifier",
      saved: "Identifier saved",
    },
    appointmentReminders: {
      title: "Appointments — notifications (SMS and email)",
      reminderHours: "Hours before the appointment",
      reminderHoursHint: "The cron sends a reminder when this many hours are left (default 24h)",
      smsLabel: "Send appointment notifications by SMS (main channel)",
      emailNotifLabel: "Use email as a fallback (when there is no phone or the SMS fails)",
      smsHint:
        "SMS requires a Twilio account set up by the technical team (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Save changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
    smsNumber: {
      title: "SMS — number and usage",
      subtitle: "Which number your texts come from and how much you've used this month.",
      dedicatedLabel: "Your shop's own number",
      sharedLabel: "Shared GarageOS number",
      sharedBody:
        "Your notices go out from a shared number: they work, but clients can't text you back. With your own number, their replies arrive in your Inbox.",
      noSmsBody: "SMS isn't set up yet; notices go out by email.",
      provisioningBody: "We're activating your own number. We'll let you know when it's ready.",
      releaseScheduled: (date) => `Your subscription isn't active: this number will be released on ${date} unless it's reactivated.`,
      twoWayHint: "Clients can reply to this number; their messages arrive in your Inbox.",
      requestButton: "Request my own number",
      requestSent: "Request sent — the GarageOS team will follow up under Help.",
      requestMessage: "Hi, I'd like to activate a dedicated SMS number for my shop (two-way SMS).",
      usageTitle: "SMS usage this month",
      usageLine: (used, allowance) => `${used} of ${allowance} segments`,
      usageRenews: (date) => `Renews on ${date}.`,
      usageFullHint: "Allowance used up: automatic notices go out by email until next month.",
      segmentsHint:
        "A text of up to 160 characters is 1 segment; accents like ê, ô or ç lower that to 70 per segment.",
      optedOut: (count) => `${count} contact${count !== 1 ? "s" : ""} replied STOP and won't receive SMS.`,
    },
    workOrderNotifications: {
      title: "Work orders — notify when the vehicle is ready",
      emailLabel: 'Notify by email when marked "Ready for pickup"',
      smsLabel: 'Notify by SMS when marked "Ready for pickup"',
      hint: "Sent once per work order through a single channel: SMS when enabled and the client has a phone; otherwise email.",
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
      downloadError: "Couldn't download — the logo blocked exporting the PNG",
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
      icon: "Icon",
      chooseIcon: "Choose icon",
      featured: "Featured",
      featuredHint: (max) => `Featured services (max ${max}) appear in the main strip of your booking page.`,
      featuredLimit: (max) => `You already have ${max} featured services — unfeature one to feature another.`,
      moveUp: "Move up",
      moveDown: "Move down",
      iconLabels: {
        wrench: "General repair",
        oil: "Oil",
        tires: "Tires",
        brakes: "Brakes",
        battery: "Battery",
        diagnostics: "Diagnostics",
        engine: "Engine",
        alignment: "Alignment",
        suspension: "Suspension",
        ac: "A/C",
        transmission: "Transmission",
        exhaust: "Exhaust",
        inspection: "Inspection",
        electrical: "Electrical",
        detailing: "Detailing",
        car: "Vehicle",
      },
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
      verifyEmailSuccess: "Email confirmed",
      verifyEmailExpired: "That confirmation link expired — ask for a new one",
      verifyEmailInvalid: "That confirmation link isn't valid",
      resendVerificationSuccess: (name) => `Confirmation email resent to ${name}`,
      resendVerificationError: "Could not resend the email",
      billingNotifToggleError: "Could not update",
      emailConfirmedTooltip: "Email confirmed",
      emailUnconfirmedTooltip: "Email not confirmed — click to resend",
      unconfirmedResendLabel: "Unconfirmed · resend",
      receivesBillingEmails: "Receives billing/plan emails",
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
    billingCta: {
      seatLimitTitle: "User limit reached",
      seatLimitDescription: (limit) =>
        `Your current plan allows up to ${limit} users. Upgrade to Pro for unlimited users.`,
      multiLocationTitle: "Multi-location is a Complete feature",
      multiLocationDescription:
        "Adding more than one location requires the Complete plan — includes centralized administration and consolidated reporting.",
    },
    shopEmailVerification: {
      mainConfirmed: "Main email confirmed",
      linkExpired: "That link expired — ask for the confirmation to be resent",
      linkInvalid: "That confirmation link isn't valid",
      useLoginEmailButton: (email) => `Use my login email (${email}) — confirmed instantly`,
      useLoginEmailSuccess: "Done — your login email is now the main email, confirmed",
      useLoginEmailError: "Could not update",
      confirmedTooltip: "Confirmed",
      unconfirmedLabel: "Unconfirmed",
      unconfirmedPrefix: "Until it's confirmed, your clients will see and reply to",
      unconfirmedFallbackContact: "the shop owner's email",
      unconfirmedSuffix: "instead — nothing is lost.",
      resendButton: "Resend confirmation",
      resendSentLabel: "Confirmation resent",
      resendSuccess: "Confirmation resent",
      resendError: "Could not resend",
    },
    senderIdentities: {
      title: "Your addresses",
      subtitle:
        "Addresses your email can be sent from. With more than one, you'll be able to choose which one to use when writing from the Inbox.",
      customDomainBadge: "Custom domain",
      defaultDomainBadge: "GarageOS",
      upgradeTitle: "Additional sending addresses",
      upgradeDescription: "Adding your own senders (beyond GarageOS's) is available on Pro and Complete.",
      newAddressButton: "New address",
      noDomainsAvailable: "There's no domain available yet to create new addresses.",
      noDomainsSlugHint: " First set your shop's identifier (slug) in Settings.",
      noDomainsVerifyHint: " Connect and verify your domain above.",
      localPartPlaceholder: "sales",
      displayNamePlaceholder: "Display name (optional)",
      createButton: "Create",
      createSuccess: "Address created",
      createError: "Could not create the address",
      slugHint: (slug) =>
        `Must start with "${slug}" (e.g. ${slug} or ${slug}-booking) — so it doesn't clash with other shops sharing this domain. Your clients' replies will land in the contact email set in Shop details.`,
    },
    senderRoutes: {
      title: "Automatic rules",
      subtitle: "Which address each type of automatic email or SMS uses (invoices, appointments, reminders...).",
      channelEmail: "email",
      channelSms: "SMS",
      updateSuccess: "Rule updated",
      updateError: "Could not update the rule",
      singleAddressPrefix: (channelLabel) => `All your automatic ${channelLabel} goes out from`,
      singleAddressSuffix: ".",
      noAddressConfigured: "— no address configured —",
      customizeButton: (channelLabel) => `Customize by type (${channelLabel})`,
      messageTypeHeader: "Message type",
      addressHeader: "Address",
      chooseAddressOption: "Choose an address",
    },
    domain: {
      booking: {
        title: "Custom domain for your booking landing page",
        subtitleWithSlug: "Without a custom domain, your public landing page already works at:",
        subtitleNoSlug: "Turn on a shop slug in Settings to get a public landing page.",
        shorterUrlLabel: "Or with a shorter URL:",
        shortUrlNotEnabled: "(the short URL {shop}.garageos.com isn't enabled on this server yet)",
        upgradeTitle: "Custom domain for your landing page",
        upgradeDescription: "Available on Pro and Complete.",
        domainPlaceholder: "booking.yourdomain.com",
        updateButton: "Update",
        useMyDomainButton: "Use my domain",
        subdomainOnlyHint:
          "We only support subdomains (e.g. booking.yourdomain.com) — a root domain needs a record type most DNS providers don't offer.",
        downgradedHint:
          "Your plan no longer includes a custom domain — this domain stays active, but you can't edit it or add a new one until you upgrade your plan.",
        savedToast: "Domain saved — add the DNS record",
        saveErrorToast: "Could not save the domain",
        verifiedToast: "Domain verified",
        notVerifiedToast: "Not verified yet — check the CNAME record",
        verifyErrorToast: "Could not verify",
        removedToast: "Domain removed",
        removeErrorToast: "Could not remove it",
      },
      email: {
        title: "Custom domain for your emails",
        description:
          "Verify your domain so appointment confirmations, invoices, and quotes go out from your own address (e.g. booking@yourdomain.com) instead of GarageOS's. If you don't set it up, we keep using GarageOS's shared sender with your shop's name.",
        upgradeTitle: "Custom email domain",
        upgradeDescription: "Available on Pro and Complete.",
        domainPlaceholder: "yourdomain.com",
        updateButton: "Update",
        registerButton: "Register domain",
        downgradedHint:
          "Your plan no longer includes a custom email domain — this domain stays active, but you can't edit it or add a new one until you upgrade your plan.",
        dnsInstructionsHint: "Add these records to your domain's DNS, then verify:",
        savedToast: "Domain registered — add the DNS records",
        saveErrorToast: "Could not register the domain",
        verifiedToast: "Domain verified",
        notVerifiedToast: "Not verified yet — check the DNS records",
        verifyErrorToast: "Could not verify",
        removedToast: "Domain removed",
        removeErrorToast: "Could not remove it",
      },
      shared: {
        verifyButton: "Verify",
        removeButton: "Remove",
        statusVerified: "Verified",
        statusPending: "Pending",
        statusFailed: "Failed",
        dnsType: "Type",
        dnsName: "Name",
        dnsValue: "Value",
      },
    },
  },
  fr: {
    page: {
      title: "Configuration",
      subtitle: "Logo, infos du garage, équipe et catalogue de services",
    },
    tabs: {
      general: "Général",
      calendar: "Calendrier et horaires",
      notifications: "Notifications",
      services: "Services",
      bookingPage: "Page de réservation",
      team: "Équipe",
      locations: "Emplacements",
      domain: "Domaine et courriel",
      billing: "Facturation",
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
      hint1: "JPG, PNG, WebP ou SVG · Max 4 Mo",
      hint2: "Le logo apparaît sur toutes les factures PDF",
      uploaded: "Logo mis à jour",
      tooLarge: "Le logo ne peut pas dépasser 4 Mo",
      invalidFile: "Choisissez un fichier JPG, PNG, WebP ou SVG valide",
      failed: "Impossible de téléverser le logo. Réessayez.",
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
      emailHint: "Les réponses de vos clients arrivent ici lorsque vous leur écrivez depuis GarageOS",
      taxId: "Numéro de taxes (NEQ / TPS / TVQ)",
      taxIdPlaceholder: "TPS : 123456789 RT0001 · TVQ : 1234567890 TQ0001",
      taxIdHint: "Apparaît en bas des factures PDF",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
    etransfer: {
      title: "Virement Interac (e-transfer)",
      enableLabel: "Afficher un courriel de virement Interac sur les factures de mes clients",
      emailLabel: "Courriel pour recevoir les virements",
      emailPlaceholder: "paiements@votregarage.com",
      emailRequired: "Entrez un courriel pour activer cette option",
      infoNote: "Ceci est uniquement informatif pour vos clients : ça leur indique à quel courriel envoyer leur virement Interac. GarageOS ne facture, ne reçoit ni ne traite ce paiement — le virement reste entre votre garage et vos clients.",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
    taxes: {
      title: "Taxes",
      subtitle: "Définissez la ou les taxes appliquées sur vos factures et soumissions — une, plusieurs, ou aucune.",
      presetLabel: "Préréglage par province (optionnel)",
      presetPlaceholder: "— Sélectionnez votre province —",
      presetHint: "Pour les garages au Canada seulement — préremplit les lignes ci-dessous, que vous pouvez modifier avant d'enregistrer. Confirmez les taux avec votre comptable, ils peuvent changer.",
      empty: "Aucune taxe configurée — vos factures seront émises sans taxes.",
      namePlaceholder: "Ex. TPS, TVQ, TVH",
      addLine: "Ajouter une taxe",
      remove: "Supprimer",
      infoNote: "C'est le taux par défaut pour les nouvelles factures et soumissions — vous pouvez l'ajuster sur chaque document si un client est exonéré.",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Taxes enregistrées",
    },
    shopSlug: {
      title: "Lien public de réservation",
      subtitle: "Cet identifiant définit l'URL où les clients réservent en ligne, et active le partage du lien, le bouton pour votre site et le widget intégré dans l'onglet Calendrier et horaires.",
      placeholder: "votre-garage",
      emptyWarning: "Sans cet identifiant, vous n'avez pas de lien public — le bouton, le widget et les options de partage n'apparaîtront pas tant que vous ne l'aurez pas défini.",
      save: "Enregistrer l'identifiant",
      saved: "Identifiant enregistré",
    },
    appointmentReminders: {
      title: "Rendez-vous — notifications (SMS et courriel)",
      reminderHours: "Heures avant le rendez-vous",
      reminderHoursHint: "La tâche planifiée envoie un rappel quand il reste ce nombre d'heures (24 h par défaut)",
      smsLabel: "Envoyer les notifications de rendez-vous par SMS (canal principal)",
      emailNotifLabel: "Utiliser le courriel en secours (sans téléphone ou si le SMS échoue)",
      smsHint:
        "Le SMS nécessite un compte Twilio configuré par l'équipe technique (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).",
      save: "Enregistrer les changements",
      saving: "Enregistrement...",
      saved: "Configuration enregistrée",
    },
    smsNumber: {
      title: "SMS — numéro et utilisation",
      subtitle: "De quel numéro partent vos SMS et combien vous en avez utilisé ce mois-ci.",
      dedicatedLabel: "Numéro propre à l'atelier",
      sharedLabel: "Numéro partagé GarageOS",
      sharedBody:
        "Vos avis partent d'un numéro partagé : ils fonctionnent, mais vos clients ne peuvent pas vous répondre par SMS. Avec votre propre numéro, leurs réponses arrivent dans votre boîte de réception.",
      noSmsBody: "Les SMS ne sont pas encore configurés; les avis partent par courriel.",
      provisioningBody: "Nous activons votre numéro. Nous vous aviserons dès qu'il sera prêt.",
      releaseScheduled: (date) => `Votre abonnement n'est pas actif : ce numéro sera libéré le ${date} s'il n'est pas réactivé.`,
      twoWayHint: "Vos clients peuvent répondre à ce numéro; leurs messages arrivent dans votre boîte de réception.",
      requestButton: "Demander mon propre numéro",
      requestSent: "Demande envoyée — l'équipe GarageOS vous répondra dans Aide.",
      requestMessage: "Bonjour, j'aimerais activer un numéro SMS dédié pour mon atelier (SMS bidirectionnels).",
      usageTitle: "Utilisation des SMS ce mois-ci",
      usageLine: (used, allowance) => `${used} sur ${allowance} segments`,
      usageRenews: (date) => `Renouvellement le ${date}.`,
      usageFullHint: "Forfait épuisé : les avis automatiques partent par courriel jusqu'au mois prochain.",
      segmentsHint:
        "Un SMS de 160 caractères ou moins compte pour 1 segment; les accents comme ê, ô ou ç réduisent la limite à 70.",
      optedOut: (count) => `${count} contact${count !== 1 ? "s" : ""} ont répondu STOP et ne reçoivent plus de SMS.`,
    },
    workOrderNotifications: {
      title: "Ordres de travail — aviser quand le véhicule est prêt",
      emailLabel: "Notifier par courriel lorsque marqué « Prêt pour la récupération »",
      smsLabel: "Notifier par SMS lorsque marqué « Prêt pour la récupération »",
      hint: "Envoyé une seule fois par ordre et par un seul canal : SMS s'il est activé et que le client a un téléphone, sinon courriel.",
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
      downloadError: "Téléchargement impossible — le logo a bloqué l'export du PNG",
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
      icon: "Icône",
      chooseIcon: "Choisir une icône",
      featured: "En vedette",
      featuredHint: (max) => `Les services en vedette (max. ${max}) s'affichent dans la bande principale de votre page de réservation.`,
      featuredLimit: (max) => `Vous avez déjà ${max} services en vedette — retirez-en un pour en ajouter un autre.`,
      moveUp: "Monter",
      moveDown: "Descendre",
      iconLabels: {
        wrench: "Mécanique générale",
        oil: "Huile",
        tires: "Pneus",
        brakes: "Freins",
        battery: "Batterie",
        diagnostics: "Diagnostic",
        engine: "Moteur",
        alignment: "Alignement",
        suspension: "Suspension",
        ac: "Climatisation",
        transmission: "Transmission",
        exhaust: "Échappement",
        inspection: "Inspection",
        electrical: "Électrique",
        detailing: "Esthétique",
        car: "Véhicule",
      },
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
      verifyEmailSuccess: "Courriel confirmé",
      verifyEmailExpired: "Ce lien de confirmation a expiré — demandez-en un nouveau",
      verifyEmailInvalid: "Ce lien de confirmation n'est pas valide",
      resendVerificationSuccess: (name) => `Courriel de confirmation renvoyé à ${name}`,
      resendVerificationError: "Impossible de renvoyer le courriel",
      billingNotifToggleError: "Impossible de mettre à jour",
      emailConfirmedTooltip: "Courriel confirmé",
      emailUnconfirmedTooltip: "Courriel non confirmé — cliquez pour renvoyer",
      unconfirmedResendLabel: "Non confirmé · renvoyer",
      receivesBillingEmails: "Reçoit les courriels de facturation/forfait",
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
    billingCta: {
      seatLimitTitle: "Limite d’utilisateurs atteinte",
      seatLimitDescription: (limit) =>
        `Votre plan actuel permet jusqu’à ${limit} utilisateurs. Passez à Pro pour des utilisateurs illimités.`,
      multiLocationTitle: "Le multi-établissement est une fonction Complete",
      multiLocationDescription:
        "Ajouter plus d’un établissement nécessite le plan Complete — inclut l’administration centralisée et les rapports consolidés.",
    },
    shopEmailVerification: {
      mainConfirmed: "Courriel principal confirmé",
      linkExpired: "Ce lien a expiré — demandez que la confirmation soit renvoyée",
      linkInvalid: "Ce lien de confirmation n'est pas valide",
      useLoginEmailButton: (email) => `Utiliser mon courriel de connexion (${email}) — confirmé instantanément`,
      useLoginEmailSuccess: "C'est fait — votre courriel de connexion est maintenant le courriel principal, confirmé",
      useLoginEmailError: "Impossible de mettre à jour",
      confirmedTooltip: "Confirmé",
      unconfirmedLabel: "Non confirmé",
      unconfirmedPrefix: "Tant qu'il n'est pas confirmé, vos clients verront et répondront à",
      unconfirmedFallbackContact: "le courriel du propriétaire du garage",
      unconfirmedSuffix: "à sa place — rien n'est perdu.",
      resendButton: "Renvoyer la confirmation",
      resendSentLabel: "Confirmation renvoyée",
      resendSuccess: "Confirmation renvoyée",
      resendError: "Impossible de renvoyer",
    },
    senderIdentities: {
      title: "Vos adresses",
      subtitle:
        "Adresses depuis lesquelles vos courriels peuvent être envoyés. Avec plus d'une, vous pourrez choisir laquelle utiliser en écrivant depuis la Boîte de réception.",
      customDomainBadge: "Domaine propre",
      defaultDomainBadge: "GarageOS",
      upgradeTitle: "Adresses d'envoi supplémentaires",
      upgradeDescription:
        "Ajouter vos propres expéditeurs (au-delà de ceux de GarageOS) est disponible sur Pro et Complete.",
      newAddressButton: "Nouvelle adresse",
      noDomainsAvailable: "Aucun domaine n'est encore disponible pour créer de nouvelles adresses.",
      noDomainsSlugHint: " Définissez d'abord l'identifiant (slug) de votre garage dans Configuration.",
      noDomainsVerifyHint: " Connectez et vérifiez votre domaine ci-dessus.",
      localPartPlaceholder: "ventes",
      displayNamePlaceholder: "Nom à afficher (optionnel)",
      createButton: "Créer",
      createSuccess: "Adresse créée",
      createError: "Impossible de créer l'adresse",
      slugHint: (slug) =>
        `Doit commencer par « ${slug} » (ex. ${slug} ou ${slug}-rdv) — pour ne pas entrer en conflit avec d'autres garages qui partagent ce domaine. Les réponses de vos clients arriveront à votre courriel de contact configuré dans Informations du garage.`,
    },
    senderRoutes: {
      title: "Règles automatiques",
      subtitle: "Quelle adresse utilise chaque type de courriel ou SMS automatique (factures, rendez-vous, rappels...).",
      channelEmail: "courriel",
      channelSms: "SMS",
      updateSuccess: "Règle mise à jour",
      updateError: "Impossible de mettre à jour la règle",
      singleAddressPrefix: (channelLabel) => `Tout votre ${channelLabel} automatique sort de`,
      singleAddressSuffix: ".",
      noAddressConfigured: "— aucune adresse configurée —",
      customizeButton: (channelLabel) => `Personnaliser par type (${channelLabel})`,
      messageTypeHeader: "Type de message",
      addressHeader: "Adresse",
      chooseAddressOption: "Choisir une adresse",
    },
    domain: {
      booking: {
        title: "Domaine propre pour votre page de rendez-vous",
        subtitleWithSlug: "Sans domaine propre, votre page publique fonctionne déjà à :",
        subtitleNoSlug: "Activez un slug de garage dans Configuration pour avoir une page publique.",
        shorterUrlLabel: "Ou avec une URL plus courte :",
        shortUrlNotEnabled: "(l'URL courte {garage}.garageos.com n'est pas encore activée sur ce serveur)",
        upgradeTitle: "Domaine propre pour votre page",
        upgradeDescription: "Disponible sur Pro et Complete.",
        domainPlaceholder: "rdv.votredomaine.com",
        updateButton: "Mettre à jour",
        useMyDomainButton: "Utiliser mon domaine",
        subdomainOnlyHint:
          "Nous ne prenons en charge que les sous-domaines (ex. rdv.votredomaine.com) — un domaine racine nécessite un type d'enregistrement que la plupart des fournisseurs DNS n'offrent pas.",
        downgradedHint:
          "Votre forfait n'inclut plus de domaine propre — ce domaine reste actif, mais vous ne pouvez pas le modifier ni en ajouter un nouveau avant de mettre à niveau votre forfait.",
        savedToast: "Domaine enregistré — ajoutez l'enregistrement DNS",
        saveErrorToast: "Impossible d'enregistrer le domaine",
        verifiedToast: "Domaine vérifié",
        notVerifiedToast: "Pas encore vérifié — vérifiez l'enregistrement CNAME",
        verifyErrorToast: "Impossible de vérifier",
        removedToast: "Domaine supprimé",
        removeErrorToast: "Impossible de supprimer",
      },
      email: {
        title: "Domaine propre pour vos courriels",
        description:
          "Vérifiez votre domaine pour que les confirmations de rendez-vous, factures et soumissions soient envoyées depuis votre propre adresse (ex. rdv@votredomaine.com) au lieu de celle de GarageOS. Si vous ne le configurez pas, nous continuons à utiliser l'expéditeur partagé de GarageOS avec le nom de votre garage.",
        upgradeTitle: "Domaine de courriel propre",
        upgradeDescription: "Disponible sur Pro et Complete.",
        domainPlaceholder: "votredomaine.com",
        updateButton: "Mettre à jour",
        registerButton: "Enregistrer le domaine",
        downgradedHint:
          "Votre forfait n'inclut plus de domaine de courriel propre — ce domaine reste actif, mais vous ne pouvez pas le modifier ni en ajouter un nouveau avant de mettre à niveau votre forfait.",
        dnsInstructionsHint: "Ajoutez ces enregistrements au DNS de votre domaine, puis vérifiez :",
        savedToast: "Domaine enregistré — ajoutez les enregistrements DNS",
        saveErrorToast: "Impossible d'enregistrer le domaine",
        verifiedToast: "Domaine vérifié",
        notVerifiedToast: "Pas encore vérifié — vérifiez les enregistrements DNS",
        verifyErrorToast: "Impossible de vérifier",
        removedToast: "Domaine supprimé",
        removeErrorToast: "Impossible de supprimer",
      },
      shared: {
        verifyButton: "Vérifier",
        removeButton: "Retirer",
        statusVerified: "Vérifié",
        statusPending: "En attente",
        statusFailed: "Échoué",
        dnsType: "Type",
        dnsName: "Nom",
        dnsValue: "Valeur",
      },
    },
  },
};
