import type { SiteLocale } from "@/lib/site-locale";

/** Textos de la demostración del booking (/demo/booking). Solo se usan con el modo demo activo. */
export const DEMO_BOOKING_COPY: Record<SiteLocale, { banner: string; back: string; formNote: string; sampleLink: string }> = {
  fr: {
    banner: "Garage Laurent est un atelier fictif de démonstration GarageOS. Rien n'est envoyé ni enregistré.",
    back: "← Retour à la démo",
    formNote: "Ici, vos clients entrent leurs coordonnées pour réserver. L'envoi est désactivé dans cette démonstration.",
    sampleLink: "Information de démonstration",
  },
  en: {
    banner: "Garage Laurent is a fictional GarageOS demo shop. Nothing is sent or saved.",
    back: "← Back to the demo",
    formNote: "This is where your customers enter their details to book. Submitting is disabled in this demo.",
    sampleLink: "Sample information",
  },
  es: {
    banner: "Garage Laurent es un taller ficticio de demostración de GarageOS. No se envía ni se guarda nada.",
    back: "← Volver a la demo",
    formNote: "Aquí tus clientes completan sus datos para reservar. El envío está deshabilitado en esta demostración.",
    sampleLink: "Información de muestra",
  },
};
