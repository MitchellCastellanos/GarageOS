import type { AdminLocale } from "@/lib/admin-locale";
import type { BookingPageTemplate, BookingPageTypography } from "@/lib/booking-page";
import type { BookingPageActionError } from "@/actions/booking-page";

type StepKey = "photos" | "template" | "style" | "review";

export interface BookingPageDictionary {
  title: string;
  subtitle: string;
  steps: Record<StepKey, string>;
  stepCounter: (current: number, total: number) => string;
  back: string;
  next: string;
  guidedIntro: string;
  photos: {
    heading: string;
    intro: string;
    cover: { title: string; guidance: string; recommended: string };
    shop: { title: string; guidance: string; recommended: string };
    upload: string;
    replace: string;
    remove: string;
    uploading: string;
    empty: string;
    fallbackNote: string;
    logoTitle: string;
    logoSet: string;
    logoMissing: string;
    logoLink: string;
  };
  template: {
    heading: string;
    intro: string;
    names: Record<BookingPageTemplate, string>;
    descriptions: Record<BookingPageTemplate, string>;
    recommended: string;
  };
  style: {
    heading: string;
    intro: string;
    typographyTitle: string;
    typographyNames: Record<BookingPageTypography, string>;
    typographyDescriptions: Record<BookingPageTypography, string>;
    colorTitle: string;
    colorHint: string;
    colorAdjusted: string;
    colorReset: string;
  };
  review: {
    heading: string;
    intro: string;
    template: string;
    typography: string;
    color: string;
    photos: string;
    photosCount: (count: number) => string;
    services: string;
    featuredCount: (count: number) => string;
    servicesLink: string;
  };
  preview: {
    title: string;
    desktop: string;
    mobile: string;
    draftBadge: string;
    openLive: string;
  };
  pro: {
    badge: string;
    lockedTitle: string;
    lockedBody: string;
    upgradeCta: string;
    previewNote: string;
  };
  publish: {
    button: string;
    publishing: string;
    discard: string;
    unsaved: string;
    upToDate: string;
    success: string;
    liveTitle: string;
    copy: string;
    copied: string;
    open: string;
    bookingDisabled: string;
    unsavedPrompt: string;
  };
  errors: Record<BookingPageActionError, string> & { generic: string };
}

