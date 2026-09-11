export type SiteLocale = "fr" | "en" | "es";

export const SITE_LOCALES: { value: SiteLocale; label: string }[] = [
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
];

export const DEFAULT_SITE_LOCALE: SiteLocale = "fr";

type ServiceKey = "general" | "batteries" | "tires" | "brakes" | "oil";

export interface SiteDictionary {
  intlLocale: string;
  nav: { services: string; shop: string; book: string };
  header: { bookCta: string; home: string; openMenu: string };
  whatsapp: { label: string; message: string };
  hero: {
    subheadline: string;
    tagline: string;
    bookCta: string;
    viewServicesCta: string;
  };
  services: {
    eyebrow: string;
    heading: string;
    subtitle: string;
    items: Record<ServiceKey, { title: string; description: string }>;
    noServiceTitle: string;
    noServiceBody: string;
  };
  ourShop: {
    eyebrow: string;
    heading: string;
    paragraph: string;
    hoursLabel: string;
    photoComingSoon: string;
  };
  booking: {
    eyebrow: string;
    heading: string;
    subtitle: string;
  };
  form: {
    fullName: string;
    phone: string;
    emailOptional: string;
    serviceRequested: string;
    serviceOptions: { value: string; label: string }[];
    selectPlaceholder: string;
    otherOption: string;
    specify: string;
    make: string;
    model: string;
    year: string;
    licensePlate: string;
    stepPickDay: string;
    stepPickTime: string;
    stepVehicle: string;
    stepYourInfo: string;
    previousMonth: string;
    nextMonth: string;
    loadingAvailability: string;
    noSlots: string;
    notesOptional: string;
    confirmAppointment: (minutes: number) => string;
    couldNotLoadAvailability: string;
    couldNotBook: string;
    doneTitle: string;
    smsNotice: string;
    callForChanges: string;
    saveLink: string;
  };
}

