import "server-only";
import type { CrmLanguage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { resolveEffectiveLanguage } from "@/domain/sales-crm/language";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { HeaderInjectionError, cleanSubject, generateMessageId, emailDomain, isValidEmail, normalizeEmail, replySubject, parseRecipientList } from "@/domain/sales-comms/email";
import { randomToken, signUnsubscribeToken } from "@/domain/sales-comms/tokens";
import { isTemplateKey, categoryOfTemplate, type TemplateKey, type TemplateLanguage } from "@/domain/sales-comms/templates";
import { baseVars, renderResolved, resolveTemplate, toTemplateLanguage } from "@/lib/sales-comms/templates";
import { buildContent, unsubscribeUrlFor, type BuiltContent } from "@/lib/sales-comms/content";
import { evaluatePolicy } from "@/lib/sales-comms/policy";
import { getCommsSettings, unsubscribeSecret } from "@/lib/sales-comms/settings";
import { createThread, requireScopedThread, threadingFor } from "@/lib/sales-comms/threads";
import { bookingUrl, ensureGeneralLink, ensureProspectLink } from "@/lib/sales-comms/booking-links";
import { dispatchMessage } from "@/lib/sales-comms/dispatcher";
import type { SendDecision } from "@/domain/sales-comms/casl";

const PLACEHOLDER = /\{\{[^}]*\}\}/;
export const MAX_BODY_CHARS = 20_000;

export interface ComposeInput {
  messageId?: string | null;
  threadId?: string | null;
  prospectId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  to: string; cc?: string; bcc?: string;
  subject: string; bodyText: string;
  templateKey?: string | null;
  languageOverride?: "FR" | "EN" | null;
}

/** The seller's own identity. Nobody sends as somebody else, and there is no fallback sender. */
export async function requireOwnIdentity(actor: PlatformSalesActor) {
  if (!actor.staffId) throw new CrmError("NO_SENDER_IDENTITY");
  const identity = await db.crmSenderIdentity.findUnique({ where: { staffId: actor.staffId }, include: { staff: { select: { id: true, userId: true, status: true, timezone: true, user: { select: { name: true } } } } } });
  if (!identity) throw new CrmError("NO_SENDER_IDENTITY");
  return identity;
}

async function loadLinks(actor: PlatformSalesActor, input: { prospectId?: string | null; contactId?: string | null; opportunityId?: string | null }) {
  const prospect = input.prospectId ? await requireScopedProspect(actor, input.prospectId) : null;
  let contact: { id: string; name: string; email: string | null; preferredLanguage: CrmLanguage | null; doNotContact: boolean } | null = null;
  if (input.contactId) {
    if (!prospect) throw new CrmError("NOT_FOUND");
    contact = await db.crmContact.findFirst({ where: { id: input.contactId, prospectId: prospect.id, archivedAt: null }, select: { id: true, name: true, email: true, preferredLanguage: true, doNotContact: true } });
    if (!contact) throw new CrmError("NOT_FOUND");
  }
  if (input.opportunityId) {
    if (!prospect) throw new CrmError("NOT_FOUND");
    const opp = await db.crmOpportunity.findFirst({ where: { id: input.opportunityId, prospectId: prospect.id }, select: { id: true } });
    if (!opp) throw new CrmError("NOT_FOUND");
  }
  return { prospect, contact };
}

export function effectiveLanguage(args: { override: "FR" | "EN" | null | undefined; contact: CrmLanguage | null | undefined; prospect: CrmLanguage | null | undefined }) {
  return resolveEffectiveLanguage({ override: args.override ?? null, contact: args.contact ?? null, prospect: args.prospect ?? "UNKNOWN" });
}

/**
 * Pre-fills subject/body from an approved template for the resolved language. The booking link is a real, opaque,
 * prospect-bound link (created once and re-used). Returns what is still missing so the UI can say so.
 */
