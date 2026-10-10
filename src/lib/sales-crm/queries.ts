import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, canAccessDemoCreator, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { BOARD_STAGES, type PipelineStage } from "@/domain/sales-crm/pipeline";
import { effectiveScore, recommendDemoFeatures, type NeedInput } from "@/domain/sales-crm/scoring";
import { resolveEffectiveLanguage } from "@/domain/sales-crm/language";
import { normalizeBusinessName, phoneDigits } from "@/domain/sales-crm/normalize";
import { loadNeedInputs } from "@/lib/sales-crm/scoring";
import { loadQueueContext, queueWhere, type ProspectQueue } from "@/lib/sales-crm/queues";

export const PAGE_SIZE = 25;
const OPEN = BOARD_STAGES as unknown as PipelineStage[];

export interface ProspectFilters {
  q?: string; status?: "ACTIVE" | "ARCHIVED"; stage?: string; owner?: string; language?: string; source?: string; industry?: string;
  dnc?: boolean; queue?: ProspectQueue; territory?: string; sort?: "name" | "created" | "activity"; dir?: "asc" | "desc"; page?: number;
}

/** Spreadsheet-safe, injection-safe text search over the fields a seller actually types. */
function searchWhere(q: string): Prisma.CrmProspectWhereInput {
  const term = q.trim().slice(0, 80);
  const digits = phoneDigits(term) ?? (term.replace(/\D/g, "").length >= 4 ? term.replace(/\D/g, "") : null);
  const or: Prisma.CrmProspectWhereInput[] = [
    { name: { contains: term, mode: "insensitive" } }, { nameNormalized: { contains: normalizeBusinessName(term) || term.toLowerCase() } },
    { city: { contains: term, mode: "insensitive" } }, { website: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } },
    { contacts: { some: { archivedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, { emailNormalized: { contains: term.toLowerCase() } }] } } },
  ];
  if (digits) or.push({ phoneDigits: { contains: digits } });
  return { OR: or };
}

export async function listProspects(actor: PlatformSalesActor, f: ProspectFilters) {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const ownerWhere: Prisma.CrmProspectWhereInput = f.owner === "none" ? { assignedStaffId: null } : f.owner ? { assignedStaffId: f.owner } : {};
  const queueFragment: Prisma.CrmProspectWhereInput = f.queue ? queueWhere(f.queue, actor, await loadQueueContext()) : {};
  const where: Prisma.CrmProspectWhereInput = {
    AND: [
      assignedScopeWhere(actor), ownerWhere, queueFragment,
      f.territory === "unresolved" ? { territoryState: "UNRESOLVED" } : f.territory === "national" ? { territoryState: "NATIONAL" } : f.territory ? { territoryState: "LOCAL", territoryKey: f.territory } : {},
      f.q?.trim() ? searchWhere(f.q) : {},
      // Queues define their own status/DNC semantics (e.g. "do not contact"); the status filter only applies outside a queue.
      f.queue ? {} : { status: f.status ?? "ACTIVE" },
      f.stage ? { opportunities: { some: { stage: f.stage as PipelineStage } } } : {},
      f.language ? { preferredLanguage: f.language as never } : {},
      f.source ? { source: f.source as never } : {},
      f.industry ? { industry: f.industry as never } : {},
      f.dnc ? { doNotContact: true } : {},
    ],
  };
  const dir = f.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.CrmProspectOrderByWithRelationInput[] =
    f.sort === "name" ? [{ nameNormalized: f.dir === "desc" ? "desc" : "asc" }, { id: "asc" }]
    : f.sort === "created" ? [{ createdAt: dir }, { id: "asc" }]
    : [{ lastActivityAt: { sort: dir, nulls: "last" } }, { id: "asc" }];
  const [total, rows] = await Promise.all([
    db.crmProspect.count({ where }),
    db.crmProspect.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, city: true, province: true, preferredLanguage: true, source: true, industry: true, status: true, doNotContact: true, lastActivityAt: true, createdAt: true,
        territoryKey: true, territoryState: true, addressQuality: true, assignedStaffId: true,
        duplicateReviews: { where: { status: "PENDING" }, take: 1, select: { id: true } },
        assignedStaff: { select: { id: true, status: true, user: { select: { name: true } } } },
        contacts: { where: { archivedAt: null, isPrimary: true }, take: 1, select: { name: true } },
        opportunities: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, stage: true, fitScore: true, fitScoreOverride: true, intentScore: true, intentScoreOverride: true } },
        tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1, select: { id: true, dueAt: true, title: true } },
      },
    }),
  ]);
  const now = new Date();
  return {
    total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r, overdue: !!r.tasks[0] && r.tasks[0].dueAt < now, nextTask: r.tasks[0] ?? null, reviewPending: r.duplicateReviews.length > 0 })),
  };
}

