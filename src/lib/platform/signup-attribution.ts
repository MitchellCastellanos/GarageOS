import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import { requireSuperAdmin } from "@/lib/permissions";
import { isTrackingOptOut } from "@/lib/privacy/opt-out";
import {
  buildSignupAttribution,
  signupAttributionEnabled,
  type SignupAttributionRecord,
} from "@/lib/analytics/signup-attribution";

type Writer = Pick<Prisma.TransactionClient, "signupAttribution">;

/**
 * First touch wins: INSERT ... ON CONFLICT ("shopId") DO NOTHING (Prisma `createMany({ skipDuplicates })`). A second call for the same shop is a
 * no-op, the row is never updated. Returns true when a row was inserted.
 */
export async function insertSignupAttribution(client: Writer, shopId: string, record: SignupAttributionRecord): Promise<boolean> {
  const res = await client.signupAttribution.createMany({ data: [{ shopId, ...record }], skipDuplicates: true });
  return res.count === 1;
}

export interface CaptureInput {
  shopId: string;
  /** Raw hand-off fields (query-style names: from, lang, lp, cta, utm_*), already read from the signup form. Re-validated here. */
  fields: Record<string, unknown>;
  /** Host from the browser's document.referrer (host only); re-validated here. */
  referrerHost?: unknown;
  formLocale?: string;
  headers: { get(name: string): string | null };
}

/**
 * Called by the signup route AFTER the shop transaction has committed. It can never fail the signup: every error (including a missing table
 * before the migration is applied) is caught and logged by error class only, with no payload. No-op when the privacy flag is off or the
 * visitor sent DNT/GPC.
 */
export async function captureSignupAttribution(input: CaptureInput, env: NodeJS.ProcessEnv = process.env, client: Writer = db): Promise<boolean> {
  try {
    if (!signupAttributionEnabled(env)) return false;
    if (isTrackingOptOut(input.headers)) return false;
    let ownHost: string | undefined;
    try {
      ownHost = new URL(getAppUrl()).hostname;
    } catch {
      ownHost = undefined;
    }
    const record = buildSignupAttribution(input.fields, { formLocale: input.formLocale, referrerHost: input.referrerHost, ownHost });
    return await insertSignupAttribution(client, input.shopId, record);
  } catch (err) {
    console.error("[signup-attribution] not recorded:", err instanceof Error ? err.name : "unknown");
    return false;
  }
}

const MIN_CELL = 5;

function fold(rows: { key: string; count: number }[]): { key: string; count: number }[] {
  const kept = rows.filter((r) => r.count >= MIN_CELL);
  const other = rows.filter((r) => r.count > 0 && r.count < MIN_CELL).reduce((a, r) => a + r.count, 0);
  return other > 0 ? [...kept, { key: "__other__", count: other }] : kept;
}

export interface SignupAttributionSummary {
  total: number;
  byChannel: { key: string; count: number }[];
  byPageType: { key: string; count: number }[];
  byLocale: { key: string; count: number }[];
  byCta: { key: string; count: number }[];
}

/**
 * Aggregate counts for the Super Admin panel. SUPER ADMIN ONLY: `requireSuperAdmin()` runs before any query (a shop Owner/Mechanic/Viewer or an
 * anonymous caller is redirected away and nothing is read). Never returns a row, a shop id or a landing path: only counts, with buckets under
 * the minimum cell size of 5 folded into "__other__" (contract §10.3).
 */
export async function getSignupAttributionSummary(range?: { from: Date; to: Date }): Promise<SignupAttributionSummary> {
  await requireSuperAdmin();
  const where = range ? { createdAt: { gte: range.from, lt: range.to } } : {};
  const [total, channel, pageType, locale, cta] = await Promise.all([
    db.signupAttribution.count({ where }),
    db.signupAttribution.groupBy({ by: ["channel"], where, _count: { _all: true } }),
    db.signupAttribution.groupBy({ by: ["pageType"], where, _count: { _all: true } }),
    db.signupAttribution.groupBy({ by: ["locale"], where, _count: { _all: true } }),
    db.signupAttribution.groupBy({ by: ["ctaId"], where, _count: { _all: true } }),
  ]);
  const rows = <T extends string>(g: { _count: { _all: number } }[], k: (x: never) => T) => fold(g.map((x) => ({ key: k(x as never), count: x._count._all })).sort((a, b) => b.count - a.count));
  return {
    total,
    byChannel: rows(channel, (x: { channel: string }) => x.channel),
    byPageType: rows(pageType, (x: { pageType: string }) => x.pageType),
    byLocale: rows(locale, (x: { locale: string }) => x.locale),
    byCta: rows(cta, (x: { ctaId: string | null }) => x.ctaId ?? ""),
  };
}
