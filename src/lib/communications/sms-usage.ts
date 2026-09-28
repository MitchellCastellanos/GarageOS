// Uso y cupo mensual de SMS por taller, medido en segmentos (lo que cobra Twilio).
// El cupo sale del plan (PLAN_LIMITS.smsSegmentsPerMonth) salvo que GarageOS
// haya fijado otro para el taller (Shop.smsMonthlyAllowanceOverride). Al
// agotarse el cupo, el SMS se sigue enviando (nunca se bloquea ni cae a
// email por esto) y los segmentos de más se cobran como excedente — ver
// planSmsOverage y src/lib/stripe.ts (reportSmsOverageUsage).

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/config/entitlements";
import { getEffectiveSubscription } from "@/lib/subscription";
import { computeOverageSegments, nextUsageAlert, smsBillingPeriod, smsUsageAlertLevel } from "@/domain/sms";

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

export interface SmsOveragePlan {
  usedBefore: number;
  allowance: number;
  /** Segmentos de este envío que caen fuera del cupo — para facturar y para guardar en CommunicationMessage.billedOverageSegments. */
  overageSegments: number;
}

/**
 * Nunca bloquea el envío — solo calcula cuánto de este mensaje (`segments`)
 * cae fuera del cupo del mes, contando lo que ya se envió antes que él.
 */
export async function planSmsOverage(shopId: string, segments: number): Promise<SmsOveragePlan> {
  const [usedBefore, allowance] = await Promise.all([getSmsSegmentsUsed(shopId), getSmsAllowance(shopId)]);
  return { usedBefore, allowance, overageSegments: computeOverageSegments(usedBefore, allowance, segments) };
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
