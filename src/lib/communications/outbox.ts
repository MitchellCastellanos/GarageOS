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
import { getEffectiveSubscription } from "@/lib/subscription";
import { assertProviderSideEffects } from "@/lib/provider-policy";
import { resolveDemoCommunication } from "@/lib/communications/demo-origin";

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
  /** null si el historial no se pudo escribir (el mensaje igual salió). */
  messageId: string | null;
  salesDemoOriginId?: string | null;
  /** Segmentos reales que reportó el proveedor (SMS), si los hubo. */
  segments?: number | null;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Estados que significan "ya se entregó de verdad" — solo estos deduplican sin reintentar. */
const TERMINAL_SUCCESS_STATUSES = new Set(["SENT", "DELIVERED"]);

/**
 * A QUEUED row this young belongs to a concurrent caller that is sending RIGHT NOW (a duplicated cron
 * run, a double click, a webhook retry). Treating it as "already handled" prevents a double send;
 * an older QUEUED row means the earlier attempt died, so the retry may take it over.
 */
export const IN_FLIGHT_WINDOW_MS = 120_000;

function isInFlight(existing: { status: string; createdAt: Date; sendAttemptedAt?: Date | null }, now = Date.now()): boolean {
  return ["QUEUED", "SENDING"].includes(existing.status) && now - (existing.sendAttemptedAt ?? existing.createdAt).getTime() < IN_FLIGHT_WINDOW_MS;
}

async function reserveMessageId(params: RecordAndSendParams, salesDemoOriginId: string | null): Promise<
  | { messageId: string; deduped: false; salesDemoOriginId: string | null }
  | { deduped: true; providerMessageId: string | null; messageId: string; salesDemoOriginId: string | null }
> {
  const senderIdentity = await resolveSenderIdentity(params.shopId, params.purpose, params.channel).catch(
    () => null
  );

  const createData = {
    salesDemoOriginId,
    sendAttemptedAt: new Date(),
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
    billedOverageSegments: salesDemoOriginId ? 0 : params.billedOverageSegments ?? null,
  } satisfies Prisma.CommunicationMessageUncheckedCreateInput;

  if (params.idempotencyKey) {
    const existing = await db.communicationMessage.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (existing.shopId !== params.shopId) throw new Error("COMMUNICATION_TENANT_MISMATCH");
      if (TERMINAL_SUCCESS_STATUSES.has(existing.status) || isInFlight(existing)) {
        return { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id, salesDemoOriginId: existing.salesDemoOriginId ?? salesDemoOriginId };
      }
      // Intento anterior quedó FAILED/QUEUED (ej. reintento de cron tras una caída del
      // proveedor) — reintenta reusando la misma fila en vez de duplicarla.
      const claimed = await db.communicationMessage.updateMany({
        where: { id: existing.id, status: existing.status, sendAttemptedAt: existing.sendAttemptedAt },
        data: { ...createData, salesDemoOriginId: existing.salesDemoOriginId ?? salesDemoOriginId,
          billedOverageSegments: existing.salesDemoOriginId || salesDemoOriginId ? 0 : createData.billedOverageSegments,
          status: "QUEUED", errorMessage: null, errorCode: null, failedAt: null },
      });
      const durableOrigin = existing.salesDemoOriginId ?? salesDemoOriginId;
      return claimed.count === 1 ? { messageId: existing.id, deduped: false, salesDemoOriginId: durableOrigin } :
        { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id, salesDemoOriginId: durableOrigin };
    }
  }

  try {
    const message = await db.communicationMessage.create({ data: createData });
    return { messageId: message.id, deduped: false, salesDemoOriginId: message.salesDemoOriginId ?? salesDemoOriginId };
  } catch (err) {
    if (params.idempotencyKey && isUniqueConstraintViolation(err)) {
      // Carrera: otra llamada concurrente creó la fila entre el findUnique y el create.
      const existing = await db.communicationMessage.findUniqueOrThrow({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing.shopId !== params.shopId) throw new Error("COMMUNICATION_TENANT_MISMATCH");
      if (TERMINAL_SUCCESS_STATUSES.has(existing.status) || isInFlight(existing)) {
        return { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id, salesDemoOriginId: existing.salesDemoOriginId ?? salesDemoOriginId };
      }
      // Another caller owns the reservation; never send without winning a lease.
      return { deduped: true, providerMessageId: existing.providerMessageId, messageId: existing.id, salesDemoOriginId: existing.salesDemoOriginId ?? salesDemoOriginId };
    }
    throw err;
  }
}

