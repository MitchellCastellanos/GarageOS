import type { AdminLocale } from "@/lib/admin-locale";

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const APPOINTMENT_STATUS_LABELS: Record<AdminLocale, Record<AppointmentStatus, string>> = {
  es: {
    SCHEDULED: "Programada",
    CONFIRMED: "Confirmada",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
    NO_SHOW: "No asistió",
  },
  en: {
    SCHEDULED: "Scheduled",
    CONFIRMED: "Confirmed",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No-show",
  },
  fr: {
    SCHEDULED: "Planifiée",
    CONFIRMED: "Confirmée",
    COMPLETED: "Terminée",
    CANCELLED: "Annulée",
    NO_SHOW: "Absence",
  },
};

export function appointmentStatusLabel(status: string, locale: AdminLocale): string {
  return APPOINTMENT_STATUS_LABELS[locale][status as AppointmentStatus] ?? status;
}

export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-teal-100 text-teal-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-400",
  NO_SHOW: "bg-red-100 text-red-700",
};
