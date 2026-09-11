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
