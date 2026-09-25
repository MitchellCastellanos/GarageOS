"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { ADMIN } from "@/lib/routes";
import { getShopServiceCatalog } from "@/lib/booking-slots";

/**
 * Todo lo que el asistente de arranque necesita saber ANTES de decidir qué
 * pasos mostrar: si es la primera ubicación del taller (asistente completo)
 * o una ubicación adicional de una organización que ya tiene otra ubicación
 * lista (asistente corto — fiscal/logo/color ya se copiaron al crearla, ver
 * createShopLocation en actions/locations.ts).
 */
export async function getOnboardingContext() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) redirect(ADMIN.login);

  let isAdditionalLocation = false;
  let suggestedServices: Awaited<ReturnType<typeof getShopServiceCatalog>> = [];
  let copiedFromShopName: string | undefined;

  if (shop.organizationId) {
    const sibling = await db.shop.findFirst({
      where: {
        organizationId: shop.organizationId,
        id: { not: shopId },
        onboardingCompletedAt: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (sibling) {
      isAdditionalLocation = true;
      // getShopServiceCatalog cae al catálogo de fábrica si no hay filas
      // guardadas — por eso se cuenta directo en la tabla para saber si esta
      // ubicación ya tiene SU propio catálogo antes de ofrecer copiar el de
      // la otra ubicación.
      const ownRowCount = await db.shopBookingService.count({ where: { shopId } });
      if (ownRowCount === 0) {
        suggestedServices = await getShopServiceCatalog(sibling.id);
        copiedFromShopName = sibling.name;
      }
    }
  }

  return { shop, isAdditionalLocation, suggestedServices, copiedFromShopName };
}

export async function completeOnboarding() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  await db.shop.update({
    where: { id: shopId },
    data: { onboardingCompletedAt: new Date() },
  });

  revalidatePath(ADMIN.dashboard);
  return { success: true };
}
