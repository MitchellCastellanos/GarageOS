// Outbox/log de comunicaciones — Fase 1 de Communications Platform.
// Envuelve cada envío real (Resend/Twilio) con un registro CommunicationMessage,
// sin cambiar el manejo de errores existente en los call sites: si `send()` falla,
// el mensaje se marca FAILED y el error se vuelve a lanzar tal cual (los call sites
// ya lo capturan en su propio try/catch). idempotencyKey evita reenvíos duplicados
// en reintentos (cron, doble clic) — ver docs/domain-model.md #9.

import { db } from "@/lib/db";
import { Prisma, type CommChannel, type CommDirection, type CommMessageType } from "@prisma/client";
import { resolveSenderIdentity } from "@/lib/communications/sender-identity";

export interface RecordAndSendParams {
  shopId: string;
  clientId?: string | null;
  purpose: string;
  channel: CommChannel;
  provider: string;
  direction?: CommDirection;
  messageType?: CommMessageType;
  from: string;
  replyTo?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  businessEntityType?: string;
  businessEntityId?: string;
  idempotencyKey?: string;
  createdByUserId?: string;
  send: () => Promise<{ providerMessageId?: string | null }>;
}

export interface RecordAndSendResult {
  deduped: boolean;
  providerMessageId: string | null;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Estados que significan "ya se entregó de verdad" — solo estos deduplican sin reintentar. */
const TERMINAL_SUCCESS_STATUSES = new Set(["SENT", "DELIVERED"]);

async function reserveMessageId(params: RecordAndSendParams): Promise<
  { messageId: string; deduped: false } | { deduped: true; providerMessageId: string | null }
> {
  const senderIdentity = await resolveSenderIdentity(params.shopId, params.purpose, params.channel).catch(
    () => null
  );

  const createData = {
    shopId: params.shopId,
    clientId: params.clientId ?? null,
    direction: params.direction ?? "OUTBOUND",
    channel: params.channel,
    messageType: params.messageType ?? "TRANSACTIONAL",
    status: "QUEUED",
    provider: params.provider,
    senderIdentityId: senderIdentity?.id ?? null,
    purpose: params.purpose,
    businessEntityType: params.businessEntityType ?? null,
    businessEntityId: params.businessEntityId ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
    from: params.from,
    replyTo: params.replyTo ?? null,
    to: params.to,
    cc: params.cc ?? [],
    bcc: params.bcc ?? [],
    subject: params.subject ?? null,
    textBody: params.textBody ?? null,
    htmlBody: params.htmlBody ?? null,
    createdByUserId: params.createdByUserId ?? null,
  } satisfies Prisma.CommunicationMessageUncheckedCreateInput;

  if (params.idempotencyKey) {
    const existing = await db.communicationMessage.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (TERMINAL_SUCCESS_STATUSES.has(existing.status)) {
        return { deduped: true, providerMessageId: existing.providerMessageId };
      }
      // Intento anterior quedó FAILED/QUEUED (ej. reintento de cron tras una caída del
      // proveedor) — reintenta reusando la misma fila en vez de duplicarla.
      await db.communicationMessage.update({
        where: { id: existing.id },
        data: { ...createData, status: "QUEUED", errorMessage: null, errorCode: null, failedAt: null },
      });
      return { messageId: existing.id, deduped: false };
    }
  }

  try {
    const message = await db.communicationMessage.create({ data: createData });
    return { messageId: message.id, deduped: false };
  } catch (err) {
    if (params.idempotencyKey && isUniqueConstraintViolation(err)) {
      // Carrera: otra llamada concurrente creó la fila entre el findUnique y el create.
      const existing = await db.communicationMessage.findUniqueOrThrow({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (TERMINAL_SUCCESS_STATUSES.has(existing.status)) {
        return { deduped: true, providerMessageId: existing.providerMessageId };
      }
      return { messageId: existing.id, deduped: false };
    }
    throw err;
  }
}

export async function recordAndSend(params: RecordAndSendParams): Promise<RecordAndSendResult> {
  const reserved = await reserveMessageId(params);
  if (reserved.deduped) {
    return { deduped: true, providerMessageId: reserved.providerMessageId };
  }
  const { messageId } = reserved;

  try {
    const result = await params.send();
    await db.communicationMessage.update({
      where: { id: messageId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
      },
    });
    return { deduped: false, providerMessageId: result.providerMessageId ?? null };
  } catch (err) {
    await db.communicationMessage.update({
      where: { id: messageId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
