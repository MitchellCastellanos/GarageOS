import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSuppressed } from "@/lib/communications/suppression";
import { sendCampaignEmail } from "@/lib/communications/campaigns";

// Cron de envío de campañas — corre en lotes acotados en vez de mandar todo desde una
// request web (doc §11.4/§20). Protegido con CRON_SECRET, igual que el cron de
// recordatorios (src/app/api/webhooks/cron/route.ts).
//
// El plan Hobby de Vercel solo permite cron jobs de una vez al día (vercel.json corre
// esto a las 9am) — una campaña grande se termina de enviar en varios días, no en
// minutos. GLOBAL_RECIPIENT_LIMIT_PER_RUN y maxDuration están puestos para que una sola
// corrida no se pase del límite de ejecución de una función en Hobby (60s); si el
// proyecto sube a Pro, se puede programar esta ruta con más frecuencia en vercel.json
// y subir estos límites — ver docs/communications-activation-todo.md.
export const maxDuration = 60;

const BATCH_SIZE_PER_CAMPAIGN = 25;
const GLOBAL_RECIPIENT_LIMIT_PER_RUN = 150;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  await db.campaign.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    data: { status: "SENDING" },
  });

  const sendingCampaigns = await db.campaign.findMany({ where: { status: "SENDING" } });

  const results = { campaignsProcessed: 0, sent: 0, failed: 0, skipped: 0 };
  let processedThisRun = 0;

  for (const campaign of sendingCampaigns) {
    if (processedThisRun >= GLOBAL_RECIPIENT_LIMIT_PER_RUN) break;

    const shop = await db.shop.findUnique({ where: { id: campaign.shopId } });
    if (!shop) continue;

    // Kill switch de plataforma (Fase 7) — no borra la campaña, solo pausa el envío.
    if (shop.communicationsSuspendedAt) continue;

    results.campaignsProcessed++;

    const pending = await db.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: "PENDING" },
      take: Math.min(BATCH_SIZE_PER_CAMPAIGN, GLOBAL_RECIPIENT_LIMIT_PER_RUN - processedThisRun),
      include: { client: true },
    });

    for (const recipient of pending) {
      processedThisRun++;

      if (!recipient.client.marketingEmailConsent || recipient.client.emailMarketingOptOutAt) {
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED_NO_CONSENT" },
        });
        results.skipped++;
        continue;
      }

      const suppressed = await isSuppressed(campaign.shopId, campaign.channel, recipient.address);
      if (suppressed) {
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SKIPPED_SUPPRESSED" },
        });
        results.skipped++;
        continue;
      }

      try {
        const sendResult = await sendCampaignEmail({
          shop,
          campaign,
          client: recipient.client,
          address: recipient.address,
        });
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", messageId: sendResult.messageId },
        });
        results.sent++;
      } catch (err) {
        console.error(`[campaigns] error enviando a ${recipient.address} (campaña ${campaign.id}):`, err);
        await db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "FAILED" } });
        results.failed++;
      }
    }

    const remaining = await db.campaignRecipient.count({
      where: { campaignId: campaign.id, status: "PENDING" },
    });
    if (remaining === 0) {
      await db.campaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentAt: new Date() } });
    }
  }

  return NextResponse.json(results);
}