/** Tope de mensajes por taller+canal por hora (Fase 7, doc §20) — protege la reputación
 * compartida del remitente GarageOS mientras no exista un plan/entitlement real. */
const HOURLY_RATE_LIMIT: Record<CommChannel, number> = { EMAIL: 300, SMS: 100 };

/** Mensajes que un taller sin pago vigente no puede disparar solo (campañas y recordatorios). */
function isAutomatedOutreach(params: RecordAndSendParams): boolean {
  return params.messageType === "CAMPAIGN" || params.purpose === "REMINDER";
}

export async function recordAndSend(params: RecordAndSendParams): Promise<RecordAndSendResult> {
  // Política de efectos externos: ANTES de reservar historial / cupos — así un entorno no autorizado
  // no deja filas QUEUED/FAILED, no consume cupo SMS ni marca un envío como entregado.
  if ((params.direction ?? "OUTBOUND") === "OUTBOUND") {
    assertProviderSideEffects(params.provider === "twilio" ? "twilio" : "resend", "send");
  }
  const shop = await db.shop.findUnique({
    where: { id: params.shopId },
    select: { communicationsSuspendedAt: true, salesDemo: true },
  });
  if (shop?.communicationsSuspendedAt) {
    throw new Error("This shop's communications are suspended by the platform.");
  }
  const salesDemoOriginId = await resolveDemoCommunication(params.shopId, shop?.salesDemo);

  // Última barrera de estado de cuenta: un taller restringido no envía campañas ni
  // recordatorios (los crons ya lo filtran; esto cubre cualquier otro camino).
  // Lo transaccional (citas, facturas, inbox) sigue su propio gating en la acción.
  if (isAutomatedOutreach(params) && !(await getEffectiveSubscription(params.shopId)).canWrite) {
    throw new Error("This shop's subscription is not active — automated outreach is paused.");
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

  // El historial es bitácora, no requisito: si no se puede escribir (DB degradada),
  // el aviso al cliente igual sale — se pierde el registro, no el mensaje.
  let reserved: Awaited<ReturnType<typeof reserveMessageId>> | null = null;
  try {
    reserved = await reserveMessageId(params, salesDemoOriginId);
  } catch (err) {
    // A demo must never send without its durable non-meterable provenance.
    // Tenant mismatches always fail closed, including normal shops.
    if (salesDemoOriginId || (err instanceof Error && err.message === "COMMUNICATION_TENANT_MISMATCH")) throw err;
    console.error(`[outbox] no se pudo registrar el mensaje (${params.purpose}, ${params.shopId}); se envía sin historial:`, err);
  }
  if (reserved?.deduped) {
    return { deduped: true, providerMessageId: reserved.providerMessageId, messageId: reserved.messageId, salesDemoOriginId: reserved.salesDemoOriginId };
  }
  const messageId = reserved?.messageId ?? null;

  let result: Awaited<ReturnType<RecordAndSendParams["send"]>>;
  try {
    if (salesDemoOriginId && shop?.salesDemo && shop.salesDemo.status !== "CONVERTED") {
      const current = await db.salesDemo.findUnique({ where: { id: salesDemoOriginId } });
      const { authorizedDemoSession } = await import("@/lib/sales-demo");
      if (!current?.communicationsEnabled || !await authorizedDemoSession(current)) throw new Error("DEMO_COMMUNICATION_FORBIDDEN");
      const state = await db.shop.findUnique({ where: { id: params.shopId }, select: { communicationsSuspendedAt: true } });
      if (state?.communicationsSuspendedAt) throw new Error("This shop's communications are suspended by the platform.");
    }
    result = await params.send();
  } catch (err) {
    if (messageId) {
      await db.communicationMessage
        .update({
          where: { id: messageId },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
        .catch((updateErr) => console.error(`[outbox] no se pudo marcar FAILED (${messageId}):`, updateErr));
    }
    throw err;
  }

  // El proveedor ya aceptó el mensaje: un fallo al anotarlo nunca debe propagarse
  // (el llamador lo tomaría por fallo y reintentaría/caería a otro canal = duplicado).
  if (messageId) {
    await db.communicationMessage
      .update({
        where: { id: messageId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          ...(result.segments != null ? { segments: result.segments } : {}),
        },
      })
      .catch((err) => console.error(`[outbox] enviado pero no se pudo anotar SENT (${messageId}):`, err));
  }
  return {
    deduped: false,
    providerMessageId: result.providerMessageId ?? null,
    messageId,
    salesDemoOriginId: reserved?.salesDemoOriginId ?? salesDemoOriginId,
    segments: result.segments ?? null,
  };
}
