import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { constructWebhookEvent, getStripeClient, resolvePlanFromPriceId } from "@/lib/stripe";
import type { SubscriptionStatus } from "@prisma/client";

// Endpoint público de Stripe — se configura en el Dashboard (Developers →
// Webhooks) apuntando a <NEXT_PUBLIC_APP_URL>/api/stripe/webhook. Ver
// docs/subscription-plans.md / respuesta de configuración de Stripe para la
// lista exacta de eventos a suscribir.
//
// La firma (Stripe-Signature) es la única autenticación — por eso leemos el
// body como texto crudo (nunca req.json(), que ya lo habría reserializado y
// rompería la verificación HMAC).

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    console.error("[stripe webhook] firma inválida:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const shopId = session.client_reference_id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (shopId && subscriptionId) {
          const stripeSub = await getStripeClient().subscriptions.retrieve(subscriptionId);
          await upsertFromStripeSubscription(stripeSub, shopId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const stripeSub = event.data.object as Stripe.Subscription;
        await upsertFromStripeSubscription(stripeSub, stripeSub.metadata?.shopId ?? null);
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as Stripe.Subscription;
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSub.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: false },
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] error procesando ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    default:
      // incomplete, incomplete_expired, paused
      return "INCOMPLETE";
  }
}

async function shopIdFromCustomer(customerId: string): Promise<string | null> {
  const row = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    select: { shopId: true },
  });
  return row?.shopId ?? null;
}

async function upsertFromStripeSubscription(
  stripeSub: Stripe.Subscription,
  shopIdHint: string | null
): Promise<void> {
  const item = stripeSub.items.data[0];
  const priceId = item?.price.id;
  const resolved = priceId ? resolvePlanFromPriceId(priceId) : null;
  if (!resolved || !item) {
    console.error("[stripe webhook] ningún STRIPE_PRICE_* de .env coincide con el price", priceId);
    return;
  }

  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

  const existing = await db.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
    select: { shopId: true },
  });
  const shopId = existing?.shopId ?? shopIdHint ?? (await shopIdFromCustomer(customerId));
  if (!shopId) {
    console.error("[stripe webhook] no se pudo resolver el shopId de la suscripción", stripeSub.id);
    return;
  }

  const data = {
    plan: resolved.plan,
    status: mapStripeStatus(stripeSub.status),
    billingInterval: resolved.interval,
    trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId,
  };

  await db.subscription.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
  });
}
