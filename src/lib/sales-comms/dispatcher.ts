import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertSafeHeaderValue, formatMailbox } from "@/domain/sales-comms/email";
import { buildReplyTo } from "@/domain/sales-comms/tokens";
import { nextSendInstant } from "@/domain/sales-comms/business-days";
import { decideStop } from "@/domain/sales-comms/sequences";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { downloadSalesEmailAttachment } from "@/lib/storage";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { evaluatePolicy } from "@/lib/sales-comms/policy";
import { providerSend, SendError } from "@/lib/sales-comms/provider";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { publishInboxSignal } from "@/lib/sales-comms/realtime";
import { listUnsubscribeHeaders, unsubscribeApiUrlFor } from "@/lib/sales-comms/content";
import { unsubscribeSecret } from "@/lib/sales-comms/settings";
import { signUnsubscribeToken } from "@/domain/sales-comms/tokens";

export const MAX_ATTEMPTS = 5;
export const LOCK_TIMEOUT_MS = 5 * 60_000;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DispatchOutcome = "sent" | "retry" | "failed" | "deferred" | "cancelled" | "skipped";

export function backoffMinutes(attempt: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1];
}

/**
 * Processes due outbound mail. Safe to run concurrently (cron overlap, a double click, several workers): a message
 * is claimed with a compare-and-set on its status, and the provider call carries the message id as Idempotency-Key.
 */
