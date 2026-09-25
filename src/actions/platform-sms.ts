"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireSuperAdmin } from "@/lib/permissions";
import { logPlatformAction } from "@/lib/platform/audit";
import { isTwilioConfigured } from "@/lib/communications/twilio";
import {
  cancelShopSmsNumberRelease,
  provisionShopSmsNumber,
  releaseShopSmsNumber,
  scheduleShopSmsNumberRelease,
  SmsNumberError,
} from "@/lib/communications/sms-numbers";
import { getSmsUsageSummary } from "@/lib/communications/sms-usage";
import { PLAN_LIMITS } from "@/config/entitlements";
import { alertStaffSmsNumberActivated } from "@/lib/staff-alerts";
import { getEffectiveSubscription } from "@/lib/subscription";

export async function getShopSmsAdminOverview(shopId: string) {
  await requireSuperAdmin();
  const [number, usage, sub, optedOutCount] = await Promise.all([
    db.shopSmsNumber.findUnique({ where: { shopId } }),
    getSmsUsageSummary(shopId),
    getEffectiveSubscription(shopId),
    db.communicationSuppression.count({ where: { shopId, channel: "SMS" } }),
  ]);
  return {
    number,
    usage,
    planAllowance: PLAN_LIMITS[sub.plan].smsSegmentsPerMonth,
    plan: sub.plan,
    optedOutCount,
    twilioConfigured: isTwilioConfigured(),
  };
}

function toError(err: unknown): { error: string } {
  if (err instanceof SmsNumberError) return { error: err.message };
  console.error("[platform-sms]", err);
  return { error: err instanceof Error ? err.message : "Unexpected error" };
}

/** Compra un número real (renta mensual en Twilio) — la UI pide confirmación explícita. */
export async function provisionShopSmsNumberAction(shopId: string, countryCode: string, areaCode: string) {
  const session = await requireSuperAdmin();
  try {
    const result = await provisionShopSmsNumber({ shopId, actorUserId: session.user.id, countryCode, areaCode });
    await logPlatformAction({
      actorUserId: session.user.id,
      shopId,
      action: "SMS_NUMBER_PROVISIONED",
      targetType: "SHOP_SMS_NUMBER",
      targetId: shopId,
      metadata: { phoneNumber: result.phoneNumber, subaccountSid: result.subaccountSid, countryCode, areaCode },
    });
    await alertStaffSmsNumberActivated({ shopId, phoneNumber: result.phoneNumber }).catch((err) =>
      console.error("[platform-sms] aviso de número activo falló:", err)
    );
    revalidatePath(PLATFORM.shop(shopId));
    return { success: true, phoneNumber: result.phoneNumber };
  } catch (err) {
    revalidatePath(PLATFORM.shop(shopId));
    return toError(err);
  }
}

export async function releaseShopSmsNumberAction(shopId: string, mode: "now" | "schedule", reason: string) {
  const session = await requireSuperAdmin();
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Escribe el motivo" };
  try {
    if (mode === "now") {
      await releaseShopSmsNumber({ shopId, reason: trimmed, actorUserId: session.user.id });
    } else {
      await scheduleShopSmsNumberRelease({ shopId, reason: trimmed, actorUserId: session.user.id });
    }
    await logPlatformAction({
      actorUserId: session.user.id,
      shopId,
      action: mode === "now" ? "SMS_NUMBER_RELEASED" : "SMS_NUMBER_RELEASE_SCHEDULED",
      targetType: "SHOP_SMS_NUMBER",
      targetId: shopId,
      metadata: { reason: trimmed },
    });
    revalidatePath(PLATFORM.shop(shopId));
    return { success: true };
  } catch (err) {
    revalidatePath(PLATFORM.shop(shopId));
    return toError(err);
  }
}

export async function cancelShopSmsNumberReleaseAction(shopId: string) {
  const session = await requireSuperAdmin();
  try {
    await cancelShopSmsNumberRelease({ shopId, actorUserId: session.user.id });
    await logPlatformAction({
      actorUserId: session.user.id,
      shopId,
      action: "SMS_NUMBER_RELEASE_CANCELLED",
      targetType: "SHOP_SMS_NUMBER",
      targetId: shopId,
    });
    revalidatePath(PLATFORM.shop(shopId));
    return { success: true };
  } catch (err) {
    return toError(err);
  }
}

/** Cupo mensual propio del taller (null = el del plan). */
export async function setShopSmsAllowanceAction(shopId: string, allowance: number | null) {
  const session = await requireSuperAdmin();
  if (allowance !== null && (!Number.isInteger(allowance) || allowance < 0 || allowance > 1_000_000)) {
    return { error: "Cupo inválido" };
  }
  await db.shop.update({ where: { id: shopId }, data: { smsMonthlyAllowanceOverride: allowance } });
  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "SMS_ALLOWANCE_CHANGED",
    targetType: "SHOP",
    targetId: shopId,
    metadata: { allowance },
  });
  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}
