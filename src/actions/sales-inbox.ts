"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canAssignToStaff } from "@/domain/sales-crm/access";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { applyTemplate, bookingLinkFor, deleteDraft, prepareSend, queueDraft, saveDraft, requireOwnIdentity } from "@/lib/sales-comms/compose";
import { requireScopedThread } from "@/lib/sales-comms/threads";
import { videoLinkFor } from "@/lib/sales-video";
import { suppressEmail } from "@/lib/sales-comms/suppression";
import { suggestedBasisExpiry } from "@/domain/sales-comms/casl";
import { validateAttachment, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from "@/domain/sales-comms/attachments";
import { isStorageConfigured, uploadSalesEmailAttachment, signedUrlForSalesEmailAttachment } from "@/lib/storage";
import { publishInboxSignal } from "@/lib/sales-comms/realtime";
import { dispatchMessage } from "@/lib/sales-comms/dispatcher";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { createHash } from "node:crypto";

const lang = z.enum(["EN", "FR"]).nullable().catch(null);
const composeSchema = z.object({
  messageId: z.string().max(40).optional().transform((v) => v || null), threadId: z.string().max(40).optional().transform((v) => v || null),
  prospectId: z.string().max(40).optional().transform((v) => v || null), contactId: z.string().max(40).optional().transform((v) => v || null), opportunityId: z.string().max(40).optional().transform((v) => v || null),
  to: z.string().max(2000).default(""), cc: z.string().max(2000).default(""), bcc: z.string().max(2000).default(""),
  subject: z.string().max(300).default(""), bodyText: z.string().max(20000).default(""), templateKey: z.string().max(40).optional().transform((v) => v || null),
  languageOverride: z.string().optional().transform((v) => (v === "EN" || v === "FR" ? v : null)),
});

function refresh(threadId?: string) {
  revalidatePath(PLATFORM.salesInbox);
  if (threadId) revalidatePath(PLATFORM.salesThread(threadId));
}

export async function saveEmailDraft(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const r = await saveDraft(actor, composeSchema.parse(Object.fromEntries(form)));
    refresh(r.threadId);
    return r;
  });
}

export interface PreviewResult {
  messageId: string; threadId: string; blocked: string | null; blockedDetail: string | null; html: string | null; text: string | null; subject: string | null;
  warnings: string[]; language: string | null; category: string | null;
}

export async function previewEmail(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async (): Promise<PreviewResult> => {
    const saved = await saveDraft(actor, composeSchema.parse(Object.fromEntries(form)));
    const p = await prepareSend(actor, saved.messageId, true);
    if (!p.ok) return { messageId: saved.messageId, threadId: saved.threadId, blocked: p.error, blockedDetail: null, html: null, text: null, subject: null, warnings: [], language: null, category: null };
    return {
      messageId: saved.messageId, threadId: saved.threadId, blocked: p.decision.allowed ? null : p.decision.code, blockedDetail: p.decision.allowed ? null : p.decision.detail ?? null,
      html: p.content.html, text: p.content.text, subject: p.content.subject, warnings: p.warnings, language: p.language, category: p.category,
    };
  });
}

/** Send now (default) or schedule (ISO local date+time in the seller's timezone). Everything is re-validated server-side. */
export async function sendEmail(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const saved = await saveDraft(actor, composeSchema.parse(Object.fromEntries(form)));
    let scheduledFor: Date | null = null;
    const date = String(form.get("scheduleDate") ?? ""), time = String(form.get("scheduleTime") ?? "");
    if (date && time) {
      const identity = await requireOwnIdentity(actor);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new CrmError("INVALID_SCHEDULE");
      scheduledFor = parseShopDateTime(date, time, identity.staff.timezone);
    }
    const r = await queueDraft(actor, saved.messageId, { scheduledFor });
    refresh(saved.threadId);
    if (!r.ok) throw new CrmError(r.error);
    return { messageId: r.messageId, threadId: r.threadId, status: r.status, errorCode: "errorCode" in r ? r.errorCode : null };
  });
}

export async function discardDraft(messageId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => { await deleteDraft(actor, messageId); refresh(); return {}; });
}

export async function loadTemplate(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const r = await applyTemplate(actor, {
      templateKey: String(form.get("templateKey") ?? ""), prospectId: String(form.get("prospectId") ?? ""),
      contactId: String(form.get("contactId") ?? "") || null, languageOverride: lang.parse(form.get("languageOverride") || null),
    });
    if (!r.ok) throw new CrmError(r.error);
    return r;
  });
}

export async function insertBookingLink(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => ({
    url: await bookingLinkFor(actor, { prospectId: String(form.get("prospectId") ?? "") || null, contactId: String(form.get("contactId") ?? "") || null, language: lang.parse(form.get("language") || null) }),
  }));
}

