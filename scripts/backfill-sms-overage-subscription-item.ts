// Backfill idempotente: agrega el subscription item de excedente de SMS
// (STRIPE_SMS_OVERAGE_PRICE_ID) a las suscripciones de Stripe de talleres que
// ya existían antes de que createCheckoutSession empezara a incluirlo para
// talleres nuevos (ver "Cobro de excedente de SMS" en src/lib/stripe.ts). Se
// ejecuta en cada deploy desde scripts/deploy-migrations.mjs vía `tsx`. Seguro
// de correr repetidamente: ensureSmsOverageSubscriptionItem no hace nada si el
// item ya está. Sin STRIPE_SMS_OVERAGE_PRICE_ID configurada, no hace nada.
import { db } from "@/lib/db";
import { ensureSmsOverageSubscriptionItem, smsOverageMeterPriceId } from "@/lib/stripe";

async function main() {
  if (!smsOverageMeterPriceId()) {
    console.log("[backfill-sms-overage-subscription-item] STRIPE_SMS_OVERAGE_PRICE_ID no configurada — omitiendo.");
    return;
  }

  const subscriptions = await db.subscription.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    select: { shopId: true, stripeSubscriptionId: true },
  });

  let added = 0;
  let alreadyPresent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const result = await ensureSmsOverageSubscriptionItem(sub.stripeSubscriptionId!);
      if (result === "added") added++;
      else if (result === "already_present") alreadyPresent++;
    } catch (err) {
      failed++;
      console.error(`[backfill-sms-overage-subscription-item] taller ${sub.shopId} falló:`, err);
    }
  }

  console.log(
    `[backfill-sms-overage-subscription-item] ${added} agregado(s), ${alreadyPresent} ya lo tenían, ${failed} con error (de ${subscriptions.length} suscripción(es) revisada(s)).`
  );
}

main()
  .catch((err) => {
    console.error("[backfill-sms-overage-subscription-item] error fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
