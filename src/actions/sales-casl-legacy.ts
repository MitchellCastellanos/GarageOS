"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { computeLegacyImpact, DEFAULT_LEGACY_KINDS, sanitizeKinds, type LegacyImpact } from "@/lib/sales-crm/legacy-basis";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";

async function superAdmin() {
  const actor = await requireCrmActor("manage_team");
  if (!actor.all) throw new Error("SALES_FORBIDDEN");
  return actor;
}
const publicImpact = ({ ids: _ids, ...rest }: LegacyImpact) => { void _ids; return rest; };

/**
 * Step 1 (read-only apart from an audit row): what WOULD change if these legacy kinds were reclassified LEGACY_UNREVIEWED,
 * computed with the real send policy. Super Admin only. Nothing is modified.
 */
export async function previewLegacyBasisReclassification(kinds?: string[]) {
  const actor = await superAdmin();
  return crmAction(async () => {
    const k = kinds ? sanitizeKinds(kinds) : DEFAULT_LEGACY_KINDS;
    if (!k) throw new CrmError("INVALID");
    const impact = await computeLegacyImpact(k);
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEGACY_BASES_PREVIEWED", entityType: "CrmSendingBasis", metadata: { kinds: k, batchRows: impact.batchRows, losing: impact.contactsLosingSendability, token: impact.token } });
    return publicImpact(impact);
  });
}

/**
 * Step 2: apply exactly what was previewed. The token binds the call to the previewed rows and impact; if anything changed
 * since (new evidence, a revoked basis, another run) it is refused and a fresh preview is required. Only rows that are STILL
 * unclassified are touched, so repeating the call is a no-op. Audited with the affected ids so the run can be reverted.
 * It never sends, enrols or schedules anything; the existing worker/dispatcher then stop what the policy no longer allows.
 */
export async function reclassifyLegacyBases(kinds: string[], token: string) {
  const actor = await superAdmin();
  return crmAction(async () => {
    const k = sanitizeKinds(kinds);
    if (!k || typeof token !== "string" || token.length !== 32) throw new CrmError("INVALID");
    const res = await db.$transaction(async (tx) => {
      const impact = await computeLegacyImpact(k, tx);
      if (impact.token !== token) throw new CrmError("LEGACY_PREVIEW_STALE");
      if (!impact.ids.length) return { updated: 0, auditId: null as string | null, impact };
      const upd = await tx.crmSendingBasis.updateMany({ where: { id: { in: impact.ids }, reviewStatus: null }, data: { reviewStatus: "LEGACY_UNREVIEWED" } });
      if (upd.count !== impact.ids.length) throw new CrmError("LEGACY_PREVIEW_STALE"); // a concurrent writer changed a row: roll back
      const ev = await tx.crmAuditEvent.create({
        data: {
          actorUserId: actor.userId, action: "LEGACY_BASES_RECLASSIFIED", entityType: "CrmSendingBasis", entityId: null,
          metadata: { kinds: k, count: upd.count, ids: impact.ids, losing: impact.contactsLosingSendability, enrollments: impact.activeEnrollments, queued: impact.queuedCommercialMessages, token } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { updated: upd.count, auditId: ev.id, impact };
    }, { timeout: 60_000 });
    revalidatePath(PLATFORM.salesEvidence);
    return { updated: res.updated, auditId: res.auditId, remaining: Math.max(0, res.impact.remainingRows - res.updated) };
  });
}

/** Undo one run: rows that are still LEGACY_UNREVIEWED and were never reviewed go back to unclassified (their previous behaviour). Idempotent. */
export async function revertLegacyReclassification(auditId: string) {
  const actor = await superAdmin();
  return crmAction(async () => {
    const ev = await db.crmAuditEvent.findUnique({ where: { id: auditId }, select: { action: true, metadata: true } });
    if (!ev || ev.action !== "LEGACY_BASES_RECLASSIFIED") throw new CrmError("NOT_FOUND");
    const ids = ((ev.metadata as { ids?: unknown })?.ids ?? []) as string[];
    if (!Array.isArray(ids)) throw new CrmError("NOT_FOUND");
    const reverted = await db.$transaction(async (tx) => {
      const r = await tx.crmSendingBasis.updateMany({ where: { id: { in: ids }, reviewStatus: "LEGACY_UNREVIEWED", reviewedByUserId: null }, data: { reviewStatus: null } });
      if (r.count > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEGACY_BASES_REVERTED", entityType: "CrmSendingBasis", metadata: { of: auditId, count: r.count } }, tx);
      return r.count;
    });
    revalidatePath(PLATFORM.salesEvidence);
    return { reverted };
  });
}
