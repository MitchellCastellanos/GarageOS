// Business-day arithmetic in an IANA timezone, with Québec statutory holidays. Reuses the repo's DST-safe
// wall-clock helpers (shop-timezone.ts) rather than re-implementing time zone maths.
import { addShopDays, formatShopDate, getShopDayOfWeek, parseShopDateTime } from "@/lib/shop-timezone";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function shiftUtc(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return ymd(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

/** Québec general holidays (Loi sur les normes du travail) that close most businesses. YYYY-MM-DD local dates. */
export function quebecHolidays(year: number): Set<string> {
  const [em, ed] = easter(year);
  const set = new Set<string>([
    ymd(year, 1, 1),
    shiftUtc(year, em, ed, -2), // Good Friday
    shiftUtc(year, em, ed, 1), // Easter Monday
    ymd(year, 6, 24), // Fête nationale
    ymd(year, 7, 1), // Canada Day
    nthWeekday(year, 9, 1, 1), // Labour Day
    nthWeekday(year, 10, 1, 2), // Thanksgiving
    ymd(year, 12, 25),
  ]);
  // Journée nationale des patriotes: Monday preceding May 25.
  const may25 = new Date(Date.UTC(year, 4, 25)).getUTCDay();
  set.add(ymd(year, 5, 25 - (((may25 + 6) % 7) || 7)));
  return set;
}

export function isBusinessDay(dateStr: string, tz: string, holidays: (year: number) => Set<string> = quebecHolidays): boolean {
  const dow = getShopDayOfWeek(dateStr, tz);
  if (dow === 0 || dow === 6) return false;
  return !holidays(Number(dateStr.slice(0, 4))).has(dateStr);
}

/** `days` business days after `dateStr` (0 ⇒ the first business day on/after it). */
export function addBusinessDays(dateStr: string, days: number, tz: string, holidays?: (year: number) => Set<string>): string {
  let d = dateStr;
  while (!isBusinessDay(d, tz, holidays)) d = addShopDays(d, 1, tz);
  let left = days;
  while (left > 0) {
    d = addShopDays(d, 1, tz);
    if (isBusinessDay(d, tz, holidays)) left--;
  }
  return d;
}

export interface SendWindow { startHour: number; endHour: number; businessDaysOnly: boolean }

/**
 * The earliest instant ≥ `at` that lies inside the sender's local send window (and on a business day when required).
 * Pure function of (instant, tz): used for sequence scheduling and for deferring when a window is closed.
 */
export function nextSendInstant(at: Date, tz: string, win: SendWindow, holidays?: (year: number) => Set<string>): Date {
  let day = formatShopDate(at, tz);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const minutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const startMin = win.startHour * 60, endMin = win.endHour * 60;
  const dayOk = !win.businessDaysOnly || isBusinessDay(day, tz, holidays);
  if (dayOk && minutes >= startMin && minutes < endMin) return at;
  if (dayOk && minutes < startMin) return parseShopDateTime(day, `${pad(win.startHour)}:00`, tz);
  do { day = addShopDays(day, 1, tz); } while (win.businessDaysOnly && !isBusinessDay(day, tz, holidays));
  return parseShopDateTime(day, `${pad(win.startHour)}:00`, tz);
}
