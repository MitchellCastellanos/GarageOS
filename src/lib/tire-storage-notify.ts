// Tire Storage customer communications (Block 15 / I-2). One orchestrator on top of the EXISTING
// pipelines — no second messaging system: SMS first with email fallback (or both), per the customer's
// notify preference, through sendSms/sendTransactionalEmail (history, suppressions, Twilio/Resend
// routes, SMS allowance + overage accounting all come with them).
//
// Idempotency (two layers): a per-event key on the outbox (`tire-storage:<set>:<event>:<channel>`) makes
// a retried/duplicated call a no-op, and business timestamps on the set (`checkInNotifiedAt`,
// `pickupReminder14/3SentAt`) stop the cron from re-evaluating a reminder that already went out.
import type { Client, Shop, TireStorageSet, Vehicle } from "@prisma/client";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { resolveNotifyChannelPlan } from "@/domain/sms";
import { customerStorageReference, duePickupReminder, type PickupReminderKind } from "@/domain/tire-storage";
import { formatShopDate } from "@/lib/shop-timezone";
import { can } from "@/lib/subscription";
import { shopToEmailConfig } from "@/lib/email-config";
import { sendTireStorageSms } from "@/lib/sms";
import { sendTireStorageEmail } from "@/lib/email";
import { tireNoticeEmail, tireNoticeSms, type TireNoticeData, type TireNoticeKind } from "@/lib/tire-storage-copy";

export interface TireNotifyDeps {
  sendSms: typeof sendTireStorageSms;
  sendEmail: typeof sendTireStorageEmail;
}
const defaultDeps: TireNotifyDeps = { sendSms: sendTireStorageSms, sendEmail: sendTireStorageEmail };

export type TireNotifyResult =
  | { delivered: true; channels: ("SMS" | "EMAIL")[] }
  | { delivered: false; reason: "NOT_FOUND" | "NO_CONTACT" | "FAILED" };

type SetWithRelations = TireStorageSet & { client: Client; vehicle: Vehicle | null; shop: Shop };

function longDate(date: Date, timeZone: string, lang: "EN" | "FR"): string {
  return new Intl.DateTimeFormat(lang === "FR" ? "fr-CA" : "en-CA", { timeZone, dateStyle: "long" }).format(date);
}

export function buildTireNoticeData(set: SetWithRelations, kind: TireNoticeKind): TireNoticeData {
  const lang: "EN" | "FR" = set.client.language === "FR" ? "FR" : "EN";
  const tz = set.shop.timezone || "America/Montreal";
  return {
    kind,
    lang,
    clientName: [set.client.firstName, set.client.lastName].filter(Boolean).join(" "),
    shopName: set.shop.name,
    shopPhone: set.shop.phone,
    bookingUrl: set.shop.bookingEnabled && set.shop.slug ? `${getAppUrl()}/book/${set.shop.slug}` : null,
    vehicle: set.vehicle ? `${set.vehicle.year} ${set.vehicle.make} ${set.vehicle.model}` : null,
    quantity: set.quantity,
    size: set.size,
    season: set.season,
    reference: customerStorageReference(set.id),
    checkedInDate: longDate(set.checkedInAt, tz, lang),
    checkedOutDate: set.checkedOutAt ? longDate(set.checkedOutAt, tz, lang) : null,
    // @db.Date arrives as UTC midnight of the calendar day the shop chose — format it in UTC.
    expectedPickupDate: set.expectedPickupDate ? longDate(set.expectedPickupDate, "UTC", lang) : null,
  };
}

function eventKey(set: SetWithRelations, kind: TireNoticeKind, now: Date): string {
  switch (kind) {
    case "CHECK_IN":
      return `tire-storage:${set.id}:check-in:${set.checkedInAt.getTime()}`;
    case "CHECK_OUT":
      return `tire-storage:${set.id}:check-out:${set.checkedOutAt?.getTime() ?? 0}`;
    case "PICKUP_REMINDER_14":
    case "PICKUP_REMINDER_3":
      return `tire-storage:${set.id}:${kind}:${set.expectedPickupDate?.toISOString().slice(0, 10) ?? "none"}`;
    case "MANUAL":
      // Deliberate re-sends are allowed, but a double click within 5 minutes is one message.
      return `tire-storage:${set.id}:manual:${Math.floor(now.getTime() / 300_000)}`;
  }
}

