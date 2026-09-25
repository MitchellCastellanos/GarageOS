import type { AdminLocale } from "@/lib/admin-locale";

// El asistente de arranque es una feature nueva: solo EN/FR (igual que
// ADMIN_LOCALES) — "es" en AdminLocale existe solo por compatibilidad con
// preferencias ya guardadas, nunca lo devuelve resolveAdminLocale().
export function toOnboardingLocale(locale: AdminLocale): "en" | "fr" {
  return locale === "fr" ? "fr" : "en";
}

export interface OnboardingDictionary {
  progress: (step: number, total: number) => string;
  back: string;
  skip: string;
  step1: {
    title: string;
    subtitle: string;
    name: string;
    address: string;
    addressPlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    slugLabel: string;
    slugHint: string;
    continue: string;
    saving: string;
  };
  step2: {
    title: string;
    subtitle: string;
    logoTitle: string;
    logoChange: string;
    logoUploading: string;
    logoHint: string;
    taxIdLabel: string;
    taxIdPlaceholder: string;
    taxPresetLabel: string;
    taxPresetPlaceholder: string;
    continue: string;
    saving: string;
  };
  step3: {
    title: string;
    subtitle: string;
  };
  step4: {
    title: string;
    subtitle: string;
    closed: string;
    continue: string;
    saving: string;
  };
  step5: {
    title: string;
    subtitle: string;
    colorExtracted: string;
    continue: string;
    saving: string;
  };
  step6: {
    title: string;
    subtitle: string;
    finish: string;
    finishing: string;
    supportHint: string;
    supportLink: string;
  };
  additionalLocation: {
    banner: string;
    copyServices: (shopName: string) => string;
  };
}

export const ONBOARDING_DICT: Record<"en" | "fr", OnboardingDictionary> = {
  en: {
    progress: (step, total) => `Step ${step} of ${total}`,
    back: "Back",
    skip: "Skip for now",
    step1: {
      title: "Let's set up your shop",
      subtitle: "This info is used on your booking page and in every email we send to your customers.",
      name: "Shop name",
      address: "Address",
      addressPlaceholder: "123 Main St, Montreal, QC",
      phone: "Phone",
      phonePlaceholder: "(514) 555-0100",
      email: "Contact email",
      emailPlaceholder: "hello@yourshop.com",
      slugLabel: "Your booking page URL",
      slugHint: "This is the link customers will use to book with you — you can change it later in Settings.",
      continue: "Continue",
      saving: "Saving...",
    },
    step2: {
      title: "Add your tax details and logo",
      subtitle: "They'll appear on your invoices, receipts, emails, and anywhere else we represent your shop.",
      logoTitle: "Logo",
      logoChange: "Upload logo",
      logoUploading: "Uploading...",
      logoHint: "PNG, JPG, WEBP or SVG, up to 4 MB.",
      taxIdLabel: "Tax ID",
      taxIdPlaceholder: "e.g. GST/QST number",
      taxPresetLabel: "Province / tax preset",
      taxPresetPlaceholder: "Choose a starting point...",
      continue: "Continue",
      saving: "Saving...",
    },
    step3: {
      title: "Add the services you offer",
      subtitle: "These are exactly what customers will choose from when they book. We started you off with a few common ones — edit, remove or add your own.",
    },
    step4: {
      title: "When can customers book you?",
      subtitle: "Set your hours so the calendar only offers real availability.",
      closed: "Closed",
      continue: "Continue",
      saving: "Saving...",
    },
    step5: {
      title: "Here's your booking page",
      subtitle: "Pick a color for your booking page — you can fine-tune the full design later in Settings.",
      colorExtracted: "We picked this from your logo — feel free to change it.",
      continue: "Continue",
      saving: "Saving...",
    },
    step6: {
      title: "You're ready to receive bookings!",
      subtitle: "Share this link, print the QR code, or embed the button on your own site.",
      finish: "Go to dashboard",
      finishing: "Finishing...",
      supportHint: "Stuck on anything?",
      supportLink: "Here's how to reach us",
    },
    additionalLocation: {
      banner: "Adding a new location — your branding and tax info carried over automatically, so this is a shorter setup.",
      copyServices: (shopName) => `Copied from ${shopName} — edit, remove or add your own.`,
    },
  },
  fr: {
    progress: (step, total) => `Étape ${step} sur ${total}`,
    back: "Retour",
    skip: "Passer pour l'instant",
    step1: {
      title: "Configurons votre atelier",
      subtitle: "Ces informations apparaissent sur votre page de réservation et dans chaque courriel envoyé à vos clients.",
      name: "Nom de l'atelier",
      address: "Adresse",
      addressPlaceholder: "123 rue Principale, Montréal, QC",
      phone: "Téléphone",
      phonePlaceholder: "(514) 555-0100",
      email: "Courriel de contact",
      emailPlaceholder: "bonjour@votregarage.com",
      slugLabel: "URL de votre page de réservation",
      slugHint: "C'est le lien que vos clients utiliseront pour réserver — vous pourrez le changer plus tard dans Paramètres.",
      continue: "Continuer",
      saving: "Enregistrement...",
    },
    step2: {
      title: "Ajoutez vos informations fiscales et votre logo",
      subtitle: "Ils apparaîtront sur vos factures, reçus, courriels et partout où nous représentons votre atelier.",
      logoTitle: "Logo",
      logoChange: "Téléverser un logo",
      logoUploading: "Téléversement...",
      logoHint: "PNG, JPG, WEBP ou SVG, jusqu'à 4 Mo.",
      taxIdLabel: "Numéro de taxe",
      taxIdPlaceholder: "ex. numéro TPS/TVQ",
      taxPresetLabel: "Province / préréglage fiscal",
      taxPresetPlaceholder: "Choisir un point de départ...",
      continue: "Continuer",
      saving: "Enregistrement...",
    },
    step3: {
      title: "Ajoutez les services que vous offrez",
      subtitle: "Ce sont exactement les choix que vos clients verront en réservant. On a démarré avec quelques services courants — modifiez, supprimez ou ajoutez les vôtres.",
    },
    step4: {
      title: "Quand pouvez-vous recevoir des réservations?",
      subtitle: "Réglez vos horaires pour que le calendrier n'offre que des disponibilités réelles.",
      closed: "Fermé",
      continue: "Continuer",
      saving: "Enregistrement...",
    },
    step5: {
      title: "Voici votre page de réservation",
      subtitle: "Choisissez une couleur pour votre page de réservation — vous pourrez peaufiner le design complet plus tard dans Paramètres.",
      colorExtracted: "Nous l'avons choisie à partir de votre logo — n'hésitez pas à la changer.",
      continue: "Continuer",
      saving: "Enregistrement...",
    },
    step6: {
      title: "Vous êtes prêt à recevoir des réservations!",
      subtitle: "Partagez ce lien, imprimez le code QR ou intégrez le bouton sur votre propre site.",
      finish: "Aller au tableau de bord",
      finishing: "Finalisation...",
      supportHint: "Un pépin?",
      supportLink: "Voici comment nous joindre",
    },
    additionalLocation: {
      banner: "Ajout d'un nouvel emplacement — votre image de marque et vos infos fiscales ont été reprises automatiquement, la configuration est donc plus courte.",
      copyServices: (shopName) => `Copié depuis ${shopName} — modifiez, supprimez ou ajoutez les vôtres.`,
    },
  },
};
