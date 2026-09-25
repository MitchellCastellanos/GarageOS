// Catálogo de eventos del centro de notificaciones — datos puros, sin DB ni
// "server-only", para poder importarse tanto desde server actions (server-only,
// ver src/lib/staff-notify.ts) como desde el componente cliente de preferencias.

export const STAFF_EVENT_KEYS = [
  "STAFF_NEW_WEB_BOOKING",
  "STAFF_CLIENT_CANCELLED_APPOINTMENT",
  "STAFF_QUOTE_DECIDED",
  "STAFF_SMS_USAGE",
  "STAFF_SMS_NUMBER_RELEASE_SCHEDULED",
  "STAFF_SMS_NUMBER_ACTIVATED",
] as const;

export type StaffEventKey = (typeof STAFF_EVENT_KEYS)[number];

export const STAFF_EVENT_LABELS: Record<StaffEventKey, { EN: string; FR: string }> = {
  STAFF_NEW_WEB_BOOKING: { EN: "New online booking", FR: "Nouveau rendez-vous en ligne" },
  STAFF_CLIENT_CANCELLED_APPOINTMENT: { EN: "Client cancelled an appointment", FR: "Client a annulé un rendez-vous" },
  STAFF_QUOTE_DECIDED: { EN: "Quote accepted or declined", FR: "Soumission acceptée ou refusée" },
  STAFF_SMS_USAGE: { EN: "SMS usage (80% / 100%)", FR: "Utilisation des SMS (80 % / 100 %)" },
  STAFF_SMS_NUMBER_RELEASE_SCHEDULED: { EN: "SMS number release scheduled", FR: "Libération du numéro SMS programmée" },
  STAFF_SMS_NUMBER_ACTIVATED: { EN: "SMS number activated", FR: "Numéro SMS activé" },
};

export interface StaffNotificationPreference {
  inApp: boolean;
  email: boolean;
}

/**
 * Sin fila = ambos canales activos. La app es el canal principal (siempre se
 * puede ver el historial completo ahí); el email es un refuerzo que cada
 * quien puede apagar sin perder el aviso — nunca al revés (no hay opción de
 * "solo email", porque el centro de notificaciones es la fuente de verdad).
 */
export const DEFAULT_STAFF_NOTIFICATION_PREFERENCE: StaffNotificationPreference = { inApp: true, email: true };