export async function applyTemplate(actor: PlatformSalesActor, args: { templateKey: string; prospectId: string; contactId: string | null; languageOverride: "FR" | "EN" | null }) {
  if (!isTemplateKey(args.templateKey)) throw new CrmError("INVALID");
  const identity = await requireOwnIdentity(actor);
  const { prospect, contact } = await loadLinks(actor, args);
  if (!prospect) throw new CrmError("NOT_FOUND");
  const full = await db.crmProspect.findUniqueOrThrow({ where: { id: prospect.id }, select: { name: true, preferredLanguage: true } });
  const lang = effectiveLanguage({ override: args.languageOverride, contact: contact?.preferredLanguage, prospect: full.preferredLanguage });
  const tl = toTemplateLanguage(lang.language);
  if (!tl) return { ok: false as const, error: "LANGUAGE_REQUIRED" as const };
  const tpl = await resolveTemplate(args.templateKey, tl);
  let link: string | null = null;
  const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: identity.staffId }, select: { bookingEnabled: true } });
  if (staff.bookingEnabled) {
    const l = await ensureProspectLink({ staffId: identity.staffId, prospectId: prospect.id, contactId: contact?.id ?? null, opportunityId: args.templateKey ? null : null, language: tl, actorUserId: actor.userId });
    link = bookingUrl(l.token, tl);
  }
  const vars = baseVars({ language: tl, contactName: contact?.name ?? null, prospectName: full.name, sellerName: identity.fromName, sellerTitle: identity.jobTitle, bookingUrl: link });
  const r = await renderResolved(tpl, vars);
  return { ok: true as const, subject: r.subject, body: r.body, language: tl, languageSource: lang.source, templateVersion: tpl.version, templateKey: args.templateKey, missing: r.missing };
}

/** Insert-able booking link for the composer ("Insert booking link"). */
export async function bookingLinkFor(actor: PlatformSalesActor, args: { prospectId: string | null; contactId: string | null; language: "EN" | "FR" | null }) {
  const identity = await requireOwnIdentity(actor);
  const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: identity.staffId }, select: { bookingEnabled: true } });
  if (!staff.bookingEnabled) throw new CrmError("BOOKING_DISABLED");
  if (args.prospectId) {
    const { prospect, contact } = await loadLinks(actor, { prospectId: args.prospectId, contactId: args.contactId });
    const link = await ensureProspectLink({ staffId: identity.staffId, prospectId: prospect!.id, contactId: contact?.id ?? null, opportunityId: null, language: args.language, actorUserId: actor.userId });
    return bookingUrl(link.token, args.language);
  }
  return bookingUrl((await ensureGeneralLink(identity.staffId, actor.userId)).token, args.language);
}

function parseRecipients(input: ComposeInput) {
  const to = parseRecipientList(input.to), cc = parseRecipientList(input.cc ?? ""), bcc = parseRecipientList(input.bcc ?? "");
  return { to, cc, bcc, bad: [...to.invalid, ...cc.invalid, ...bcc.invalid] };
}

/** Saves (creates or updates) a draft. No send policy yet: that runs when the seller presses Send / Schedule. */
export async function saveDraft(actor: PlatformSalesActor, input: ComposeInput) {
  const identity = await requireOwnIdentity(actor);
  const { prospect, contact } = await loadLinks(actor, input);
  const r = parseRecipients(input);
  if (r.bad.length) throw new CrmError("INVALID_RECIPIENT");
  if (input.bodyText.length > MAX_BODY_CHARS) throw new CrmError("TOO_LONG");
  let subject = "";
  try { subject = input.subject.trim() ? cleanSubject(input.subject) : ""; } catch (e) { if (e instanceof HeaderInjectionError) throw new CrmError("INVALID_SUBJECT"); throw e; }
  const lang = effectiveLanguage({ override: input.languageOverride, contact: contact?.preferredLanguage, prospect: prospect ? (await db.crmProspect.findUniqueOrThrow({ where: { id: prospect.id }, select: { preferredLanguage: true } })).preferredLanguage : "UNKNOWN" });
  const templateKey = input.templateKey && isTemplateKey(input.templateKey) ? input.templateKey : null;

  return db.$transaction(async (tx) => {
    let threadId = input.threadId ?? null;
    if (threadId) {
      const t = await requireScopedThread(actor, threadId);
      threadId = t.id;
    }
    let existing = null;
    if (input.messageId) {
      existing = await tx.crmEmailMessage.findFirst({ where: { id: input.messageId, status: "DRAFT", authorUserId: actor.userId } });
      if (!existing) throw new CrmError("NOT_FOUND");
      threadId = existing.threadId;
    }
    if (!threadId) {
      const t = await createThread({ subject: subject || "(draft)", identityId: identity.id, ownerStaffId: identity.staffId, prospectId: prospect?.id ?? null, contactId: contact?.id ?? null, opportunityId: input.opportunityId ?? null, counterpartyEmail: r.to.valid[0] ?? null, language: lang.language, createdByUserId: actor.userId }, tx);
      threadId = t.id;
    }
    const data = {
      threadId, identityId: identity.id, direction: "OUTBOUND" as const, status: "DRAFT" as const, authorUserId: actor.userId,
      prospectId: prospect?.id ?? null, contactId: contact?.id ?? null, opportunityId: input.opportunityId ?? null,
      fromAddress: identity.fromEmail, fromName: identity.fromName, toAddresses: r.to.valid, ccAddresses: r.cc.valid, bccAddresses: r.bcc.valid,
      subject, bodyText: input.bodyText, templateKey, language: lang.language === "UNKNOWN" ? null : lang.language, languageSource: input.languageOverride ? "override" : lang.source,
    } satisfies Prisma.CrmEmailMessageUncheckedCreateInput;
    const msg = existing ? await tx.crmEmailMessage.update({ where: { id: existing.id }, data }) : await tx.crmEmailMessage.create({ data });
    return { messageId: msg.id, threadId };
  });
}