export async function getProspectDetail(actor: PlatformSalesActor, id: string) {
  const prospect = await db.crmProspect.findFirst({
    where: { id, ...assignedScopeWhere(actor) },
    include: {
      assignedStaff: { select: { id: true, status: true, user: { select: { name: true } } } },
      contacts: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      needs: { include: { definition: true }, orderBy: { definition: { sortOrder: "asc" } } },
      opportunities: {
        orderBy: { createdAt: "desc" },
        include: { stageEvents: { orderBy: { createdAt: "desc" }, take: 30 }, demos: { select: { id: true, status: true, createdByUserId: true, expiresAt: true, shop: { select: { name: true } } } } },
      },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100, include: { assignedStaff: { select: { id: true, user: { select: { name: true } } } } } },
      activities: { orderBy: { occurredAt: "desc" }, take: 150, include: { author: { select: { id: true, name: true } }, contact: { select: { name: true } } } },
    },
  });
  if (!prospect) return null;
  const [definitions, needInputs] = await Promise.all([
    db.crmNeedDefinition.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }),
    loadNeedInputs(db, id),
  ]);
  const open = prospect.opportunities.find((o) => OPEN.includes(o.stage as PipelineStage)) ?? null;
  const current = open ?? prospect.opportunities[0] ?? null;
  // Demos are only listed if the actor may use them (creator scope), so a manager-owned prospect never leaks another rep's demo.
  const opportunities = prospect.opportunities.map((o) => ({ ...o, demos: o.demos.filter((d) => canAccessDemoCreator(actor, d.createdByUserId)) }));
  const primary = prospect.contacts.find((c) => c.isPrimary) ?? prospect.contacts[0] ?? null;
  return {
    prospect: { ...prospect, opportunities },
    openOpportunity: open ? opportunities.find((o) => o.id === open.id)! : null,
    currentOpportunity: current ? opportunities.find((o) => o.id === current.id)! : null,
    definitions,
    scores: current ? {
      fit: effectiveScore(current.fitScore, current.fitScoreOverride), intent: effectiveScore(current.intentScore, current.intentScoreOverride),
    } : null,
    recommendations: recommendDemoFeatures(needInputs),
    language: resolveEffectiveLanguage({ contact: primary?.preferredLanguage ?? null, prospect: prospect.preferredLanguage }),
  };
}

