import "server-only";
import { db } from "@/lib/db";
import { emailDomain, headerValue, isAutomatedMessage, normalizeEmail, parseAddress, parseMessageIdList } from "@/domain/sales-comms/email";
import { extractReplyKey } from "@/domain/sales-comms/tokens";
import { htmlToText } from "@/domain/sales-comms/html";
import { matchThread } from "@/domain/sales-comms/threading";
import { validateAttachment, MAX_ATTACHMENT_BYTES } from "@/domain/sales-comms/attachments";
import { fetchReceivedAttachment, fetchReceivedEmail, type ReceivedEmail } from "@/lib/sales-comms/provider";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { createThread } from "@/lib/sales-comms/threads";
import { stopEnrollments } from "@/lib/sales-comms/sequences";
import { publishInboxSignal } from "@/lib/sales-comms/realtime";
import { isStorageConfigured, uploadSalesEmailAttachment } from "@/lib/storage";
import { writeCrmAudit } from "@/lib/sales-crm/audit";

export type InboundResult =
  | { status: "stored"; threadId: string; messageId: string; matchedBy: string; automated: boolean }
  | { status: "duplicate" }
  | { status: "unrouted"; reason: string }
  | { status: "ignored"; reason: string };

const MAX_BODY = 200_000;

/** Does this local@domain address route to a sales identity? (`name+key@inbound` or `name@fromDomain`.) */
function stripTag(addr: string): string {
  const [local, domain] = normalizeEmail(addr).split("@");
  return `${(local ?? "").split("+")[0]}@${domain ?? ""}`;
}

async function resolveIdentity(recipients: string[], settings: { inboundDomain: string | null }) {
  const identities = await db.crmSenderIdentity.findMany({ include: { staff: { select: { id: true, userId: true, status: true } } } });
  const wanted = recipients.map(stripTag);
  return identities.find((i) => {
    const candidates = [i.fromEmail, ...(i.replyToEmail ? [i.replyToEmail] : [])];
    const locals = candidates.map((c) => c.split("@")[0].toLowerCase());
    return wanted.some((w) => {
      const [l, d] = w.split("@");
      return locals.includes(l) && (d === emailDomain(i.fromEmail) || (!!settings.inboundDomain && d === settings.inboundDomain.toLowerCase()));
    });
  }) ?? null;
}

/** Cheap pre-check used by the shared webhook: does any recipient belong to the SALES system (reply key or identity address)? */
export async function routesToSales(addresses: string[]): Promise<boolean> {
  const recipients = [...new Set(addresses.map(normalizeEmail))];
  const keys = recipients.map(extractReplyKey).filter((k): k is string => !!k);
  if (keys.length && (await db.crmEmailThread.count({ where: { replyKey: { in: keys } } })) > 0) return true;
  return (await resolveIdentity(recipients, await getCommsSettings())) !== null;
}

/**
 * Stores one inbound email in the Sales Inbox. Called after the webhook signature was verified. Idempotent on the
 * provider email id (unique), so Svix retries and replays cannot create a second copy.
 */
