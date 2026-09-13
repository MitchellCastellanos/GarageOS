export type AdminLocale = "es" | "en" | "fr";

// Spanish is kept in the type only for backwards compatibility with existing
// persisted user preferences and dictionaries. New/visible admin choices are
// English and French only.
export const ADMIN_LOCALES: { value: AdminLocale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
];

export const DEFAULT_ADMIN_LOCALE: AdminLocale = "en";

export function resolveAdminLocale(value: string | null | undefined): AdminLocale {
  const normalized = value?.toLowerCase();
  return normalized === "fr" ? "fr" : DEFAULT_ADMIN_LOCALE;
}

export function adminLocaleToDb(locale: AdminLocale): "ES" | "EN" | "FR" {
  return locale.toUpperCase() as "ES" | "EN" | "FR";
}
