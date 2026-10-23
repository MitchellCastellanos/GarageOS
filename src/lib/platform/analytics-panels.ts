import "server-only";
import { db } from "@/lib/db";
import { foldFunnel, foldSmallCells, type AnalyticsRange, type CountRow, type FunnelRow } from "@/lib/platform/analytics-panels-core";

// Analytics v2 panels (aggregates only: no visitorHash, path-level or row-level visitor data ever leaves this module).
// Callers must already be authorised as Super Admin (the page calls requireSuperAdmin() first, exactly like the existing panels).
// All queries filter on "createdAt" (indexed) and, for the funnel, join on ("path", "createdAt") (indexed).


export interface PanelsData {
  totals: { views: number; uniques: number };
  channels: CountRow[];
  pageTypes: CountRow[];
  locales: CountRow[];
  /** True when AnalyticsEvent holds at least one row at all (any date). False => "collection is off" note. */
  hasAnyEvents: boolean;
  ctas: CountRow[];
  funnel: FunnelRow[];
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function groupPageViews(column: "channel" | "pageType" | "locale", r: AnalyticsRange): Promise<CountRow[]> {
  // Column names come from this closed union, never from input; each statement is spelled out because identifiers cannot be parameterised.
  const rows =
    column === "channel"
      ? await db.$queryRaw<{ k: string; n: bigint }[]>`SELECT "channel" AS k, COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to} GROUP BY 1 ORDER BY 2 DESC`
      : column === "pageType"
        ? await db.$queryRaw<{ k: string; n: bigint }[]>`SELECT "pageType" AS k, COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to} GROUP BY 1 ORDER BY 2 DESC`
        : await db.$queryRaw<{ k: string; n: bigint }[]>`SELECT "locale" AS k, COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to} GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((x) => ({ key: x.k, count: num(x.n) }));
}

/** Totals for the range. `uniques` = distinct DAILY pseudonymous hashes: a visitor seen on two days counts twice; it is not a count of people. */
export async function getRangeTotals(r: AnalyticsRange): Promise<{ views: number; uniques: number }> {
  const rows = await db.$queryRaw<{ views: bigint; uniques: bigint }[]>`
    SELECT COUNT(*)::bigint AS views, COUNT(DISTINCT "visitorHash")::bigint AS uniques
    FROM "garageos"."PageView" WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to}`;
  return { views: num(rows[0]?.views), uniques: num(rows[0]?.uniques) };
}

export async function getChannelBreakdown(r: AnalyticsRange): Promise<CountRow[]> {
  return foldSmallCells(await groupPageViews("channel", r));
}

export async function getPageTypeBreakdown(r: AnalyticsRange): Promise<CountRow[]> {
  return foldSmallCells(await groupPageViews("pageType", r));
}

/** EN/FR split. Only two possible values, so the small-cell rule is not applied (nothing to re-identify). */
export async function getLocaleSplit(r: AnalyticsRange): Promise<CountRow[]> {
  return groupPageViews("locale", r);
}

export async function hasAnyAnalyticsEvents(): Promise<boolean> {
  const rows = await db.$queryRaw<{ x: number }[]>`SELECT 1 AS x FROM "garageos"."AnalyticsEvent" LIMIT 1`;
  return rows.length > 0;
}

/** CTA click EVENTS by ctaId (not people), small cells folded. */
export async function getCtaBreakdown(r: AnalyticsRange): Promise<CountRow[]> {
  const rows = await db.$queryRaw<{ k: string; n: bigint }[]>`
    SELECT "ctaId" AS k, COUNT(*)::bigint AS n FROM "garageos"."AnalyticsEvent"
    WHERE "type" = 'CTA_CLICK' AND "createdAt" >= ${r.from} AND "createdAt" < ${r.to} GROUP BY 1 ORDER BY 2 DESC`;
  return foldSmallCells(rows.map((x) => ({ key: x.k, count: num(x.n) })));
}

/**
 * Page views -> CTA clicks, per (CTA, page). Only pages that have at least one recorded click for that CTA appear (the data has no
 * "CTA shown" signal), so rates are descriptive, not a conversion rate. Rows with fewer than MIN_CELL_SIZE clicks are folded per CTA.
 * Signup conversion is intentionally absent until SignupAttribution exists.
 */
export async function getCtaFunnel(r: AnalyticsRange, limit = 200): Promise<FunnelRow[]> {
  const rows = await db.$queryRaw<{ ctaId: string; path: string; clicks: bigint; views: bigint }[]>`
    WITH ev AS (
      SELECT "ctaId", "path", COUNT(*)::bigint AS clicks
      FROM "garageos"."AnalyticsEvent"
      WHERE "type" = 'CTA_CLICK' AND "createdAt" >= ${r.from} AND "createdAt" < ${r.to}
      GROUP BY 1, 2
      ORDER BY 3 DESC
      LIMIT ${limit}
    ), pv AS (
      SELECT "path", COUNT(*)::bigint AS views
      FROM "garageos"."PageView"
      WHERE "createdAt" >= ${r.from} AND "createdAt" < ${r.to} AND "path" IN (SELECT "path" FROM ev)
      GROUP BY 1
    )
    SELECT ev."ctaId", ev."path", ev.clicks, COALESCE(pv.views, 0)::bigint AS views
    FROM ev LEFT JOIN pv ON pv."path" = ev."path"`;
  return foldFunnel(rows.map((x) => ({ ctaId: x.ctaId, path: x.path, clicks: num(x.clicks), views: num(x.views) })));
}

export async function getAnalyticsPanels(r: AnalyticsRange): Promise<PanelsData> {
  const [totals, channels, pageTypes, locales, hasAnyEvents] = await Promise.all([
    getRangeTotals(r),
    getChannelBreakdown(r),
    getPageTypeBreakdown(r),
    getLocaleSplit(r),
    hasAnyAnalyticsEvents(),
  ]);
  const [ctas, funnel] = hasAnyEvents ? await Promise.all([getCtaBreakdown(r), getCtaFunnel(r)]) : [[], []];
  return { totals, channels, pageTypes, locales, hasAnyEvents, ctas, funnel };
}
