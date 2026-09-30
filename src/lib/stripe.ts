// Integración de Stripe — checkout hospedado + billing portal + webhook.
// No usamos Stripe.js en el cliente (no hace falta publishable key): todo el
// flujo de pago vive en la página hospedada de Stripe, a la que redirigimos.
//
// Variables de entorno requeridas — ver .env.example para la lista completa
// y las instrucciales de qué pegar en el Dashboard de Stripe.

import Stripe from "stripe";
import { PLAN_PRICING_CAD, type Plan } from "@/config/entitlements";
import type { TrialPlan } from "@/domain/subscription-state";

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no está configurada");
  client = new Stripe(key);
  return client;
}

import type { BillingInterval } from "@/domain/subscription-state";
export type { BillingInterval };

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

/**
 * Encuentra el item de PLAN dentro de los items de una suscripción de Stripe
 * (nunca `items.data[0]` a secas: desde que existe el item de excedente de
 * SMS, el de plan puede no ser el primero — el orden de Stripe no está
 * garantizado tras un `subscriptions.update`).
 */
export function findPlanSubscriptionItem<T extends { price: { id: string } }>(items: readonly T[]): T | null {
  for (const item of items) {
    if (resolvePlanFromPriceId(item.price.id)) return item;
  }
  return null;
}

export interface CreateCheckoutSessionParams {
  /** Shop dueño de la Subscription (en multi-sucursal, el Shop raíz) — va a client_reference_id y a la metadata. */
  shopId: string;
  plan: Plan;
  interval: BillingInterval;
  /** Customer de Stripe ya creado/vinculado a este taller (ver ensureStripeCustomer) — evita clientes duplicados. */
  stripeCustomerId: string;
  /** Trial a aplicar — lo decide el SERVIDOR (decideTrialPlan), nunca el cliente. */
  trial: TrialPlan;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Fail-closed guard (Block 15): the UI quotes PLAN_PRICING_CAD but Stripe charges the Price in env.
 * If someone points STRIPE_PRICE_* at a stale/wrong Price (e.g. the pre-launch $149/$249/$399 set),
 * customers would be charged something different from what they were shown, so refuse to open Checkout.
 */
export function priceMismatchReason(
  price: Pick<Stripe.Price, "currency" | "unit_amount" | "recurring" | "active">,
  plan: Plan,
  interval: BillingInterval
): string | null {
  const expected = PLAN_PRICING_CAD[plan][interval === "YEARLY" ? "yearly" : "monthly"] * 100;
  if (!price.active) return "the Price is archived";
  if (price.currency !== "cad") return `currency is ${price.currency}, expected cad`;
  if (price.unit_amount !== expected) return `amount is ${price.unit_amount}, expected ${expected}`;
  if (price.recurring?.interval !== (interval === "YEARLY" ? "year" : "month") || price.recurring?.interval_count !== 1) {
    return "billing interval does not match";
  }
  if (price.recurring?.usage_type === "metered") return "the Price is metered";
  return null;
}

/**
 * Line items del Checkout. El Price de excedente de SMS es mensual y Stripe
 * Checkout rechaza mezclar intervalos ("Checkout does not support multiple
 * prices with different billing intervals"), así que en un plan ANUAL el
 * excedente NO se agrega: si se agregara, el Checkout anual no se podría abrir.
 */
export function checkoutLineItems(
  planPriceId: string,
  interval: BillingInterval,
  overagePriceId: string | null
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: planPriceId, quantity: 1 }];
  if (overagePriceId && interval === "MONTHLY") lineItems.push({ price: overagePriceId });
  return lineItems;
}

/**
 * Checkout hospedado en modo suscripción con método de pago OBLIGATORIO
 * (`payment_method_collection: "always"`) — la tarjeta la captura Stripe, jamás
 * GarageOS. Con trial, el cobro de hoy es $0 y Stripe cobra solo al terminar.
 * Si el trial termina sin método de pago válido, la suscripción se cancela.
 */
