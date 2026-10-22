import { getAppUrl } from "@/config/app";
import { getSiteUrl } from "@/lib/seo/site";
import { isTrackablePath, normalizeForStorage } from "@/lib/privacy/private-paths";

/**
 * Pure request guards for POST /api/track (SEC-06). No database, no logging, nothing from the payload is ever echoed.
 * Every failure is answered with the same silent 204 by the route, so none of these reasons is observable by a client.
 */

export const TRACK_MAX_BODY_BYTES = 2048;
export const TRACK_MAX_PATH = 300;

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Same-site check. With an `Origin` header: its host must equal the request `Host` or the configured site/app host
 * (and `Sec-Fetch-Site`, when sent, must not say cross-site). Without `Origin` (some same-origin requests omit it),
 * only an explicit `Sec-Fetch-Site: same-origin | same-site | none` is accepted; a request with neither is rejected.
 */
export function isAllowedTrackOrigin(headers: { get(name: string): string | null }): boolean {
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
  const origin = headers.get("origin")?.trim();
  if (origin) {
    if (fetchSite === "cross-site") return false;
    const originHost = hostOf(origin);
    if (!originHost) return false; // "null" or garbage
    const allowed = new Set<string>();
    const requestHost = headers.get("host")?.trim().toLowerCase();
    if (requestHost) allowed.add(requestHost);
    for (const base of [getSiteUrl(), getAppUrl()]) {
      const h = hostOf(base);
      if (h) allowed.add(h);
    }
    return allowed.has(originHost);
  }
  return SAFE_FETCH_SITES.has(fetchSite);
}

/** Reads at most `maxBytes` of the body. Returns null if it is larger (the stream is cancelled) or unreadable. */
export async function readBoundedBody(req: Request, maxBytes: number = TRACK_MAX_BODY_BYTES): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0 || n > maxBytes) return null;
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface TrackPayload {
  path: string;
  locale: "en" | "fr";
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  shopSlug: string;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Strict validation of the parsed JSON. Unknown fields are ignored. Returns null (drop silently) when the path is not a
 * string <= 300 chars, is not trackable (private/token/ambiguous) or does not normalise, or the locale is not en/fr.
 * A missing locale defaults to "en".
 */
export function parseTrackPayload(body: unknown): TrackPayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.path !== "string" || b.path.length === 0 || b.path.length > TRACK_MAX_PATH) return null;
  if (!isTrackablePath(b.path)) return null;
  const path = normalizeForStorage(b.path);
  if (!path) return null;
  let locale: "en" | "fr" = "en";
  if (b.locale !== undefined) {
    if (b.locale !== "en" && b.locale !== "fr") return null;
    locale = b.locale;
  }
  const slug = str(b.shopSlug, 80);
  return {
    path,
    locale,
    referrer: str(b.referrer, 2000),
    utmSource: str(b.utmSource, 200),
    utmMedium: str(b.utmMedium, 200),
    utmCampaign: str(b.utmCampaign, 200),
    shopSlug: /^[a-z0-9-]*$/i.test(slug) ? slug : "",
  };
}
