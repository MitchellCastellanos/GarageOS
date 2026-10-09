// Reusable marketing videos — pure. A video is only ever shown/sent when it is PUBLISHED, eligible for the placement and its URL
// is a real https link. Anything else resolves to null so callers fall back safely (no placeholder or broken link reaches a prospect).
export type VideoPlacement = "website" | "outreach";
export interface VideoRow { key: string; language: "EN" | "FR" | "UNKNOWN"; title: string; url: string; thumbnailUrl: string | null; status: "DRAFT" | "PUBLISHED"; allowWebsite: boolean; allowOutreach: boolean }

export const DEFAULT_OUTREACH_VIDEO_KEY = "product-overview";
export const VIDEO_KEY_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

const BLOCKED_HOSTS = /(^|\.)(example\.(com|org|net)|localhost|invalid|test|local)$/i;
const PLACEHOLDER = /(\{\{|\}\}|<|>|\bTODO\b|\bTBD\b|placeholder|your[-_ ]?video|xxxx)/i;

/** A usable public https URL: no credentials, no private/placeholder host, no template leftovers. Returns the normalised URL or null. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 500 || PLACEHOLDER.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || BLOCKED_HOSTS.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
    return u.toString();
  } catch { return null; }
}

export function canPublish(v: { title: string; url: string }): boolean {
  return v.title.trim().length >= 2 && safeHttpsUrl(v.url) !== null;
}

/** The video to use for (key, language, placement), or null → caller falls back. Never crosses languages. */
export function pickVideo(rows: VideoRow[], key: string, language: "EN" | "FR", placement: VideoPlacement): (VideoRow & { url: string; thumbnailUrl: string | null }) | null {
  const row = rows.find((r) => r.key === key && r.language === language && r.status === "PUBLISHED" && (placement === "website" ? r.allowWebsite : r.allowOutreach));
  if (!row) return null;
  const url = safeHttpsUrl(row.url);
  if (!url || row.title.trim().length < 2) return null;
  return { ...row, url, thumbnailUrl: safeHttpsUrl(row.thumbnailUrl) };
}

/** One localized call-to-action line for plain-text templates (`{{video.cta}}`). */
export function videoCtaText(language: "EN" | "FR", title: string, url: string): string {
  return language === "FR" ? `Pour un aperçu rapide, regardez « ${title.trim()} » : ${url}` : `For a quick overview, watch “${title.trim()}”: ${url}`;
}
