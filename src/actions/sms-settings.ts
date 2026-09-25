"use server";

import { db } from "@/lib/db";
import { requireShopSession } from "@/lib/permissions";
import { getSmsUsageSummary } from "@/lib/communications/sms-usage";
import { getSharedSmsNumber } from "@/lib/communications/sms-numbers";
import { sendSupportMessage } from "@/actions/support";

export interface ShopSmsOverview {
  number: {
    status: "PROVISIONING" | "ACTIVE" | "RELEASE_SCHEDULED" | "RELEASED" | "FAILED";
    phoneNumber: string | null;
    releaseScheduledAt: Date | null;
  } | null;
  sharedNumberConfigured: boolean;
  usage: Awaited<ReturnType<typeof getSmsUsageSummary>>;
  optedOutCount: number;
}

/** Estado de SMS del taller para Configuración → Notificaciones (solo lectura para el taller). */
export async function getShopSmsOverview(): Promise<ShopSmsOverview> {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;
  const [number, usage, optedOutCount] = await Promise.all([
    db.shopSmsNumber.findUnique({
      where: { shopId },
      select: { status: true, phoneNumber: true, releaseScheduledAt: true },
    }),
    getSmsUsageSummary(shopId),
    db.communicationSuppression.count({ where: { shopId, channel: "SMS" } }),
  ]);
  return { number, sharedNumberConfigured: Boolean(getSharedSmsNumber()), usage, optedOutCount };
}

/**
 * El número dedicado lo aprovisiona GarageOS (tiene costo mensual): el taller
 * lo pide y la solicitud entra como mensaje de soporte, que ya alerta al equipo.
 */
export async function requestDedicatedSmsNumber(message: string) {
  const session = await requireShopSession();
  if (session.user.role !== "OWNER") return { error: "Only the owner can request a number" };
  return sendSupportMessage(message);
}
