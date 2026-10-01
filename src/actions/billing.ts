"use server";

import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { findSubscriptionRow, getEffectiveSubscription } from "@/lib/subscription";
import { ensureStripeCustomer, confirmCheckoutSession } from "@/lib/stripe-sync";
import { decideTrialPlan, isLiveStripeStatus } from "@/domain/subscription-state";
import { ONBOARDING_PLAN_STEP } from "@/config/onboarding";
import {
  createCheckoutSession,
  createBillingPortalSession,
  cancelStripeSubscriptionAtPeriodEnd,
  resumeStripeSubscription,
  type BillingInterval,
} from "@/lib/stripe";
import { getAppUrl } from "@/config/app";
import { ADMIN } from "@/lib/routes";
import type { Plan } from "@/config/entitlements";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { BILLING_DICT } from "@/lib/admin-locale/billing";

const VALID_PLANS: Plan[] = ["CORE", "PRO", "COMPLETE"];
const VALID_INTERVALS: BillingInterval[] = ["MONTHLY", "YEARLY"];

// Demo completion is deliberately separate. Wave 3 will reuse this path only
// after owner activation; Sales can never accidentally open Checkout now.
async function assertCommercialBilling(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { salesDemo: { select: { status: true } } } });
  if (shop?.salesDemo && shop.salesDemo.status !== "CONVERTED") throw new Error("DEMO_BILLING_DISABLED");
}

export async function getBillingOverview() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const subscription = await getEffectiveSubscription(shopId);
  return { subscription, shopEmail: session.user.email ?? "" };
}

/** Rutas de retorno decididas en el SERVIDOR — el cliente solo elige entre dos contextos conocidos. */
function checkoutReturnUrls(returnTo: "onboarding" | "billing") {
  const appUrl = getAppUrl();
  if (returnTo === "onboarding") {
    const base = `${appUrl}${ADMIN.onboarding}?step=${ONBOARDING_PLAN_STEP}`;
    return {
      successUrl: `${base}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}&checkout=cancelled`,
    };
  }
  return {
    successUrl: `${appUrl}${ADMIN.settings}?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}${ADMIN.settings}?tab=billing&checkout=cancelled`,
  };
}

/**
 * Inicia el Checkout de Stripe para el plan+intervalo elegidos. El servidor
 * decide TODO lo que importa: el Price (por env, nunca del cliente), si hay
 * trial y de cuánto, el Customer y las URLs de retorno.
 */
export async function startCheckoutAction(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await assertCommercialBilling(shopId);
  const t = BILLING_DICT[await getAdminLocale()];

  const plan = formData.get("plan") as string;
  const interval = formData.get("interval") as string;
  const returnTo = formData.get("returnTo") === "onboarding" ? "onboarding" : "billing";
  if (!VALID_PLANS.includes(plan as Plan) || !VALID_INTERVALS.includes(interval as BillingInterval)) {
    return { error: t.errors.invalidPlanOrInterval };
  }

  try {
    let row = await findSubscriptionRow(shopId);
    if (!row) {
      // Taller sin fila de Subscription (bug/backfill): se repara a AWAITING_PLAN, jamás a un plan gratis.
      row = await db.subscription.upsert({
        where: { shopId },
        create: { shopId, plan: null, status: "AWAITING_PLAN" },
        update: {},
      });
    }

    // Anti-duplicado: con una suscripción de Stripe viva se administra por el portal,
    // nunca abriendo un segundo Checkout (doble cobro).
    if (row.stripeSubscriptionId && isLiveStripeStatus(row.status)) {
      return { error: t.errors.alreadySubscribed };
    }

    const shop = await db.shop.findUnique({ where: { id: row.shopId }, select: { name: true, email: true } });
    const stripeCustomerId = await ensureStripeCustomer({
      subscriptionOwnerShopId: row.shopId,
      email: shop?.email || session.user.email || "",
      name: shop?.name ?? "GarageOS",
    });

    const checkoutSession = await createCheckoutSession({
      shopId: row.shopId,
      plan: plan as Plan,
      interval: interval as BillingInterval,
      stripeCustomerId,
      trial: decideTrialPlan(row),
      ...checkoutReturnUrls(returnTo),
    });
    if (!checkoutSession.url) return { error: t.errors.checkoutNoUrl };
    return { url: checkoutSession.url };
  } catch (err) {
    console.error("[billing] startCheckoutAction:", err);
    return { error: t.errors.checkoutGeneric };
  }
}

