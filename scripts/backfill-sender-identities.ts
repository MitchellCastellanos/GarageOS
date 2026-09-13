// Backfill idempotente de SenderIdentity/CommunicationRoute — Fase 1 de
// Communications Platform (ver docs/communications-platform.md). Se ejecuta en cada
// deploy desde scripts/deploy-migrations.mjs vía `tsx` (para poder reusar los alias
// `@/*` y la lógica real de src/lib/communications/sender-identity.ts en vez de
// duplicarla en JS plano). Es seguro correrlo repetidamente: upserta por
// (shopId, channel, address) / (shopId, purpose, channel).
import { db } from "@/lib/db";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";

async function main() {
  const shops = await db.shop.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      billingEmail: true,
      infoEmail: true,
      providersEmail: true,
      newsletterEmail: true,
    },
  });

  let ok = 0;
  let failed = 0;

  for (const shop of shops) {
    try {
      await provisionDefaultSenderIdentities(shop);
      ok++;
    } catch (err) {
      failed++;
      console.error(`[backfill-sender-identities] taller ${shop.id} falló:`, err);
    }
  }

  console.log(`[backfill-sender-identities] ${ok} taller(es) procesado(s), ${failed} con error.`);
}

main()
  .catch((err) => {
    console.error("[backfill-sender-identities] error fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
