import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { defaultSenderFacts } from "@/domain/sales-crm/identity";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { getIdentitySetup } from "@/lib/sales-comms/setup";

type Tx = Prisma.TransactionClient;

/**
 * Existing-or-automatic CRM sender identity for a staff member. The corporate login IS the sender address, so nothing is
 * typed twice. Created as DRAFT: activation still requires the PROVIDER to confirm the domain (see tryActivateIdentity).
 * Returns null when the corporate address is already used by another identity (the admin resolves that explicitly).
 */
export async function ensureSenderIdentity(tx: Tx, p: { staffId: string; corporateEmail: string; actorUserId: string }): Promise<{ id: string; created: boolean } | null> {
  const staff = await tx.platformSalesStaff.findUniqueOrThrow({ where: { id: p.staffId }, select: { displayName: true, title: true, phone: true, uiLocale: true, user: { select: { name: true } } } });
  const existing = await tx.crmSenderIdentity.findUnique({ where: { staffId: p.staffId } });
  const facts = defaultSenderFacts({ displayName: staff.displayName, userName: staff.user.name, title: staff.title, phone: staff.phone, uiLocale: staff.uiLocale === "FR" ? "FR" : "EN" }, p.corporateEmail);
  const clash = await tx.crmSenderIdentity.findFirst({ where: { fromEmail: p.corporateEmail, NOT: { staffId: p.staffId } }, select: { id: true } });
  if (clash) return null;
  if (existing) {
    if (existing.fromEmail === p.corporateEmail) return { id: existing.id, created: false };
    // The address changed (legacy login → corporate): the proven reply path must be re-proven with a real round trip.
    await tx.crmSenderIdentity.update({ where: { id: existing.id }, data: { fromEmail: p.corporateEmail, replyToEmail: null, inboundVerifiedAt: null, sendingCheckedAt: null, status: "DRAFT", updatedByUserId: p.actorUserId } });
    await writeCrmAudit({ actorUserId: p.actorUserId, action: "SENDER_IDENTITY_UPDATED", entityType: "CrmSenderIdentity", entityId: existing.id, staffId: p.staffId, metadata: { reason: "CORPORATE_EMAIL_ASSIGNED" } }, tx);
    return { id: existing.id, created: false };
  }
  const row = await tx.crmSenderIdentity.create({ data: { ...facts, staffId: p.staffId, status: "DRAFT", createdByUserId: p.actorUserId } });
  await writeCrmAudit({ actorUserId: p.actorUserId, action: "SENDER_IDENTITY_CREATED", entityType: "CrmSenderIdentity", entityId: row.id, staffId: p.staffId, metadata: { auto: true, fromEmail: p.corporateEmail } }, tx);
  return { id: row.id, created: true };
}

/**
 * Activates the identity ONLY when the provider confirms the sending domain right now and the domain is approved.
 * Never throws; returns the reason when it cannot activate (the Super Admin checklist then shows the exact blocker).
 */
export async function tryActivateIdentity(staffId: string, actorUserId: string): Promise<{ activated: boolean; blocker?: string }> {
  try {
    const identity = await db.crmSenderIdentity.findUnique({ where: { staffId }, select: { id: true, status: true } });
    if (!identity) return { activated: false, blocker: "NO_IDENTITY" };
    if (identity.status === "ACTIVE") return { activated: true };
    if (identity.status === "DISABLED") return { activated: false, blocker: "DISABLED_BY_ADMIN" }; // never override a deliberate disable
    const { state } = await getIdentitySetup(identity.id);
    const failing = state.steps.find((s) => ["domain_approved", "domain_verified", "provider_key"].includes(s.key) && !s.ok);
    if (failing) return { activated: false, blocker: failing.key };
    await db.crmSenderIdentity.update({ where: { id: identity.id }, data: { status: "ACTIVE", sendingCheckedAt: new Date(), updatedByUserId: actorUserId } });
    await writeCrmAudit({ actorUserId, action: "SENDER_IDENTITY_ACTIVATED", entityType: "CrmSenderIdentity", entityId: identity.id, staffId, metadata: { auto: true } });
    return { activated: true };
  } catch {
    return { activated: false, blocker: "LOOKUP_FAILED" };
  }
}
