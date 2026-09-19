// Integración de Stripe — checkout hospedado + billing portal + webhook.
// No usamos Stripe.js en el cliente (no hace falta publishable key): todo el
// flujo de pago vive en la página hospedada de Stripe, a la que redirigimos.
//
// Variables de entorno requeridas — ver .env.example para la lista completa
// y las instrucciales de qué pegar en el Dashboard de Stripe.

import Stripe from "stripe";
import type { Plan } from "@/config/entitlements";

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no está configurada");
  client = new Stripe(key);
  return client;
}

export type BillingInterval = "MONTHLY" | "YEARLY";

/** plan+intervalo → Price ID de Stripe, leído de env. Un plan/intervalo sin price ID configurado no se puede comprar. */
function priceEnvVar(plan: Plan, interval: BillingInterval): string {
  return `STRIPE_PRICE_${plan}_${interval}`;
}

export function getPriceId(plan: Plan, interval: BillingInterval): string | null {
  return process.env[priceEnvVar(plan, interval)]?.trim() || null;
}

/** Inverso de getPriceId — para resolver plan/intervalo a partir de un Price ID que llega en un evento de webhook. */
export function resolvePlanFromPriceId(priceId: string): { plan: Plan; interval: BillingInterval } | null {
  const plans: Plan[] = ["CORE", "PRO", "COMPLETE"];
  const intervals: BillingInterval[] = ["MONTHLY", "YEARLY"];
  for (const plan of plans) {
    for (const interval of intervals) {
      if (getPriceId(plan, interval) === priceId) return { plan, interval };
    }
  }
  return null;
}

export interface CreateCheckoutSessionParams {
  shopId: string;
  plan: Plan;
  interval: BillingInterval;
  customerEmail: string;
  existingStripeCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const priceId = getPriceId(params.plan, params.interval);
  if (!priceId) {
    throw new Error(
      `No hay Price ID configurado para ${params.plan}/${params.interval} (falta ${priceEnvVar(params.plan, params.interval)})`
    );
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: params.shopId,
    customer: params.existingStripeCustomerId ?? undefined,
    customer_email: params.existingStripeCustomerId ? undefined : params.customerEmail,
    subscription_data: {
      metadata: { shopId: params.shopId },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

export async function createBillingPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}

/**
 * Mueve una suscripción de Stripe ya existente al price de un plan/intervalo
 * distinto, con proration automático — usado por el cambio de plan manual de
 * super admin (src/actions/platform.ts changeShopPlan) para que Stripe y la
 * fila de Subscription nunca queden desincronizados.
 */
export async function updateStripeSubscriptionPrice(
  stripeSubscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    throw new Error(`La suscripción de Stripe ${stripeSubscriptionId} no tiene items`);
  }
  return stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: "create_prorations",
  });
}

/** Cancela al final del período actual — nunca de inmediato, para no cortar un servicio ya pagado. */
export async function cancelStripeSubscriptionAtPeriodEnd(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
}

export function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET no está configurada");
  return getStripeClient().webhooks.constructEvent(payload, signature, secret);
}
