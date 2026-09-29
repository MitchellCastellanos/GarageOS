import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructWebhookEvent } from "@/lib/stripe";
import { processStripeEvent } from "@/lib/stripe-sync";

// Endpoint público de Stripe — se configura en el Dashboard (Developers →
// Webhooks) apuntando a <NEXT_PUBLIC_APP_URL>/api/stripe/webhook. Eventos a
// suscribir: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted (ver
// docs/product-completion-plan.md → Block 1, sección de configuración manual).
//
// La firma (Stripe-Signature) es la única autenticación — por eso leemos el
// body como texto crudo (nunca req.json(), que ya lo habría reserializado y
// rompería la verificación HMAC). La lógica (idempotencia por event.id,
// orden, duplicados) vive en src/lib/stripe-sync.ts.

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
    const outcome = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: outcome === "duplicate" });
  } catch (err) {
    console.error(`[stripe webhook] error procesando ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
