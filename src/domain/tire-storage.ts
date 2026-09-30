// Tire Storage (Block 4) — reglas puras: medida, estados y transiciones.

export const TIRE_SEASONS = ["WINTER", "SUMMER", "ALL_SEASON"] as const;
export const TIRE_CONDITIONS = ["NEW", "GOOD", "FAIR", "WORN"] as const;
export type TireStorageStatusValue = "STORED" | "CHECKED_OUT";

/**
 * Normaliza una medida de llanta a "225/45R17" (acepta "225 45 17", "225/45/17", "225-45-r17",
 * prefijos P/LT y sufijo de carga "94V" que se descarta). Medidas en pulgadas ("31x10.5R15")
 * también. null = no reconocible.
 */
export function normalizeTireSize(input: string): string | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, " ");
  const metric = /^(P|LT|T)?\s?(\d{3})\s?[/\- ]\s?(\d{2})\s?[- /]?\s?(Z?R|D|B)?\s?[- /]?\s?(\d{2})(?:\s?\d{2,3}[A-Z]{1,2})?$/.exec(s);
  if (metric) {
    const [, prefix, width, aspect, construction, rim] = metric;
    return `${prefix ?? ""}${width}/${aspect}${construction ? (construction === "ZR" ? "ZR" : construction) : "R"}${rim}`;
  }
  const flotation = /^(\d{2}(?:\.\d+)?)\s?X\s?(\d{1,2}(?:\.\d+)?)\s?(R|D|B)?\s?[- ]?(\d{2})$/.exec(s);
  if (flotation) {
    const [, dia, width, construction, rim] = flotation;
    return `${dia}X${width}${construction ?? "R"}${rim}`;
  }
  return null;
}

export function canCheckOut(status: TireStorageStatusValue): boolean {
  return status === "STORED";
}

/** Volver a guardar un juego que salió (re-check-in). */
export function canCheckIn(status: TireStorageStatusValue): boolean {
  return status === "CHECKED_OUT";
}

export function canMove(status: TireStorageStatusValue): boolean {
  return status === "STORED";
}

export function normalizeLocation(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().replace(/\s+/g, " ");
  return v ? v.toUpperCase().slice(0, 40) : null;
}

// ── Customer communication lifecycle (Block 15 / I-2) ─────────────────────────

/** Whole calendar days from `fromYmd` to `toYmd` ("YYYY-MM-DD"). Pure UTC date math — immune to DST. */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export const PICKUP_REMINDER_LEAD_DAYS = { early: 14, final: 3 } as const;

export type PickupReminderKind = "PICKUP_REMINDER_14" | "PICKUP_REMINDER_3";

/**
 * Which pickup reminder (if any) a stored set is due for TODAY (shop-local calendar day).
 *  - "final" (≤ 3 days before, through the pickup day itself) — skipped if the check-in was < 1 day ago.
 *  - "early" (4–14 days before) — skipped if the check-in was < 7 days ago (the customer just got the
 *    check-in confirmation), so nobody is reminded of a pickup they were told about hours ago.
 * A reminder that has already been sent is never repeated; a missed window (cron outage) simply
 * falls through to the next one; nothing is sent after the expected date has passed.
 */
export function duePickupReminder(input: {
  status: TireStorageStatusValue;
  todayYmd: string;
  expectedPickupYmd: string | null;
  checkedInAt: Date;
  now: Date;
  earlySent: boolean;
  finalSent: boolean;
}): PickupReminderKind | null {
  if (input.status !== "STORED" || !input.expectedPickupYmd) return null;
  const daysLeft = calendarDaysBetween(input.todayYmd, input.expectedPickupYmd);
  if (daysLeft < 0) return null;
  const ageDays = (input.now.getTime() - input.checkedInAt.getTime()) / 86_400_000;
  if (daysLeft <= PICKUP_REMINDER_LEAD_DAYS.final) {
    return !input.finalSent && ageDays >= 1 ? "PICKUP_REMINDER_3" : null;
  }
  if (daysLeft <= PICKUP_REMINDER_LEAD_DAYS.early) {
    return !input.earlySent && !input.finalSent && ageDays >= 7 ? "PICKUP_REMINDER_14" : null;
  }
  return null;
}

/** Customer-safe storage reference (never the internal rack/location): "TS-" + last 6 chars of the id. */
export function customerStorageReference(setId: string): string {
  return `TS-${setId.slice(-6).toUpperCase()}`;
}

/** Accepts "YYYY-MM-DD" only, and a real calendar date. Returns null for empty, throws-free. */
export function parsePickupDate(input: string | null | undefined): { ymd: string | null; invalid: boolean } {
  const v = (input ?? "").trim();
  if (!v) return { ymd: null, invalid: false };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return { ymd: null, invalid: true };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const ok = d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  return ok ? { ymd: v, invalid: false } : { ymd: null, invalid: true };
}
