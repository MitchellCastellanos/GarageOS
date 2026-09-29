// Callbacks de estado de Twilio (StatusCallback de cada SMS saliente, firma ya
// validada por la ruta). Actualiza CommunicationMessage de forma monótona e
// idempotente, y cuando el operador reporta que un aviso automático no se
// entregó, lo reenvía por email (respaldo diferido).

import { db } from "@/lib/db";
import { mapTwilioMessageStatus, shouldApplyStatusUpdate } from "@/domain/sms";
import { addSuppression } from "@/lib/communications/suppression";
import { handleNotificationDeliveryFailure } from "@/lib/notification-fallback";
import { getSharedSmsNumber } from "@/lib/communications/sms-numbers";
import { getSharedNumberAccountSid } from "@/lib/communications/twilio";

export interface SmsStatusInput {
  messageSid: string;
  accountSid: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Twilio 21610: el destinatario respondió STOP a este número. */
const TWILIO_UNSUBSCRIBED_ERROR = "21610";

/**
 * El AccountSid del callback debe ser el dueño del número que envió el mensaje:
 * la cuenta principal si salió del número compartido; si no, la subcuenta del
 * taller (se conserva aunque el número se libere y se vuelva a pedir). Evita que
 * un callback de otra cuenta toque mensajes de este taller.
 */
async function accountOwnsMessage(message: { shopId: string; from: string }, accountSid: string): Promise<boolean> {
  if (message.from === getSharedSmsNumber()) return accountSid === getSharedNumberAccountSid();
  const number = await db.shopSmsNumber.findUnique({
    where: { shopId: message.shopId },
    select: { subaccountSid: true },
  });
  return Boolean(number?.subaccountSid && number.subaccountSid === accountSid);
}

export async function handleSmsStatusCallback(input: SmsStatusInput): Promise<"updated" | "ignored"> {
  const next = mapTwilioMessageStatus(input.status);
  if (!next || next === "RECEIVED") return "ignored";

  const message = await db.communicationMessage.findFirst({
    where: { provider: "twilio", providerMessageId: input.messageSid, direction: "OUTBOUND" },
    select: { id: true, shopId: true, from: true, to: true, status: true },
  });
  if (!message) return "ignored";
  if (!(await accountOwnsMessage(message, input.accountSid))) return "ignored";
  if (!shouldApplyStatusUpdate(message.status, next)) return "ignored";

  const now = new Date();
  // Condicionado al estado leído: dos callbacks simultáneos no aplican dos veces.
  const updated = await db.communicationMessage.updateMany({
    where: { id: message.id, status: message.status },
    data: {
      status: next,
      ...(next === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(next === "FAILED"
        ? {
            failedAt: now,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? (input.errorCode ? `Twilio error ${input.errorCode}` : null),
          }
        : {}),
    },
  });
  if (updated.count !== 1) return "ignored";

  if (next === "FAILED") {
    if (input.errorCode === TWILIO_UNSUBSCRIBED_ERROR && message.to[0]) {
      await addSuppression(message.shopId, "SMS", message.to[0], "UNSUBSCRIBE");
    }
    await handleNotificationDeliveryFailure(message.id, "SMS").catch((err) =>
      console.error(`[sms-status] respaldo por email falló (${message.id}):`, err)
    );
  }
  return "updated";
}

// ── Conciliación de callbacks perdidos ───────────────────────────────────────
// Twilio no reintenta un StatusCallback que ya respondimos 200, y a veces llega
// antes de que el envío guarde el providerMessageId (entonces se ignora). Sin
// esto, el mensaje quedaría en SENT para siempre y el respaldo por email de un
// fallo de entrega nunca correría. El cron consulta a Twilio por los mensajes
// que llevan un rato sin estado final y aplica el resultado por el mismo camino
// (monótono e idempotente) que el webhook.

const RECONCILE_MIN_AGE_MS = 15 * 60 * 1000;
const RECONCILE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface TwilioMessageSnapshot {
  status: string;
  accountSid: string;
  errorCode?: number | string | null;
  errorMessage?: string | null;
}

export type FetchTwilioMessage = (subaccountSid: string | null, messageSid: string) => Promise<TwilioMessageSnapshot | null>;

const defaultFetchTwilioMessage: FetchTwilioMessage = async (subaccountSid, messageSid) => {
  const { getTwilioClientFor } = await import("@/lib/communications/twilio");
  try {
    const m = await getTwilioClientFor(subaccountSid).messages(messageSid).fetch();
    return { status: m.status, accountSid: m.accountSid, errorCode: m.errorCode, errorMessage: m.errorMessage };
  } catch (err) {
    console.error(`[sms-status] no se pudo consultar ${messageSid} en Twilio:`, err);
    return null;
  }
};

export interface SmsReconcileResult {
  scanned: number;
  updated: number;
}

export async function reconcileStaleSmsStatuses(
  now: Date = new Date(),
  opts: { limit?: number; fetchMessage?: FetchTwilioMessage } = {}
): Promise<SmsReconcileResult> {
  const fetchMessage = opts.fetchMessage ?? defaultFetchTwilioMessage;
  const stale = await db.communicationMessage.findMany({
    where: {
      channel: "SMS",
      direction: "OUTBOUND",
      provider: "twilio",
      providerMessageId: { not: null },
      status: { in: ["QUEUED", "SENDING", "SENT"] },
      createdAt: {
        gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS),
        lte: new Date(now.getTime() - RECONCILE_MIN_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
    select: { id: true, shopId: true, from: true, providerMessageId: true },
  });

  const result: SmsReconcileResult = { scanned: 0, updated: 0 };
  const shared = getSharedSmsNumber();
  for (const m of stale) {
    result.scanned++;
    const subaccountSid =
      m.from === shared
        ? null
        : (await db.shopSmsNumber.findUnique({ where: { shopId: m.shopId }, select: { subaccountSid: true } }))
            ?.subaccountSid ?? null;
    const snapshot = await fetchMessage(subaccountSid, m.providerMessageId!);
    if (!snapshot) continue;
    const outcome = await handleSmsStatusCallback({
      messageSid: m.providerMessageId!,
      accountSid: snapshot.accountSid,
      status: snapshot.status,
      errorCode: snapshot.errorCode != null ? String(snapshot.errorCode) : null,
      errorMessage: snapshot.errorMessage ?? null,
    }).catch((err) => {
      console.error(`[sms-status] conciliación falló (${m.id}):`, err);
      return "ignored" as const;
    });
    if (outcome === "updated") result.updated++;
  }
  return result;
}