const es: BookingPageDictionary = {
  title: "Página de reservas",
  subtitle: "Personaliza cómo se ve tu página pública de reservas. Los cambios no se publican hasta que confirmes.",
  steps: { photos: "Fotos", template: "Plantilla", style: "Estilo", review: "Revisar y publicar" },
  stepCounter: (current, total) => `Paso ${current} de ${total}`,
  back: "Atrás",
  next: "Siguiente",
  guidedIntro: "Configura tu página en 4 pasos cortos. Podrás volver a editar todo cuando quieras.",
  photos: {
    heading: "Haz que la página se sienta como tu taller",
    intro: "Dos fotos reales cambian todo. Puedes publicar sin ellas: usaremos un fondo con tu color.",
    cover: {
      title: "Foto de portada",
      guidance: "La fachada o una vista representativa del taller, tomada en horizontal y con buena luz.",
      recommended: "Horizontal · recomendado 2400 × 1350 px (16:9)",
    },
    shop: {
      title: "Foto del taller",
      guidance: "El interior: bahías de servicio, equipo, tu equipo trabajando o un auto en el elevador.",
      recommended: "Horizontal · recomendado 1600 × 1200 px (4:3)",
    },
    upload: "Subir foto",
    replace: "Cambiar",
    remove: "Quitar",
    uploading: "Subiendo…",
    empty: "Sin foto",
    fallbackNote: "Sin foto se muestra un fondo con tu color de marca.",
    logoTitle: "Logo",
    logoSet: "Tu logo ya está configurado y aparece en el encabezado.",
    logoMissing: "Todavía no subiste un logo — sin él se muestra solo el nombre del taller.",
    logoLink: "Cambiar en General",
  },
  template: {
    heading: "Elige una plantilla",
    intro: "Las cuatro usan tus mismos datos, servicios y reservas — solo cambia la presentación.",
    names: { CLASSIC: "Classic", MODERN: "Modern", BOLD: "Bold", MINIMAL: "Minimal" },
    descriptions: {
      CLASSIC: "Foto grande con velo oscuro. La de siempre.",
      MODERN: "Dividida, clara y limpia.",
      BOLD: "Fuerte, deportiva, con tu color al frente.",
      MINIMAL: "Mucho aire, estilo premium.",
    },
    recommended: "Recomendada",
  },
  style: {
    heading: "Ajusta el estilo",
    intro: "Elige una tipografía y tu color principal. Mira el resultado en vivo a la derecha.",
    typographyTitle: "Tipografía",
    typographyNames: { GARAGE: "Garage", MODERN: "Moderna", CLASSIC: "Clásica", PREMIUM: "Premium" },
    typographyDescriptions: {
      GARAGE: "Condensada e industrial",
      MODERN: "Geométrica y limpia",
      CLASSIC: "Sólida y confiable",
      PREMIUM: "Editorial y elegante",
    },
    colorTitle: "Color principal",
    colorHint: "Es tu color de marca (el mismo de Configuración → General).",
    colorAdjusted: "Lo oscurecemos un poco en la página para que el texto se lea bien.",
    colorReset: "Restablecer",
  },
  review: {
    heading: "Revisa y publica",
    intro: "Así se verá tu página. Publicar reemplaza la versión actual.",
    template: "Plantilla",
    typography: "Tipografía",
    color: "Color",
    photos: "Fotos",
    photosCount: (count) => `${count} de 2`,
    services: "Servicios",
    featuredCount: (count) => (count === 1 ? "1 destacado" : `${count} destacados`),
    servicesLink: "Editar servicios",
  },
  preview: {
    title: "Vista previa",
    desktop: "Escritorio",
    mobile: "Móvil",
    draftBadge: "Borrador",
    openLive: "Ver página publicada",
  },
  pro: {
    badge: "PRO",
    lockedTitle: "Diseño avanzado — plan Pro",
    lockedBody: "Puedes probar este diseño con tus datos, pero publicarlo requiere el plan Pro o superior.",
    upgradeCta: "Ver planes",
    previewNote: "Solo vista previa",
  },
  publish: {
    button: "Publicar",
    publishing: "Publicando…",
    discard: "Descartar cambios",
    unsaved: "Cambios sin publicar",
    upToDate: "Publicado",
    success: "Página publicada",
    liveTitle: "Tu página está en línea",
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    open: "Abrir",
    bookingDisabled: "Las reservas en línea están desactivadas: la página muestra un aviso en lugar del diseño. Actívalas en Calendario.",
    unsavedPrompt: "Tienes cambios sin publicar en la página de reservas.",
  },
  errors: {
    notConfigured: "El almacenamiento de archivos no está configurado.",
    noFile: "No se seleccionó ningún archivo.",
    tooLarge: "La foto es demasiado pesada (máximo 4 MB).",
    invalidType: "Solo se aceptan fotos JPG, PNG o WebP.",
    uploadFailed: "No se pudo subir la foto. Inténtalo de nuevo.",
    invalid: "Datos inválidos. Recarga la página e inténtalo de nuevo.",
    invalidImage: "Una de las fotos no es válida. Vuelve a subirla.",
    entitlement: "Esta plantilla o tipografía requiere el plan Pro.",
    generic: "Algo salió mal. Inténtalo de nuevo.",
  },
};