export const SITE_DICTIONARIES: Record<SiteLocale, SiteDictionary> = {
  fr: {
    intlLocale: "fr-CA",
    nav: { services: "Services", shop: "Le garage", book: "Réserver" },
    header: { bookCta: "Réserver", home: "Accueil", openMenu: "Ouvrir le menu" },
    whatsapp: {
      label: "Discuter sur WhatsApp",
      message: "Bonjour, j'aimerais prendre un rendez-vous.",
    },
    hero: {
      subheadline: "Une mécanique de confiance pour votre auto de tous les jours",
      tagline:
        "Diagnostic honnête, réparation complète et rendez-vous en ligne en quelques minutes — sans surprise sur la facture.",
      bookCta: "Réserver un rendez-vous",
      viewServicesCta: "Voir nos services",
    },
    services: {
      eyebrow: "Ce qu'on fait",
      heading: "Services du garage",
      subtitle: "Tout ce dont votre auto a besoin, au même endroit, avec rendez-vous en ligne.",
      items: {
        general: {
          title: "Mécanique générale",
          description: "Diagnostic, entretien et réparation complète pour toutes les marques.",
        },
        batteries: {
          title: "Batteries",
          description: "Vérification du système électrique et installation de batteries neuves.",
        },
        tires: {
          title: "Pneus",
          description: "Changement de pneus, balancement et alignement pour rouler en sécurité.",
        },
        brakes: {
          title: "Freins",
          description: "Inspection, plaquettes, disques et ajustement du système de freinage.",
        },
        oil: {
          title: "Vidange d'huile",
          description: "Changement d'huile et de filtre avec des produits de qualité.",
        },
      },
      noServiceTitle: "Vous ne voyez pas votre service ?",
      noServiceBody: "Écrivez-le lors de la réservation et on regarde ça ensemble.",
    },
    ourShop: {
      eyebrow: "À propos",
      heading: "Le garage",
      paragraph:
        "Un garage de quartier à Montréal, où les mécaniciens connaissent votre auto par son nom. Sans détour, sans surprise sur la facture.",
      hoursLabel: "Horaire disponible lors de la réservation en ligne",
      photoComingSoon: "Photo du garage à venir",
    },
    booking: {
      eyebrow: "Réservation en ligne",
      heading: "Prenez rendez-vous",
      subtitle: "Choisissez le jour, l'heure, et dites-nous ce qui ne va pas avec votre auto.",
    },
    form: {
      fullName: "Nom complet *",
      phone: "Téléphone *",
      emailOptional: "Courriel (optionnel)",
      serviceRequested: "Service demandé *",
      serviceOptions: [
        { value: "oil_change", label: "Changement d'huile" },
        { value: "brakes", label: "Freins" },
        { value: "tires", label: "Pneus (achat / installation)" },
        { value: "seasonal_tires", label: "Changement de pneus saisonnier" },
        { value: "battery", label: "Batterie" },
        { value: "alignment", label: "Alignement" },
        { value: "suspension", label: "Suspension" },
        { value: "diagnostic", label: "Diagnostic (voyant moteur)" },
        { value: "exhaust", label: "Système d'échappement" },
        { value: "ac", label: "Climatisation" },
        { value: "inspection", label: "Inspection mécanique (SAAQ)" },
        { value: "transmission", label: "Transmission" },
        { value: "general", label: "Entretien général" },
        { value: "other", label: "Autre (précisez)" },
      ],
      selectPlaceholder: "Sélectionnez...",
      otherOption: "Autre",
      specify: "Précisez",
      make: "Marque *",
      model: "Modèle *",
      year: "Année *",
      licensePlate: "Plaque (optionnelle)",
      stepPickDay: "Choisissez le jour",
      stepPickTime: "Choisissez l'heure",
      stepVehicle: "Votre véhicule",
      stepYourInfo: "Vos coordonnées",
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
      loadingAvailability: "Chargement des disponibilités...",
      noSlots: "Aucune disponibilité ce jour-là.",
      notesOptional: "Notes (optionnel)",
      confirmAppointment: (min) => `Confirmer le rendez-vous (${min} min)`,
      couldNotLoadAvailability: "Impossible de charger les disponibilités",
      couldNotBook: "Impossible de réserver",
      doneTitle: "Rendez-vous confirmé !",
      smsNotice: "Vous recevrez un SMS de confirmation sur votre téléphone.",
      callForChanges: "Pour tout changement, appelez au",
      saveLink: "Gardez ce lien pour confirmer ou annuler votre rendez-vous plus tard :",
    },
  },
  en: {
    intlLocale: "en-CA",
    nav: { services: "Services", shop: "The Shop", book: "Book" },
    header: { bookCta: "Book Appointment", home: "Home", openMenu: "Open menu" },
    whatsapp: {
      label: "Chat on WhatsApp",
      message: "Hi, I'd like to book an appointment.",
    },
    hero: {
      subheadline: "Trusted mechanics for your everyday car",
      tagline:
        "Honest diagnostics, complete repairs, and online booking in minutes — no surprises on the bill.",
      bookCta: "Book an appointment",
      viewServicesCta: "View services",
    },
    services: {
      eyebrow: "What we do",
      heading: "Shop services",
      subtitle: "Everything your car needs, in one place, with online booking.",
      items: {
        general: {
          title: "General mechanics",
          description: "Diagnostics, maintenance, and complete repair for all makes.",
        },
        batteries: {
          title: "Batteries",
          description: "Electrical system check and new battery installation.",
        },
        tires: {
          title: "Tires",
          description: "Tire changes, balancing, and alignment for a safe ride.",
        },
        brakes: {
          title: "Brakes",
          description: "Inspection, pads, rotors, and brake system adjustment.",
        },
        oil: {
          title: "Oil change",
          description: "Oil and filter change with quality products.",
        },
      },
      noServiceTitle: "Don't see your service?",
      noServiceBody: "Write it in when you book and we'll take a look together.",
    },
    ourShop: {
      eyebrow: "Get to know us",
      heading: "The shop",
      paragraph:
        "A neighborhood garage in Montréal, where the mechanics know your car by name. No runaround, no surprises on the bill.",
      hoursLabel: "Hours available when you book online",
      photoComingSoon: "Shop photo coming soon",
    },
    booking: {
      eyebrow: "Online booking",
      heading: "Book your appointment",
      subtitle: "Choose the day, the time, and tell us what's wrong with your car.",
    },
    form: {
      fullName: "Full name *",
      phone: "Phone *",
      emailOptional: "Email (optional)",
      serviceRequested: "Requested service *",
      serviceOptions: [
        { value: "oil_change", label: "Oil change" },
        { value: "brakes", label: "Brakes" },
        { value: "tires", label: "Tires (purchase / installation)" },
        { value: "seasonal_tires", label: "Seasonal tire change" },
        { value: "battery", label: "Battery" },
        { value: "alignment", label: "Alignment" },
        { value: "suspension", label: "Suspension" },
        { value: "diagnostic", label: "Diagnostic (check engine light)" },
        { value: "exhaust", label: "Exhaust system" },
        { value: "ac", label: "Air conditioning" },
        { value: "inspection", label: "Mechanical inspection (SAAQ)" },
        { value: "transmission", label: "Transmission" },
        { value: "general", label: "General maintenance" },
        { value: "other", label: "Other (please specify)" },
      ],
      selectPlaceholder: "Select...",
      otherOption: "Other",
      specify: "Please specify",
      make: "Make *",
      model: "Model *",
      year: "Year *",
      licensePlate: "License plate (optional)",
      stepPickDay: "Pick a day",
      stepPickTime: "Pick a time",
      stepVehicle: "Your vehicle",
      stepYourInfo: "Your info",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      loadingAvailability: "Loading availability...",
      noSlots: "No availability that day.",
      notesOptional: "Notes (optional)",
      confirmAppointment: (min) => `Confirm appointment (${min} min)`,
      couldNotLoadAvailability: "Could not load availability",
      couldNotBook: "Could not book appointment",
      doneTitle: "Appointment confirmed!",
      smsNotice: "You'll receive a confirmation SMS on your phone.",
      callForChanges: "For changes, call",
      saveLink: "Save this link to confirm or cancel your appointment later:",
    },
  },
  es: {
    intlLocale: "es",
    nav: { services: "Servicios", shop: "El taller", book: "Reservar" },
    header: { bookCta: "Reservar cita", home: "Inicio", openMenu: "Abrir menú" },
    whatsapp: {
      label: "Chatear por WhatsApp",
      message: "Hola, quisiera agendar una cita.",
    },
    hero: {
      subheadline: "Mecánica de confianza para tu auto de todos los días",
      tagline:
        "Diagnóstico honesto, reparación completa y cita en línea en minutos — sin sorpresas en la factura.",
      bookCta: "Reservar cita",
      viewServicesCta: "Ver servicios",
    },
    services: {
      eyebrow: "Qué hacemos",
      heading: "Servicios del taller",
      subtitle: "Todo lo que tu auto necesita, en un mismo lugar y con cita en línea.",
      items: {
        general: {
          title: "Mecánica general",
          description: "Diagnóstico, mantenimiento y reparación completa para todas las marcas.",
        },
        batteries: {
          title: "Baterías",
          description: "Revisión del sistema eléctrico e instalación de baterías nuevas.",
        },
        tires: {
          title: "Neumáticos",
          description: "Cambio de llantas, balanceo y alineación para rodar seguro.",
        },
        brakes: {
          title: "Frenos",
          description: "Inspección, pastillas, discos y ajuste del sistema de frenado.",
        },
        oil: {
          title: "Cambio de aceite",
          description: "Cambio de aceite y filtro con productos de calidad.",
        },
      },
      noServiceTitle: "¿No ves tu servicio?",
      noServiceBody: "Escríbelo al reservar tu cita y lo revisamos juntos.",
    },
    ourShop: {
      eyebrow: "Conócenos",
      heading: "El taller",
      paragraph:
        "Un taller de barrio en Montréal, atendido por mecánicos que conocen tu auto por su nombre. Sin vueltas, sin sorpresas en la factura.",
      hoursLabel: "Horario disponible al reservar tu cita en línea",
      photoComingSoon: "Foto del taller próximamente",
    },
    booking: {
      eyebrow: "Reserva en línea",
      heading: "Agenda tu cita",
      subtitle: "Elige el día, la hora y cuéntanos qué le pasa a tu auto.",
    },
    form: {
      fullName: "Nombre completo *",
      phone: "Teléfono *",
      emailOptional: "Email (opcional)",
      serviceRequested: "Servicio solicitado *",
      serviceOptions: [
        { value: "oil_change", label: "Cambio de aceite" },
        { value: "brakes", label: "Frenos" },
        { value: "tires", label: "Neumáticos (compra / instalación)" },
        { value: "seasonal_tires", label: "Cambio de llantas de temporada" },
        { value: "battery", label: "Batería" },
        { value: "alignment", label: "Alineación" },
        { value: "suspension", label: "Suspensión" },
        { value: "diagnostic", label: "Diagnóstico (check engine)" },
        { value: "exhaust", label: "Sistema de escape" },
        { value: "ac", label: "Aire acondicionado" },
        { value: "inspection", label: "Inspección mecánica (SAAQ)" },
        { value: "transmission", label: "Transmisión" },
        { value: "general", label: "Revisión general" },
        { value: "other", label: "Otro (especifica)" },
      ],
      selectPlaceholder: "Selecciona...",
      otherOption: "Otro",
      specify: "Especifica",
      make: "Marca *",
      model: "Modelo *",
      year: "Año *",
      licensePlate: "Placa (opcional)",
      stepPickDay: "Elige el día",
      stepPickTime: "Elige la hora",
      stepVehicle: "Tu vehículo",
      stepYourInfo: "Tus datos",
      previousMonth: "Mes anterior",
      nextMonth: "Mes siguiente",
      loadingAvailability: "Cargando horarios...",
      noSlots: "No hay horarios disponibles este día.",
      notesOptional: "Notas (opcional)",
      confirmAppointment: (min) => `Confirmar cita (${min} min)`,
      couldNotLoadAvailability: "No se pudo cargar disponibilidad",
      couldNotBook: "No se pudo reservar",
      doneTitle: "¡Cita confirmada!",
      smsNotice: "Recibirás un SMS de confirmación a tu teléfono.",
      callForChanges: "Para cambios, llama al",
      saveLink: "Guarda este link para confirmar o cancelar tu cita más tarde:",
    },
  },
};

export const SERVICE_KEYS: ServiceKey[] = ["general", "batteries", "tires", "brakes", "oil"];
