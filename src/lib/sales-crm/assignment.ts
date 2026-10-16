import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canAssignToStaff, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { planAssignments, type AssignableProspect, type AssignableSeller, type AssignmentProposal } from "@/domain/sales-crm/assignment";
import { evaluateAcquisition, resolveTerritory, type TerritoryRule } from "@/domain/sales-crm/territory";
import { loadEngagements } from "@/lib/sales-crm/territory";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import type { RepairFit } from "@/domain/lead-radar/repair-fit";
import { candidateEvidence, proposeFit } from "@/lib/sales-crm/repair-fit-service";

export const ASSIGNMENT_BATCH_LIMIT = 500;
export const ASSIGNMENT_SCAN_LIMIT = 5000;
export const ASSIGNMENT_RUN_TTL_MS = 24 * 3600_000;

/**
 * Sales reps the actor may hand work to (active only), with their current workload. Managers distribute to their own team's reps; Super Admin to all reps.
 * Managers themselves are not auto-assigned (assign them manually). `onlyStaffIds` narrows to an explicit allow-list (Lead Radar automation: nobody is
 * eligible until a Super Admin names them). Workload is also split by the lane (FIELD / REMOTE) the prospect was assigned under.
 */
export async function loadSellers(actor: PlatformSalesActor, client: Prisma.TransactionClient | typeof db = db, onlyStaffIds?: readonly string[]): Promise<AssignableSeller[]> {
  const staff = await client.platformSalesStaff.findMany({
    where: {
      status: "ACTIVE", role: "SALES_REP",
      // Automation allow-list: a platform Super Admin login is NEVER an auto-assignment target, even if it also holds a staff row.
      ...(onlyStaffIds ? { user: { role: { not: "SUPER_ADMIN" as const } } } : {}),
      AND: [actor.all ? {} : { id: { in: [...actor.scopeStaffIds] } }, onlyStaffIds ? { id: { in: [...onlyStaffIds] } } : {}],
    },
    select: { id: true, salesMode: true, coverageTerritoryKeys: true, acceptsAutoAssignment: true, maxActiveLeads: true, maxActiveFieldLeads: true, maxActiveRemoteLeads: true, leadLanguages: true },
  });
  const ids = staff.map((s) => s.id);
  const [counts, laneCounts] = await Promise.all([
    client.crmProspect.groupBy({ by: ["assignedStaffId"], where: { assignedStaffId: { in: ids }, status: "ACTIVE", doNotContact: false }, _count: { _all: true } }),
    client.crmProspect.groupBy({ by: ["assignedStaffId", "assignmentMode"], where: { assignedStaffId: { in: ids }, status: "ACTIVE", doNotContact: false, assignmentMode: { not: null } }, _count: { _all: true } }),
  ]);
  const load = new Map(counts.map((c) => [c.assignedStaffId!, c._count._all]));
  const lane = (id: string, m: "FIELD" | "REMOTE") => laneCounts.find((c) => c.assignedStaffId === id && c.assignmentMode === m)?._count._all ?? 0;
  return staff.map((s) => ({
    id: s.id, mode: s.salesMode, coverageKeys: s.coverageTerritoryKeys, active: true, acceptsAutoAssignment: s.acceptsAutoAssignment, maxActiveLeads: s.maxActiveLeads, workload: load.get(s.id) ?? 0,
    laneWorkload: { FIELD: lane(s.id, "FIELD"), REMOTE: lane(s.id, "REMOTE") }, laneCaps: { FIELD: s.maxActiveFieldLeads, REMOTE: s.maxActiveRemoteLeads },
    languages: s.leadLanguages.filter((l) => l === "FR" || l === "EN"),
  }));
}

