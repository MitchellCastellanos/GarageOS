/**
 * App-wide constants. GarageOS is multi-tenant: name, logo, contact emails,
 * slug and timezone are per-shop data on the `Shop` record, not global
 * config — see docs/domain-model.md. Nothing here may hardcode a shop.
 */
export const APP_NAME = "GarageOS";
export const DEFAULT_TIMEZONE = "America/Montreal";

export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function bookingPublicPath(slug: string): string {
  return `/book/${slug}`;
}

export function bookingPublicUrl(slug: string): string {
  return `${getAppUrl()}${bookingPublicPath(slug)}`;
}

/**
 * Dominio raíz que GarageOS ya controla (ej. "garageos.com"), usado para el
 * fallback `{slug}.garageos.com` cuando un taller no tiene dominio propio.
 * Sin esta variable, ese fallback queda desactivado y solo existe /book/[slug].
 */
export function getRootDomain(): string | null {
  const raw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  return raw || null;
}

export function bookingSubdomainUrl(slug: string): string | null {
  const root = getRootDomain();
  if (!root) return null;
  const protocol = getAppUrl().startsWith("https") ? "https" : "http";
  return `${protocol}://${slug}.${root}`;
}
