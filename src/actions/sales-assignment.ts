"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { ASSIGNMENT_RUN_TTL_MS, buildAssignmentProposals, proposalStillValid } from "@/lib/sales-crm/assignment";
import { CrmError, addressColumns, territoryColumns } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import type { AssignmentProposal } from "@/domain/sales-crm/assignment";

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/** Step 1: compute who would get which unassigned prospect. Changes nothing except recording the preview. */
export async function previewAssignmentRun(form: FormData) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const territoryKey = String(form.get("territoryKey") ?? "").trim() || undefined;
    if (territoryKey && !/^[a-z0-9-]{1,60}$/.test(territoryKey)) throw new CrmError("INVALID");
    const { proposals, considered } = await buildAssignmentProposals(actor, { territoryKey });
    const assigned = proposals.filter((p) => p.staffId);
    const skips: Record<string, number> = {};
    for (const p of proposals) if (p.skip) skips[p.skip] = (skips[p.skip] ?? 0) + 1;
    const perSeller: Record<string, number> = {};
    for (const p of assigned) perSeller[p.staffId!] = (perSeller[p.staffId!] ?? 0) + 1;
    const summary = { considered, proposed: assigned.length, skips, perSeller };
    const run = await db.crmAssignmentRun.create({ data: { createdByUserId: actor.userId, proposals: proposals as unknown as Prisma.InputJsonValue, summary: summary as Prisma.InputJsonValue }, select: { id: true } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "ASSIGNMENT_RUN_PREVIEWED", entityType: "CrmAssignmentRun", entityId: run.id, metadata: summary as Prisma.InputJsonValue });
    const [staff, prospects] = await Promise.all([
      db.platformSalesStaff.findMany({ where: { id: { in: Object.keys(perSeller) } }, select: { id: true, salesMode: true, user: { select: { name: true } } } }),
      db.crmProspect.findMany({ where: { id: { in: proposals.slice(0, 100).map((p) => p.prospectId) } }, select: { id: true, name: true, city: true, province: true } }),
    ]);
    const sName = new Map(staff.map((s) => [s.id, { name: s.user.name, mode: s.salesMode }])), pName = new Map(prospects.map((p) => [p.id, p]));
    return {
      runId: run.id, summary,
      sellers: Object.entries(perSeller).map(([id, count]) => ({ id, count, name: sName.get(id)?.name ?? "—", mode: sName.get(id)?.mode ?? "REMOTE" })),
      rows: proposals.slice(0, 100).map((p) => ({ prospectId: p.prospectId, name: pName.get(p.prospectId)?.name ?? "—", city: pName.get(p.prospectId)?.city ?? null, staffId: p.staffId, staffName: p.staffId ? sName.get(p.staffId)?.name ?? "—" : null, skip: p.skip, territoryKey: p.territoryKey, requiredMode: p.requiredMode })),
    };
  });
}

/**
 * Step 2: apply a previewed run. Each proposal is re-validated against live data (still unassigned, still eligible,
 * seller still active and allowed) so a stale preview can never steal an owned prospect or break a territory rule.
 */
export async function confirmAssignmentRun(runId: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const run = await db.crmAssignmentRun.findFirst({ where: { id: runId, ...(actor.all ? {} : { createdByUserId: actor.userId }) } });
    if (!run) throw new CrmError("NOT_FOUND");
    if (run.status === "APPLIED") return { applied: run.appliedCount, skipped: run.skippedCount, alreadyApplied: true };
    if (run.status !== "PREVIEWED") throw new CrmError("RUN_NOT_CONFIRMABLE");
    if (Date.now() - run.createdAt.getTime() > ASSIGNMENT_RUN_TTL_MS) throw new CrmError("PREVIEW_EXPIRED");
    const claimed = await db.crmAssignmentRun.updateMany({ where: { id: runId, status: "PREVIEWED" }, data: { status: "APPLYING" } });
    if (claimed.count !== 1) throw new CrmError("RUN_NOT_CONFIRMABLE");
    try {
      const proposals = (run.proposals as unknown as AssignmentProposal[]).filter((p) => p.staffId);
      const now = new Date();
      const out = await db.$transaction(async (tx) => {
        const rules = await loadTerritoryRulesWith(tx);
        let applied = 0, skipped = 0;
        for (const pr of proposals) {
          if (!(await proposalStillValid(tx, actor, pr, rules, now))) { skipped++; continue; }
          // Compare-and-set on ownership: only an UNASSIGNED prospect can be taken.
          const r = await tx.crmProspect.updateMany({ where: { id: pr.prospectId, assignedStaffId: null, status: "ACTIVE", doNotContact: false }, data: { assignedStaffId: pr.staffId } });
          if (r.count !== 1) { skipped++; continue; }
          await tx.crmOpportunity.updateMany({ where: { prospectId: pr.prospectId, stage: { in: [...OPEN_STAGES] }, assignedStaffId: null }, data: { assignedStaffId: pr.staffId } });
          await tx.crmActivity.create({ data: { prospectId: pr.prospectId, type: "ASSIGNMENT", authorUserId: actor.userId, metadata: { from: null, to: pr.staffId, via: "auto-assignment", runId } } });
          await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ASSIGNED", entityType: "CrmProspect", entityId: pr.prospectId, prospectId: pr.prospectId, before: { assignedStaffId: null }, after: { assignedStaffId: pr.staffId }, metadata: { runId, territoryKey: pr.territoryKey } }, tx);
          applied++;
        }
        await tx.crmAssignmentRun.update({ where: { id: runId }, data: { status: "APPLIED", appliedAt: now, appliedCount: applied, skippedCount: skipped } });
        await writeCrmAudit({ actorUserId: actor.userId, action: "ASSIGNMENT_RUN_APPLIED", entityType: "CrmAssignmentRun", entityId: runId, metadata: { applied, skipped } }, tx);
        return { applied, skipped };
      }, { timeout: 120_000, maxWait: 10_000 });
      revalidatePath(PLATFORM.salesProspects);
      return { ...out, alreadyApplied: false };
    } catch (err) {
      await db.crmAssignmentRun.updateMany({ where: { id: runId, status: "APPLYING" }, data: { status: "PREVIEWED" } }); // nothing was committed: allow a retry
      throw err instanceof CrmError ? err : new CrmError("ASSIGNMENT_FAILED");
    }
  });
}

