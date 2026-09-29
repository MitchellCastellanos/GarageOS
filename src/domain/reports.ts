// Reportes (Block 5) — lógica pura: rangos de fechas en la zona horaria del taller, buckets,
// antigüedad de saldos y CSV. Sin acceso a BD (ver src/lib/reports-service.ts para las consultas).
import Decimal from "decimal.js";
import { parseShopDateTime } from "@/lib/shop-timezone";

export const REPORT_PRESETS = [
  "today",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "thisYear",
  "lastYear",
  "custom",
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** Core (reportes básicos): solo estos periodos, sin rango personalizado ni exportación. */
export const BASIC_PRESETS: readonly ReportPreset[] = ["last30", "thisMonth", "lastMonth"];
export const DEFAULT_PRESET: ReportPreset = "thisMonth";
/** Tope de un rango personalizado (evita consultas enormes). */
export const MAX_RANGE_DAYS = 731;

export const REPORT_KINDS = ["overview", "sales", "receivables", "operations", "customers", "inventory", "locations"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Reportes que muestran dinero → exigen además `financial.view`. */
export const FINANCIAL_KINDS: readonly ReportKind[] = ["sales", "receivables", "locations"];
/** Reportes que solo existen con Multi-Shop (`reports.multiLocation`, Complete). */
export const MULTI_LOCATION_KINDS: readonly ReportKind[] = ["locations"];
/** Reportes disponibles en Core (básico). El resto exige `reports.advanced`. */
export const BASIC_KINDS: readonly ReportKind[] = ["overview"];

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);
}
export function isReportPreset(v: unknown): v is ReportPreset {
  return typeof v === "string" && (REPORT_PRESETS as readonly string[]).includes(v);
}

export interface ResolvedRange {
  preset: ReportPreset;
  /** Fechas locales del taller, inclusivas (YYYY-MM-DD). */
  fromYmd: string;
  toYmd: string;
  /** Instantes UTC: [from, toExclusive). */
  from: Date;
  toExclusive: Date;
  days: number;
  timeZone: string;
}