/** Stored fit if a decision exists; otherwise the live assessment from the prospect's own facts and its staged candidate. Only VERIFIED_REPAIR is assignable. */
export async function effectiveFits(client: Prisma.TransactionClient | typeof db, rows: readonly { id: string; name: string; industry: string | null; repairFit: RepairFit | null }[]): Promise<Map<string, RepairFit | "UNCLASSIFIED">> {
  const out = new Map<string, RepairFit | "UNCLASSIFIED">();
  const open = rows.filter((r) => !r.repairFit);
  for (const r of rows) if (r.repairFit) out.set(r.id, r.repairFit);
  if (open.length) {
    const cands = await candidateEvidence(client, open.map((r) => r.id));
    // Same rule as the cleanup (proposeFit): a hand-entered record with no evidence either way and nothing contradicting it is UNCLASSIFIED, not held.
    for (const r of open) out.set(r.id, proposeFit({ name: r.name, industry: r.industry, repairFit: null, repairFitSource: null, repairFitReasons: [], repairFitProtected: false }, cands.get(r.id), false).fit);
  }
  return out;
}

export interface PreviewFilters {
  /** How many unassigned rows to READ in one pass (default = `limit`, max 5,000). Capacity is accounted across the whole scan, so a preview can look past
   *  prospects that are not assignable (excluded / under review) instead of stopping at the first 500 rows. */
  scanLimit?: number;
  territoryKey?: string; limit?: number;
  /** Lead Radar automation: only these sellers are eligible (explicit allow-list), only prospects imported by Lead Radar are considered. */
  onlyStaffIds?: readonly string[]; leadRadarOnly?: boolean;
  /** Keyset position (createdAt, id) after which to continue, so a caller can walk the whole unassigned pool without re-reading unassignable rows. */
  after?: { createdAt: Date; id: string } | null;
}

