// Pure helpers for the Analytics v2 panels in /platform/analytics (no database, no server-only): date-range parsing, labels and
// minimum-cell-size folding (docs/analytics-v2-contract.md §7 and §10.3). Tested in tests/analytics-panels.test.ts.

/** Aggregate buckets with fewer than this many visits/events are folded into one "Other" row (re-identification guard, contract §10.3). */
export const MIN_CELL_SIZE = 5;

/** Rows stored before Analytics v2 classification have channel/pageType = ''. They are never guessed. */
export const CLASSIFICATION_START = "2026-10-23";
export const NOT_CLASSIFIED_LABEL = `Sin clasificar (antes del ${CLASSIFICATION_START})`;
export const OTHER_LABEL = `Otros (<${MIN_CELL_SIZE})`;

export const PRESET_DAYS = [7, 30, 90] as const;
export const DEFAULT_DAYS = 30;
/** Retention is 13 months, so a wider window can never contain more data. */
export const MAX_RANGE_DAYS = 400;

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD as a real UTC calendar day (rejects 2026-02-30, 2026-13-01, extra characters). */
export function parseIsoDay(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = ISO_DAY.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface AnalyticsRange {
  /** Inclusive start (UTC midnight of the first day). */
  from: Date;
  /** EXCLUSIVE end (UTC midnight after the last day). */
  to: Date;
  /** First and last day, YYYY-MM-DD (UTC). */
  fromDay: string;
  toDay: string;
  /** Number of calendar days covered. */
  days: number;
  kind: "preset" | "custom";
  /** Set when a custom range was supplied but rejected (the default range is used instead). */
  error?: "invalid" | "order" | "future" | "too_long";
}

function presetRange(days: number, today: Date): AnalyticsRange {
  const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(lastDay.getTime() - (days - 1) * DAY_MS);
  const to = new Date(lastDay.getTime() + DAY_MS);
  return { from, to, fromDay: isoDay(from), toDay: isoDay(lastDay), days, kind: "preset" };
}

/**
 * Query-string -> range. Presets 7/30/90 days (default 30, ending today UTC); a custom `from`+`to` (inclusive days) must be real dates,
 * from <= to, not after today, at most MAX_RANGE_DAYS long. Anything else falls back to the default and reports why.
 */
export function parseRange(params: { days?: unknown; from?: unknown; to?: unknown }, now: Date = new Date()): AnalyticsRange {
  const fromRaw = params.from;
  const toRaw = params.to;
  const hasCustom = (typeof fromRaw === "string" && fromRaw !== "") || (typeof toRaw === "string" && toRaw !== "");
  if (hasCustom) {
    const f = parseIsoDay(fromRaw);
    const t = parseIsoDay(toRaw);
    const fallback = presetRange(DEFAULT_DAYS, now);
    if (!f || !t) return { ...fallback, error: "invalid" };
    if (f.getTime() > t.getTime()) return { ...fallback, error: "order" };
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (t.getTime() > todayMs) return { ...fallback, error: "future" };
    const days = Math.round((t.getTime() - f.getTime()) / DAY_MS) + 1;
    if (days > MAX_RANGE_DAYS) return { ...fallback, error: "too_long" };
    return { from: f, to: new Date(t.getTime() + DAY_MS), fromDay: isoDay(f), toDay: isoDay(t), days, kind: "custom" };
  }
  const n = typeof params.days === "string" ? Number(params.days) : typeof params.days === "number" ? params.days : NaN;
  const days = (PRESET_DAYS as readonly number[]).includes(n) ? n : DEFAULT_DAYS;
  return presetRange(days, now);
}

export interface CountRow {
  key: string;
  count: number;
}

/**
 * Minimum cell size: every row with fewer than `min` is merged into a single OTHER row (key "__other__"), appended last when it exists.
 * The input is not mutated; rows keep their order (callers sort by count desc first).
 */
export const OTHER_KEY = "__other__";
export function foldSmallCells(rows: CountRow[], min: number = MIN_CELL_SIZE): CountRow[] {
  const kept: CountRow[] = [];
  let other = 0;
  let folded = 0;
  for (const r of rows) {
    if (r.count >= min) kept.push({ ...r });
    else if (r.count > 0) {
      other += r.count;
      folded += 1;
    }
  }
  if (folded > 0) kept.push({ key: OTHER_KEY, count: other });
  return kept;
}

/** '' (historical, before classification) -> NOT_CLASSIFIED_LABEL; the folded bucket -> OTHER_LABEL; known keys through `names`. */
export function displayKey(key: string, names: Record<string, string> = {}): string {
  if (key === OTHER_KEY) return OTHER_LABEL;
  if (key === "") return NOT_CLASSIFIED_LABEL;
  return names[key] ?? key;
}

export const CHANNEL_NAMES: Record<string, string> = {
  direct: "Directo",
  organic_search: "Búsqueda orgánica",
  social: "Redes sociales",
  email: "Correo",
  referral: "Referido (otro sitio)",
  campaign: "Campaña (UTM)",
};

export const PAGE_TYPE_NAMES: Record<string, string> = {
  home: "Inicio",
  commercial: "Comercial (producto, precios, demo)",
  help: "Ayuda y recursos",
  blog: "Blog",
  legal: "Legal",
  watch: "Video (/watch)",
  other: "Otras",
};

export const LOCALE_NAMES: Record<string, string> = { en: "Inglés (EN)", fr: "Francés (FR)" };

export const CTA_NAMES: Record<string, string> = {
  demo_book: "Reservar demo",
  demo_interactive: "Demo interactiva",
  signup_start: "Iniciar registro / prueba",
  plan_select_core: "Plan Core",
  plan_select_pro: "Plan Pro",
  plan_select_complete: "Plan Complete",
  pricing_view: "Ver precios",
  watch_play: "Reproducir video",
};

/** Clicks per 100 page views, one decimal; "-" when there are no views. */
export function ratePer100(clicks: number, views: number): string {
  if (!(views > 0)) return "-";
  return (Math.round((clicks / views) * 1000) / 10).toFixed(1);
}

export interface FunnelRow {
  ctaId: string;
  path: string;
  views: number;
  clicks: number;
}

/** Funnel rows with fewer than `min` clicks are folded per CTA (path hidden). Sorted by clicks desc. */
export function foldFunnel(rows: FunnelRow[], min: number = MIN_CELL_SIZE): FunnelRow[] {
  const kept: FunnelRow[] = [];
  const other = new Map<string, FunnelRow>();
  for (const r of rows) {
    if (r.clicks >= min) kept.push({ ...r });
    else if (r.clicks > 0) {
      const o = other.get(r.ctaId) ?? { ctaId: r.ctaId, path: OTHER_KEY, views: 0, clicks: 0 };
      o.views += r.views;
      o.clicks += r.clicks;
      other.set(r.ctaId, o);
    }
  }
  kept.sort((a, b) => b.clicks - a.clicks || a.ctaId.localeCompare(b.ctaId) || a.path.localeCompare(b.path));
  return [...kept, ...[...other.values()].sort((a, b) => b.clicks - a.clicks)];
}