export async function dispatchDue(opts: { now?: Date; limit?: number; paceMs?: number } = {}) {
  const now = opts.now ?? new Date();
  // A worker that died mid-send leaves SENDING behind. The provider dedupes by idempotency key, so re-queueing is safe.
  await db.crmEmailMessage.updateMany({
    where: { direction: "OUTBOUND", status: "SENDING", lockedAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
    data: { status: "QUEUED", nextAttemptAt: now },
  });
  const due = await db.crmEmailMessage.findMany({
    where: { direction: "OUTBOUND", status: { in: ["QUEUED", "SCHEDULED"] }, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" }, take: opts.limit ?? 25, select: { id: true },
  });
  const tally: Record<DispatchOutcome, number> = { sent: 0, retry: 0, failed: 0, deferred: 0, cancelled: 0, skipped: 0 };
  for (const [i, m] of due.entries()) {
    const outcome = await dispatchMessage(m.id, now);
    tally[outcome]++;
    if (outcome === "sent" && opts.paceMs && i < due.length - 1) await sleep(opts.paceMs); // provider rate limit (≈2 req/s)
  }
  return { considered: due.length, ...tally };
}

async function release(id: string, data: Prisma.CrmEmailMessageUpdateInput) {
  await db.crmEmailMessage.updateMany({ where: { id, status: "SENDING" }, data: data as Prisma.CrmEmailMessageUpdateManyMutationInput });
}

async function cancel(id: string, code: string, status: "CANCELLED" | "FAILED" = "CANCELLED") {
  await release(id, { status, errorCode: code, failedAt: new Date(), nextAttemptAt: null, lockedAt: null });
}

/** Sends one message if (and only if) it is due and this caller wins the claim. */
export async function dispatchMessage(id: string, now = new Date()): Promise<DispatchOutcome> {
  const claim = await db.crmEmailMessage.updateMany({
    where: { id, direction: "OUTBOUND", status: { in: ["QUEUED", "SCHEDULED"] }, nextAttemptAt: { lte: now } },
    data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 } },
  });
  if (claim.count !== 1) return "skipped";

  const msg = await db.crmEmailMessage.findUniqueOrThrow({
    where: { id },
    include: { thread: { select: { id: true, replyKey: true, ownerStaffId: true, prospectId: true, contactId: true } }, identity: { include: { staff: { select: { id: true, userId: true, status: true, timezone: true } } } }, attachments: true },
  });
  const systemOriginated = !!msg.sequenceEnrollmentId || !!msg.meetingId;

  // ── Pre-send guards: state may have changed since the message was queued. ──────────────────────────────
  if (msg.meetingId) {
    const meeting = await db.crmMeeting.findUnique({ where: { id: msg.meetingId }, select: { status: true, revision: true } });
    const rev = Number(/:r(\d+):/.exec(msg.idempotencyKey ?? "")?.[1] ?? NaN);
    const cancelNotice = msg.meetingEmailKind === "cancelled";
    if (!meeting || (!cancelNotice && (meeting.status !== "SCHEDULED" || (Number.isFinite(rev) && rev !== meeting.revision)))) {
      await cancel(id, "MEETING_OBSOLETE"); // a canceled/rescheduled meeting never sends an obsolete reminder or confirmation
      return "cancelled";
    }
  }
  if (msg.sequenceEnrollmentId) {
    const e = await db.crmSequenceEnrollment.findUnique({ where: { id: msg.sequenceEnrollmentId }, include: { sequence: { select: { status: true } }, contact: { select: { doNotContact: true, archivedAt: true, emailNormalized: true } }, prospect: { select: { doNotContact: true, status: true } } } });
    if (!e || e.status !== "ACTIVE" && e.status !== "COMPLETED") { await cancel(id, "ENROLLMENT_NOT_ACTIVE"); return "cancelled"; }
    const supp = e.contact.emailNormalized ? (await activeSuppressions([e.contact.emailNormalized])).get(e.contact.emailNormalized) ?? null : null;
    const opp = e.opportunityId ? await db.crmOpportunity.findUnique({ where: { id: e.opportunityId }, select: { stage: true } }) : null;
    const bases = await db.crmSendingBasis.findMany({ where: { contactId: e.contactId } });
    const stop = decideStop({
      prospectDnc: e.prospect.doNotContact, prospectArchived: e.prospect.status === "ARCHIVED", contactDnc: e.contact.doNotContact, contactArchived: !!e.contact.archivedAt,
      suppressed: supp, opportunityStage: opp?.stage ?? null, staffActive: msg.identity.staff.status === "ACTIVE", identityActive: msg.identity.status === "ACTIVE",
      basisValid: evaluateSendingBasis(bases, now).valid, sequenceArchived: e.sequence.status === "ARCHIVED",
    });
    if (stop) {
      const { stopEnrollments } = await import("@/lib/sales-comms/sequences");
      await stopEnrollments({ enrollmentIds: [e.id], reason: stop });
      await cancel(id, `STOP_${stop}`);
      return "cancelled";
    }
  }

  const recipients = [...msg.toAddresses, ...msg.ccAddresses, ...msg.bccAddresses];
  const { decision } = await evaluatePolicy({
    identityId: msg.identityId, category: msg.category, recipients, prospectId: msg.prospectId, contactId: msg.contactId,
    languageResolved: msg.category !== "COMMERCIAL" || (msg.language !== null && msg.language !== "UNKNOWN"), excludeMessageId: msg.id,
  }, now);
  // The message itself is already counted in today's total: only a *different* message may trip the cap.
  const policyCode = decision.allowed ? null : decision.code;
  if (policyCode === "SENDING_DISABLED") {
    await release(id, { status: "QUEUED", attempts: { decrement: 1 }, nextAttemptAt: new Date(now.getTime() + 30 * 60_000), lockedAt: null });
    return "deferred";
  }
  if (policyCode === "DAILY_LIMIT" && msg.sequenceEnrollmentId) {
    const settings = await getCommsSettings();
    const next = nextSendInstant(new Date(now.getTime() + 24 * 3_600_000), msg.identity.staff.timezone, { startHour: settings.sendWindowStartHour, endHour: settings.sendWindowEndHour, businessDaysOnly: true });
    await release(id, { status: "QUEUED", attempts: { decrement: 1 }, nextAttemptAt: next, lockedAt: null });
    return "deferred";
  }
  if (policyCode && policyCode !== "DAILY_LIMIT") {
    await cancel(id, policyCode, systemOriginated ? "CANCELLED" : "FAILED");
    await publishInboxSignal(msg.identity.staff.userId, { threadId: msg.threadId, type: "status" });
    return systemOriginated ? "cancelled" : "failed";
  }

  // ── Build the provider payload ────────────────────────────────────────────────────────────────────
  const settings = await getCommsSettings();
  let { subject, bodyText, bodyHtml } = msg;
  let ics: { filename: string; content: Buffer; contentType: string } | null = null;
  if (msg.meetingId && (!bodyHtml || !bodyText)) {
    const { renderMeetingMessage } = await import("@/lib/sales-comms/meeting-emails");
    const rendered = await renderMeetingMessage({ meetingId: msg.meetingId, kind: msg.meetingEmailKind ?? "confirmation", identityId: msg.identityId });
    if (!rendered) { await cancel(id, "RENDER_UNAVAILABLE"); return "cancelled"; }
    subject = rendered.subject; bodyText = rendered.text; bodyHtml = rendered.html; ics = rendered.ics;
    await db.crmEmailMessage.update({ where: { id }, data: { subject, bodyText, bodyHtml } });
  }
  if (!bodyText || !bodyHtml) { await cancel(id, "EMPTY_BODY", "FAILED"); return "failed"; }

  try {
    const headers: Record<string, string> = {};
    if (msg.internetMessageId) headers["Message-ID"] = assertSafeHeaderValue(msg.internetMessageId);
    if (msg.inReplyTo) headers["In-Reply-To"] = assertSafeHeaderValue(msg.inReplyTo);
    if (msg.references.length) headers["References"] = assertSafeHeaderValue(msg.references.slice(-20).join(" "));
    if (msg.category === "COMMERCIAL") {
      const token = signUnsubscribeToken(unsubscribeSecret(), msg.id);
      Object.assign(headers, listUnsubscribeHeaders(unsubscribeApiUrlFor(token)));
    }
    if (msg.meetingId) headers["Auto-Submitted"] = "auto-generated";

    const replyLocal = (msg.identity.replyToEmail ?? msg.identity.fromEmail).split("@")[0];
    const replyTo = settings.inboundDomain ? buildReplyTo(replyLocal, settings.inboundDomain, msg.thread.replyKey) : msg.identity.replyToEmail ?? undefined;
    const attachments = [
      ...(await Promise.all(msg.attachments.map(async (a) => ({ filename: a.filename, content: await downloadSalesEmailAttachment(a.storageKey), contentType: a.mimeType })))),
      ...(ics ? [ics] : []),
    ];
    const sent = await providerSend({
      from: formatMailbox(msg.fromName ?? msg.identity.fromName, msg.fromAddress), to: msg.toAddresses, cc: msg.ccAddresses, bcc: msg.bccAddresses, replyTo,
      subject, html: bodyHtml, text: bodyText, headers, attachments, idempotencyKey: msg.id,
    });
    const done = await db.crmEmailMessage.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "SENT", providerMessageId: sent.providerMessageId, sentAt: new Date(), lockedAt: null, nextAttemptAt: null, errorCode: null, errorMessage: null },
    });
    if (done.count === 1) await afterSent(msg, now);
    return "sent";
  } catch (e) {
    const err = e instanceof SendError ? e : new SendError("unexpected", e instanceof Error ? e.message : "unexpected error", false);
    if (err.disabled) {
      await release(id, { status: "QUEUED", attempts: { decrement: 1 }, nextAttemptAt: new Date(now.getTime() + 30 * 60_000), lockedAt: null, errorCode: err.code });
      return "deferred";
    }
    if (err.retryable && msg.attempts < MAX_ATTEMPTS) {
      await release(id, { status: "QUEUED", nextAttemptAt: new Date(now.getTime() + backoffMinutes(msg.attempts) * 60_000), lockedAt: null, errorCode: err.code, errorMessage: err.message.slice(0, 300) });
      return "retry";
    }
    await release(id, { status: "FAILED", failedAt: new Date(), nextAttemptAt: null, lockedAt: null, errorCode: err.code, errorMessage: err.message.slice(0, 300) });
    await publishInboxSignal(msg.identity.staff.userId, { threadId: msg.threadId, type: "status" });
    return "failed";
  }
}