const en: BookingPageDictionary = {
  title: "Booking page",
  subtitle: "Customize how your public booking page looks. Nothing goes live until you publish.",
  steps: { photos: "Photos", template: "Template", style: "Style", review: "Review & publish" },
  stepCounter: (current, total) => `Step ${current} of ${total}`,
  back: "Back",
  next: "Next",
  guidedIntro: "Set up your page in 4 short steps. You can come back and edit anything later.",
  photos: {
    heading: "Make the page feel like your shop",
    intro: "Two real photos make all the difference. You can publish without them — we'll use a background in your color.",
    cover: {
      title: "Cover photo",
      guidance: "Your storefront or a representative view of the shop, shot horizontally in good light.",
      recommended: "Landscape · recommended 2400 × 1350 px (16:9)",
    },
    shop: {
      title: "Shop photo",
      guidance: "The inside: service bays, equipment, your team at work or a car on the lift.",
      recommended: "Landscape · recommended 1600 × 1200 px (4:3)",
    },
    upload: "Upload photo",
    replace: "Replace",
    remove: "Remove",
    uploading: "Uploading…",
    empty: "No photo",
    fallbackNote: "Without a photo, a background in your brand color is shown.",
    logoTitle: "Logo",
    logoSet: "Your logo is already set and shows in the header.",
    logoMissing: "You haven't uploaded a logo yet — only the shop name is shown.",
    logoLink: "Change in General",
  },
  template: {
    heading: "Choose a template",
    intro: "All four use the same info, services and booking — only the presentation changes.",
    names: { CLASSIC: "Classic", MODERN: "Modern", BOLD: "Bold", MINIMAL: "Minimal" },
    descriptions: {
      CLASSIC: "Big photo with a dark overlay. The original.",
      MODERN: "Split layout, light and clean.",
      BOLD: "Strong and sporty, your color up front.",
      MINIMAL: "Lots of whitespace, premium feel.",
    },
    recommended: "Recommended",
  },
  style: {
    heading: "Fine-tune the style",
    intro: "Pick a typography style and your primary color. See the result live on the right.",
    typographyTitle: "Typography",
    typographyNames: { GARAGE: "Garage", MODERN: "Modern", CLASSIC: "Classic", PREMIUM: "Premium" },
    typographyDescriptions: {
      GARAGE: "Condensed and industrial",
      MODERN: "Geometric and clean",
      CLASSIC: "Solid and trustworthy",
      PREMIUM: "Editorial and elegant",
    },
    colorTitle: "Primary color",
    colorHint: "This is your brand color (same as Settings → General).",
    colorAdjusted: "We darken it slightly on the page so text stays readable.",
    colorReset: "Reset",
  },
  review: {
    heading: "Review & publish",
    intro: "This is how your page will look. Publishing replaces the current version.",
    template: "Template",
    typography: "Typography",
    color: "Color",
    photos: "Photos",
    photosCount: (count) => `${count} of 2`,
    services: "Services",
    featuredCount: (count) => (count === 1 ? "1 featured" : `${count} featured`),
    servicesLink: "Edit services",
  },
  preview: {
    title: "Preview",
    desktop: "Desktop",
    mobile: "Mobile",
    draftBadge: "Draft",
    openLive: "View published page",
  },
  pro: {
    badge: "PRO",
    lockedTitle: "Advanced design — Pro plan",
    lockedBody: "You can try this design with your own shop, but publishing it requires the Pro plan or higher.",
    upgradeCta: "See plans",
    previewNote: "Preview only",
  },
  publish: {
    button: "Publish",
    publishing: "Publishing…",
    discard: "Discard changes",
    unsaved: "Unpublished changes",
    upToDate: "Published",
    success: "Page published",
    liveTitle: "Your page is live",
    copy: "Copy link",
    copied: "Link copied",
    open: "Open",
    bookingDisabled: "Online booking is turned off, so the page shows a notice instead of this design. Turn it on under Calendar.",
    unsavedPrompt: "You have unpublished changes to your booking page.",
  },
  errors: {
    notConfigured: "File storage is not configured.",
    noFile: "No file selected.",
    tooLarge: "The photo is too large (4 MB max).",
    invalidType: "Only JPG, PNG or WebP photos are accepted.",
    uploadFailed: "The photo could not be uploaded. Please try again.",
    invalid: "Invalid data. Reload the page and try again.",
    invalidImage: "One of the photos is not valid. Please upload it again.",
    entitlement: "This template or typography requires the Pro plan.",
    generic: "Something went wrong. Please try again.",
  },
};

