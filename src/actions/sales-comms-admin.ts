"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { cleanSubject, emailDomain, isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";
import { TEMPLATE_KEYS, categoryOfTemplate, unknownVariables } from "@/domain/sales-comms/templates";
import { getIdentitySetup } from "@/lib/sales-comms/setup";
import { liftSuppression, suppressEmail } from "@/lib/sales-comms/suppression";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { isValidTimezone } from "@/domain/sales-comms/meetings";

const refresh = () => { revalidatePath(PLATFORM.salesComms); };
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const domainRe = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

const settingsSchema = z.object({
  sendingEnabled: z.string().optional().transform((v) => v === "on" || v === "true"),
  approvedDomains: z.string().default("").transform((v) => [...new Set(v.split(/[\s,;]+/).map((d) => d.trim().toLowerCase()).filter(Boolean))]).pipe(z.array(z.string().regex(domainRe)).max(10)),
  inboundDomain: z.string().trim().toLowerCase().optional().transform((v) => v || null).pipe(z.string().regex(domainRe).nullable()),
  legalName: z.string().trim().min(2).max(120),
  mailingAddress: optText(300), contactEmail: z.string().trim().toLowerCase().optional().transform((v) => v || null).pipe(z.email().nullable()), contactPhone: optText(40),
  websiteUrl: z.string().trim().url().max(200).refine((v) => /^https:\/\//.test(v)),
  defaultDailyLimit: z.coerce.number().int().min(0).max(500), sendWindowStartHour: z.coerce.number().int().min(0).max(23), sendWindowEndHour: z.coerce.number().int().min(1).max(24),
  minNoticeMinutes: z.coerce.number().int().min(0).max(14 * 24 * 60), maxAdvanceDays: z.coerce.number().int().min(1).max(365),
}).refine((v) => v.sendWindowStartHour < v.sendWindowEndHour);

/** Super Admin: global sales-communications settings (kill switch, approved domains, CASL identification, limits). */
export async function saveCommsSettings(form: FormData) {
  const actor = await requireCrmActor("manage_sender_identities");
  return crmAction(async () => {
    const v = settingsSchema.parse(Object.fromEntries(form));
    const before = await getCommsSettings();
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { ...v, updatedByUserId: actor.userId } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "COMMS_SETTINGS_UPDATED", entityType: "CrmCommsSettings", entityId: "default", before: { sendingEnabled: before.sendingEnabled, approvedDomains: before.approvedDomains, inboundDomain: before.inboundDomain }, after: { sendingEnabled: v.sendingEnabled, approvedDomains: v.approvedDomains, inboundDomain: v.inboundDomain } });
    refresh();
    return {};
  });
}

