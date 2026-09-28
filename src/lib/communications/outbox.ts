// Outbox/log de comunicaciones — Fase 1 de Communications Platform.
// Envuelve cada envío real (Resend/Twilio) con un registro CommunicationMessage,
// sin cambiar el manejo de errores existente en los call sites: si `send()` falla,
// el mensaje se marca FAILED y el error se vuelve a lanzar tal cual (los call sites
// ya lo capturan en su propio try/catch). idempotencyKey evita reenvíos duplicados
// en reintentos (cron, doble clic) — ver docs/domain-model.md #9.

import { db } from "@/lib/db";
import { Prisma, type CommChannel, type CommDirection, type CommMessageType } from "@prisma/client";
import { resolveSenderIdentity } from "@/lib/communications/sender-identity";
import { isSuppressed } from "@/lib/communications/suppression";

export interface RecordAndSendParams {
  shopId: string;
  clientId?: string | null;
  threadId?: string | null;
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
  /** Segmentos SMS estimados antes del envío (se corrigen con lo que devuelva `send`). */
  segments?: number;
  /** Cuántos de esos segmentos son excedente del cupo mensual — ver planSmsOverage. */
  billedOverageSegments?: number;
  send: () => Promise<{ providerMessageId?: string | null; segments?: number | null }>;
}

export interface RecordAndSendResult {
  deduped: boolean;
  providerMessageId: string | null;
  messageId: string | null;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Estados que significan "ya se entregó de verdad" — solo estos deduplican sin reintentar. */
const TERMINAL_SUCCESS_STATUSES = new Set(["SENT", "DELIVERED"]);

async function reserveMessageId(params: RecordAndSendParams): Promise<
  | { messageId: string; deduped: false }
  | { deduped: true; providerMessageId: string | null; messageId: string }
> {
  const senderIdentity = await resolveSenderIdentity(params.shopId, params.purpose, params.channel).catch(
    () => null
  );

  const createData = {
    shopId: params.shopId,
    clientId: params.clientId ?? null,
    threadId: params.threadId ?? null,
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
    segments: params.segments ?? null,
    billedOverageSegments: params.billedOverageSegments ?? null,
  } satisfies Prisma.CommunicationMessageUncheckedCreateInput;

  if (params.idempotencyKey) {
    const existing = await db.communicationMessage.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (TERMINAL_SUCCESS_STATUSES.has(existing.status)) {
        return { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id };
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
        return { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id };
      }
      return { messageId: existing.id, deduped: false };
    }
    throw err;
  }
}

/** Tope de mensajes por taller+canal por hora (Fase 7, doc §20) — protege la reputación
 * compartida del remitente GarageOS mientras no exista un plan/entitlement real. */
const HOURLY_RATE_LIMIT: Record<CommChannel, number> = { EMAIL: 300, SMS: 100 };

export async function recordAndSend(params: RecordAndSendParams): Promise<RecordAndSendResult> {
  const shop = await db.shop.findUnique({
    where: { id: params.shopId },
    select: { communicationsSuspendedAt: true },
  });
  if (shop?.communicationsSuspendedAt) {
    throw new Error("This shop's communications are suspended by the platform.");
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await db.communicationMessage.count({
    where: { shopId: params.shopId, channel: params.channel, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= HOURLY_RATE_LIMIT[params.channel]) {
    throw new Error(`Hourly sending limit reached for ${params.channel} — try again later.`);
  }

  // Solo campañas se filtran por supresión — lo transaccional nunca se bloquea así
  // (doc §12.2/§12.3). El cron de campañas ya filtra antes de llamar aquí; esto es la
  // última barrera por si algo llega igual.
  if (params.messageType === "CAMPAIGN" && params.to[0]) {
    const suppressed = await isSuppressed(params.shopId, params.channel, params.to[0]);
    if (suppressed) {
      throw new Error(`Suppressed address: ${params.to[0]}`);
    }
  }

  const reserved = await reserveMessageId(params);
  if (reserved.deduped) {
    return { deduped: true, providerMessageId: reserved.providerMessageId, messageId: reserved.messageId };
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
        ...(result.segments != null ? { segments: result.segments } : {}),
      },
    });
    return { deduped: false, providerMessageId: result.providerMessageId ?? null, messageId };
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
