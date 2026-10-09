import "server-only";
import { db } from "@/lib/db";
import { evaluateSendingBasis, evaluateSendPolicy, type SendDecision } from "@/domain/sales-comms/casl";
import { emailDomain, isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { evaluateColdEmail, requiredMode } from "@/domain/sales-crm/territory";
import { loadEngagement, territoryOfLocation } from "@/lib/sales-crm/territory";
import { formatShopDate, parseShopDateTime } from "@/lib/shop-timezone";

/** Commercial messages the seller's identity has queued/sent since local midnight (the daily cap counter). */
export async function sentTodayCount(identityId: string, tz: string, now: Date, excludeMessageId?: string): Promise<number> {
  const startOfDay = parseShopDateTime(formatShopDate(now, tz), "00:00", tz);
  return db.crmEmailMessage.count({
    where: { identityId, direction: "OUTBOUND", category: "COMMERCIAL", status: { in: ["QUEUED", "SENDING", "SENT", "DELIVERED", "DELAYED", "BOUNCED", "COMPLAINED"] }, createdAt: { gte: startOfDay }, ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}) },
  });
}

export interface PolicyTarget {
  identityId: string; category: "COMMERCIAL" | "REPLY" | "TRANSACTIONAL"; recipients: string[]; prospectId: string | null; contactId: string | null; languageResolved: boolean;
  /** The message being (re)checked: not counted against its own daily cap. */
  excludeMessageId?: string;
  /** True for sequence/automation sends (never a cold first contact in a field-held territory). */
  automated?: boolean;
}

/** Gathers every fact the pure policy needs, from the database, at the moment of the decision. */
export async function evaluatePolicy(t: PolicyTarget, now = new Date()): Promise<{ decision: SendDecision; basis: ReturnType<typeof evaluateSendingBasis> | null }> {
  const [settings, identity] = await Promise.all([
    getCommsSettings(),
    db.crmSenderIdentity.findUnique({ where: { id: t.identityId }, include: { staff: { select: { status: true, timezone: true, salesMode: true, userId: true } } } }),
  ]);
  if (!identity) return { decision: { allowed: false, code: "IDENTITY_UNKNOWN" }, basis: null };
  const recipients = [...new Set(t.recipients.map(normalizeEmail))];
  const supp = await activeSuppressions(recipients);

  // The contact being solicited: the linked one, else whichever CRM contact owns the first recipient address.
  let contactId = t.contactId;
  if (!contactId && recipients[0]) {
    const byEmail = await db.crmContact.findFirst({ where: { emailNormalized: recipients[0], archivedAt: null }, select: { id: true, prospectId: true }, orderBy: { updatedAt: "desc" } });
    contactId = byEmail?.id ?? null;
  }
  const [contact, prospect, bases, dncByAddress] = await Promise.all([
    contactId ? db.crmContact.findUnique({ where: { id: contactId }, select: { doNotContact: true } }) : null,
    t.prospectId ? db.crmProspect.findUnique({ where: { id: t.prospectId }, select: { doNotContact: true, status: true } }) : null,
    contactId ? db.crmSendingBasis.findMany({ where: { contactId } }) : [],
    // A Do-Not-Contact flag on ANY contact row holding one of these addresses blocks the send, linked or not.
    db.crmContact.count({ where: { emailNormalized: { in: recipients }, doNotContact: true } }),
  ]);
  const basis = t.category === "COMMERCIAL" ? evaluateSendingBasis(bases, now) : null;
  const tz = identity.staff.timezone;
  const sentToday = t.category === "COMMERCIAL" ? await sentTodayCount(identity.id, tz, now, t.excludeMessageId) : 0;
  const decision = evaluateSendPolicy({
    category: t.category, settingsSendingEnabled: settings.sendingEnabled, identityActive: identity.status === "ACTIVE", staffActive: identity.staff.status === "ACTIVE",
    fromDomainApproved: settings.approvedDomains.map((d) => d.toLowerCase()).includes(emailDomain(identity.fromEmail)),
    recipients: recipients.map((email) => ({ email, valid: isValidEmail(email), suppression: supp.get(email) ?? null })),
    prospect: prospect ? { doNotContact: prospect.doNotContact, archived: prospect.status === "ARCHIVED" } : null,
    contact: contact ? { doNotContact: contact.doNotContact || dncByAddress > 0 } : dncByAddress > 0 ? { doNotContact: true } : null,
    basis, languageResolved: t.languageResolved, sentToday,
    dailyLimit: Math.min(identity.dailyLimit ?? settings.defaultDailyLimit, settings.defaultDailyLimit),
    commercialFooterConfigured: !!settings.mailingAddress?.trim(),
  });
  if (decision.allowed && t.category === "COMMERCIAL" && t.prospectId) {
    const territory = await evaluateTerritoryPolicy(t.prospectId, { automated: !!t.automated, senderMode: identity.staff.salesMode, senderUserId: identity.staff.userId }, now);
    if (!territory.allowed) return { decision: { allowed: false, code: territory.code }, basis };
  }
  return { decision, basis };
}

/** Sales mode + territory rules for commercial email, evaluated from live data at the moment of the decision. */
export async function evaluateTerritoryPolicy(prospectId: string, who: { automated: boolean; senderMode: "FIELD" | "REMOTE"; senderUserId: string }, now: Date) {
  const p = await db.crmProspect.findUnique({ where: { id: prospectId }, select: { province: true, city: true, postalCode: true } });
  if (!p) return { allowed: true } as const;
  const [rule, eng, sender] = await Promise.all([territoryOfLocation(p), loadEngagement(prospectId), db.user.findUnique({ where: { id: who.senderUserId }, select: { role: true } })]);
  return evaluateColdEmail({ required: requiredMode(rule, eng, now), eng, automated: who.automated, senderMode: who.senderMode, senderIsSuperAdmin: sender?.role === "SUPER_ADMIN" });
}
