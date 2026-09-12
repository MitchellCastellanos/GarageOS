import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyResendWebhookSignature } from "@/lib/communications/resend-webhook";
import { resolveShopIdByInboundAddress } from "@/lib/communications/sender-identity";
import { uploadCommunicationAttachment } from "@/lib/storage";

/**
 * Email entrante de Resend — Fase 4 de Communications Platform, NO ACTIVADA.
 *
 * Por qué está inactiva: requiere que el usuario configure recepción de correo en un
 * dominio real de Resend y agregue el webhook en su dashboard — nada de eso existe en
 * este entorno. El endpoint solo procesa algo cuando RESEND_INBOUND_WEBHOOK_SECRET está
 * configurado; sin esa variable responde 404 y no hace nada.
 *
 * ADVERTENCIA para quien active esto: las rutas de la API de Resend usadas abajo
 * (`/emails/inbound/{id}` y `/emails/inbound/{id}/attachments`) se armaron a partir de
 * la documentación pública de Resend (el webhook solo trae metadata; el contenido y los
 * adjuntos se piden aparte), pero no se pudieron verificar contra la referencia viva de
 * la API porque resend.com no es alcanzable desde este sandbox. Confírmalas contra
 * https://resend.com/docs antes de depender de este endpoint en producción.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await req.text();
  const valid = verifyResendWebhookSignature(secret, rawBody, {
    svixId: req.headers.get("svix-id"),
    svixTimestamp: req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("svix-signature"),
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; to?: string[]; from?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "email.received" || !event.data?.email_id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const toAddress = event.data.to?.[0]?.toLowerCase().trim();
  if (!toAddress) return NextResponse.json({ ok: true, skipped: true });

  const shopId = await resolveShopIdByInboundAddress(toAddress);
  if (!shopId) {
    // Dirección no pertenece a ningún taller activo — se descarta, no se asume nada.
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Idempotencia: un mismo email_id no debe crear dos mensajes si Resend reintenta el webhook.
  const existing = await db.communicationMessage.findFirst({
    where: { shopId, providerMessageId: event.data.email_id },
  });
  if (existing) return NextResponse.json({ ok: true, deduped: true });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY no configurado" }, { status: 500 });

  const emailRes = await fetch(`https://api.resend.com/emails/inbound/${event.data.email_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!emailRes.ok) {
    console.error("[resend-inbound] no se pudo obtener el contenido del correo:", await emailRes.text());
    return NextResponse.json({ error: "No se pudo obtener el correo" }, { status: 502 });
  }

  const email = (await emailRes.json()) as {
    from: string;
    to: string[];
    cc?: string[];
    subject?: string;
    text?: string;
    html?: string;
    message_id?: string;
    in_reply_to?: string;
    references?: string[];
    attachments?: { filename: string; content_type: string; download_url: string }[];
  };

  const fromAddress = email.from.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? email.from.toLowerCase();

  const client = await db.client.findFirst({ where: { shopId, email: fromAddress } });

  // Threading: intenta encontrar el mensaje al que responde por Message-ID (doc §7).
  let threadId: string | null = null;
  if (email.in_reply_to || email.references?.length) {
    const candidateIds = [email.in_reply_to, ...(email.references ?? [])].filter(
      (v): v is string => Boolean(v)
    );
    const parent = await db.communicationMessage.findFirst({
      where: { shopId, internetMessageId: { in: candidateIds } },
      select: { threadId: true },
    });
    threadId = parent?.threadId ?? null;
  }

  if (!threadId) {
    const thread = await db.communicationThread.create({
      data: {
        shopId,
        clientId: client?.id ?? null,
        subject: email.subject ?? null,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
    });
    threadId = thread.id;
  } else {
    await db.communicationThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date(), status: "OPEN" },
    });
  }

  const message = await db.communicationMessage.create({
    data: {
      shopId,
      clientId: client?.id ?? null,
      threadId,
      direction: "INBOUND",
      channel: "EMAIL",
      messageType: "HUMAN",
      status: "RECEIVED",
      provider: "resend",
      providerMessageId: event.data.email_id,
      internetMessageId: email.message_id ?? null,
      inReplyTo: email.in_reply_to ?? null,
      references: email.references ?? [],
      from: fromAddress,
      to: email.to ?? [toAddress],
      cc: email.cc ?? [],
      subject: email.subject ?? null,
      textBody: email.text ?? null,
      htmlBody: email.html ?? null,
    },
  });

  for (const att of email.attachments ?? []) {
    try {
      const fileRes = await fetch(att.download_url);
      if (!fileRes.ok) continue;
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const { storagePath } = await uploadCommunicationAttachment(
        shopId,
        message.id,
        att.filename,
        buffer,
        att.content_type
      );
      await db.communicationAttachment.create({
        data: {
          shopId,
          messageId: message.id,
          filename: att.filename,
          mimeType: att.content_type,
          size: buffer.length,
          storageKey: storagePath,
        },
      });
    } catch (err) {
      console.error("[resend-inbound] error guardando adjunto:", err);
    }
  }

  return NextResponse.json({ ok: true, threadId, messageId: message.id });
}