/**
 * Al volver de Stripe Checkout: confirma la sesión contra Stripe y sincroniza
 * la suscripción (sin esperar al webhook). Valida que la sesión sea de ESTE taller.
 */
export async function confirmCheckoutAction(sessionId: string) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await assertCommercialBilling(shopId);
  const t = BILLING_DICT[await getAdminLocale()];
  if (!sessionId || !sessionId.startsWith("cs_")) return { error: t.errors.checkoutGeneric };

  try {
    const row = await findSubscriptionRow(shopId);
    if (!row) return { error: t.errors.noActiveSubscription };
    const result = await confirmCheckoutSession(sessionId, row.shopId);
    if (result !== "confirmed") return { error: t.errors.checkoutGeneric };
    return { success: true };
  } catch (err) {
    console.error("[billing] confirmCheckoutAction:", err);
    return { error: t.errors.checkoutGeneric };
  }
}

export async function openBillingPortalAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await assertCommercialBilling(shopId);
  const subscription = await getEffectiveSubscription(shopId);
  const t = BILLING_DICT[await getAdminLocale()];

  if (!subscription.stripeCustomerId) {
    return { error: t.errors.noActiveSubscription };
  }

  try {
    const portalSession = await createBillingPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      returnUrl: `${getAppUrl()}${ADMIN.settings}?tab=billing`,
    });
    return { url: portalSession.url };
  } catch (err) {
    console.error("[billing] openBillingPortalAction:", err);
    return { error: err instanceof Error ? err.message : t.errors.portalGeneric };
  }
}

/**
 * Cancelación iniciada por el dueño. El portal de Stripe NO ofrece cancelar:
 * en una suscripción anual con excedente mensual su "cancelar al fin del
 * período" cortaría el año pagado. Aquí se cancela con `cancel_at:
 * max_period_end` (fin de lo pagado) y se guarda el historial.
 * Idempotente: repetir la acción no crea otra fila de historial.
 */
export async function cancelSubscriptionAction(reason?: string) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await assertCommercialBilling(shopId);
  const t = BILLING_DICT[await getAdminLocale()];

  try {
    const row = await findSubscriptionRow(shopId);
    if (!row?.stripeSubscriptionId || !isLiveStripeStatus(row.status)) {
      return { error: t.errors.noActiveSubscription };
    }
    if (row.cancelAtPeriodEnd) return { success: true };

    const stripeSub = await cancelStripeSubscriptionAtPeriodEnd(row.stripeSubscriptionId);
    const effectiveAt = stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : row.currentPeriodEnd;

    await db.$transaction([
      db.subscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: true } }),
      db.subscriptionCancellation.create({
        data: {
          subscriptionId: row.id,
          shopId: row.shopId,
          planAtCancellation: row.plan ?? "CORE",
          reason: reason?.trim().slice(0, 500) || "Cancelled by the shop owner",
          initiatedBy: "OWNER",
          initiatedByUserId: session.user.id,
          effectiveAt,
        },
      }),
    ]);
    return { success: true };
  } catch (err) {
    console.error("[billing] cancelSubscriptionAction:", err);
    return { error: t.errors.cancelGeneric };
  }
}

/** Deshace una cancelación programada (mientras siga el período pagado). */
export async function resumeSubscriptionAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await assertCommercialBilling(shopId);
  const t = BILLING_DICT[await getAdminLocale()];

  try {
    const row = await findSubscriptionRow(shopId);
    if (!row?.stripeSubscriptionId || !isLiveStripeStatus(row.status)) {
      return { error: t.errors.noActiveSubscription };
    }
    if (!row.cancelAtPeriodEnd) return { success: true };

    await resumeStripeSubscription(row.stripeSubscriptionId);
    await db.subscription.update({ where: { id: row.id }, data: { cancelAtPeriodEnd: false } });
    return { success: true };
  } catch (err) {
    console.error("[billing] resumeSubscriptionAction:", err);
    return { error: t.errors.resumeGeneric };
  }
}
