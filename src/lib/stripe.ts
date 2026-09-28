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

  const overagePriceId = smsOverageMeterPriceId();
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];
  // Metered: sin quantity — Stripe la calcula de los meter events reportados.
  if (overagePriceId) line_items.push({ price: overagePriceId });

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items,
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

// ── Cobro de excedente de SMS (Billing Meters) ────────────────────────────────
// Meter events, no usage records (createUsageRecord no existe en el SDK v22 —
// Stripe lo reemplazó por la API de Meters). Forma verificada contra la
// referencia viva de Stripe (docs.stripe.com/api/billing/meter-event) y contra
// el Meter/Price reales de esta cuenta — ver docs/notifications.md. Del lado
// de Stripe:
//   1. Un Billing Meter (Dashboard → Billing → Meters) con event_name igual a
//      STRIPE_SMS_OVERAGE_METER_EVENT_NAME, customer_mapping por
//      stripe_customer_id.
//   2. Un Price "metered" sobre ese Meter (STRIPE_SMS_OVERAGE_PRICE_ID) a
//      $0.05 CAD/segmento (SMS_OVERAGE_PRICE_CAD_PER_SEGMENT en
//      src/domain/sms.ts, deben coincidir) — agregado como subscription item
//      en cada taller: createCheckoutSession lo agrega solo para talleres
//      nuevos; scripts/backfill-sms-overage-subscription-item.ts lo agrega a
//      los ya existentes. Sin ese item en la suscripción, los meter events se
//      siguen acumulando pero Stripe nunca genera el cargo.

export function smsOverageMeterEventName(): string | null {
  return process.env.STRIPE_SMS_OVERAGE_METER_EVENT_NAME?.trim() || null;
}

export function smsOverageMeterPriceId(): string | null {
  return process.env.STRIPE_SMS_OVERAGE_PRICE_ID?.trim() || null;
}

export function isSmsOverageBillingConfigured(): boolean {
  return Boolean(smsOverageMeterEventName() && process.env.STRIPE_SECRET_KEY);
}

/**
 * Agrega el subscription item de excedente de SMS a una suscripción de
 * Stripe que todavía no lo tenga — usado por el backfill de talleres ya
 * existentes (createCheckoutSession ya lo hace para talleres nuevos).
 * Idempotente: no hace nada si el item ya está. No toca ningún otro item
 * (el plan del taller queda intacto).
 */
export async function ensureSmsOverageSubscriptionItem(stripeSubscriptionId: string): Promise<"added" | "already_present" | "not_configured"> {
  const overagePriceId = smsOverageMeterPriceId();
  if (!overagePriceId) return "not_configured";

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const alreadyPresent = subscription.items.data.some((item) => item.price.id === overagePriceId);
  if (alreadyPresent) return "already_present";

  await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ price: overagePriceId }],
  });
  return "added";
}

/**
 * Reporta segmentos de excedente a Stripe para un cliente. Idempotente por
 * `identifier` (el id del CommunicationMessage) — un reintento del mismo
 * mensaje nunca lo cuenta dos veces. Nunca lanza: quien la llama la trata
 * como best-effort (un fallo de Stripe nunca debe bloquear ni reintentar el
 * envío del SMS, que ya salió).
 */
export async function reportSmsOverageUsage(params: {
  stripeCustomerId: string;
  segments: number;
  messageId: string;
}): Promise<void> {
  const eventName = smsOverageMeterEventName();
  if (!eventName || params.segments <= 0) return;

  try {
    await getStripeClient().billing.meterEvents.create({
      event_name: eventName,
      identifier: `sms-overage:${params.messageId}`,
      payload: {
        stripe_customer_id: params.stripeCustomerId,
        value: String(params.segments),
      },
    });
  } catch (err) {
    console.error(`[stripe] reportSmsOverageUsage falló (mensaje ${params.messageId}):`, err);
  }
}
