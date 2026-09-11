export const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export interface WorkingHoursRow {
  dayOfWeek: number;
  dayLabel: string;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}
