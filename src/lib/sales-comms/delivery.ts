import "server-only";
import type { CrmEmailStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/domain/sales-comms/email";
import { suppressEmail } from "@/lib/sales-comms/suppression";
import { publishInboxSignal } from "@/lib/sales-comms/realtime";

const RANK: Record<string, number> = { DRAFT: 0, SCHEDULED: 1, QUEUED: 2, SENDING: 3, SENT: 4, DELAYED: 5, DELIVERED: 6, BOUNCED: 7, COMPLAINED: 7, FAILED: 7, CANCELLED: 0, RECEIVED: 0 };

export function mapDeliveryEvent(type: string): CrmEmailStatus | null {
  switch (type) {
    case "email.sent": return "SENT";
    case "email.delivery_delayed": return "DELAYED";
    case "email.delivered": return "DELIVERED";
    case "email.bounced": return "BOUNCED";
    case "email.complained": return "COMPLAINED";
    case "email.failed": case "email.suppressed": return "FAILED";
    default: return null;
  }
}

export interface DeliveryEvent {
  /** Svix delivery id — the replay-protection key. */
  eventId: string; type: string; createdAt: Date;
  data: { email_id?: string; message_id?: string; to?: string[]; bounce?: { type?: string; subType?: string; message?: string }; failed?: { reason?: string }; suppressed?: { message?: string; type?: string } };
}

export type DeliveryResult = "applied" | "duplicate" | "unknown_message" | "ignored";

/** Applies a provider delivery event to a SALES message. Replays are no-ops; status only ever moves forward. */
export async function applyDeliveryEvent(ev: DeliveryEvent): Promise<DeliveryResult> {
  const emailId = ev.data.email_id;
  const message = emailId ? await db.crmEmailMessage.findFirst({ where: { providerMessageId: emailId, direction: "OUTBOUND" }, include: { identity: { include: { staff: { select: { userId: true } } } } } }) : null;
  if (!message) return "unknown_message";
  const next = mapDeliveryEvent(ev.type);
  if (!next) return "ignored";

  try {
    await db.crmEmailDeliveryEvent.create({
      data: { providerEventId: ev.eventId, messageId: message.id, type: ev.type, providerEmailId: emailId, detail: (ev.data.bounce?.message ?? ev.data.failed?.reason ?? ev.data.suppressed?.message ?? null)?.slice(0, 300) ?? null, occurredAt: ev.createdAt },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "duplicate";
    throw e;
  }

  // Remember the provider's own Message-ID so a reply that references it still threads correctly.
  const mid = ev.data.message_id;
  const alt = mid && mid !== message.internetMessageId && !message.altMessageIds.includes(mid) ? [...message.altMessageIds, mid.startsWith("<") ? mid : `<${mid}>`] : null;

  if (RANK[next] > RANK[message.status]) {
    await db.crmEmailMessage.updateMany({
      where: { id: message.id, status: message.status },
      data: {
        status: next, ...(alt ? { altMessageIds: alt } : {}),
        ...(next === "DELIVERED" ? { deliveredAt: ev.createdAt } : {}),
        ...(["BOUNCED", "COMPLAINED", "FAILED"].includes(next) ? { failedAt: ev.createdAt, errorCode: ev.type, errorMessage: (ev.data.bounce?.message ?? ev.data.failed?.reason ?? ev.data.suppressed?.message ?? null)?.slice(0, 300) ?? null } : {}),
      },
    });
  } else if (alt) {
    await db.crmEmailMessage.update({ where: { id: message.id }, data: { altMessageIds: alt } });
  }

  const recipients = (ev.data.to?.length ? ev.data.to : message.toAddresses).map(normalizeEmail).filter((a) => message.toAddresses.map(normalizeEmail).includes(a));
  if (next === "BOUNCED" && ev.data.bounce?.type?.toLowerCase() === "permanent") for (const r of recipients) await suppressEmail({ email: r, reason: "HARD_BOUNCE", source: "provider_bounce", messageId: message.id });
  else if (next === "COMPLAINED") for (const r of recipients) await suppressEmail({ email: r, reason: "COMPLAINT", source: "provider_complaint", messageId: message.id });
  else if (ev.type === "email.suppressed") for (const r of recipients) await suppressEmail({ email: r, reason: "HARD_BOUNCE", source: "provider_suppressed", messageId: message.id });

  await publishInboxSignal(message.identity.staff.userId, { threadId: message.threadId, type: "status" });
  return "applied";
}
