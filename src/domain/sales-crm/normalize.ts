const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const COMPANY_SUFFIX = /\b(inc|incorporated|ltd|ltee|limitee|limited|enr|enrg|senc|llc|corp|corporation|co|cie|company)\b\.?/g;

/** Accent/punctuation/suffix-insensitive business name used for duplicate detection. */
export function normalizeBusinessName(name: string): string {
  return stripAccents(name).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(COMPANY_SUFFIX, " ").replace(/\s+/g, " ").trim();
}
export function normalizeCity(city: string | null | undefined): string {
  return stripAccents(city ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function normalizeEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v || null;
}
/** Digits only; for 11 digits starting with 1 (North American) the country code is dropped. null if too short to match on. */
export function phoneDigits(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 10 ? d : null;
}
/** Hostname without protocol/www/path ("https://www.Garage.ca/x" → "garage.ca"); null if not a plausible host. */
export function websiteDomain(website: string | null | undefined): string | null {
  const raw = (website ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch { return null; }
}
/** Canonical stored URL: https scheme default, no credentials. null if invalid. */
export function normalizeWebsite(website: string | null | undefined): string | null {
  const raw = (website ?? "").trim();
  if (!raw) return null;
  const host = websiteDomain(raw);
  if (!host) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.username = ""; url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}
