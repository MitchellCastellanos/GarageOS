import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canAssignToStaff, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { planAssignments, type AssignableProspect, type AssignableSeller, type AssignmentProposal } from "@/domain/sales-crm/assignment";
import { hasQualifiedVisit } from "@/domain/sales-crm/field-visit";
import { evaluateAcquisition, NO_ENGAGEMENT, resolveTerritory, type Engagement, type TerritoryRule } from "@/domain/sales-crm/territory";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

export const ASSIGNMENT_BATCH_LIMIT = 500;
export const ASSIGNMENT_RUN_TTL_MS = 24 * 3600_000;
const TOUCH_TYPES = ["CALL", "MEETING", "FIELD_VISIT", "EMAIL_SENT", "EMAIL_RECEIVED", "EMAIL_LOGGED", "SEQUENCE", "DEMO"] as const;
const ACTIVE_STAGES = ["CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/** Engagement facts for many prospects at once (same semantics as `loadEngagement`). */
export async function loadEngagements(ids: string[], client: Prisma.TransactionClient | typeof db = db): Promise<Map<string, Engagement>> {
  const [acts, visits, opps] = await Promise.all([
    client.crmActivity.groupBy({ by: ["prospectId", "type"], where: { prospectId: { in: ids }, type: { in: [...TOUCH_TYPES] } }, _count: true }),
    client.crmActivity.findMany({ where: { prospectId: { in: ids }, type: "FIELD_VISIT", fieldVisitOutcome: { not: null } }, select: { prospectId: true, fieldVisitOutcome: true, occurredAt: true, createdAt: true } }),
    client.crmOpportunity.findMany({ where: { prospectId: { in: ids }, stage: { in: [...ACTIVE_STAGES] } }, select: { prospectId: true } }),
  ]);
  const out = new Map<string, Engagement>(ids.map((id) => [id, { ...NO_ENGAGEMENT }]));
  for (const a of acts) { const e = out.get(a.prospectId)!; e.touched = true; if (a.type === "FIELD_VISIT") e.visited = true; if (a.type === "EMAIL_RECEIVED") e.replied = true; }
  const byProspect = new Map<string, { outcome: NonNullable<(typeof visits)[number]["fieldVisitOutcome"]>; at: Date; createdAt: Date }[]>();
  for (const v of visits) byProspect.set(v.prospectId, [...(byProspect.get(v.prospectId) ?? []), { outcome: v.fieldVisitOutcome!, at: v.occurredAt, createdAt: v.createdAt }]);
  for (const [id, list] of byProspect) out.get(id)!.qualifiedVisit = hasQualifiedVisit(list);
  for (const o of opps) out.get(o.prospectId)!.activeOpportunity = true;
  return out;
}

/** Sales reps the actor may hand work to (active only), with their current workload. Managers distribute to their own team's reps; Super Admin to all reps. Managers themselves are not auto-assigned (assign them manually). */
export async function loadSellers(actor: PlatformSalesActor, client: Prisma.TransactionClient | typeof db = db): Promise<AssignableSeller[]> {
  const staff = await client.platformSalesStaff.findMany({
    where: { status: "ACTIVE", role: "SALES_REP", ...(actor.all ? {} : { id: { in: [...actor.scopeStaffIds] } }) },
    select: { id: true, salesMode: true, coverageTerritoryKeys: true, acceptsAutoAssignment: true, maxActiveLeads: true },
  });
  const counts = await client.crmProspect.groupBy({ by: ["assignedStaffId"], where: { assignedStaffId: { in: staff.map((s) => s.id) }, status: "ACTIVE", doNotContact: false }, _count: { _all: true } });
  const load = new Map(counts.map((c) => [c.assignedStaffId!, c._count._all]));
  return staff.map((s) => ({ id: s.id, mode: s.salesMode, coverageKeys: s.coverageTerritoryKeys, active: true, acceptsAutoAssignment: s.acceptsAutoAssignment, maxActiveLeads: s.maxActiveLeads, workload: load.get(s.id) ?? 0 }));
}

export interface PreviewFilters { territoryKey?: string; limit?: number }

/** Builds proposals for the actor's unassigned pool. Reads only; nothing is changed. */
export async function buildAssignmentProposals(actor: PlatformSalesActor, f: PreviewFilters, now = new Date()): Promise<{ proposals: AssignmentProposal[]; considered: number }> {
  const limit = Math.min(Math.max(1, f.limit ?? ASSIGNMENT_BATCH_LIMIT), ASSIGNMENT_BATCH_LIMIT);
  const [rules, sellers] = await Promise.all([loadTerritoryRulesWith(db), loadSellers(actor)]);
  const rows = await db.crmProspect.findMany({
    where: {
      AND: [assignedScopeWhere(actor), { assignedStaffId: null, status: "ACTIVE", doNotContact: false, territoryState: { in: ["LOCAL", "NATIONAL"] } }, f.territoryKey ? { territoryKey: f.territoryKey } : {}],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit,
    select: { id: true, status: true, doNotContact: true, assignedStaffId: true, territoryState: true, province: true, city: true, postalCode: true },
  });
  const eng = await loadEngagements(rows.map((r) => r.id));
  const prospects: AssignableProspect[] = rows.map((r) => ({
    id: r.id, status: r.status, doNotContact: r.doNotContact, assignedStaffId: r.assignedStaffId, territoryState: r.territoryState,
    rule: resolveTerritory(rules, r), engagement: eng.get(r.id)!,
  }));
  return { proposals: planAssignments(prospects, sellers, now), considered: rows.length };
}

/** Re-checks one proposal against live data right before applying it. */
export async function proposalStillValid(tx: Prisma.TransactionClient, actor: PlatformSalesActor, pr: AssignmentProposal, rules: TerritoryRule[], now: Date): Promise<boolean> {
  if (!pr.staffId || !canAssignToStaff(actor, pr.staffId)) return false;
  const [p, s] = await Promise.all([
    tx.crmProspect.findUnique({ where: { id: pr.prospectId }, select: { assignedStaffId: true, status: true, doNotContact: true, province: true, city: true, postalCode: true, territoryState: true } }),
    tx.platformSalesStaff.findUnique({ where: { id: pr.staffId }, select: { status: true, salesMode: true, coverageTerritoryKeys: true, acceptsAutoAssignment: true } }),
  ]);
  if (!p || !s || p.assignedStaffId || p.status !== "ACTIVE" || p.doNotContact || (p.territoryState !== "LOCAL" && p.territoryState !== "NATIONAL")) return false;
  if (s.status !== "ACTIVE" || !s.acceptsAutoAssignment) return false;
  const eng = (await loadEngagements([pr.prospectId], tx)).get(pr.prospectId)!;
  return evaluateAcquisition({ mode: s.salesMode, coverageKeys: s.coverageTerritoryKeys, isSuperAdmin: false }, resolveTerritory(rules, p), eng, now).allowed;
}