export async function pipelineBoard(actor: PlatformSalesActor, owner?: string) {
  const ownerWhere: Prisma.CrmOpportunityWhereInput = owner === "none" ? { assignedStaffId: null } : owner ? { assignedStaffId: owner } : {};
  const where: Prisma.CrmOpportunityWhereInput = { AND: [{ prospect: { AND: [assignedScopeWhere(actor), { status: "ACTIVE" }] } }, ownerWhere] };
  const [cards, closed] = await Promise.all([
    db.crmOpportunity.findMany({
      where: { AND: [where, { stage: { in: OPEN } }] }, orderBy: [{ stageChangedAt: "desc" }], take: 700,
      select: {
        id: true, stage: true, stageChangedAt: true, fitScore: true, fitScoreOverride: true, intentScore: true, intentScoreOverride: true, urgency: true, estimatedMrrCents: true,
        prospect: { select: { id: true, name: true, city: true, preferredLanguage: true, lastActivityAt: true, tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } } } },
        assignedStaff: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    db.crmOpportunity.groupBy({ by: ["stage"], where: { AND: [where, { stage: { in: ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"] } }] }, _count: { _all: true } }),
  ]);
  return {
    cards: cards.map((c) => ({
      ...c, fit: effectiveScore(c.fitScore, c.fitScoreOverride).value, intent: effectiveScore(c.intentScore, c.intentScoreOverride).value,
      nextDueAt: c.prospect.tasks[0]?.dueAt ?? null,
    })),
    closedCounts: Object.fromEntries(closed.map((g) => [g.stage, g._count._all])) as Record<string, number>,
    truncated: cards.length >= 700,
  };
}

export type TaskView = "open" | "overdue" | "today" | "upcoming" | "done";
export async function listTasks(actor: PlatformSalesActor, opts: { view: TaskView; owner?: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const endOfToday = new Date(now.getTime() + 24 * 3600_000);
  const scope: Prisma.CrmTaskWhereInput = actor.all ? {} : { assignedStaffId: { in: [...actor.scopeStaffIds] } };
  const ownerWhere: Prisma.CrmTaskWhereInput = opts.owner === "mine" && actor.staffId ? { assignedStaffId: actor.staffId } : opts.owner && opts.owner !== "all" && opts.owner !== "mine" ? { assignedStaffId: opts.owner } : {};
  const statusWhere: Prisma.CrmTaskWhereInput =
    opts.view === "done" ? { status: "DONE" }
    : opts.view === "overdue" ? { status: "OPEN", dueAt: { lt: now } }
    : opts.view === "today" ? { status: "OPEN", dueAt: { lt: endOfToday } }
    : opts.view === "upcoming" ? { status: "OPEN", dueAt: { gte: now } } : { status: "OPEN" };
  return db.crmTask.findMany({
    where: { AND: [scope, ownerWhere, statusWhere, { prospect: assignedScopeWhere(actor) }] },
    orderBy: opts.view === "done" ? { completedAt: "desc" } : { dueAt: "asc" }, take: 200,
    select: {
      id: true, title: true, type: true, priority: true, status: true, dueAt: true, notes: true, completedAt: true,
      prospect: { select: { id: true, name: true } }, assignedStaff: { select: { id: true, user: { select: { name: true } } } },
    },
  });
}

/** Real, database-backed numbers for the seller's (or team's / platform's) dashboard. */
export async function dashboardMetrics(actor: PlatformSalesActor, now = new Date()) {
  const prospectScope = assignedScopeWhere(actor);
  const taskScope: Prisma.CrmTaskWhereInput = { AND: [actor.all ? {} : { assignedStaffId: { in: [...actor.scopeStaffIds] } }, { prospect: prospectScope }] };
  const oppScope: Prisma.CrmOpportunityWhereInput = { prospect: { AND: [prospectScope, { status: "ACTIVE" }] } };
  const d7 = new Date(now.getTime() - 7 * 86400_000), d14 = new Date(now.getTime() - 14 * 86400_000), d30 = new Date(now.getTime() - 30 * 86400_000);
  const demoScope: Prisma.SalesDemoWhereInput = actor.all ? {} : { createdByUserId: { in: [...actor.scopeUserIds] } };
  const [totalProspects, newProspects30, byStage, overdue, dueToday, stale, activities7, demosByStatus, unassigned, recentTasks] = await Promise.all([
    db.crmProspect.count({ where: { AND: [prospectScope, { status: "ACTIVE" }] } }),
    db.crmProspect.count({ where: { AND: [prospectScope, { status: "ACTIVE", createdAt: { gte: d30 } }] } }),
    db.crmOpportunity.groupBy({ by: ["stage"], where: oppScope, _count: { _all: true } }),
    db.crmTask.count({ where: { AND: [taskScope, { status: "OPEN", dueAt: { lt: now } }] } }),
    db.crmTask.count({ where: { AND: [taskScope, { status: "OPEN", dueAt: { gte: now, lt: new Date(now.getTime() + 24 * 3600_000) } }] } }),
    db.crmOpportunity.count({ where: { AND: [oppScope, { stage: { in: OPEN } }, { prospect: { OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: d14 } }] } }] } }),
    db.crmActivity.count({ where: { prospect: prospectScope, occurredAt: { gte: d7 }, type: { in: ["NOTE", "CALL", "MEETING", "EMAIL_LOGGED"] } } }),
    db.salesDemo.groupBy({ by: ["status"], where: demoScope, _count: { _all: true } }),
    actor.all || actor.kind === "SALES_MANAGER" ? db.crmProspect.count({ where: { assignedStaffId: null, status: "ACTIVE" } }) : Promise.resolve(0),
    db.crmTask.findMany({
      where: { AND: [taskScope, { status: "OPEN" }] }, orderBy: { dueAt: "asc" }, take: 6,
      select: { id: true, title: true, dueAt: true, priority: true, prospect: { select: { id: true, name: true } } },
    }),
  ]);
  const stageCounts = Object.fromEntries(byStage.map((g) => [g.stage, g._count._all])) as Record<string, number>;
  const openCount = OPEN.reduce((a, s) => a + (stageCounts[s] ?? 0), 0);
  return {
    totalProspects, newProspects30, stageCounts, openCount, overdue, dueToday, stale, activities7, unassigned, recentTasks,
    demosByStatus: Object.fromEntries(demosByStatus.map((g) => [g.status, g._count._all])) as Record<string, number>,
    won: stageCounts.WON ?? 0, lost: stageCounts.LOST ?? 0,
  };
}

/** Staff the actor may assign work to (active only). */
export async function listAssignableStaff(actor: PlatformSalesActor) {
  const where: Prisma.PlatformSalesStaffWhereInput = actor.all ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: actor.kind === "SALES_MANAGER" ? [...actor.scopeStaffIds] : actor.staffId ? [actor.staffId] : [] } };
  const rows = await db.platformSalesStaff.findMany({ where, select: { id: true, role: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } });
  return rows.map((r) => ({ id: r.id, name: r.user.name, role: r.role }));
}

export async function listStaff(actor: PlatformSalesActor) {
  const where: Prisma.PlatformSalesStaffWhereInput = actor.all ? {} : { id: { in: [...actor.scopeStaffIds] } };
  const rows = await db.platformSalesStaff.findMany({
    where, orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
    select: {
      id: true, role: true, status: true, title: true, territories: true, uiLocale: true, timezone: true, activatedAt: true, manager: { select: { id: true, user: { select: { name: true } } } },
      user: { select: { name: true, email: true } },
      _count: { select: { prospects: { where: { status: "ACTIVE" } }, tasks: { where: { status: "OPEN" } } } },
    },
  });
  return rows;
}

export async function staffSummary(actor: PlatformSalesActor, staffId: string, now = new Date()) {
  if (!actor.all && !actor.scopeStaffIds.includes(staffId)) return null;
  const staff = await db.platformSalesStaff.findUnique({
    where: { id: staffId },
    include: { user: { select: { id: true, name: true, email: true, emailVerified: true } }, manager: { select: { id: true, user: { select: { name: true } } } }, reports: { select: { id: true, user: { select: { name: true } } } } },
  });
  if (!staff) return null;
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const [prospects, byStage, openTasks, overdueTasks, activities30, demos, lastActivity, audit] = await Promise.all([
    db.crmProspect.count({ where: { assignedStaffId: staffId, status: "ACTIVE" } }),
    db.crmOpportunity.groupBy({ by: ["stage"], where: { assignedStaffId: staffId, prospect: { status: "ACTIVE" } }, _count: { _all: true } }),
    db.crmTask.count({ where: { assignedStaffId: staffId, status: "OPEN" } }),
    db.crmTask.count({ where: { assignedStaffId: staffId, status: "OPEN", dueAt: { lt: now } } }),
    db.crmActivity.count({ where: { authorUserId: staff.userId, occurredAt: { gte: d30 }, type: { in: ["NOTE", "CALL", "MEETING", "EMAIL_LOGGED"] } } }),
    db.salesDemo.groupBy({ by: ["status"], where: { createdByUserId: staff.userId }, _count: { _all: true } }),
    db.crmActivity.findFirst({ where: { authorUserId: staff.userId }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
    actor.all ? db.crmAuditEvent.findMany({ where: { staffId }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, action: true, actorUserId: true, createdAt: true, metadata: true } }) : Promise.resolve([]),
  ]);
  const actorIds = [...new Set(audit.map((a) => a.actorUserId))];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return {
    staff, prospects, openTasks, overdueTasks, activities30, lastActivityAt: lastActivity?.occurredAt ?? null,
    stageCounts: Object.fromEntries(byStage.map((g) => [g.stage, g._count._all])) as Record<string, number>,
    demos: Object.fromEntries(demos.map((g) => [g.status, g._count._all])) as Record<string, number>,
    audit: audit.map((a) => ({ ...a, actorName: names.get(a.actorUserId) ?? "—" })),
  };
}

/** STABLE CONTRACT (Agent 3): everything a demo playbook needs about a prospect, scope-checked. Facts only, no free-text notes. */
export async function getDemoPlanningContext(actor: PlatformSalesActor, opportunityId: string) {
  const opp = await db.crmOpportunity.findFirst({
    where: { id: opportunityId, prospect: assignedScopeWhere(actor) },
    select: {
      id: true, stage: true, prospectId: true, urgency: true, estimatedPlan: true,
      prospect: { select: { id: true, name: true, preferredLanguage: true, shopSize: true, industry: true, locationCount: true, currentSoftware: true, contacts: { where: { archivedAt: null }, select: { id: true, name: true, isPrimary: true, isDecisionMaker: true, preferredLanguage: true } } } },
    },
  });
  if (!opp) return null;
  const needs: NeedInput[] = await loadNeedInputs(db, opp.prospectId);
  const primary = opp.prospect.contacts.find((c) => c.isPrimary) ?? opp.prospect.contacts[0] ?? null;
  return {
    opportunityId: opp.id, prospectId: opp.prospectId, stage: opp.stage, prospect: { ...opp.prospect, contacts: undefined }, contacts: opp.prospect.contacts,
    language: resolveEffectiveLanguage({ contact: primary?.preferredLanguage ?? null, prospect: opp.prospect.preferredLanguage }),
    needs, recommendedFeatures: recommendDemoFeatures(needs, 9),
  };
}
