// Envío individual de un mensaje de campaña — usado por el cron de lotes
// (src/app/api/webhooks/cron/campaigns/route.ts). El body de la campaña se trata
// siempre como texto plano del taller, nunca HTML arbitrario del tenant (doc §10.2);
// se renderiza a través del mismo layout seguro que el resto de los correos.

import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";
import type { Campaign, Client, Shop } from "@prisma/client";
import { recordAndSend } from "@/lib/communications/outbox";
import { resolveSenderIdentity } from "@/lib/communications/sender-identity";
import { formatFromHeader } from "@/lib/email-config";
import { buildUnsubscribeToken } from "@/lib/communications/suppression";
import { PlainMessageEmail } from "@/emails/PlainMessageEmail";
import { getAppUrl } from "@/lib/app-url";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY no está configurado");
  }
  return new Resend(key);
}

export interface SendCampaignEmailResult {
  messageId: string | null;
}

export async function sendCampaignEmail(params: {
  shop: Shop;
  campaign: Campaign;
  /** null solo para el envío de prueba a la propia cuenta del dueño (sin cliente real). */
  client: Client | null;
  address: string;
}): Promise<SendCampaignEmailResult> {
  const identity = await resolveSenderIdentity(params.shop.id, "CAMPAIGN", "EMAIL");
  if (!identity) {
    throw new Error("No hay un remitente configurado para Campañas.");
  }

  const from = formatFromHeader(params.shop.name, identity.address);
  const unsubscribeUrl = params.client
    ? `${getAppUrl()}/api/unsubscribe/${buildUnsubscribeToken(params.shop.id, params.client.id)}`
    : null;

  const element = React.createElement(PlainMessageEmail, {
    shopName: params.shop.name,
    headerSubtitle: params.campaign.subject ?? params.campaign.name,
    bodyText: params.campaign.bodyHtml,
    footerText: `Recibiste este correo porque eres cliente de ${params.shop.name}.`,
    unsubscribeUrl,
  });
  const html = await render(element);

  const result = await recordAndSend({
    shopId: params.shop.id,
    clientId: params.client?.id,
    purpose: "CAMPAIGN",
    channel: "EMAIL",
    provider: "resend",
    direction: "OUTBOUND",
    messageType: "CAMPAIGN",
    from,
    replyTo: identity.address,
    to: [params.address],
    subject: params.campaign.subject ?? params.campaign.name,
    htmlBody: html,
    textBody: params.campaign.bodyHtml,
    businessEntityType: "CAMPAIGN",
    businessEntityId: params.campaign.id,
    send: async () => {
      const { data, error } = await getResend().emails.send({
        from,
        replyTo: identity.address,
        to: params.address,
        subject: params.campaign.subject ?? params.campaign.name,
        html,
      });
      if (error) throw new Error(`Error enviando campaña: ${error.message}`);
      return { providerMessageId: data?.id };
    },
  });

  return { messageId: result.messageId };
}
