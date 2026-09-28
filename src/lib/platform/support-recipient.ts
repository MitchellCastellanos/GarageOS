import "server-only";
import { db } from "@/lib/db";
import { resolveEffectiveShopContactEmail } from "@/lib/communications/sender-identity";

/**
 * A quién mandar los correos de soporte GarageOS↔taller: al usuario que
 * escribió si su correo está confirmado; si no (o si no hay autor), al
 * contacto efectivo del taller — nunca a un Shop.email sin confirmar.
 */
export async function resolveSupportRecipient(shopId: string, userId: string | null): Promise<string | null> {
  if (userId) {
    const user = await db.user.findFirst({
      where: { id: userId, shopId, emailVerified: { not: null } },
      select: { email: true },
    });
    if (user) return user.email;
  }
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { email: true } });
  return resolveEffectiveShopContactEmail(shopId, shop?.email);
}
