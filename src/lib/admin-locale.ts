export type AdminLocale = "es" | "en" | "fr";

export const ADMIN_LOCALES: { value: AdminLocale; label: string }[] = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
];

export const DEFAULT_ADMIN_LOCALE: AdminLocale = "es";

export function resolveAdminLocale(value: string | null | undefined): AdminLocale {
  const normalized = value?.toLowerCase();
  return normalized === "en" || normalized === "fr" ? normalized : DEFAULT_ADMIN_LOCALE;
}

export function adminLocaleToDb(locale: AdminLocale): "ES" | "EN" | "FR" {
  return locale.toUpperCase() as "ES" | "EN" | "FR";
}
