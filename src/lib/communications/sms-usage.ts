// Uso y cupo mensual de SMS por taller, medido en segmentos (lo que cobra Twilio).
// El cupo sale del plan (PLAN_LIMITS.smsSegmentsPerMonth) salvo que GarageOS
// haya fijado otro para el taller (Shop.smsMonthlyAllowanceOverride). Al
// agotarse el cupo, el SMS se sigue enviando (nunca se bloquea ni cae a
// email por esto) y los segmentos de más se cobran como excedente — ver
// planSmsOverage y src/lib/stripe.ts (reportSmsOverageUsage).

import { db } from "@/lib/db";
import { PLAN_LIMITS } from "@/config/entitlements";
import { getEffectiveSubscription } from "@/lib/subscription";
import {
  computeOverageSegments,
  nextUsageAlert,
  SMS_OVERAGE_PRICE_CAD_PER_SEGMENT,
  smsBillingPeriod,
  smsUsageAlertLevel,
} from "@/domain/sms";

export async function getSmsAllowance(shopId: string): Promise<number> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { smsMonthlyAllowanceOverride: true } });
  if (shop?.smsMonthlyAllowanceOverride != null) return Math.max(0, shop.smsMonthlyAllowanceOverride);
  const { plan, subscribedPlan } = await getEffectiveSubscription(shopId);
  const allowancePlan = plan ?? subscribedPlan;
  // Sin plan (taller sin elegir / sin fila) no hay cupo: no existe un plan gratuito.
  return allowancePlan ? PLAN_LIMITS[allowancePlan].smsSegmentsPerMonth : 0;
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
  /** Segmentos por encima del cupo este mes (0 dentro del cupo). */
  overageSegments: number;
  /** Estimado (CAD) al precio de lista del excedente — Stripe factura de verdad. */
  estimatedOverageCad: number;
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
    overageSegments: Math.max(0, used - allowance),
    estimatedOverageCad: Math.round(Math.max(0, used - allowance) * SMS_OVERAGE_PRICE_CAD_PER_SEGMENT * 100) / 100,
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

// ── Reporte del excedente a Stripe (con recuperación) ────────────────────────

/** Tras esto un mensaje sin reportar se abandona (Stripe ya no acepta timestamps tan viejos). */
const OVERAGE_RETRY_MAX_AGE_DAYS = 30;
const OVERAGE_RETRY_MAX_ATTEMPTS = 25;

export type OverageSettleResult = "reported" | "already_reported" | "not_applicable" | "not_configured" | "failed";

/**
 * Reporta a Stripe el excedente de UN mensaje y persiste el resultado. Idempotente
 * en dos niveles: overageReportedAt (no se vuelve a intentar) e `identifier`
 * `sms-overage:<messageId>` en el meter event (Stripe descarta el duplicado si
 * un reporte se aceptó pero no alcanzamos a guardarlo). Nunca lanza.
 */
export async function settleSmsOverage(messageId: string): Promise<OverageSettleResult> {
  try {
    const message = await db.communicationMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        shopId: true,
        channel: true,
        direction: true,
        billedOverageSegments: true,
        overageReportedAt: true,
        providerMessageId: true,
        createdAt: true,
      },
    });
    if (!message || message.channel !== "SMS" || message.direction !== "OUTBOUND") return "not_applicable";
    if (!message.billedOverageSegments || message.billedOverageSegments <= 0) return "not_applicable";
    if (message.overageReportedAt) return "already_reported";
    if (!message.providerMessageId) return "not_applicable"; // nunca salió: no se cobra

    const stripe = await import("@/lib/stripe");
    if (!stripe.isSmsOverageBillingConfigured()) return "not_configured";

    const { stripeCustomerId } = await getEffectiveSubscription(message.shopId);
    if (!stripeCustomerId) return "not_configured";

    const ok = await stripe.reportSmsOverageUsage({
      stripeCustomerId,
      segments: message.billedOverageSegments,
      messageId: message.id,
      occurredAt: message.createdAt,
    });

    if (ok) {
      await db.communicationMessage.updateMany({
        where: { id: message.id, overageReportedAt: null },
        data: { overageReportedAt: new Date(), overageReportError: null },
      });
      return "reported";
    }
    await db.communicationMessage.update({
      where: { id: message.id },
      data: { overageReportAttempts: { increment: 1 }, overageReportError: "Stripe meter event was not accepted" },
    });
    return "failed";
  } catch (err) {
    console.error(`[sms-usage] settleSmsOverage falló (${messageId}):`, err);
    return "failed";
  }
}

export interface OverageRetryResult {
  scanned: number;
  reported: number;
  failed: number;
  skipped: number;
}

/**
 * Cron: reintenta los excedentes que no se pudieron reportar (Stripe caído, cliente
 * sin suscripción todavía, meter sin configurar en su momento). Acotado por corrida.
 */
export async function retryPendingSmsOverage(now: Date = new Date(), limit = 200): Promise<OverageRetryResult> {
  const result: OverageRetryResult = { scanned: 0, reported: 0, failed: 0, skipped: 0 };
  const stripe = await import("@/lib/stripe");
  if (!stripe.isSmsOverageBillingConfigured()) return result;

  const since = new Date(now.getTime() - OVERAGE_RETRY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const pending = await db.communicationMessage.findMany({
    where: {
      channel: "SMS",
      direction: "OUTBOUND",
      billedOverageSegments: { gt: 0 },
      overageReportedAt: null,
      providerMessageId: { not: null },
      overageReportAttempts: { lt: OVERAGE_RETRY_MAX_ATTEMPTS },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const { id } of pending) {
    result.scanned++;
    const outcome = await settleSmsOverage(id);
    if (outcome === "reported") result.reported++;
    else if (outcome === "failed") result.failed++;
    else result.skipped++;
  }
  return result;
}