/** Composer "Insert video": a tracked landing link for the commercial/teaser in the recipient's language. Needs the seller's own prospect scope. */
export async function insertVideoLink(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const parsed = z.object({ prospectId: z.string().min(1), contactId: z.string().nullable().catch(null), kind: z.enum(["commercial", "teaser"]), language: z.enum(["EN", "FR"]) }).parse({
      prospectId: String(form.get("prospectId") ?? ""), contactId: String(form.get("contactId") ?? "") || null, kind: form.get("kind"), language: form.get("language"),
    });
    const v = await videoLinkFor(actor, parsed);
    return { url: v.url };
  });
}

export async function retryFailedEmail(messageId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const m = await db.crmEmailMessage.findFirst({ where: { id: messageId, direction: "OUTBOUND", status: "FAILED" } });
    if (!m) throw new CrmError("NOT_FOUND");
    await requireScopedThread(actor, m.threadId);
    if (m.authorUserId !== actor.userId && !actor.all) throw new CrmError("NOT_FOUND");
    const r = await db.crmEmailMessage.updateMany({ where: { id: m.id, status: "FAILED" }, data: { status: "QUEUED", nextAttemptAt: new Date(), attempts: 0, errorCode: null, errorMessage: null, failedAt: null } });
    if (r.count === 1) await dispatchMessage(m.id);
    refresh(m.threadId);
    return {};
  });
}

export async function addInternalNote(threadId: string, body: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    const text = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (!text || text.length > 4000) throw new CrmError("INVALID");
    await db.crmEmailNote.create({ data: { threadId: t.id, authorUserId: actor.userId, body: text } });
    refresh(t.id);
    return {};
  });
}

export async function setThreadStatus(threadId: string, status: "OPEN" | "DONE" | "SPAM") {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    await db.crmEmailThread.update({ where: { id: t.id }, data: { status, needsReply: status === "OPEN" ? t.needsReply : false } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "THREAD_STATUS_CHANGED", entityType: "CrmEmailThread", entityId: t.id, prospectId: t.prospectId, metadata: { status } });
    refresh(t.id);
    return {};
  });
}

/** Marks everything up to now as read for the thread's owner (a manager/Super Admin merely looking does not clear the owner's unread). */
export async function markThreadSeen(threadId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    if (actor.staffId && t.ownerStaffId === actor.staffId) await db.crmEmailThread.update({ where: { id: t.id }, data: { ownerSeenAt: new Date() } });
    return {};
  });
}

/** Reassign a conversation: managers within their team, Super Admin anywhere. The new owner replies from THEIR OWN identity. */
export async function reassignThread(threadId: string, staffId: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    if (!canAssignToStaff(actor, staffId)) throw new CrmError("ASSIGNMENT_FORBIDDEN");
    const target = await db.platformSalesStaff.findUnique({ where: { id: staffId }, select: { status: true, userId: true } });
    if (!target || target.status !== "ACTIVE") throw new CrmError("ASSIGNEE_INACTIVE");
    await db.crmEmailThread.update({ where: { id: t.id }, data: { ownerStaffId: staffId, ownerSeenAt: null } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "THREAD_ASSIGNED", entityType: "CrmEmailThread", entityId: t.id, prospectId: t.prospectId, staffId, metadata: { from: t.ownerStaffId } });
    await publishInboxSignal(target.userId, { threadId: t.id, type: "assigned" });
    refresh(t.id);
    return {};
  });
}

/** Associates a thread (e.g. an inbound from an unknown address) with a CRM prospect/contact within the actor's scope. */
export async function linkThread(threadId: string, prospectId: string, contactId: string | null) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    const p = await requireScopedProspect(actor, prospectId);
    if (contactId && !(await db.crmContact.findFirst({ where: { id: contactId, prospectId: p.id }, select: { id: true } }))) throw new CrmError("NOT_FOUND");
    await db.crmEmailThread.update({ where: { id: t.id }, data: { prospectId: p.id, contactId } });
    await db.crmEmailMessage.updateMany({ where: { threadId: t.id, prospectId: null }, data: { prospectId: p.id, contactId } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "THREAD_LINKED", entityType: "CrmEmailThread", entityId: t.id, prospectId: p.id });
    refresh(t.id);
    return {};
  });
}

/** Human-confirmed opt-out from a reply ("please remove me"): suppresses the address everywhere and stops sequences. */
export async function recordOptOut(threadId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    if (!t.counterpartyEmail) throw new CrmError("INVALID");
    await suppressEmail({ email: t.counterpartyEmail, reason: "REPLY_OPT_OUT", source: "seller_confirmed_reply", actorUserId: actor.userId });
    await db.crmEmailThread.update({ where: { id: t.id }, data: { needsReply: false } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "OPT_OUT_RECORDED", entityType: "CrmEmailThread", entityId: t.id, prospectId: t.prospectId });
    refresh(t.id);
    return {};
  });
}

