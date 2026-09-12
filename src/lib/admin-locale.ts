import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

/**
 * Reads the signed-in user's preferred locale straight from the DB (not the
 * JWT) so a change made in Settings applies on the very next request instead
 * of waiting for the session token to refresh.
 */
export async function getAdminLocale(): Promise<AdminLocale> {
  const session = await auth();
  if (!session?.user?.id) return DEFAULT_ADMIN_LOCALE;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { preferredLocale: true },
  });

  return resolveAdminLocale(user?.preferredLocale);
}
