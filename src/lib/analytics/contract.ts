// Analytics v2 event contract (docs/analytics-v2-contract.md): pure, side-effect-free vocabulary and classification rules.
// Nothing here touches the database or the network, so it is safe to import from the server route, the client beacon and tests.
//
// What this module is NOT: it does not store anything, does not identify anyone, and is separate from the sales-video attribution
// (CrmVideoEvent / CrmVideoLink), which already measures outreach videos for known prospects and must not be duplicated.
import { looksLikeToken } from "@/lib/privacy/private-paths";

/** The only call-to-action ids the endpoint accepts (contract §2). Anything else is dropped. */
export const CTA_IDS = [
  "demo_book",
  "demo_interactive",
  "signup_start",
  "plan_select_core",
  "plan_select_pro",
  "plan_select_complete",
  "pricing_view",
  "watch_play",
] as const;
export type CtaId = (typeof CTA_IDS)[number];

export function isCtaId(value: unknown): value is CtaId {
  return typeof value === "string" && (CTA_IDS as readonly string[]).includes(value);
}

export const CHANNELS = ["direct", "organic_search", "social", "email", "referral", "campaign"] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAGE_TYPES = ["home", "commercial", "help", "blog", "legal", "watch", "other"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

const SEARCH_HOSTS = /^(www\.)?(google|bing|duckduckgo|yahoo|ecosia|qwant)\.[a-z.]+$|^search\.brave\.com$/;
const SOCIAL_HOSTS = /^(www\.|m\.|l\.|lm\.)?(facebook|instagram|linkedin|twitter|x|youtube|reddit|tiktok|t)\.(com|co)$|^lnkd\.in$|^youtu\.be$|^t\.co$/;

/**
 * Channel of a visit, derived server-side from data the request already carries (contract §2).
 * `campaign` wins when any UTM value survived sanitisation; `utm_medium=email` refines it to `email`.
 * A referrer on the site's own host is never a channel (internal navigation → direct).
 */
export function classifyChannel(input: { utmSource?: string; utmMedium?: string; utmCampaign?: string; referrerHost?: string; ownHost?: string }): Channel {
  const medium = (input.utmMedium ?? "").toLowerCase();
  const hasUtm = Boolean(input.utmSource || input.utmMedium || input.utmCampaign);
  if (hasUtm) return medium === "email" || medium === "newsletter" ? "email" : "campaign";
  const host = (input.referrerHost ?? "").toLowerCase();
  if (!host || (input.ownHost && host === input.ownHost.toLowerCase())) return "direct";
  if (SEARCH_HOSTS.test(host)) return "organic_search";
  if (SOCIAL_HOSTS.test(host)) return "social";
  return "referral";
}

const FR_COMMERCIAL = new Set(["produit", "fonctionnalites", "tarifs", "integrations", "demo", "commencer", "demarrage-rapide", "a-propos", "contact"]);
const EN_COMMERCIAL = new Set(["product", "features", "pricing", "integrations", "demo", "get-started", "quick-start", "about", "contact"]);

/** Page type from a NORMALISED public path (the same value that is stored). */
export function classifyPageType(path: string): PageType {
  const clean = path.split(/[?#]/)[0].toLowerCase();
  const segs = clean.split("/").filter(Boolean);
  if (segs.length === 0) return "home";
  const fr = segs[0] === "fr";
  const parts = fr ? segs.slice(1) : segs;
  if (parts.length === 0) return "home";
  const first = parts[0];
  if (first === "watch") return "watch";
  if (first === "blog") return "blog";
  if (first === "help" || first === "aide" || first === "resources" || first === "ressources" || first === "guides") return "help";
  if (first === "privacy" || first === "terms" || first === "confidentialite" || first === "conditions") return "legal";
  if ((fr ? FR_COMMERCIAL : EN_COMMERCIAL).has(first)) return "commercial";
  return "other";
}

// Contract §10.4 — strict allowlist for utm_*: lower-case, starts alphanumeric, short, no personal-looking or token-like shapes.
const UTM_SHAPE = /^[a-z0-9][a-z0-9_.\-+ ]{0,39}$/;
const LONG_DIGITS = /\d{7,}/;
const PHONE_SHAPE = /\d{3}[-. ]?\d{3}[-. ]?\d{4}/;
const LONG_URLSAFE_RUN = /[a-z0-9_-]{21,}/;

/** Returns the lower-cased value when it satisfies the contract allowlist, otherwise "". Stricter than sanitizeCampaignValue. */
export function strictCampaignValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  if (!UTM_SHAPE.test(v)) return "";
  if (LONG_DIGITS.test(v) || PHONE_SHAPE.test(v) || LONG_URLSAFE_RUN.test(v) || looksLikeToken(v) || v.includes("@") || v.includes("%")) return "";
  return v;
}

const FROM_SHAPE = /^[a-z]+:[a-z0-9-]{1,40}$/;

/** Parses the hand-off parameters of a CTA link to signup/demo (`?from=<pageType>:<slug>&lang=<en|fr>`); invalid parts are dropped. */
export function parseHandoff(params: { from?: string | null; lang?: string | null }): { pageType: PageType | ""; slug: string; lang: "en" | "fr" | "" } {
  const lang = params.lang === "en" || params.lang === "fr" ? params.lang : "";
  const from = (params.from ?? "").toLowerCase();
  if (!FROM_SHAPE.test(from)) return { pageType: "", slug: "", lang };
  const [type, slug] = from.split(":");
  const pageType = (PAGE_TYPES as readonly string[]).includes(type) ? (type as PageType) : "";
  return pageType ? { pageType, slug, lang } : { pageType: "", slug: "", lang };
}