const identitySchema = z.object({
  staffId: z.string().min(5).max(40), fromName: z.string().trim().min(2).max(100).refine((v) => !/[\u0000-\u001f<>"]/.test(v)),
  fromEmail: z.string().trim().toLowerCase().pipe(z.email().max(200)), replyToEmail: z.string().trim().toLowerCase().optional().transform((v) => v || null).pipe(z.email().nullable()),
  jobTitle: optText(120), phone: optText(40), signatureText: z.string().max(1200).optional().transform((v) => v?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() || null),
  defaultLanguage: z.enum(["EN", "FR"]), dailyLimit: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(0).max(500).nullable()),
});

/** Super Admin creates/updates a seller's sender identity. The address is only *configured* here; "ready" is proven by the provider. */
export async function saveSenderIdentity(form: FormData) {
  const actor = await requireCrmActor("manage_sender_identities");
  return crmAction(async () => {
    const v = identitySchema.parse(Object.fromEntries(form));
    const staff = await db.platformSalesStaff.findUnique({ where: { id: v.staffId }, select: { id: true, status: true } });
    if (!staff) throw new CrmError("NOT_FOUND");
    const settings = await getCommsSettings();
    if (!settings.approvedDomains.includes(emailDomain(v.fromEmail))) throw new CrmError("DOMAIN_NOT_APPROVED");
    if (v.replyToEmail && !settings.approvedDomains.includes(emailDomain(v.replyToEmail)) && emailDomain(v.replyToEmail) !== settings.inboundDomain) throw new CrmError("DOMAIN_NOT_APPROVED");
    const clash = await db.crmSenderIdentity.findFirst({ where: { fromEmail: v.fromEmail, NOT: { staffId: v.staffId } }, select: { id: true } });
    if (clash) throw new CrmError("EMAIL_IN_USE");
    const existing = await db.crmSenderIdentity.findUnique({ where: { staffId: v.staffId } });
    const data = { fromName: v.fromName, fromEmail: v.fromEmail, replyToEmail: v.replyToEmail, jobTitle: v.jobTitle, phone: v.phone, signatureText: v.signatureText, defaultLanguage: v.defaultLanguage, dailyLimit: v.dailyLimit, updatedByUserId: actor.userId };
    // Changing the address invalidates the proven reply path: it must be re-proven with a real round trip.
    const row = existing
      ? await db.crmSenderIdentity.update({ where: { id: existing.id }, data: { ...data, ...(existing.fromEmail !== v.fromEmail || existing.replyToEmail !== v.replyToEmail ? { inboundVerifiedAt: null } : {}) } })
      : await db.crmSenderIdentity.create({ data: { ...data, staffId: v.staffId, createdByUserId: actor.userId } });
    await writeCrmAudit({ actorUserId: actor.userId, action: existing ? "SENDER_IDENTITY_UPDATED" : "SENDER_IDENTITY_CREATED", entityType: "CrmSenderIdentity", entityId: row.id, staffId: v.staffId, metadata: { fromEmail: v.fromEmail } });
    refresh();
    return { identityId: row.id };
  });
}

/** Activation requires the PROVIDER to confirm the sending domain right now. No silent fallback sender, no manual override. */
export async function setSenderStatus(identityId: string, status: "ACTIVE" | "DISABLED") {
  const actor = await requireCrmActor("manage_sender_identities");
  return crmAction(async () => {
    const identity = await db.crmSenderIdentity.findUnique({ where: { id: identityId } });
    if (!identity) throw new CrmError("NOT_FOUND");
    if (status === "ACTIVE") {
      const { state } = await getIdentitySetup(identityId);
      const mustHave = ["domain_approved", "domain_verified", "provider_key"] as const;
      const failing = state.steps.filter((s) => (mustHave as readonly string[]).includes(s.key) && !s.ok);
      if (failing.length) throw new CrmError(`SETUP_${failing[0].key.toUpperCase()}`);
    }
    await db.crmSenderIdentity.update({ where: { id: identityId }, data: { status, updatedByUserId: actor.userId, ...(status === "ACTIVE" ? { sendingCheckedAt: new Date() } : {}) } });
    await writeCrmAudit({ actorUserId: actor.userId, action: status === "ACTIVE" ? "SENDER_IDENTITY_ACTIVATED" : "SENDER_IDENTITY_DISABLED", entityType: "CrmSenderIdentity", entityId: identityId, staffId: identity.staffId });
    refresh();
    return {};
  });
}

export async function refreshIdentitySetup(identityId: string) {
  await requireCrmActor("manage_sender_identities");
  return getIdentitySetup(identityId);
}

const templateSchema = z.object({
  key: z.enum(TEMPLATE_KEYS), language: z.enum(["EN", "FR"]), name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(200), bodyText: z.string().trim().min(10).max(8000),
});

/** Approving a template creates version n+1; earlier versions stay for the audit trail and for messages that used them. */
export async function approveTemplate(form: FormData) {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    const v = templateSchema.parse(Object.fromEntries(form));
    cleanSubject(v.subject);
    if (unknownVariables(v.subject + v.bodyText).length) throw new CrmError("UNKNOWN_VARIABLE");
    const category = categoryOfTemplate(v.key);
    if (category === "COMMERCIAL" && !/\{\{\s*seller\.name\s*\}\}/.test(v.bodyText)) throw new CrmError("SENDER_IDENTIFICATION_REQUIRED"); // CASL: identify the sender
    const last = await db.crmEmailTemplate.findFirst({ where: { key: v.key, language: v.language }, orderBy: { version: "desc" }, select: { version: true } });
    const row = await db.crmEmailTemplate.create({ data: { ...v, category, version: (last?.version ?? 0) + 1, approvedByUserId: actor.userId } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "TEMPLATE_APPROVED", entityType: "CrmEmailTemplate", entityId: row.id, metadata: { key: v.key, language: v.language, version: row.version } });
    refresh();
    return { version: row.version };
  });
}

export async function addManualSuppression(form: FormData) {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    const email = normalizeEmail(String(form.get("email") ?? ""));
    if (!isValidEmail(email)) throw new CrmError("INVALID");
    await suppressEmail({ email, reason: "MANUAL", source: "super_admin", actorUserId: actor.userId, note: String(form.get("note") ?? "").slice(0, 300) || null });
    refresh();
    return {};
  });
}

export async function liftEmailSuppression(suppressionId: string, note: string) {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    if (note.trim().length < 5) throw new CrmError("NOTE_REQUIRED");
    if (!(await liftSuppression({ suppressionId, actorUserId: actor.userId, note: note.trim().slice(0, 300) }))) throw new CrmError("NOT_FOUND");
    refresh();
    return {};
  });
}