export class ReportRangeError extends Error {
  constructor(public readonly code: "INVALID_DATE" | "INVERTED" | "TOO_LONG" | "PRESET_NOT_ALLOWED") {
    super(code);
    this.name = "ReportRangeError";
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function todayYmd(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  if (!YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function addDaysYmd(ymd: string, days: number): string {
  const p = parseYmd(ymd)!;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function diffDays(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd)!;
  const b = parseYmd(toYmd)!;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Rango [fromYmd, toYmd] para un preset, en la fecha local del taller. */
export function presetBounds(preset: Exclude<ReportPreset, "custom">, today: string): { fromYmd: string; toYmd: string } {
  const { y, m } = parseYmd(today)!;
  switch (preset) {
    case "today":
      return { fromYmd: today, toYmd: today };
    case "last7":
      return { fromYmd: addDaysYmd(today, -6), toYmd: today };
    case "last30":
      return { fromYmd: addDaysYmd(today, -29), toYmd: today };
    case "thisMonth":
      return { fromYmd: `${y}-${pad(m)}-01`, toYmd: today };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { fromYmd: `${py}-${pad(pm)}-01`, toYmd: `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}` };
    }
    case "thisQuarter": {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { fromYmd: `${y}-${pad(qm)}-01`, toYmd: today };
    }
    case "thisYear":
      return { fromYmd: `${y}-01-01`, toYmd: today };
    case "lastYear":
      return { fromYmd: `${y - 1}-01-01`, toYmd: `${y - 1}-12-31` };
  }
}

export interface RangeInput {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}

/**
 * Resuelve el rango pedido en la zona del taller. `allowedPresets` (Core = BASIC_PRESETS) hace de
 * enforcement del plan: un preset/rango personalizado no permitido se rechaza, no se degrada.
 */
export function resolveRange(
  input: RangeInput,
  opts: { timeZone: string; now?: Date; allowedPresets?: readonly ReportPreset[] }
): ResolvedRange {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone;
  const allowed = opts.allowedPresets ?? REPORT_PRESETS;
  const today = todayYmd(now, tz);
  const preset: ReportPreset = isReportPreset(input.preset) ? input.preset : input.from || input.to ? "custom" : DEFAULT_PRESET;
  if (!allowed.includes(preset)) throw new ReportRangeError("PRESET_NOT_ALLOWED");

  let fromYmd: string;
  let toYmd: string;
  if (preset === "custom") {
    if (!input.from || !input.to || !parseYmd(input.from) || !parseYmd(input.to)) throw new ReportRangeError("INVALID_DATE");
    fromYmd = input.from;
    toYmd = input.to;
  } else {
    ({ fromYmd, toYmd } = presetBounds(preset, today));
  }
  if (fromYmd > toYmd) throw new ReportRangeError("INVERTED");
  const days = diffDays(fromYmd, toYmd) + 1;
  if (days > MAX_RANGE_DAYS) throw new ReportRangeError("TOO_LONG");

  return {
    preset,
    fromYmd,
    toYmd,
    from: parseShopDateTime(fromYmd, "00:00", tz),
    toExclusive: parseShopDateTime(addDaysYmd(toYmd, 1), "00:00", tz),
    days,
    timeZone: tz,
  };
}

// ── buckets ────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

export function pickGranularity(days: number): Granularity {
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

/** Fecha local del taller (YYYY-MM-DD) de un instante. */
export function localYmd(date: Date, timeZone: string): string {
  return todayYmd(date, timeZone);
}

export function bucketKey(ymd: string, granularity: Granularity): string {
  if (granularity === "day") return ymd;
  if (granularity === "month") return ymd.slice(0, 7);
  const p = parseYmd(ymd)!;
  const dow = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; // lunes = 0
  return addDaysYmd(ymd, -dow);
}

export interface SeriesPoint {
  key: string;
  count: number;
  total: number;
}

/** Serie continua (rellena huecos con 0) para un rango y granularidad. */
export function buildSeries(
  rows: { at: Date; amount: Decimal.Value }[],
  range: Pick<ResolvedRange, "fromYmd" | "toYmd" | "timeZone">,
  granularity: Granularity
): SeriesPoint[] {
  const acc = new Map<string, { count: number; total: Decimal }>();
  for (let d = range.fromYmd; d <= range.toYmd; d = addDaysYmd(d, 1)) {
    const k = bucketKey(d, granularity);
    if (!acc.has(k)) acc.set(k, { count: 0, total: new Decimal(0) });
  }
  for (const r of rows) {
    const k = bucketKey(localYmd(r.at, range.timeZone), granularity);
    const cur = acc.get(k) ?? { count: 0, total: new Decimal(0) };
    cur.count += 1;
    cur.total = cur.total.plus(r.amount);
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({ key, count: v.count, total: v.total.toDecimalPlaces(2).toNumber() }));
}

// ── antigüedad de saldos ───────────────────────────────────

export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Días de atraso respecto al vencimiento (o a la emisión si no hay vencimiento). ≤0 = al corriente. */
export function daysPastDue(ref: { dueAt: Date | null; issuedAt: Date }, asOf: Date, timeZone: string): number {
  const due = localYmd(ref.dueAt ?? ref.issuedAt, timeZone);
  return diffDays(due, localYmd(asOf, timeZone));
}

export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 0) return "current";
  if (daysLate <= 30) return "d1_30";
  if (daysLate <= 60) return "d31_60";
  if (daysLate <= 90) return "d61_90";
  return "d90plus";
}

// ── CSV ────────────────────────────────────────────────────

/** Neutraliza inyección de fórmulas en hojas de cálculo (=, +, -, @, tab, CR al inicio de texto). */
function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM (Excel abre bien acentos/UTF-8) y saltos CRLF. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function money(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