export async function cancelAssignmentRun(runId: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const r = await db.crmAssignmentRun.updateMany({ where: { id: runId, status: "PREVIEWED", ...(actor.all ? {} : { createdByUserId: actor.userId }) }, data: { status: "CANCELLED" } });
    if (r.count !== 1) throw new CrmError("NOT_FOUND");
    await writeCrmAudit({ actorUserId: actor.userId, action: "ASSIGNMENT_RUN_CANCELLED", entityType: "CrmAssignmentRun", entityId: runId });
    return {};
  });
}

/** Availability controls for automatic distribution: a pause switch and an optional cap. Managers: their own team only. */
export async function setStaffAssignmentSettings(staffId: string, form: FormData) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    if (!actor.all && !actor.scopeStaffIds.includes(staffId)) throw new CrmError("NOT_FOUND");
    const accepts = form.get("acceptsAutoAssignment") === "on" || form.get("acceptsAutoAssignment") === "true";
    const capRaw = String(form.get("maxActiveLeads") ?? "").trim();
    const cap = capRaw === "" ? null : Number(capRaw);
    if (cap !== null && (!Number.isInteger(cap) || cap < 0 || cap > 5000)) throw new CrmError("INVALID");
    const before = await db.platformSalesStaff.findUnique({ where: { id: staffId }, select: { acceptsAutoAssignment: true, maxActiveLeads: true } });
    if (!before) throw new CrmError("NOT_FOUND");
    await db.platformSalesStaff.update({ where: { id: staffId }, data: { acceptsAutoAssignment: accepts, maxActiveLeads: cap } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_ASSIGNMENT_SETTINGS_CHANGED", entityType: "PlatformSalesStaff", entityId: staffId, staffId, before, after: { acceptsAutoAssignment: accepts, maxActiveLeads: cap } });
    revalidatePath(PLATFORM.salesAssignment);
    return {};
  });
}

/**
 * Super Admin maintenance: (re)computes address quality/fingerprint and the territory snapshot of existing prospects.
 * Needed once after the Lead Engine migration and whenever territory rules change. Idempotent, batched, never touches
 * ownership, DNC or activities.
 */
export async function recomputeProspectDerived(cursor?: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    if (!actor.all) throw new CrmError("SALES_FORBIDDEN");
    const rules = await loadTerritoryRulesWith(db);
    const rows = await db.crmProspect.findMany({ where: cursor ? { id: { gt: cursor } } : {}, orderBy: { id: "asc" }, take: 500, select: { id: true, address: true, city: true, province: true, postalCode: true } });
    const now = new Date();
    await db.$transaction(rows.map((r) => db.crmProspect.update({ where: { id: r.id }, data: { ...addressColumns(r), ...territoryColumns(rules, r, now) } })));
    if (!rows.length || rows.length < 500) await writeCrmAudit({ actorUserId: actor.userId, action: "DERIVED_COLUMNS_RECOMPUTED", entityType: "CrmProspect", metadata: { lastBatch: rows.length } });
    revalidatePath(PLATFORM.salesProspects);
    return { processed: rows.length, nextCursor: rows.length === 500 ? rows[rows.length - 1].id : null };
  });
}
