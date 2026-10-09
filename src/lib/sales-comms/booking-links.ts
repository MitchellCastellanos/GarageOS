import "server-only";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import { randomToken } from "@/domain/sales-comms/tokens";
import { writeCrmAudit } from "@/lib/sales-crm/audit";

export function bookingUrl(token: string, lang?: "EN" | "FR" | null): string {
  return `${getAppUrl()}/sales/book/${token}${lang ? `?lang=${lang.toLowerCase()}` : ""}`;
}

export async function ensureGeneralLink(staffId: string, actorUserId: string) {
  const existing = await db.crmBookingLink.findFirst({ where: { staffId, kind: "GENERAL", active: true } });
  if (existing) return existing;
  try {
    const link = await db.crmBookingLink.create({ data: { token: randomToken(), kind: "GENERAL", staffId, createdByUserId: actorUserId } });
    await writeCrmAudit({ actorUserId, action: "BOOKING_LINK_CREATED", entityType: "CrmBookingLink", entityId: link.id, staffId, metadata: { kind: "GENERAL" } });
    return link;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return db.crmBookingLink.findFirstOrThrow({ where: { staffId, kind: "GENERAL", active: true } });
    throw e;
  }
}

/** One live link per (seller, prospect, contact): re-used so a seller inserting the link twice never mints a new URL. */
export async function ensureProspectLink(args: { staffId: string; prospectId: string; contactId: string | null; opportunityId: string | null; language: "EN" | "FR" | null; actorUserId: string }) {
  const existing = await db.crmBookingLink.findFirst({ where: { staffId: args.staffId, kind: "PROSPECT", active: true, prospectId: args.prospectId, contactId: args.contactId } });
  if (existing) return existing;
  const link = await db.crmBookingLink.create({
    data: { token: randomToken(), kind: "PROSPECT", staffId: args.staffId, prospectId: args.prospectId, contactId: args.contactId, opportunityId: args.opportunityId, language: args.language, createdByUserId: args.actorUserId },
  });
  await writeCrmAudit({ actorUserId: args.actorUserId, action: "BOOKING_LINK_CREATED", entityType: "CrmBookingLink", entityId: link.id, prospectId: args.prospectId, staffId: args.staffId, metadata: { kind: "PROSPECT" } });
  return link;
}

export async function revokeLink(linkId: string, actorUserId: string) {
  const link = await db.crmBookingLink.update({ where: { id: linkId }, data: { active: false, revokedAt: new Date() } });
  await writeCrmAudit({ actorUserId, action: "BOOKING_LINK_REVOKED", entityType: "CrmBookingLink", entityId: linkId, staffId: link.staffId });
}

/** Public lookup: an active, unexpired link whose seller can still take bookings. Returns null for everything else (no oracle). */
export async function resolvePublicLink(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const link = await db.crmBookingLink.findUnique({ where: { token }, include: { staff: { include: { user: { select: { name: true } }, senderIdentity: { select: { fromName: true, jobTitle: true, status: true } } } } } });
  if (!link || !link.active || link.revokedAt || (link.expiresAt && link.expiresAt <= now)) return null;
  if (link.staff.status !== "ACTIVE" || !link.staff.bookingEnabled) return null;
  return link;
}
