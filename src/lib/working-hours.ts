import type { AdminLocale } from "@/lib/admin-locale";

const DAY_LABELS: Record<AdminLocale, string[]> = {
  es: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
};

export function dayLabel(dayOfWeek: number, locale: AdminLocale): string {
  return DAY_LABELS[locale][dayOfWeek];
}

export interface WorkingHoursRow {
  dayOfWeek: number;
  dayLabel: string;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}
