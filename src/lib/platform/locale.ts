import "server-only";
import { db } from "@/lib/db";

export type PlatformEmailLanguage = "EN" | "FR";

function normalize(value: string | null | undefined): PlatformEmailLanguage {
  return value === "FR" ? "FR" : "EN";
}

/**
 * Language for a GarageOS→shop email (plan change, cancellation, support,
 * verification): the shop's first OWNER's own preference (same field that
 * drives their admin dashboard, see src/lib/get-admin-locale.ts), falling
 * back to the shop's default language when it has no owner yet.
 */
export async function resolveShopEmailLanguage(shopId: string): Promise<PlatformEmailLanguage> {
  const owner = await db.user.findFirst({
    where: { shopId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { preferredLocale: true },
  });
  if (owner) return normalize(owner.preferredLocale);

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { defaultLanguage: true } });
  return normalize(shop?.defaultLanguage);
}