export async function deleteDraft(actor: PlatformSalesActor, messageId: string) {
  const m = await db.crmEmailMessage.findFirst({ where: { id: messageId, status: "DRAFT", authorUserId: actor.userId }, select: { id: true, threadId: true } });
  if (!m) throw new CrmError("NOT_FOUND");
  await db.crmEmailMessage.delete({ where: { id: m.id } });
  // Drop the thread when the draft was its only message (never touch a thread that has real history).
  const remaining = await db.crmEmailMessage.count({ where: { threadId: m.threadId } });
  if (remaining === 0) await db.crmEmailThread.delete({ where: { id: m.threadId } }).catch(() => undefined);
}

export type PreparedSend =
  | { ok: true; content: BuiltContent; category: "COMMERCIAL" | "REPLY"; language: "EN" | "FR"; languageSource: string; templateVersion: number | null; decision: SendDecision; warnings: string[] }
  | { ok: false; error: string; detail?: string; decision?: SendDecision };

/** Validation + rendering shared by Preview and Send. Pure with respect to the database (writes nothing). */
export async function prepareSend(actor: PlatformSalesActor, messageId: string, previewOnly: boolean): Promise<PreparedSend & { msg?: Awaited<ReturnType<typeof loadDraft>> }> {
  const msg = await loadDraft(actor, messageId);
  const identity = await requireOwnIdentity(actor);
  const settings = await getCommsSettings();
  const { prospect, contact } = await loadLinks(actor, { prospectId: msg.prospectId, contactId: msg.contactId, opportunityId: msg.opportunityId });
  const recipients = [...msg.toAddresses, ...msg.ccAddresses, ...msg.bccAddresses];
  if (msg.toAddresses.length === 0) return { ok: false, error: "NO_RECIPIENT", msg };
  if (!msg.subject.trim()) return { ok: false, error: "SUBJECT_REQUIRED", msg };
  if (!msg.bodyText?.trim()) return { ok: false, error: "BODY_REQUIRED", msg };
  if (PLACEHOLDER.test(msg.subject) || PLACEHOLDER.test(msg.bodyText)) return { ok: false, error: "UNRESOLVED_PLACEHOLDER", msg };

  const prospectLang = prospect ? (await db.crmProspect.findUniqueOrThrow({ where: { id: prospect.id }, select: { preferredLanguage: true } })).preferredLanguage : "UNKNOWN";
  const override = msg.languageSource === "override" && (msg.language === "FR" || msg.language === "EN") ? msg.language : null;
  const lang = effectiveLanguage({ override, contact: contact?.preferredLanguage, prospect: prospectLang });

  // Reply = the thread already has a human message from the counterparty; anything else is a solicitation.
  const history = await db.crmEmailMessage.findMany({ where: { threadId: msg.threadId, status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { direction: true, isAutomated: true, fromAddress: true, toAddresses: true, ccAddresses: true } });
  const hasInbound = history.some((h) => h.direction === "INBOUND" && !h.isAutomated);
  // A reply may only go to people already IN the conversation. Adding a new address turns it back into a solicitation,
  // which needs its own documented basis (otherwise Cc would be a back door around CASL).
  const participants = new Set(history.flatMap((h) => [h.fromAddress, ...h.toAddresses, ...h.ccAddresses]).map(normalizeEmail));
  participants.delete(normalizeEmail(identity.fromEmail));
  const toExisting = [...msg.toAddresses, ...msg.ccAddresses, ...msg.bccAddresses].every((a) => participants.has(normalizeEmail(a)));
  const category = hasInbound && toExisting ? ("REPLY" as const) : ("COMMERCIAL" as const);
  // Language is only *required* for solicitations; a reply may be written in whatever the human chose.
  const chosen: "EN" | "FR" = lang.language === "FR" || lang.language === "EN" ? lang.language : (msg.language === "FR" ? "FR" : msg.language === "EN" ? "EN" : identity.defaultLanguage === "FR" ? "FR" : "EN");
  const { decision } = await evaluatePolicy({ identityId: identity.id, category, recipients, prospectId: msg.prospectId, contactId: msg.contactId, languageResolved: category !== "COMMERCIAL" || lang.language !== "UNKNOWN", excludeMessageId: msg.id });

  const unsub = category === "COMMERCIAL" ? unsubscribeUrlFor(previewOnly ? "preview" : signUnsubscribeToken(unsubscribeSecret(), msg.id)) : null;
  const subjectOut = category === "REPLY" ? replySubject(msg.subject) : msg.subject;
  const content = await buildContent({
    subject: subjectOut, bodyText: msg.bodyText, language: chosen, commercial: category === "COMMERCIAL", unsubscribeUrl: unsub,
    identity: { staffId: identity.staffId, fromName: identity.fromName, fromEmail: identity.fromEmail, jobTitle: identity.jobTitle, phone: identity.phone },
    settings,
  });
  const warnings: string[] = [];
  if (!settings.inboundDomain) warnings.push("INBOUND_NOT_CONFIGURED");
  if (!identity.inboundVerifiedAt) warnings.push("REPLY_PATH_UNVERIFIED");
  if (lang.language === "UNKNOWN" && category === "COMMERCIAL") warnings.push("LANGUAGE_UNKNOWN");
  return { ok: true, content, category, language: chosen, languageSource: msg.languageSource ?? lang.source, templateVersion: null, decision, warnings, msg };
}

async function loadDraft(actor: PlatformSalesActor, messageId: string) {
  const m = await db.crmEmailMessage.findFirst({ where: { id: messageId, authorUserId: actor.userId, status: "DRAFT" }, include: { thread: true } });
  if (!m) throw new CrmError("NOT_FOUND");
  await requireScopedThread(actor, m.threadId);
  return m;
}

/**
 * Locks a draft into the durable outbox. Re-validates EVERYTHING (the draft may be hours old), snapshots language and
 * template version, assigns RFC threading headers, then attempts an immediate send unless it is scheduled.
 */
export async function queueDraft(actor: PlatformSalesActor, messageId: string, opts: { scheduledFor?: Date | null } = {}) {
  const prep = await prepareSend(actor, messageId, false);
  if (!prep.ok) return { ok: false as const, error: prep.error };
  if (!prep.decision.allowed) return { ok: false as const, error: prep.decision.code, detail: prep.decision.detail };
  const msg = prep.msg!;
  const now = new Date();
  const scheduledFor = opts.scheduledFor ?? null;
  if (scheduledFor && (scheduledFor.getTime() < now.getTime() + 60_000 || scheduledFor.getTime() > now.getTime() + 90 * 86_400_000)) return { ok: false as const, error: "INVALID_SCHEDULE" };

  const { references, inReplyTo } = await threadingFor(msg.threadId);
  const internetMessageId = generateMessageId(emailDomain(msg.fromAddress), randomToken(12));
  const content = prep.content;

  const updated = await db.crmEmailMessage.updateMany({
    where: { id: msg.id, status: "DRAFT", authorUserId: actor.userId },
    data: {
      status: scheduledFor ? "SCHEDULED" : "QUEUED", category: prep.category, subject: content.subject, bodyText: content.text, bodyHtml: content.html,
      language: prep.language, languageSource: prep.languageSource, templateKey: msg.templateKey, templateVersion: msg.templateKey ? (await templateVersionFor(msg.templateKey, prep.language)) : null,
      internetMessageId, inReplyTo, references, idempotencyKey: `compose:${msg.id}`, scheduledFor, nextAttemptAt: scheduledFor ?? now, attempts: 0,
    },
  });
  if (updated.count !== 1) return { ok: false as const, error: "ALREADY_QUEUED" };
  await db.crmEmailThread.update({ where: { id: msg.threadId }, data: { subject: msg.thread.subject === "(draft)" ? content.subject : undefined, counterpartyEmail: msg.toAddresses[0], language: prep.language } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "EMAIL_QUEUED", entityType: "CrmEmailMessage", entityId: msg.id, prospectId: msg.prospectId, metadata: { category: prep.category, scheduled: !!scheduledFor, language: prep.language } });
  if (scheduledFor) return { ok: true as const, status: "SCHEDULED" as const, messageId: msg.id, threadId: msg.threadId };
  const outcome = await dispatchMessage(msg.id, new Date());
  const fresh = await db.crmEmailMessage.findUnique({ where: { id: msg.id }, select: { status: true, errorCode: true } });
  return { ok: true as const, status: fresh?.status ?? "QUEUED", outcome, errorCode: fresh?.errorCode ?? null, messageId: msg.id, threadId: msg.threadId };
}

async function templateVersionFor(key: string, language: "EN" | "FR"): Promise<number | null> {
  if (!isTemplateKey(key)) return null;
  const t = await resolveTemplate(key as TemplateKey, language as TemplateLanguage);
  return t.version;
}

export { normalizeEmail, isValidEmail, categoryOfTemplate };