/** Authenticated refetch used after a Pusher signal (signals carry no content). */
export async function getThreadSnapshot(threadId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const t = await requireScopedThread(actor, threadId);
    const messages = await db.crmEmailMessage.findMany({ where: { threadId: t.id, status: { not: "DRAFT" } }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, direction: true, createdAt: true } });
    return { lastMessageAt: t.lastMessageAt.toISOString(), count: messages.length, statuses: messages.map((m) => m.status) };
  });
}

export async function attachFile(messageId: string, form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    if (!isStorageConfigured()) throw new CrmError("STORAGE_UNAVAILABLE");
    const draft = await db.crmEmailMessage.findFirst({ where: { id: messageId, status: "DRAFT", authorUserId: actor.userId }, include: { attachments: true } });
    if (!draft) throw new CrmError("NOT_FOUND");
    const file = form.get("file");
    if (!(file instanceof File)) throw new CrmError("INVALID");
    if (draft.attachments.length >= MAX_ATTACHMENTS) throw new CrmError("TOO_MANY_ATTACHMENTS");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (draft.attachments.reduce((n, a) => n + a.sizeBytes, 0) + bytes.length > MAX_TOTAL_ATTACHMENT_BYTES) throw new CrmError("TOO_LARGE");
    const check = validateAttachment({ filename: file.name, mimeType: file.type, bytes });
    if (!check.ok) throw new CrmError(`ATTACHMENT_${check.code}`);
    const { storagePath } = await uploadSalesEmailAttachment(draft.id, check.filename, Buffer.from(bytes), check.mimeType);
    const row = await db.crmEmailAttachment.create({ data: { messageId: draft.id, filename: check.filename, mimeType: check.mimeType, sizeBytes: bytes.length, storageKey: storagePath, sha256: createHash("sha256").update(bytes).digest("hex") } });
    return { attachmentId: row.id, filename: row.filename, sizeBytes: row.sizeBytes };
  });
}

export async function removeAttachment(attachmentId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const a = await db.crmEmailAttachment.findFirst({ where: { id: attachmentId, message: { status: "DRAFT", authorUserId: actor.userId } } });
    if (!a) throw new CrmError("NOT_FOUND");
    await db.crmEmailAttachment.delete({ where: { id: a.id } });
    return {};
  });
}

/** Short-lived signed link, issued only after the thread passes the scope check. */
export async function attachmentDownloadUrl(attachmentId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const a = await db.crmEmailAttachment.findUnique({ where: { id: attachmentId }, include: { message: { select: { threadId: true } } } });
    if (!a) throw new CrmError("NOT_FOUND");
    await requireScopedThread(actor, a.message.threadId);
    return { url: await signedUrlForSalesEmailAttachment(a.storageKey) };
  });
}

const basisSchema = z.object({
  contactId: z.string().min(5).max(40), kind: z.enum(["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"]),
  evidence: z.string().trim().min(12).max(1000), expiresAt: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59Z`) : null)),
});

/** CASL: documents WHY this contact may receive commercial email. Without a valid basis, no commercial email leaves. */
export async function recordSendingBasis(form: FormData) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const v = basisSchema.parse(Object.fromEntries(form));
    const c = await db.crmContact.findUnique({ where: { id: v.contactId }, select: { id: true, prospectId: true } });
    if (!c) throw new CrmError("NOT_FOUND");
    await requireScopedProspect(actor, c.prospectId);
    const now = new Date();
    const expiresAt = v.expiresAt ?? suggestedBasisExpiry(v.kind, now);
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new CrmError("INVALID");
    await db.crmSendingBasis.create({ data: { contactId: c.id, kind: v.kind, evidence: v.evidence, expiresAt, recordedByUserId: actor.userId } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_RECORDED", entityType: "CrmContact", entityId: c.id, prospectId: c.prospectId, metadata: { kind: v.kind, expiresAt: expiresAt?.toISOString() ?? null } });
    revalidatePath(PLATFORM.salesProspect(c.prospectId));
    return {};
  });
}

export async function revokeSendingBasis(contactId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { id: true, prospectId: true } });
    if (!c) throw new CrmError("NOT_FOUND");
    await requireScopedProspect(actor, c.prospectId);
    await db.crmSendingBasis.updateMany({ where: { contactId: c.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_REVOKED", entityType: "CrmContact", entityId: c.id, prospectId: c.prospectId });
    revalidatePath(PLATFORM.salesProspect(c.prospectId));
    return {};
  });
}