/** Sends one lifecycle notice. Never throws for delivery problems — the caller's workflow must not depend on it. */
export async function notifyTireStorageCustomer(params: {
  shopId: string;
  setId: string;
  kind: TireNoticeKind;
  userId?: string;
  now?: Date;
}, deps: TireNotifyDeps = defaultDeps): Promise<TireNotifyResult> {
  const now = params.now ?? new Date();
  const set = await db.tireStorageSet.findFirst({
    where: { id: params.setId, shopId: params.shopId },
    include: { client: true, vehicle: true, shop: true },
  });
  if (!set) return { delivered: false, reason: "NOT_FOUND" };

  const client = set.client;
  const phone = client.phone?.trim();
  const email = client.email?.trim();
  if (!phone && !email) return { delivered: false, reason: "NO_CONTACT" };

  const data = buildTireNoticeData(set, params.kind);
  const key = eventKey(set, params.kind, now);
  const isReminder = params.kind === "PICKUP_REMINDER_14" || params.kind === "PICKUP_REMINDER_3";
  const smsBody = tireNoticeSms(data);
  const emailCopy = tireNoticeEmail(data);

  const trySms = async () => {
    if (!phone) return false;
    try {
      await deps.sendSms({
        to: phone, shopId: set.shopId, clientId: client.id, setId: set.id, body: smsBody,
        purpose: isReminder ? "REMINDER" : "TIRE_STORAGE", idempotencyKey: `${key}:sms`, createdByUserId: params.userId,
      });
      return true;
    } catch (err) {
      console.error(`[tire-storage] SMS falló (${set.id}, ${params.kind}):`, err);
      return false;
    }
  };
  const tryEmail = async () => {
    if (!email) return false;
    try {
      await deps.sendEmail({
        shop: shopToEmailConfig(set.shop), to: email, clientId: client.id, setId: set.id, lang: data.lang,
        subject: emailCopy.subject, subtitle: emailCopy.subtitle, body: emailCopy.body,
        channel: isReminder ? "REMINDER" : "WORK_ORDER", idempotencyKey: `${key}:email`,
      });
      return true;
    } catch (err) {
      console.error(`[tire-storage] email falló (${set.id}, ${params.kind}):`, err);
      return false;
    }
  };

  const { order, sendBoth } = resolveNotifyChannelPlan(client.notifyChannel);
  const attempt = { SMS: trySms, EMAIL: tryEmail } as const;
  const channels: ("SMS" | "EMAIL")[] = [];
  for (const channel of order) {
    if (await attempt[channel]()) {
      channels.push(channel);
      if (!sendBoth) break;
    }
  }
  if (channels.length === 0) return { delivered: false, reason: "FAILED" };

  await recordDelivery(set, params.kind, channels, params.userId, now).catch((err) =>
    console.error(`[tire-storage] no se pudo anotar el aviso (${set.id}):`, err)
  );
  return { delivered: true, channels };
}

async function recordDelivery(
  set: SetWithRelations,
  kind: TireNoticeKind,
  channels: ("SMS" | "EMAIL")[],
  userId: string | undefined,
  now: Date
) {
  const flag =
    kind === "CHECK_IN" ? { checkInNotifiedAt: now }
    : kind === "PICKUP_REMINDER_14" ? { pickupReminder14SentAt: now }
    : kind === "PICKUP_REMINDER_3" ? { pickupReminder3SentAt: now }
    : null;
  if (flag) {
    const [field] = Object.keys(flag);
    // Only the first delivery stamps the flag (guarded by IS NULL); the outbox key already prevented a resend.
    await db.tireStorageSet.updateMany({ where: { id: set.id, shopId: set.shopId, [field]: null }, data: flag });
  }
  await db.tireStorageEvent.create({
    data: { shopId: set.shopId, setId: set.id, type: "NOTIFIED", note: `${kind} · ${channels.join("+")}`, userId: userId ?? null },
  });
}

// ── Cron: pickup / seasonal-change reminders ─────────────────────────────────

export interface TireReminderRunResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function deliverDueTirePickupReminders(
  now: Date,
  canOperate: (shopId: string) => Promise<boolean>,
  deps: TireNotifyDeps = defaultDeps
): Promise<TireReminderRunResult> {
  const out: TireReminderRunResult = { sent: 0, skipped: 0, errors: 0 };
  // Cheap DB pre-filter (calendar dates are compared per shop below, in the shop's own zone).
  const candidates = await db.tireStorageSet.findMany({
    where: {
      status: "STORED",
      expectedPickupDate: { gte: new Date(now.getTime() - 2 * 86_400_000), lte: new Date(now.getTime() + 16 * 86_400_000) },
      OR: [{ pickupReminder3SentAt: null }, { pickupReminder14SentAt: null }],
    },
    include: { shop: { select: { id: true, timezone: true } } },
    take: 1000,
  });

  for (const set of candidates) {
    const todayYmd = formatShopDate(now, set.shop.timezone || "America/Montreal");
    const kind: PickupReminderKind | null = duePickupReminder({
      status: set.status,
      todayYmd,
      expectedPickupYmd: set.expectedPickupDate ? set.expectedPickupDate.toISOString().slice(0, 10) : null,
      checkedInAt: set.checkedInAt,
      now,
      earlySent: set.pickupReminder14SentAt != null,
      finalSent: set.pickupReminder3SentAt != null,
    });
    if (!kind) continue;
    if (!(await canOperate(set.shopId)) || !(await can(set.shopId, "tireStorage.manage"))) {
      out.skipped++;
      continue;
    }
    const res = await notifyTireStorageCustomer({ shopId: set.shopId, setId: set.id, kind, now }, deps);
    if (res.delivered) out.sent++;
    else if (res.reason === "NO_CONTACT") out.skipped++;
    else out.errors++;
  }
  return out;
}
