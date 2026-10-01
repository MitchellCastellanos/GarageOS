"use server";

import { claimDemoCheckout } from "@/lib/sales-demo-conversion";
import { getStripeClient } from "@/lib/stripe";
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

// The shared commercial path opens for the authenticated, activated owner.
// Sales impersonation can never open Checkout.
async function assertCommercialBilling(shopId: string, activation = false) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { salesDemo: true } });
  const demo = shop?.salesDemo;
  if (demo && demo.status !== "CONVERTED") {
    const session = await requireOwner();
    if (!activation || demo.status !== "AWAITING_PAYMENT" || demo.activatedOwnerId !== session.user.id || session.impersonation) throw new Error("DEMO_BILLING_DISABLED");
  }
  return demo;
}

export async function getBillingOverview() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const subscription = await getEffectiveSubscription(shopId);
  return { subscription, shopEmail: session.user.email ?? "" };
}

/** Rutas de retorno decididas en el SERVIDOR — el cliente solo elige entre dos contextos conocidos. */
function checkoutReturnUrls(returnTo: "onboarding" | "billing" | "activation") {
  const appUrl = getAppUrl();
  if (returnTo === "activation") {
    const base = `${appUrl}/admin/activation-payment`;
    return { successUrl: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${base}?checkout=cancelled` };
  }
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
  const demo = await assertCommercialBilling(shopId, true);
  const t = BILLING_DICT[await getAdminLocale()];

  const converting = demo?.status === "AWAITING_PAYMENT";
  const plan = converting ? demo.proposedPlan : formData.get("plan") as string;
  const interval = converting ? demo.proposedBillingInterval : formData.get("interval") as string;
  const returnTo = converting ? "activation" : formData.get("returnTo") === "onboarding" ? "onboarding" : "billing";
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

    let attempt;
    if (converting) {
      attempt = await claimDemoCheckout(demo.id, session.user.id);
      if (!attempt.checkoutSessionId && attempt.checkoutAttemptAt && Date.now() - attempt.checkoutAttemptAt.getTime() > 22 * 3600_000) {
        // Recover a crash between Stripe creation and local persistence by the
        // stable metadata identity. Exhaust the customer list before rotating.
        let recovered: string | null = null;
        for await (const candidate of getStripeClient().checkout.sessions.list({ customer: stripeCustomerId, limit: 100 })) {
          if (candidate.client_reference_id === shopId && candidate.metadata?.checkoutAttemptId === attempt.checkoutAttemptId) { recovered = candidate.id; break; }
        }
        if (recovered) {
          await db.salesDemo.updateMany({ where: { id: demo.id, checkoutAttemptId: attempt.checkoutAttemptId }, data: { checkoutSessionId: recovered } });
          attempt = { ...attempt, checkoutSessionId: recovered };
        } else {
          await db.salesDemo.updateMany({ where: { id: demo.id, checkoutAttemptId: attempt.checkoutAttemptId, checkoutSessionId: null }, data: { checkoutAttemptId: null, checkoutAttemptAt: null } });
          attempt = await claimDemoCheckout(demo.id, session.user.id);
        }
      }
      if (attempt.checkoutSessionId) {
        const prior = await getStripeClient().checkout.sessions.retrieve(attempt.checkoutSessionId);
        if (prior.status === "open" && prior.url) return { url: prior.url };
        if (prior.status === "complete") return { url: `${getAppUrl()}/admin/activation-payment?checkout=success&session_id=${prior.id}` };
        // Rotate only after Stripe proves the old session cannot be completed.
        await db.salesDemo.updateMany({ where: { id: demo.id, checkoutSessionId: prior.id, status: "AWAITING_PAYMENT" },
          data: { checkoutSessionId: null, checkoutAttemptId: null, checkoutAttemptAt: null } });
        attempt = await claimDemoCheckout(demo.id, session.user.id);
      }
      if (attempt.checkoutAttemptAt && Date.now() - attempt.checkoutAttemptAt.getTime() > 23 * 3600_000) return { error: t.errors.checkoutGeneric };
    }
    const checkoutSession = await createCheckoutSession({
      ...(attempt ? { checkoutAttemptId: attempt.checkoutAttemptId!, idempotencyKey: `demo-checkout:${attempt.checkoutAttemptId}`, expiresAt: Math.floor(attempt.checkoutAttemptAt!.getTime() / 1000) + 24 * 3600 } : {}),
      shopId: row.shopId,
      plan: plan as Plan,
      interval: interval as BillingInterval,
      stripeCustomerId,
      trial: decideTrialPlan(row),
      ...checkoutReturnUrls(returnTo),
    });
    if (attempt) await db.salesDemo.updateMany({ where: { id: demo!.id, checkoutAttemptId: attempt.checkoutAttemptId, status: "AWAITING_PAYMENT" }, data: { checkoutSessionId: checkoutSession.id } });
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
  const demo = await assertCommercialBilling(shopId, true);
  const t = BILLING_DICT[await getAdminLocale()];
  if (!sessionId || !sessionId.startsWith("cs_")) return { error: t.errors.checkoutGeneric };

  try {
    const row = await findSubscriptionRow(shopId);
    if (!row) return { error: t.errors.noActiveSubscription };
    const result = await confirmCheckoutSession(sessionId, row.shopId);
    if (result !== "confirmed") return { error: t.errors.checkoutGeneric };
    if (demo?.status === "AWAITING_PAYMENT") {
      const finalized = await db.salesDemo.findUnique({ where: { id: demo.id }, select: { status: true } });
      if (finalized?.status !== "CONVERTED") return { error: t.errors.checkoutGeneric };
    }
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