/** Builds proposals for the actor's unassigned pool. Reads only; nothing is changed. */
export async function buildAssignmentProposals(actor: PlatformSalesActor, f: PreviewFilters, now = new Date()): Promise<{ proposals: AssignmentProposal[]; considered: number; next: { createdAt: Date; id: string } | null }> {
  const limit = Math.min(Math.max(1, f.scanLimit ?? f.limit ?? ASSIGNMENT_BATCH_LIMIT), f.scanLimit ? ASSIGNMENT_SCAN_LIMIT : ASSIGNMENT_BATCH_LIMIT);
  const [rules, sellers] = await Promise.all([loadTerritoryRulesWith(db), loadSellers(actor, db, f.onlyStaffIds)]);
  const rows = await db.crmProspect.findMany({
    where: {
      AND: [
        assignedScopeWhere(actor),
        { assignedStaffId: null, status: "ACTIVE", doNotContact: false, territoryState: { in: ["LOCAL", "NATIONAL"] } },
        f.territoryKey ? { territoryKey: f.territoryKey } : {},
        f.leadRadarOnly ? { importBatch: { sourceKey: LEAD_RADAR_SOURCE_KEY } } : {},
        f.after ? { OR: [{ createdAt: { gt: f.after.createdAt } }, { createdAt: f.after.createdAt, id: { gt: f.after.id } }] } : {},
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit,
    select: { id: true, name: true, industry: true, repairFit: true, status: true, doNotContact: true, assignedStaffId: true, territoryState: true, province: true, city: true, postalCode: true, fieldPriorityStartedAt: true, remoteReleasedAt: true, preferredLanguage: true, createdAt: true },
  });
  const [eng, fits] = await Promise.all([loadEngagements(rows.map((r) => r.id)), effectiveFits(db, rows)]);
  const prospects: AssignableProspect[] = rows.map((r) => ({
    id: r.id, status: r.status, doNotContact: r.doNotContact, assignedStaffId: r.assignedStaffId, territoryState: r.territoryState,
    rule: resolveTerritory(rules, r), engagement: eng.get(r.id)!, timing: { fieldPriorityStartedAt: r.fieldPriorityStartedAt, remoteReleasedAt: r.remoteReleasedAt }, language: r.preferredLanguage, repairFit: ((f) => (f === "UNCLASSIFIED" ? undefined : f))(fits.get(r.id)),
  }));
  const last = rows[rows.length - 1];
  return { proposals: planAssignments(prospects, sellers, now), considered: rows.length, next: rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}

/** Re-checks one proposal against live data right before applying it. */
export async function proposalStillValid(tx: Prisma.TransactionClient, actor: PlatformSalesActor, pr: AssignmentProposal, rules: TerritoryRule[], now: Date): Promise<boolean> {
  if (!pr.staffId || !canAssignToStaff(actor, pr.staffId)) return false;
  const [p, s] = await Promise.all([
    tx.crmProspect.findUnique({ where: { id: pr.prospectId }, select: { name: true, industry: true, repairFit: true, assignedStaffId: true, status: true, doNotContact: true, province: true, city: true, postalCode: true, territoryState: true, fieldPriorityStartedAt: true, remoteReleasedAt: true } }),
    tx.platformSalesStaff.findUnique({ where: { id: pr.staffId }, select: { status: true, salesMode: true, coverageTerritoryKeys: true, acceptsAutoAssignment: true } }),
  ]);
  if (!p || !s || p.assignedStaffId || p.status !== "ACTIVE" || p.doNotContact || (p.territoryState !== "LOCAL" && p.territoryState !== "NATIONAL")) return false;
  if (s.status !== "ACTIVE" || !s.acceptsAutoAssignment) return false;
  const fit = (await effectiveFits(tx, [{ id: pr.prospectId, name: p.name, industry: p.industry, repairFit: p.repairFit }])).get(pr.prospectId);
  if (fit !== "VERIFIED_REPAIR" && fit !== "UNCLASSIFIED") return false; // excluded / under review: never assigned
  const eng = (await loadEngagements([pr.prospectId], tx)).get(pr.prospectId)!;
  return evaluateAcquisition({ mode: s.salesMode, coverageKeys: s.coverageTerritoryKeys, isSuperAdmin: false }, resolveTerritory(rules, p), eng, now, false, { fieldPriorityStartedAt: p.fieldPriorityStartedAt, remoteReleasedAt: p.remoteReleasedAt }).allowed;
}

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/**
 * Applies proposals inside `tx` — the ONE apply path for the manual preview→confirm flow and for Lead Radar automation. Every proposal is re-validated against
 * live data (still unassigned, still eligible, seller still active and allowed) and ownership is taken with a compare-and-set, so a stale or duplicated plan can
 * never steal an owned prospect, break a territory rule or assign twice. Records which lane (FIELD / REMOTE) each prospect was acquired under.
 */
export async function applyAssignmentProposals(tx: Prisma.TransactionClient, actor: PlatformSalesActor, proposals: readonly AssignmentProposal[], ctx: { runId?: string | null; via: string; now?: Date }) {
  const now = ctx.now ?? new Date();
  const rules = await loadTerritoryRulesWith(tx);
  let applied = 0, skipped = 0;
  const perSeller: Record<string, number> = {};
  for (const pr of proposals.filter((p) => p.staffId)) {
    if (!(await proposalStillValid(tx, actor, pr, rules, now))) { skipped++; continue; }
    const r = await tx.crmProspect.updateMany({
      where: { id: pr.prospectId, assignedStaffId: null, status: "ACTIVE", doNotContact: false, OR: [{ repairFit: null }, { repairFit: "VERIFIED_REPAIR" }] },
      data: { assignedStaffId: pr.staffId, assignmentMode: pr.requiredMode, autoAssignedAt: now },
    });
    if (r.count !== 1) { skipped++; continue; }
    await tx.crmOpportunity.updateMany({ where: { prospectId: pr.prospectId, stage: { in: [...OPEN_STAGES] }, assignedStaffId: null }, data: { assignedStaffId: pr.staffId } });
    await tx.crmActivity.create({ data: { prospectId: pr.prospectId, type: "ASSIGNMENT", authorUserId: actor.userId, metadata: { from: null, to: pr.staffId, via: ctx.via, runId: ctx.runId ?? null, mode: pr.requiredMode } } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ASSIGNED", entityType: "CrmProspect", entityId: pr.prospectId, prospectId: pr.prospectId, before: { assignedStaffId: null }, after: { assignedStaffId: pr.staffId }, metadata: { runId: ctx.runId ?? null, territoryKey: pr.territoryKey, mode: pr.requiredMode, via: ctx.via } }, tx);
    applied++;
    perSeller[pr.staffId!] = (perSeller[pr.staffId!] ?? 0) + 1;
  }
  return { applied, skipped, perSeller };
}
