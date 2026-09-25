// Núcleo de envío/registro del Inbox (Communications Platform, Fase 3, doc §6/§8).
// Server actions (src/actions/inbox.ts) y la ruta pública de Contact Us construyen sobre
// esto — la lógica de threading/envío vive en un solo lugar.

import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";
import { db } from "@/lib/db";
import { recordAndSend } from "@/lib/communications/outbox";
import { resolveSenderIdentity, resolveSenderIdentityById } from "@/lib/communications/sender-identity";
import { formatFromHeader } from "@/lib/email-config";
import { PlainMessageEmail } from "@/emails/PlainMessageEmail";
import { uploadCommunicationAttachment } from "@/lib/storage";
import type { EmailAttachment } from "@/lib/email-attachments";
import type { EmailRichTextDocument } from "@/lib/email-rich-text";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY no está configurado");
  }
  return new Resend(key);
}

export interface SendInboxMessageParams {
  shopId: string;
  threadId?: string | null;
  clientId?: string | null;
  createdByUserId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyRich?: EmailRichTextDocument | null;
  shopName: string;
  attachments?: EmailAttachment[];
  inReplyTo?: string | null;
  /** Override del selector "Enviar desde" — si no viene, usa la ruta INBOX por defecto. */
  senderIdentityId?: string | null;
}

export interface SendInboxMessageResult {
  messageId: string | null;
  threadId: string;
}

/**
 * Envía (o falla claramente) un mensaje humano del Inbox y lo deja registrado en el
 * thread correspondiente — crea el thread si no existe. No dedupe por idempotencyKey:
 * cada clic de "Enviar" es una acción humana deliberada, no un reintento automático.
 */
export async function sendInboxMessage(params: SendInboxMessageParams): Promise<SendInboxMessageResult> {
  const identity = params.senderIdentityId
    ? await resolveSenderIdentityById(params.shopId, params.senderIdentityId)
    : await resolveSenderIdentity(params.shopId, "INBOX", "EMAIL");
  if (!identity) {
    throw new Error(
      "No sender is configured for the Inbox. Set one up under Settings → Communication routes."
    );
  }

  const from = formatFromHeader(params.shopName, identity.address);
  const replyTo = identity.replyTo ?? identity.address;

  const client = params.clientId
    ? await db.client.findUnique({ where: { id: params.clientId }, select: { language: true } })
    : null;
  const lang = client?.language === "FR" ? "fr" : "en";

  const thread = params.threadId
    ? await db.communicationThread.findFirstOrThrow({ where: { id: params.threadId, shopId: params.shopId } })
    : await db.communicationThread.create({
        data: {
          shopId: params.shopId,
          clientId: params.clientId ?? null,
          subject: params.subject,
          status: "OPEN",
        },
      });

  const element = React.createElement(PlainMessageEmail, {
    shopName: params.shopName,
    bodyText: params.bodyText,
    bodyRich: params.bodyRich,
    footerText:
      lang === "fr" ? `Ce courriel a été envoyé par ${params.shopName}.` : `This email was sent by ${params.shopName}.`,
    lang,
  });
  const html = await render(element);

  const result = await recordAndSend({
    shopId: params.shopId,
    clientId: params.clientId,
    threadId: thread.id,
    purpose: "INBOX",
    channel: "EMAIL",
    provider: "resend",
    direction: "OUTBOUND",
    messageType: "HUMAN",
    from,
    replyTo,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    htmlBody: html,
    textBody: params.bodyText,
    businessEntityType: "COMMUNICATION_THREAD",
    businessEntityId: thread.id,
    createdByUserId: params.createdByUserId,
    send: async () => {
      const { data, error } = await getResend().emails.send({
        from,
        replyTo,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        html,
        attachments: params.attachments,
      });
      if (error) throw new Error(`Error enviando mensaje: ${error.message}`);
      return { providerMessageId: data?.id };
    },
  });

  if (result.messageId && params.attachments?.length) {
    await persistAttachments(params.shopId, result.messageId, params.attachments);
  }

  await db.communicationThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), status: "OPEN" },
  });

  return { messageId: result.messageId, threadId: thread.id };
}

async function persistAttachments(
  shopId: string,
  messageId: string,
  attachments: EmailAttachment[]
): Promise<void> {
  for (const att of attachments) {
    try {
      const mimeType = att.mimeType ?? "application/octet-stream";
      const { storagePath } = await uploadCommunicationAttachment(
        shopId,
        messageId,
        att.filename,
        att.content,
        mimeType
      );
      await db.communicationAttachment.create({
        data: {
          shopId,
          messageId,
          filename: att.filename,
          mimeType,
          size: att.content.length,
          storageKey: storagePath,
        },
      });
    } catch (err) {
      // El envío ya salió — no fallar la acción completa por un problema de storage.
      console.error("[inbox] error guardando adjunto:", err);
    }
  }
}

export type { EmailAttachment };

// ── SMS bidireccional ────────────────────────────────────────────────────────

export interface SendInboxSmsParams {
  shopId: string;
  /** Hilo existente; si no viene, se retoma el hilo SMS de ese teléfono o se crea uno. */
  threadId?: string | null;
  clientId?: string | null;
  to: string;
  body: string;
  createdByUserId?: string;
}

/**
 * Mensaje SMS escrito por una persona desde el Inbox. Exige número dedicado:
 * las respuestas del cliente tienen que volver a este taller. Sin idempotencyKey
 * — cada clic de "Enviar" es deliberado (igual que el email del Inbox).
 */
export async function sendInboxSms(params: SendInboxSmsParams): Promise<SendInboxMessageResult> {
  const { sendSms, toE164 } = await import("@/lib/sms");
  const phone = toE164(params.to);
  if (!phone) throw new Error("Invalid phone number");

  const thread = params.threadId
    ? await db.communicationThread.findFirstOrThrow({
        where: { id: params.threadId, shopId: params.shopId, channel: "SMS" },
      })
    : (await db.communicationThread.findFirst({
        where: { shopId: params.shopId, channel: "SMS", contactAddress: phone },
        orderBy: { lastMessageAt: "desc" },
      })) ??
      (await db.communicationThread.create({
        data: {
          shopId: params.shopId,
          channel: "SMS",
          contactAddress: phone,
          clientId: params.clientId ?? null,
          status: "OPEN",
        },
      }));

  const result = await sendSms({
    shopId: params.shopId,
    to: phone,
    body: params.body,
    purpose: "INBOX",
    clientId: params.clientId ?? thread.clientId,
    threadId: thread.id,
    messageType: "HUMAN",
    createdByUserId: params.createdByUserId,
    businessEntityType: "COMMUNICATION_THREAD",
    businessEntityId: thread.id,
    requireDedicatedNumber: true,
  });

  // Responder cuenta como leído: quien escribe ya vio la conversación.
  const now = new Date();
  await db.communicationThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: now, readAt: now, status: "OPEN" },
  });

  return { messageId: result.messageId, threadId: thread.id };
}
