/** Asegura YYYY-MM-DD; si solo viene YYYY-MM, usa el día 01. */
export function ensureFullShopDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  return trimmed;
}

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Convierte fecha/hora local del taller a Date UTC (independiente del TZ del servidor). */
export function parseShopDateTime(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  let lo = Date.UTC(year, month - 1, day, hour, minute) - 16 * 3_600_000;
  let hi = Date.UTC(year, month - 1, day, hour, minute) + 16 * 3_600_000;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const p = partsInTimeZone(new Date(mid), timeZone);
    const cmp =
      p.year !== year
        ? p.year - year
        : p.month !== month
          ? p.month - month
          : p.day !== day
            ? p.day - day
            : p.hour !== hour
              ? p.hour - hour
              : p.minute - minute;

    if (cmp === 0) return new Date(mid);
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }

  throw new Error(`Fecha/hora inválida en ${timeZone}: ${dateStr} ${timeStr}`);
}

/** YYYY-MM-DD en la zona horaria del taller. */
export function formatShopDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** HH:mm en la zona horaria del taller. */
export function formatShopTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function getShopDayOfWeek(dateStr: string, timeZone: string): number {
  const noon = parseShopDateTime(ensureFullShopDate(dateStr), "12:00", timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export type AppointmentView = "month" | "week" | "day";

export function addShopDays(dateStr: string, days: number, timeZone: string): string {
  const at = parseShopDateTime(dateStr, "12:00", timeZone);
  at.setTime(at.getTime() + days * 86_400_000);
  return formatShopDate(at, timeZone);
}

export function formatShopDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShopDayHeader(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date));
}

export function formatShopTimeLabel(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function currentShopDate(timeZone: string): string {
  return formatShopDate(new Date(), timeZone);
}

export function getMonthRange(month: string, timeZone: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const start = parseShopDateTime(first, "00:00", timeZone);
  const end = parseShopDateTime(last, "23:59", timeZone);
  end.setMinutes(end.getMinutes() + 1);
  return { start, end, month: `${y}-${String(m).padStart(2, "0")}` };
}

export function getWeekRangeShop(anchorDate: string, timeZone: string) {
  const anchor = ensureFullShopDate(anchorDate);
  const dayOfWeek = getShopDayOfWeek(anchor, timeZone);
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = addShopDays(anchor, mondayOffset, timeZone);
  const weekEnd = addShopDays(weekStart, 6, timeZone);
  const start = parseShopDateTime(weekStart, "00:00", timeZone);
  const end = parseShopDateTime(weekEnd, "23:59", timeZone);
  end.setMinutes(end.getMinutes() + 1);
  return { start, end, weekStart };
}

export function getDayRangeShop(day: string, timeZone: string) {
  const fullDay = ensureFullShopDate(day);
  const start = parseShopDateTime(fullDay, "00:00", timeZone);
  const end = parseShopDateTime(fullDay, "23:59", timeZone);
  end.setMinutes(end.getMinutes() + 1);
  return { start, end, day: fullDay };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}
