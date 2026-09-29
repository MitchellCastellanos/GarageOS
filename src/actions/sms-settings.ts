"use server";

import { db } from "@/lib/db";
import { requireShopSession } from "@/lib/permissions";
import { getSmsUsageSummary } from "@/lib/communications/sms-usage";
import { getSharedSmsNumber, requestShopSmsNumber, SmsNumberError } from "@/lib/communications/sms-numbers";
import { sendSupportMessage } from "@/actions/support";
import { publishPlatformPendingChanged } from "@/lib/platform/pusher";

export interface ShopSmsOverview {
  number: {
    status: "REQUESTED" | "PROVISIONING" | "ACTIVE" | "RELEASE_SCHEDULED" | "RELEASED" | "FAILED";
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
 * lo pide, queda en cola (REQUESTED) visible en /platform, y un super admin lo
 * aprueba con un clic — lo que dispara la compra real en Twilio. Además entra
 * como mensaje de soporte para que el equipo lo vea de inmediato (Telegram/correo).
 */
export async function requestDedicatedSmsNumber(message: string) {
  const session = await requireShopSession();
  if (session.user.role !== "OWNER") return { error: "Only the owner can request a number" };
  try {
    await requestShopSmsNumber({ shopId: session.user.shopId!, requestedByUserId: session.user.id });
  } catch (err) {
    if (err instanceof SmsNumberError) return { error: err.message };
    throw err;
  }
  await publishPlatformPendingChanged();
  return sendSupportMessage(message);
}
