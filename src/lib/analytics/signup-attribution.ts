// Signup attribution (Analytics v2, contract §4.3 / §10.5): PURE validation of the optional hand-off a CTA link puts in the signup URL.
// Nothing here touches the database, the network or storage. Every value that survives is an allowlisted token or a validated public
// pathname; anything else is dropped, and a signup with no (or only invalid) hand-off simply records a "direct" first touch.
import { classifyChannel, classifyPageType, isCtaId, parseHandoff, strictCampaignValue, type CtaId, type PageType } from "@/lib/analytics/contract";
import { isTrackablePath, normalizeForStorage } from "@/lib/privacy/private-paths";

/** Privacy gate: collection is OFF unless the server env ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED is exactly "true" (docs/analytics-v2-contract.md §12). */
export function signupAttributionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED === "true";
}

/** Query parameters a CTA link to signup may carry. `from`/`lang` are the contract hand-off; `lp` and `cta` are additive and optional. */
export const HANDOFF_QUERY = ["from", "lang", "lp", "cta", "utm_source", "utm_medium", "utm_campaign"] as const;
export type HandoffQueryKey = (typeof HANDOFF_QUERY)[number];
export type HandoffParams = Partial<Record<HandoffQueryKey, string>>;

const HOST_SHAPE = /^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$/;

function firstString(v: unknown): string {
  if (Array.isArray(v)) return firstString(v[0]);
  return typeof v === "string" ? v : "";
}

function cleanLandingPath(raw: string): string {
  if (!raw || raw.length > 300 || !raw.startsWith("/")) return "";
  const pathOnly = raw.split(/[?#]/)[0];
  if (!isTrackablePath(pathOnly)) return "";
  return normalizeForStorage(pathOnly) ?? "";
}

/**
 * Validates raw query/form values and returns ONLY the surviving, normalised hand-off parameters (so the signup page can echo them into hidden
 * inputs without echoing anything unvalidated). Unknown keys are ignored.
 */
export function sanitizeHandoff(raw: Record<string, unknown>): HandoffParams {
  const out: HandoffParams = {};
  const h = parseHandoff({ from: firstString(raw.from), lang: firstString(raw.lang) });
  if (h.pageType) out.from = `${h.pageType}:${h.slug}`;
  if (h.lang) out.lang = h.lang;
  const lp = cleanLandingPath(firstString(raw.lp));
  if (lp) out.lp = lp;
  const cta = firstString(raw.cta);
  if (isCtaId(cta)) out.cta = cta;
  for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const v = strictCampaignValue(firstString(raw[k]));
    if (v) out[k] = v;
  }
  return out;
}

export interface SignupAttributionRecord {
  landingPath: string;
  locale: "en" | "fr";
  channel: string;
  pageType: PageType | "";
  ctaId: CtaId | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrerHost: string;
}

/** Host only, lower-case, `www.` and the site's own host dropped; anything that is not a plain hostname becomes "". */
export function cleanReferrerHost(raw: unknown, ownHost?: string): string {
  if (typeof raw !== "string") return "";
  const host = raw.trim().toLowerCase().replace(/^www\./, "");
  if (!HOST_SHAPE.test(host) || host.includes("..")) return "";
  if (ownHost && host === ownHost.toLowerCase().replace(/^www\./, "")) return "";
  return host;
}

/**
 * The record to store for a signup. Never throws, never returns null: with no valid hand-off it is a "direct" first touch (channel `direct`,
 * everything else empty). `formLocale` is the language of the signup form, used when the hand-off has no valid `lang`.
 */
export function buildSignupAttribution(raw: Record<string, unknown>, opts: { formLocale?: string; referrerHost?: unknown; ownHost?: string } = {}): SignupAttributionRecord {
  const h = sanitizeHandoff(raw);
  const parsed = parseHandoff({ from: h.from, lang: h.lang });
  const landingPath = h.lp ?? "";
  const pageType: PageType | "" = parsed.pageType || (landingPath ? classifyPageType(landingPath) : "");
  const locale: "en" | "fr" = parsed.lang || (opts.formLocale === "fr" ? "fr" : "en");
  const utmSource = h.utm_source ?? "";
  const utmMedium = h.utm_medium ?? "";
  const utmCampaign = h.utm_campaign ?? "";
  const referrerHost = cleanReferrerHost(opts.referrerHost, opts.ownHost);
  return {
    landingPath,
    locale,
    channel: classifyChannel({ utmSource, utmMedium, utmCampaign, referrerHost }),
    pageType,
    ctaId: h.cta && isCtaId(h.cta) ? h.cta : null,
    utmSource,
    utmMedium,
    utmCampaign,
    referrerHost,
  };
}

/**
 * Builds a CTA link to signup carrying the hand-off. `landingPath` must be the page's own public pathname. Only the contract tokens are added;
 * nothing is stored on the client.
 */
export function signupHandoffHref(base: string, opts: { pageType: PageType; slug: string; lang: "en" | "fr"; landingPath: string; ctaId?: CtaId }): string {
  const p = new URLSearchParams();
  const clean = sanitizeHandoff({ from: `${opts.pageType}:${opts.slug}`, lang: opts.lang, lp: opts.landingPath, cta: opts.ctaId });
  for (const k of HANDOFF_QUERY) if (clean[k]) p.set(k, clean[k]!);
  const qs = p.toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}
