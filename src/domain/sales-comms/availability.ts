// Slot generation — pure. Weekly working hours are wall-clock times in the seller's IANA timezone; every result is a
// UTC instant. Because windows are converted to instants BEFORE stepping, DST days naturally have 23/25 real hours
// and a meeting never straddles a clock change by accident (Montréal: 2nd Sunday of March, 1st Sunday of November).
import { addShopDays, formatShopDate, getShopDayOfWeek, parseShopDateTime } from "@/lib/shop-timezone";

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type WeeklyHours = Partial<Record<WeekdayKey, [string, string][]>>;

export interface TimeRange { startsAt: Date; endsAt: Date }
export interface AvailabilityException extends TimeRange { kind: "OFF" | "EXTRA" }

export interface SlotInput {
  weekly: WeeklyHours;
  timezone: string;
  exceptions: AvailabilityException[];
  /** Existing SCHEDULED meetings of the seller (raw, without buffers). */
  busy: TimeRange[];
  durationMinutes: number;
  bufferMinutes: number;
  /** Granularity of offered start times. */
  stepMinutes?: number;
  now: Date;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  /** Inclusive local calendar dates (YYYY-MM-DD in the seller timezone) to generate. */
  fromDate: string;
  toDate: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validates & normalizes a weekly template: sorted, non-overlapping, end > start. Returns null if invalid. */
export function parseWeeklyHours(raw: unknown): WeeklyHours | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: WeeklyHours = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(WEEKDAY_KEYS as readonly string[]).includes(k) || !Array.isArray(v)) return null;
    const ranges: [string, string][] = [];
    for (const r of v) {
      if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== "string" || typeof r[1] !== "string" || !HHMM.test(r[0]) || !HHMM.test(r[1]) || r[1] <= r[0]) return null;
      ranges.push([r[0], r[1]]);
    }
    ranges.sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return null;
    if (ranges.length) out[k as WeekdayKey] = ranges;
  }
  return out;
}

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]],
};

const MIN = 60_000;
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Merges overlapping/adjacent ranges (ms). */
function merge(ranges: [number, number][]): [number, number][] {
  const s = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function subtract(windows: [number, number][], holes: [number, number][]): [number, number][] {
  let cur = windows;
  for (const h of holes) {
    const next: [number, number][] = [];
    for (const w of cur) {
      if (!overlaps(w[0], w[1], h[0], h[1])) { next.push(w); continue; }
      if (h[0] > w[0]) next.push([w[0], h[0]]);
      if (h[1] < w[1]) next.push([h[1], w[1]]);
    }
    cur = next;
  }
  return cur;
}

/** All genuinely bookable start instants (ascending, unique). */
export function generateSlots(i: SlotInput): Date[] {
  const step = (i.stepMinutes ?? 15) * MIN;
  const dur = i.durationMinutes * MIN;
  const buf = i.bufferMinutes * MIN;
  const earliest = i.now.getTime() + i.minNoticeMinutes * MIN;
  const latest = i.now.getTime() + i.maxAdvanceDays * 86_400_000;

  let windows: [number, number][] = [];
  for (let d = i.fromDate, guard = 0; d <= i.toDate && guard < 62; d = addShopDays(d, 1, i.timezone), guard++) {
    const key = WEEKDAY_KEYS[getShopDayOfWeek(d, i.timezone)];
    for (const [s, e] of i.weekly[key] ?? []) {
      windows.push([parseShopDateTime(d, s, i.timezone).getTime(), parseShopDateTime(d, e, i.timezone).getTime()]);
    }
  }
  for (const x of i.exceptions) if (x.kind === "EXTRA") windows.push([x.startsAt.getTime(), x.endsAt.getTime()]);
  windows = merge(windows.filter(([s, e]) => e > s));

  const holes: [number, number][] = [
    ...i.exceptions.filter((x) => x.kind === "OFF").map((x): [number, number] => [x.startsAt.getTime(), x.endsAt.getTime()]),
    // Buffers keep a gap between consecutive meetings on both sides.
    ...i.busy.map((b): [number, number] => [b.startsAt.getTime() - buf, b.endsAt.getTime() + buf]),
  ];
  windows = subtract(windows, holes);

  const slots: Date[] = [];
  for (const [ws, we] of windows) {
    // Align offered starts to the step grid in absolute time so they stay stable as windows change.
    for (let t = Math.ceil(ws / step) * step; t + dur <= we; t += step) {
      if (t >= earliest && t <= latest) slots.push(new Date(t));
    }
  }
  return slots;
}

/** Local calendar date range [from,to] that covers the instants [a,b] in `tz`. */
export function localDateRange(a: Date, b: Date, tz: string): { fromDate: string; toDate: string } {
  return { fromDate: formatShopDate(a, tz), toDate: formatShopDate(b, tz) };
}

/** Server-side re-validation of a client-chosen start: it must be one of the generated slots. */
export function isSlotOffered(start: Date, i: Omit<SlotInput, "fromDate" | "toDate">): boolean {
  const day = formatShopDate(start, i.timezone);
  const prev = addShopDays(day, -1, i.timezone);
  const next = addShopDays(day, 1, i.timezone);
  return generateSlots({ ...i, fromDate: prev, toDate: next }).some((s) => s.getTime() === start.getTime());
}