const fr: BookingPageDictionary = {
  title: "Page de réservation",
  subtitle: "Personnalisez l'apparence de votre page de réservation publique. Rien n'est mis en ligne avant la publication.",
  steps: { photos: "Photos", template: "Modèle", style: "Style", review: "Vérifier et publier" },
  stepCounter: (current, total) => `Étape ${current} sur ${total}`,
  back: "Retour",
  next: "Suivant",
  guidedIntro: "Configurez votre page en 4 courtes étapes. Vous pourrez tout modifier plus tard.",
  photos: {
    heading: "Donnez à la page l'allure de votre garage",
    intro: "Deux vraies photos font toute la différence. Vous pouvez publier sans elles : un fond à votre couleur sera utilisé.",
    cover: {
      title: "Photo de couverture",
      guidance: "La façade ou une vue représentative du garage, à l'horizontale et bien éclairée.",
      recommended: "Paysage · recommandé 2400 × 1350 px (16:9)",
    },
    shop: {
      title: "Photo de l'atelier",
      guidance: "L'intérieur : baies de service, équipement, votre équipe au travail ou une auto sur le pont.",
      recommended: "Paysage · recommandé 1600 × 1200 px (4:3)",
    },
    upload: "Téléverser une photo",
    replace: "Remplacer",
    remove: "Retirer",
    uploading: "Téléversement…",
    empty: "Aucune photo",
    fallbackNote: "Sans photo, un fond à la couleur de votre marque est affiché.",
    logoTitle: "Logo",
    logoSet: "Votre logo est déjà configuré et s'affiche dans l'en-tête.",
    logoMissing: "Vous n'avez pas encore de logo — seul le nom du garage est affiché.",
    logoLink: "Modifier dans Général",
  },
  template: {
    heading: "Choisissez un modèle",
    intro: "Les quatre utilisent les mêmes infos, services et réservations — seule la présentation change.",
    names: { CLASSIC: "Classic", MODERN: "Modern", BOLD: "Bold", MINIMAL: "Minimal" },
    descriptions: {
      CLASSIC: "Grande photo avec voile sombre. L'originale.",
      MODERN: "Mise en page divisée, claire et épurée.",
      BOLD: "Fort et sportif, votre couleur à l'avant.",
      MINIMAL: "Beaucoup d'espace, style haut de gamme.",
    },
    recommended: "Recommandé",
  },
  style: {
    heading: "Ajustez le style",
    intro: "Choisissez une typographie et votre couleur principale. Le résultat s'affiche en direct à droite.",
    typographyTitle: "Typographie",
    typographyNames: { GARAGE: "Garage", MODERN: "Moderne", CLASSIC: "Classique", PREMIUM: "Premium" },
    typographyDescriptions: {
      GARAGE: "Condensée et industrielle",
      MODERN: "Géométrique et épurée",
      CLASSIC: "Solide et rassurante",
      PREMIUM: "Éditoriale et élégante",
    },
    colorTitle: "Couleur principale",
    colorHint: "C'est la couleur de votre marque (la même que dans Paramètres → Général).",
    colorAdjusted: "Nous l'assombrissons légèrement sur la page pour garder le texte lisible.",
    colorReset: "Réinitialiser",
  },
  review: {
    heading: "Vérifier et publier",
    intro: "Voici à quoi ressemblera votre page. Publier remplace la version actuelle.",
    template: "Modèle",
    typography: "Typographie",
    color: "Couleur",
    photos: "Photos",
    photosCount: (count) => `${count} sur 2`,
    services: "Services",
    featuredCount: (count) => `${count} en vedette`,
    servicesLink: "Modifier les services",
  },
  preview: {
    title: "Aperçu",
    desktop: "Ordinateur",
    mobile: "Mobile",
    draftBadge: "Brouillon",
    openLive: "Voir la page publiée",
  },
  pro: {
    badge: "PRO",
    lockedTitle: "Design avancé — forfait Pro",
    lockedBody: "Vous pouvez essayer ce design avec votre garage, mais le publier exige le forfait Pro ou supérieur.",
    upgradeCta: "Voir les forfaits",
    previewNote: "Aperçu seulement",
  },
  publish: {
    button: "Publier",
    publishing: "Publication…",
    discard: "Annuler les changements",
    unsaved: "Changements non publiés",
    upToDate: "Publié",
    success: "Page publiée",
    liveTitle: "Votre page est en ligne",
    copy: "Copier le lien",
    copied: "Lien copié",
    open: "Ouvrir",
    bookingDisabled: "La réservation en ligne est désactivée : la page affiche un avis au lieu de ce design. Activez-la dans Calendrier.",
    unsavedPrompt: "Vous avez des changements non publiés sur votre page de réservation.",
  },
  errors: {
    notConfigured: "Le stockage de fichiers n'est pas configuré.",
    noFile: "Aucun fichier sélectionné.",
    tooLarge: "La photo est trop lourde (4 Mo maximum).",
    invalidType: "Seules les photos JPG, PNG ou WebP sont acceptées.",
    uploadFailed: "La photo n'a pas pu être téléversée. Réessayez.",
    invalid: "Données invalides. Rechargez la page et réessayez.",
    invalidImage: "Une des photos n'est pas valide. Téléversez-la de nouveau.",
    entitlement: "Ce modèle ou cette typographie exige le forfait Pro.",
    generic: "Une erreur est survenue. Réessayez.",
  },
};

export const BOOKING_PAGE_DICT: Record<AdminLocale, BookingPageDictionary> = { es, en, fr };