async function afterSent(msg: { id: string; threadId: string; category: string; subject: string; prospectId: string | null; contactId: string | null; opportunityId: string | null; authorUserId: string | null; identityId: string; sequenceEnrollmentId: string | null; meetingId: string | null; identity: { staff: { userId: string } } }, now: Date) {
  await db.crmEmailThread.update({ where: { id: msg.threadId }, data: { lastOutboundAt: new Date(), lastMessageAt: new Date(), needsReply: false, identityId: msg.identityId } }).catch((e) => console.error("[sales-comms] thread update failed", e));
  if (msg.prospectId && !msg.meetingId) {
    await db.crmActivity.create({
      data: { prospectId: msg.prospectId, opportunityId: msg.opportunityId, contactId: msg.contactId, type: msg.sequenceEnrollmentId ? "SEQUENCE" : "EMAIL_SENT", subject: msg.subject.slice(0, 200), body: null, metadata: { messageId: msg.id, threadId: msg.threadId }, occurredAt: now, authorUserId: msg.authorUserId ?? msg.identity.staff.userId },
    }).catch((e) => console.error("[sales-comms] activity failed", e));
    await db.crmProspect.update({ where: { id: msg.prospectId }, data: { lastActivityAt: now } }).catch(() => undefined);
  }
  await publishInboxSignal(msg.identity.staff.userId, { threadId: msg.threadId, type: "sent" });
}
