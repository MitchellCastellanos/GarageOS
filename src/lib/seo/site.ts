import { getAppUrl } from "@/config/app";
import { hreflangPaths } from "@/lib/seo/routes";

/**
 * Host autoritativo del sitio público (decisión D10). `garage-os.ca` redirige (308) a este host en Vercel, así
 * que ninguna canonical, og:url ni sitemap debe apuntar al apex.
 */
export const SITE_AUTHORITY_HOST = "www.garage-os.ca";

/** Origen público del sitio (sin barra final). Normaliza el apex al host autoritativo. */
export function getSiteUrl(): string {
  const raw = getAppUrl();
  try {
    const url = new URL(raw);
    if (url.hostname === "garage-os.ca") url.hostname = SITE_AUTHORITY_HOST;
    return url.origin;
  } catch {
    return raw;
  }
}

/** URL absoluta canónica de una ruta pública. Descarta query/hash y la barra final (salvo la raíz). */
export function canonicalUrl(path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  const normalized = clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
  return new URL(normalized.startsWith("/") ? normalized : `/${normalized}`, `${getSiteUrl()}/`).toString();
}

/** Pares hreflang absolutos (`en-CA`, `fr-CA`, `x-default`) de una ruta, o `undefined` si no hay equivalente real e indexable. */
export function alternatesFor(path: string): { "en-CA": string; "fr-CA": string; "x-default": string } | undefined {
  const paths = hreflangPaths(path);
  if (!paths) return undefined;
  return {
    "en-CA": canonicalUrl(paths["en-CA"]),
    "fr-CA": canonicalUrl(paths["fr-CA"]),
    "x-default": canonicalUrl(paths["x-default"]),
  };
}
