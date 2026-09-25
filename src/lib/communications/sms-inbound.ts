// SMS entrantes (webhook de Twilio, firma ya validada por la ruta). El taller se
// resuelve SOLO por el número que recibió el mensaje (To + AccountSid) — nunca
// por el contenido. Cada mensaje entra al Inbox existente como hilo SMS con el
// teléfono del cliente, y marca el hilo como no leído.
//
// Número compartido (talleres sin número dedicado): no hay forma segura de saber
// a qué taller responde el cliente. Se atribuye al último taller que le escribió
// por ese número en los últimos 30 días; un STOP/START ahí aplica a todos los
// talleres que le escribieron por el número compartido (el bloqueo del operador
// es por número, no por taller).

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toE164 } from "@/lib/phone";
import { parseSmsKeyword, type SmsKeyword } from "@/domain/sms";
import { addSuppression, removeSuppression } from "@/lib/communications/suppression";
import { getSharedSmsNumber, LIVE_NUMBER_STATUSES } from "@/lib/communications/sms-numbers";

export interface InboundSmsInput {
  messageSid: string;
  accountSid: string;
  from: string;
  to: string;
  body: string;
  numSegments?: string | null;
}

export type InboundSmsResult =
  | { status: "recorded"; shopId: string; threadId: string; keyword: SmsKeyword | null }
  | { status: "deduped" }
  | { status: "unroutable"; reason: string };

const SHARED_ATTRIBUTION_DAYS = 30;

/** Talleres destinatarios: [principal, ...otros afectados por STOP/START]. */
async function resolveInboundShops(
  to: string,
  from: string,
  accountSid: string
): Promise<{ primary: string | null; all: string[] }> {
  const dedicated = await db.shopSmsNumber.findFirst({
    where: { phoneNumber: to, subaccountSid: accountSid, status: { in: [...LIVE_NUMBER_STATUSES] } },
    select: { shopId: true },
  });
  if (dedicated) return { primary: dedicated.shopId, all: [dedicated.shopId] };

  const shared = getSharedSmsNumber();
  if (!shared || shared !== to || accountSid !== process.env.TWILIO_ACCOUNT_SID?.trim()) {
    return { primary: null, all: [] };
  }

  const outbound = await db.communicationMessage.findMany({
    where: { channel: "SMS", direction: "OUTBOUND", from: shared, to: { has: from } },
    orderBy: { createdAt: "desc" },
    distinct: ["shopId"],
    select: { shopId: true, createdAt: true },
  });
  const cutoff = Date.now() - SHARED_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000;
  const recent = outbound.find((m) => m.createdAt.getTime() >= cutoff);
  return { primary: recent?.shopId ?? null, all: outbound.map((m) => m.shopId) };
}

/** Clientes del taller con ese teléfono (E.164), más reciente primero. */
export async function findClientsByPhone(shopId: string, phone: string) {
  const last4 = phone.replace(/\D/g, "").slice(-4);
  const candidates = await db.client.findMany({
    where: { shopId, phone: { contains: last4 } },
    select: { id: true, phone: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return candidates.filter((c) => c.phone && toE164(c.phone) === phone);
}

async function applyKeyword(keyword: SmsKeyword, shopIds: string[], phone: string): Promise<void> {
  if (keyword === "HELP") return; // Twilio responde HELP por su cuenta; solo queda registrado.

  for (const shopId of shopIds) {
    const clientIds = (await findClientsByPhone(shopId, phone)).map((c) => c.id);
    if (keyword === "STOP") {
      await addSuppression(shopId, "SMS", phone, "UNSUBSCRIBE");
      if (clientIds.length) {
        const now = new Date();
        await db.client.updateMany({
          where: { id: { in: clientIds }, shopId },
          data: { smsOptOutAt: now, smsMarketingOptOutAt: now, marketingSmsConsent: false },
        });
      }
    } else {
      // START revierte solo el STOP (no un bloqueo manual) ni el consentimiento de marketing.
      await removeSuppression(shopId, "SMS", phone, ["UNSUBSCRIBE"]);
      if (clientIds.length) {
        await db.client.updateMany({ where: { id: { in: clientIds }, shopId }, data: { smsOptOutAt: null } });
      }
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function handleInboundSms(input: InboundSmsInput): Promise<InboundSmsResult> {
  const from = toE164(input.from);
  const to = toE164(input.to);
  if (!from || !to) return { status: "unroutable", reason: "invalid_numbers" };

  const idempotencyKey = `twilio-inbound:${input.messageSid}`;
  const existing = await db.communicationMessage.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (existing) return { status: "deduped" };

  const keyword = parseSmsKeyword(input.body);
  const { primary, all } = await resolveInboundShops(to, from, input.accountSid);

  if (keyword && all.length) await applyKeyword(keyword, all, from);
  if (!primary) return { status: "unroutable", reason: "no_shop_for_number" };

  const clients = await findClientsByPhone(primary, from);
  const clientId = clients[0]?.id ?? null;

  const now = new Date();
  const openThread = await db.communicationThread.findFirst({
    where: { shopId: primary, channel: "SMS", contactAddress: from },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, clientId: true },
  });
  const threadId = openThread
    ? openThread.id
    : (
        await db.communicationThread.create({
          data: { shopId: primary, channel: "SMS", contactAddress: from, clientId, status: "OPEN", lastMessageAt: now },
          select: { id: true },
        })
      ).id;

  const segments = Number(input.numSegments);
  try {
    await db.communicationMessage.create({
      data: {
        shopId: primary,
        clientId,
        threadId,
        direction: "INBOUND",
        channel: "SMS",
        messageType: "HUMAN",
        status: "RECEIVED",
        provider: "twilio",
        providerMessageId: input.messageSid,
        purpose: "INBOX",
        idempotencyKey,
        from,
        to: [to],
        textBody: input.body,
        segments: Number.isFinite(segments) && segments > 0 ? segments : null,
        businessEntityType: "COMMUNICATION_THREAD",
        businessEntityId: threadId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "deduped" };
    throw err;
  }

  await db.communicationThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: now,
      lastInboundAt: now,
      status: "OPEN",
      ...(openThread && !openThread.clientId && clientId ? { clientId } : {}),
    },
  });

  return { status: "recorded", shopId: primary, threadId, keyword };
}
