import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";

/**
 * Analytics de visitas de primera parte, sin cookies — mismo enfoque que
 * Montreal Spider Co (src/lib/data/analytics.ts): visitorHash es un hash
 * unidireccional de IP+UA salado por día, nunca se guarda IP cruda.
 */

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|pingdom|uptimerobot|headlesschrome|lighthouse|ahrefsbot|semrushbot|mj12bot|dotbot/i;

function dailySalt(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashVisitor(ip: string, ua: string): string {
  return crypto.createHash("sha256").update(`${dailySalt()}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

function deviceFromUA(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function browserFromUA(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\/|crios\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Other";
}

export interface TrackPageViewInput {
  path: string;
  locale: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  shopSlug: string;
  ip: string;
  userAgent: string;
  country: string;
}

export async function trackPageView(input: TrackPageViewInput): Promise<void> {
  if (BOT_UA.test(input.userAgent)) return;
  if (input.path.startsWith("/admin") || input.path.startsWith("/platform")) return;

  let referrerHost = "";
  if (input.referrer) {
    try {
      const url = new URL(input.referrer);
      const host = url.hostname.replace(/^www\./, "");
      const ownHost = new URL(getAppUrl()).hostname.replace(/^www\./, "");
      if (host !== ownHost) referrerHost = host;
    } catch {
      // referrer no parseable — se ignora
    }
  }

  try {
    const shop = input.shopSlug ? await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } }) : null;
    await db.pageView.create({
      data: {
        path: input.path.slice(0, 300),
        locale: input.locale === "fr" ? "fr" : "en",
        referrerHost: referrerHost.slice(0, 200),
        utmSource: input.utmSource.slice(0, 100),
        utmMedium: input.utmMedium.slice(0, 100),
        utmCampaign: input.utmCampaign.slice(0, 100),
        device: deviceFromUA(input.userAgent),
        browser: browserFromUA(input.userAgent),
        country: /^[A-Za-z]{2}$/.test(input.country) ? input.country.toUpperCase() : "",
        shopSlug: input.shopSlug.slice(0, 100),
        shopId: shop?.id,
        visitorHash: hashVisitor(input.ip, input.userAgent),
      },
    });
  } catch (e) {
    console.error("[platform/analytics] trackPageView falló:", e);
  }
}

export interface HourlyPoint {
  hour: string; // "2026-09-19T14:00"
  views: number;
  uniques: number;
}

/** Últimas 24 horas, en bloques de una hora — para el dashboard "visitas cada 24 horas". */
export async function getLast24HoursSeries(): Promise<HourlyPoint[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.$queryRaw<{ hour: Date; views: bigint; uniques: bigint }[]>`
    SELECT date_trunc('hour', "createdAt") AS hour,
           COUNT(*)::bigint AS views,
           COUNT(DISTINCT "visitorHash")::bigint AS uniques
    FROM "garageos"."PageView"
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const byHour = new Map(rows.map((r) => [r.hour.toISOString().slice(0, 13), r]));

  const series: HourlyPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - i);
    const key = d.toISOString().slice(0, 13);
    const row = byHour.get(key);
    series.push({ hour: `${key}:00`, views: row ? Number(row.views) : 0, uniques: row ? Number(row.uniques) : 0 });
  }
  return series;
}

export interface DailyPoint {
  date: string;
  views: number;
  uniques: number;
}

export async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const rows = await db.$queryRaw<{ day: Date; views: bigint; uniques: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day,
           COUNT(*)::bigint AS views,
           COUNT(DISTINCT "visitorHash")::bigint AS uniques
    FROM "garageos"."PageView"
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));

  const series: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    series.push({ date: key, views: row ? Number(row.views) : 0, uniques: row ? Number(row.uniques) : 0 });
  }
  return series;
}

export interface RangeBreakdown {
  totals: { views: number; uniques: number };
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  devices: { device: string; views: number }[];
  countries: { country: string; views: number }[];
  browsers: { browser: string; views: number }[];
  topShops: { shopSlug: string; views: number }[];
}

export async function getRangeBreakdown(days: number): Promise<RangeBreakdown> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [totalsRow, topPages, topReferrers, devices, countries, browsers, topShops] = await Promise.all([
    db.$queryRaw<{ views: bigint; uniques: bigint }[]>`
      SELECT COUNT(*)::bigint AS views, COUNT(DISTINCT "visitorHash")::bigint AS uniques
      FROM "garageos"."PageView" WHERE "createdAt" >= ${since}
    `,
    db.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    db.pageView.groupBy({
      by: ["referrerHost"],
      where: { createdAt: { gte: since }, referrerHost: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { referrerHost: "desc" } },
      take: 10,
    }),
    db.pageView.groupBy({
      by: ["device"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { device: "desc" } },
    }),
    db.pageView.groupBy({
      by: ["country"],
      where: { createdAt: { gte: since }, country: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    }),
    db.pageView.groupBy({
      by: ["browser"],
      where: { createdAt: { gte: since }, browser: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { browser: "desc" } },
    }),
    db.pageView.groupBy({
      by: ["shopSlug"],
      where: { createdAt: { gte: since }, shopSlug: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { shopSlug: "desc" } },
      take: 10,
    }),
  ]);

  return {
    totals: { views: Number(totalsRow[0]?.views ?? 0), uniques: Number(totalsRow[0]?.uniques ?? 0) },
    topPages: topPages.map((r) => ({ path: r.path, views: r._count._all })),
    topReferrers: topReferrers.map((r) => ({ referrer: r.referrerHost || "Directo", views: r._count._all })),
    devices: devices.map((r) => ({ device: r.device, views: r._count._all })),
    countries: countries.map((r) => ({ country: r.country, views: r._count._all })),
    browsers: browsers.map((r) => ({ browser: r.browser, views: r._count._all })),
    topShops: topShops.map((r) => ({ shopSlug: r.shopSlug, views: r._count._all })),
  };
}
