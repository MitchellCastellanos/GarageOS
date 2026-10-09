import "server-only";
import type { CrmSuppressionReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/domain/sales-comms/email";
import { writeCrmAudit } from "@/lib/sales-crm/audit";

type Db = typeof db | Prisma.TransactionClient;

/** Active suppressions for these addresses (lower-cased). Global: applies to every seller, sequence and import. */
export async function activeSuppressions(emails: string[], client: Db = db): Promise<Map<string, CrmSuppressionReason>> {
  const list = [...new Set(emails.map(normalizeEmail))];
  if (list.length === 0) return new Map();
  const rows = await client.crmEmailSuppression.findMany({ where: { emailNormalized: { in: list }, liftedAt: null }, select: { emailNormalized: true, reason: true } });
  return new Map(rows.map((r) => [r.emailNormalized, r.reason]));
}

/**
 * Suppresses an address everywhere. Idempotent (partial unique index on active rows). Unsubscribe / opt-out reasons
 * also flag matching contacts Do-Not-Contact so the CRM shows it and a CSV re-import cannot resurrect them; hard
 * bounces only block the address (the person did not opt out). Live enrollments for the address are stopped.
 */
export async function suppressEmail(args: {
  email: string; reason: CrmSuppressionReason; source: string; messageId?: string | null; actorUserId?: string | null; note?: string | null;
}): Promise<{ created: boolean }> {
  const email = normalizeEmail(args.email);
  let created = false;
  try {
    await db.crmEmailSuppression.create({ data: { emailNormalized: email, reason: args.reason, source: args.source, messageId: args.messageId ?? null, createdByUserId: args.actorUserId ?? null, note: args.note ?? null } });
    created = true;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
  const contacts = await db.crmContact.findMany({ where: { emailNormalized: email }, select: { id: true, prospectId: true } });
  const optOut = args.reason === "UNSUBSCRIBE" || args.reason === "REPLY_OPT_OUT" || args.reason === "MANUAL" || args.reason === "COMPLAINT";
  if (optOut && contacts.length) await db.crmContact.updateMany({ where: { id: { in: contacts.map((c) => c.id) } }, data: { doNotContact: true } });
  const { stopEnrollments } = await import("@/lib/sales-comms/sequences");
  await stopEnrollments({ contactIds: contacts.map((c) => c.id), reason: args.reason === "HARD_BOUNCE" || args.reason === "COMPLAINT" ? "BOUNCED" : "OPTED_OUT" });
  if (created) {
    await writeCrmAudit({ actorUserId: args.actorUserId ?? "system", action: "SUPPRESSION_ADDED", entityType: "CrmEmailSuppression", metadata: { reason: args.reason, source: args.source, contacts: contacts.length } });
  }
  return { created };
}

/** Super Admin only (enforced by the caller). The row stays for the audit trail. */
export async function liftSuppression(args: { suppressionId: string; actorUserId: string; note: string }): Promise<boolean> {
  const res = await db.crmEmailSuppression.updateMany({ where: { id: args.suppressionId, liftedAt: null }, data: { liftedAt: new Date(), liftedByUserId: args.actorUserId, liftNote: args.note } });
  if (res.count === 1) await writeCrmAudit({ actorUserId: args.actorUserId, action: "SUPPRESSION_LIFTED", entityType: "CrmEmailSuppression", entityId: args.suppressionId });
  return res.count === 1;
}