export async function processInboundEmail(emailId: string, preloaded?: ReceivedEmail): Promise<InboundResult> {
  if (await db.crmEmailMessage.findUnique({ where: { inboundProviderEmailId: emailId }, select: { id: true } })) return { status: "duplicate" };
  const email = preloaded ?? await fetchReceivedEmail(emailId); // throws on provider failure ⇒ the route answers 5xx and the provider retries
  const settings = await getCommsSettings();

  const from = parseAddress(email.from);
  if (!from) return { status: "ignored", reason: "invalid_from" };
  const recipients = [...new Set([...email.to, ...email.cc, ...email.receivedFor].map(normalizeEmail))];

  const replyKey = recipients.map(extractReplyKey).find(Boolean) ?? null;
  const keyedThread = replyKey ? await db.crmEmailThread.findUnique({ where: { replyKey } }) : null;
  const refs = parseMessageIdList([headerValue(email.headers, "in-reply-to") ?? "", headerValue(email.headers, "references") ?? ""]);
  const referenced = refs.length
    ? await db.crmEmailMessage.findMany({ where: { OR: [{ internetMessageId: { in: refs } }, { altMessageIds: { hasSome: refs } }] }, select: { threadId: true }, take: 5 })
    : [];

  let identity = keyedThread ? await db.crmSenderIdentity.findUnique({ where: { id: keyedThread.identityId }, include: { staff: { select: { id: true, userId: true, status: true } } } }) : null;
  if (!identity && referenced.length) {
    const t = await db.crmEmailThread.findUnique({ where: { id: referenced[0].threadId }, select: { identityId: true } });
    identity = t ? await db.crmSenderIdentity.findUnique({ where: { id: t.identityId }, include: { staff: { select: { id: true, userId: true, status: true } } } }) : null;
  }
  if (!identity) identity = await resolveIdentity(recipients, settings);
  if (!identity) {
    await recordUnrouted(emailId, "no_identity");
    return { status: "unrouted", reason: "no_identity" };
  }
  // Never ingest mail "from" our own sending identities (loop / spoof guard).
  if (await db.crmSenderIdentity.count({ where: { OR: [{ fromEmail: from.email }, { replyToEmail: from.email }] } })) return { status: "ignored", reason: "self_sender" };

  const automated = isAutomatedMessage(email.headers, email.subject, from.email);
  const text = (email.text?.trim() ? email.text : email.html ? htmlToText(email.html) : "").slice(0, MAX_BODY);

  const candidates = await db.crmEmailThread.findMany({ where: { identityId: identity.id, counterpartyEmail: from.email }, orderBy: { lastMessageAt: "desc" }, take: 20, select: { id: true, identityId: true, counterpartyEmail: true, subject: true, lastMessageAt: true, status: true } });
  const match = matchThread({
    replyKeyThreadId: keyedThread?.id ?? null, referencedMessageThreadIds: referenced.map((r) => r.threadId), identityId: identity.id, fromEmail: from.email, subject: email.subject,
    candidates, now: new Date(),
  });

  // CRM association: the contact whose address wrote to us (prefer one owned by the identity's seller).
  const contacts = await db.crmContact.findMany({ where: { emailNormalized: from.email, archivedAt: null }, include: { prospect: { select: { id: true, assignedStaffId: true, status: true } } }, orderBy: { updatedAt: "desc" }, take: 10 });
  const contact = contacts.find((c) => c.prospect.assignedStaffId === identity!.staffId) ?? contacts[0] ?? null;

  const now = new Date();
  let threadId: string;
  if (match.kind === "new") {
    const t = await createThread({ subject: email.subject || "(no subject)", identityId: identity.id, ownerStaffId: identity.staffId, prospectId: contact?.prospectId ?? null, contactId: contact?.id ?? null, counterpartyEmail: from.email });
    threadId = t.id;
  } else threadId = match.threadId;

  const thread = await db.crmEmailThread.findUniqueOrThrow({ where: { id: threadId } });
  // Late linking: a thread created before the sender was in the CRM adopts the contact now.
  const linkProspect = thread.prospectId ?? contact?.prospectId ?? null;
  const linkContact = thread.contactId ?? contact?.id ?? null;

  let messageId: string;
  try {
    const m = await db.crmEmailMessage.create({
      data: {
        threadId, identityId: identity.id, direction: "INBOUND", category: "REPLY", status: "RECEIVED", prospectId: linkProspect, contactId: linkContact, opportunityId: thread.opportunityId,
        fromAddress: from.email, fromName: from.name, toAddresses: email.to.map(normalizeEmail), ccAddresses: email.cc.map(normalizeEmail), subject: (email.subject || "(no subject)").slice(0, 500), bodyText: text,
        provider: "resend", inboundProviderEmailId: emailId, internetMessageId: email.messageId, inReplyTo: parseMessageIdList(headerValue(email.headers, "in-reply-to") ?? "")[0] ?? null, references: refs,
        isAutomated: automated, receivedAt: now, language: null,
      },
      select: { id: true },
    });
    messageId = m.id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { status: "duplicate" };
    throw e;
  }

  await db.crmEmailThread.update({
    where: { id: threadId },
    data: {
      lastInboundAt: now, lastMessageAt: now, ...(automated ? {} : { ownerSeenAt: null }), status: thread.status === "SPAM" ? "SPAM" : "OPEN", prospectId: linkProspect, contactId: linkContact,
      counterpartyEmail: thread.counterpartyEmail ?? from.email, ...(automated ? {} : { needsReply: true }),
    },
  });

  if (!automated) {
    // The only proof the reply path works: a real human reply routed back to this identity through its own key / headers.
    if ((match.kind === "reply_key" || match.kind === "message_id") && !identity.inboundVerifiedAt) {
      await db.crmSenderIdentity.updateMany({ where: { id: identity.id, inboundVerifiedAt: null }, data: { inboundVerifiedAt: now } });
    }
    if (linkProspect) {
      const sameProspectSender = !!contact && contact.prospectId === linkProspect;
      await stopEnrollments({ prospectIds: sameProspectSender ? [linkProspect] : [], contactIds: linkContact ? [linkContact] : [], reason: "REPLIED" }).catch((e) => console.error("[inbound] stopEnrollments failed", e));
      await db.crmActivity.create({
        data: { prospectId: linkProspect, opportunityId: thread.opportunityId, contactId: linkContact, type: "EMAIL_RECEIVED", subject: (email.subject || "(no subject)").slice(0, 200), body: text.slice(0, 300), metadata: { messageId, threadId }, occurredAt: now, authorUserId: identity.staff.userId },
      }).catch((e) => console.error("[inbound] activity failed", e));
      await db.crmProspect.update({ where: { id: linkProspect }, data: { lastActivityAt: now } }).catch(() => undefined);
    }
  }

  await storeInboundAttachments(emailId, messageId, email).catch((e) => console.error("[inbound] attachments failed", e instanceof Error ? e.message : e));
  await publishInboxSignal(identity.staff.userId, { threadId, type: "inbound" });
  return { status: "stored", threadId, messageId, matchedBy: match.kind, automated };
}

