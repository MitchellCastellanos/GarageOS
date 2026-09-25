// Uso y cupo mensual de SMS por taller, medido en segmentos (lo que cobra Twilio).
// El cupo sale del plan (PLAN_LIMITS.smsSegmentsPerMonth) salvo que GarageOS
// haya fijado otro para el taller (Shop.smsMonthlyAllowanceOverride). Al
// agotarse, sendSms lanza SmsAllowanceExceededError y los avisos automáticos
// caen a email (ver notifyAppointmentEvent / updateJobStatus).

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/config/entitlements";
import { getEffectiveSubscription } from "@/lib/subscription";
import { canSpendSmsSegments, nextUsageAlert, smsBillingPeriod, smsUsageAlertLevel } from "@/domain/sms";

export class SmsAllowanceExceededError extends Error {
  constructor(public readonly used: number, public readonly allowance: number) {
    super(`Monthly SMS allowance reached (${used}/${allowance} segments).`);
    this.name = "SmsAllowanceExceededError";
  }
}

export async function getSmsAllowance(shopId: string): Promise<number> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { smsMonthlyAllowanceOverride: true } });
  if (shop?.smsMonthlyAllowanceOverride != null) return Math.max(0, shop.smsMonthlyAllowanceOverride);
  const { plan } = await getEffectiveSubscription(shopId);
  return PLAN_LIMITS[plan].smsSegmentsPerMonth;
}

/**
 * Segmentos salientes del mes. Cuenta lo que llegó a Twilio (con o sin entrega
 * final): un FAILED sin providerMessageId nunca salió y no se cobra. Mensajes
 * anteriores a esta columna (segments null) cuentan como 1.
 */
export async function getSmsSegmentsUsed(shopId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = smsBillingPeriod(now);
  const where = {
    shopId,
    channel: "SMS" as const,
    direction: "OUTBOUND" as const,
    createdAt: { gte: start, lt: end },
    OR: [
      { status: { in: ["QUEUED", "SENDING", "SENT", "DELIVERED"] as ("QUEUED" | "SENDING" | "SENT" | "DELIVERED")[] } },
      { status: "FAILED" as const, providerMessageId: { not: null } },
    ],
  };
  const [sum, legacy] = await Promise.all([
    db.communicationMessage.aggregate({ where, _sum: { segments: true } }),
    db.communicationMessage.count({ where: { ...where, segments: null } }),
  ]);
  return (sum._sum.segments ?? 0) + legacy;
}

export interface SmsUsageSummary {
  periodKey: string;
  periodEnd: Date;
  used: number;
  allowance: number;
  isOverride: boolean;
  percent: number;
}

export async function getSmsUsageSummary(shopId: string, now: Date = new Date()): Promise<SmsUsageSummary> {
  const [shop, used] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { smsMonthlyAllowanceOverride: true } }),
    getSmsSegmentsUsed(shopId, now),
  ]);
  const allowance = await getSmsAllowance(shopId);
  const { key, end } = smsBillingPeriod(now);
  return {
    periodKey: key,
    periodEnd: end,
    used,
    allowance,
    isOverride: shop?.smsMonthlyAllowanceOverride != null,
    percent: allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 100,
  };
}

/** Lanza SmsAllowanceExceededError si enviar `needed` segmentos pasaría el cupo del mes. */
export async function assertSmsAllowance(shopId: string, needed: number): Promise<void> {
  const [used, allowance] = await Promise.all([getSmsSegmentsUsed(shopId), getSmsAllowance(shopId)]);
  if (!canSpendSmsSegments(used, allowance, needed)) {
    throw new SmsAllowanceExceededError(used, allowance);
  }
}

/**
 * Después de cada envío: si el uso cruzó 80 % o 100 % por primera vez en el mes,
 * avisa a los owners. El marcador se actualiza de forma condicional para que dos
 * envíos simultáneos no manden la alerta dos veces.
 */
export async function checkSmsUsageAlerts(
  shopId: string,
  notify: (params: { level: 80 | 100; used: number; allowance: number }) => Promise<void>
): Promise<void> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { smsUsageAlertMarker: true } });
  if (!shop) return;
  const [used, allowance] = await Promise.all([getSmsSegmentsUsed(shopId), getSmsAllowance(shopId)]);
  const { key } = smsBillingPeriod();
  const level = nextUsageAlert(smsUsageAlertLevel(used, allowance), key, shop.smsUsageAlertMarker);
  if (!level) return;

  const claimed = await db.shop.updateMany({
    where: { id: shopId, smsUsageAlertMarker: shop.smsUsageAlertMarker },
    data: { smsUsageAlertMarker: `${key}:${level}` },
  });
  if (claimed.count !== 1) return;
  await notify({ level, used, allowance });
}
