import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_ADMIN_LOCALE, resolveAdminLocale, type AdminLocale } from "@/lib/admin-locale";

/**
 * Reads the signed-in user's preferred locale straight from the DB (not the
 * JWT) so a change made in Settings applies on the very next request instead
 * of waiting for the session token to refresh.
 *
 * Server-only: kept out of admin-locale.ts so that file (imported by client
 * components for the AdminLocale type/helpers) never pulls the Prisma/pg
 * client into the browser bundle.
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