export async function createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const priceId = getPriceId(params.plan, params.interval);
  if (!priceId) {
    throw new Error(
      `No hay Price ID configurado para ${params.plan}/${params.interval} (falta ${priceEnvVar(params.plan, params.interval)})`
    );
  }

  const price = await stripe.prices.retrieve(priceId);
  const mismatch = priceMismatchReason(price, params.plan, params.interval);
  if (mismatch) {
    throw new Error(`Stripe Price ${priceId} does not match ${params.plan}/${params.interval}: ${mismatch}`);
  }

  // El item de excedente de SMS es "metered" (sin quantity) — se factura solo
  // por lo que reporte reportSmsOverageUsage. Se agrega desde el arranque de
  // la suscripción para no tener que hacer un backfill después.
  const lineItems = checkoutLineItems(priceId, params.interval, getSmsOverageItemPriceId());

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { shopId: params.shopId },
  };
  if (params.trial.kind === "fresh") {
    subscriptionData.trial_period_days = params.trial.days;
  } else if (params.trial.kind === "until") {
    subscriptionData.trial_end = Math.floor(params.trial.endsAt.getTime() / 1000);
  }
  if (params.trial.kind !== "none") {
    subscriptionData.trial_settings = { end_behavior: { missing_payment_method: "cancel" } };
  }

  // Idempotency: dos clics/recargas en la misma ventana de 15 min devuelven la
  // MISMA sesión en vez de abrir varias (que podrían completarse las dos).
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: lineItems,
      client_reference_id: params.shopId,
      customer: params.stripeCustomerId,
      customer_update: { address: "auto", name: "auto" },
      payment_method_collection: "always",
      subscription_data: subscriptionData,
      metadata: { shopId: params.shopId, plan: params.plan, interval: params.interval },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    },
    { idempotencyKey: `checkout:${params.shopId}:${params.plan}:${params.interval}:${params.trial.kind}:${bucket}` }
  );
}

/** Crea el Customer de Stripe del taller. Idempotente por shopId: dos llamadas simultáneas devuelven el mismo Customer. */
export async function createStripeCustomer(params: { shopId: string; email: string; name: string }): Promise<string> {
  const customer = await getStripeClient().customers.create(
    { email: params.email || undefined, name: params.name, metadata: { shopId: params.shopId } },
    { idempotencyKey: `customer:${params.shopId}` }
  );
  return customer.id;
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
  // El item de PLAN — no items.data[0]: el de excedente de SMS puede ir primero.
  const itemId = findPlanSubscriptionItem(subscription.items.data)?.id;
  if (!itemId) {
    throw new Error(`La suscripción de Stripe ${stripeSubscriptionId} no tiene item de plan`);
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
// Stripe lo reemplazó por la API de Meters). Requiere, del lado de Stripe:
//   1. Un Billing Meter (Dashboard → Billing → Meters) con event_name igual a
//      STRIPE_SMS_OVERAGE_METER_EVENT_NAME.
//   2. Un Price "metered" sobre ese Meter — su id va en
//      STRIPE_SMS_OVERAGE_PRICE_ID. createCheckoutSession ya lo agrega como
//      segundo item a toda suscripción nueva (sin quantity, como pide Stripe
//      para un price metered); una suscripción creada ANTES de configurar
//      esta variable no lo tiene y hay que agregárselo a mano una vez
//      (Dashboard → esa suscripción → Add item, o `subscriptions.update` con
//      solo el nuevo item — no toca los items existentes).

export function smsOverageMeterEventName(): string | null {
  return process.env.STRIPE_SMS_OVERAGE_METER_EVENT_NAME?.trim() || null;
}

export function getSmsOverageItemPriceId(): string | null {
  return process.env.STRIPE_SMS_OVERAGE_PRICE_ID?.trim() || null;
}

export function isSmsOverageBillingConfigured(): boolean {
  return Boolean(smsOverageMeterEventName() && process.env.STRIPE_SECRET_KEY);
}

/** Stripe solo acepta timestamps de meter events de hasta 35 días atrás (y ~5 min a futuro). */
const METER_EVENT_MAX_AGE_MS = 34 * 24 * 60 * 60 * 1000;

/**
 * Reporta segmentos de excedente a Stripe para un cliente. Idempotente por
 * `identifier` (el id del CommunicationMessage) — un reintento del mismo
 * mensaje nunca lo cuenta dos veces. Nunca lanza: devuelve true solo si Stripe
 * aceptó el evento; quien la llama persiste el resultado (overageReportedAt) y
 * el cron reintenta los pendientes (retryPendingSmsOverage). Un fallo de Stripe
 * nunca debe bloquear ni reintentar el envío del SMS, que ya salió.
 * `occurredAt` fija el período de facturación correcto en un reintento tardío.
 */
export async function reportSmsOverageUsage(params: {
  stripeCustomerId: string;
  segments: number;
  messageId: string;
  occurredAt?: Date;
}): Promise<boolean> {
  const eventName = smsOverageMeterEventName();
  if (!eventName || params.segments <= 0) return false;

  const age = params.occurredAt ? Date.now() - params.occurredAt.getTime() : 0;
  const timestamp =
    params.occurredAt && age >= 0 && age < METER_EVENT_MAX_AGE_MS
      ? Math.floor(params.occurredAt.getTime() / 1000)
      : undefined;

  try {
    await getStripeClient().billing.meterEvents.create({
      event_name: eventName,
      identifier: `sms-overage:${params.messageId}`,
      payload: {
        stripe_customer_id: params.stripeCustomerId,
        value: String(params.segments),
      },
      ...(timestamp ? { timestamp } : {}),
    });
    return true;
  } catch (err) {
    console.error(`[stripe] reportSmsOverageUsage falló (mensaje ${params.messageId}):`, err);
    return false;
  }
}