async function recordUnrouted(emailId: string, reason: string) {
  try {
    await db.crmEmailDeliveryEvent.create({ data: { providerEventId: `unrouted:${emailId}`, type: "inbound.unrouted", providerEmailId: emailId, detail: reason, occurredAt: new Date() } });
    await writeCrmAudit({ actorUserId: "system", action: "EMAIL_UNROUTED", entityType: "CrmEmailDeliveryEvent", metadata: { emailId, reason } });
  } catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; }
}

async function storeInboundAttachments(emailId: string, messageId: string, email: ReceivedEmail) {
  if (email.attachments.length === 0) return;
  let skipped = 0;
  for (const a of email.attachments.slice(0, 10)) {
    if (!isStorageConfigured() || a.size > MAX_ATTACHMENT_BYTES) { skipped++; continue; }
    try {
      const bytes = await fetchReceivedAttachment(emailId, a.id);
      const check = validateAttachment({ filename: a.filename ?? "attachment", mimeType: a.contentType, bytes });
      if (!check.ok) { skipped++; continue; }
      const { storagePath } = await uploadSalesEmailAttachment(messageId, check.filename, bytes, check.mimeType);
      const { createHash } = await import("node:crypto");
      await db.crmEmailAttachment.create({ data: { messageId, filename: check.filename, mimeType: check.mimeType, sizeBytes: bytes.length, storageKey: storagePath, sha256: createHash("sha256").update(bytes).digest("hex") } });
    } catch { skipped++; }
  }
  if (skipped > 0) {
    const thread = await db.crmEmailMessage.findUnique({ where: { id: messageId }, select: { threadId: true } });
    if (thread) await db.crmEmailNote.create({ data: { threadId: thread.threadId, authorUserId: "system", body: `${skipped} attachment(s) were not stored (type, size or storage unavailable).` } });
  }
}
