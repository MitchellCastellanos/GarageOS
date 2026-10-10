import "server-only";
import type { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import {
  MAX_ROUTE_STOPS, canExecuteVisits, canMutateRoute, canPlanRoutes, canTransitionRoute, canViewRoutes, parsePlannedDate, routeIsEditable, routeScopeWhere, stopBlock, type RouteStatus,
} from "@/domain/sales-crm/field-route";
import { REACHED_OUTCOMES, SUBMISSION_ID_RE, visitResultSchema, type FieldVisitOutcome } from "@/domain/sales-crm/field-visit";
import { resolveTerritory } from "@/domain/sales-crm/territory";
import { lengthOfOrder } from "@/domain/sales-crm/route-optimizer";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { assertProspectVisitable, findVisitBySubmission, writeFieldVisit } from "@/lib/sales-crm/field-visit-service";
import { resolveLocations } from "@/lib/sales-crm/location-service";
import { CrmError } from "@/lib/sales-crm/prospects";
import { loadTerritoryRules } from "@/lib/sales-crm/territory";

const isUnique = (e: unknown) => typeof e === "object" && !!e && (e as { code?: string }).code === "P2002";

function requirePlanner(actor: PlatformSalesActor): string {
  if (!canPlanRoutes(actor)) throw new Error("SALES_FORBIDDEN");
  return actor.staffId!;
}

const PROSPECT_FACTS = { id: true, name: true, address: true, city: true, province: true, postalCode: true, status: true, archivedAt: true, mergedIntoId: true, doNotContact: true, assignedStaffId: true } as const;

async function coverageOk(actor: PlatformSalesActor, p: { province: string | null; city: string | null; postalCode: string | null }, rules: Awaited<ReturnType<typeof loadTerritoryRules>>) {
  const keys = actor.coverageTerritoryKeys ?? [];
  if (!keys.length) return true;
  const rule = resolveTerritory(rules, p);
  return !rule || keys.includes(rule.key);
}

export interface Candidate {
  id: string; name: string; city: string | null; province: string | null; address: string | null; postalCode: string | null;
  territoryKey: string | null; stage: string | null;
  location: { usable: true; lat: number; lng: number } | { usable: false; reason: string };
  /** Already a pending stop of another open route of the same seller on the requested date. */
  plannedElsewhere: boolean;
}

/** The seller's OWN assigned, active, non-DNC, non-merged prospects, with the state of their map position. Scoped before anything else. */
export async function listCandidates(actor: PlatformSalesActor, filter: { city?: string; territoryKey?: string; q?: string; date?: Date } = {}, now = new Date()): Promise<Candidate[]> {
  const staffId = requirePlanner(actor);
  const rows = await db.crmProspect.findMany({
    where: {
      assignedStaffId: staffId, status: "ACTIVE", doNotContact: false, mergedIntoId: null, archivedAt: null,
      ...(filter.city ? { city: { equals: filter.city, mode: "insensitive" as const } } : {}),
      ...(filter.q ? { name: { contains: filter.q.slice(0, 80), mode: "insensitive" as const } } : {}),
    },
    select: { ...PROSPECT_FACTS, opportunities: { where: { stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { stage: true }, take: 1 } },
    orderBy: [{ city: "asc" }, { name: "asc" }], take: 400,
  });
  const [rules, locs] = await Promise.all([loadTerritoryRules(), resolveLocations(rows, now)]);
  const elsewhere = filter.date
    ? new Set((await db.crmFieldRouteStop.findMany({ where: { prospectId: { in: rows.map((r) => r.id) }, status: "PENDING", route: { ownerStaffId: staffId, plannedDate: filter.date, status: { in: ["DRAFT", "IN_PROGRESS"] } } }, select: { prospectId: true } })).map((s) => s.prospectId))
    : new Set<string>();
  const out: Candidate[] = [];
  for (const p of rows) {
    const rule = resolveTerritory(rules, p);
    if (!(await coverageOk(actor, p, rules))) continue;
    if (filter.territoryKey && rule?.key !== filter.territoryKey) continue;
    out.push({ id: p.id, name: p.name, city: p.city, province: p.province, address: p.address, postalCode: p.postalCode, territoryKey: rule?.key ?? null, stage: p.opportunities[0]?.stage ?? null, location: locs.get(p.id)!, plannedElsewhere: elsewhere.has(p.id) });
  }
  return out;
}

export interface SaveRouteInput { routeId?: string; clientRequestId: string; plannedDate: string; name?: string | null; areaLabel?: string | null; prospectIds: string[]; expectedVersion?: number }

/** Creates or replaces a DRAFT route. Every stop is re-validated server-side (ownership, availability, coverage, fresh coordinates). */
export async function saveRouteDraft(actor: PlatformSalesActor, input: SaveRouteInput, now = new Date()): Promise<{ routeId: string; version: number; replayed: boolean }> {
  const staffId = requirePlanner(actor);
  if (!SUBMISSION_ID_RE.test(input.clientRequestId)) throw new CrmError("INVALID");
  const plannedDate = parsePlannedDate(input.plannedDate, now);
  if (!plannedDate) throw new CrmError("INVALID_DATE");
  const ids = input.prospectIds;
  if (ids.length > MAX_ROUTE_STOPS) throw new CrmError("TOO_MANY_STOPS");
  if (new Set(ids).size !== ids.length) throw new CrmError("DUPLICATE_STOP");
  const name = (input.name ?? "").trim().slice(0, 80) || null, areaLabel = (input.areaLabel ?? "").trim().slice(0, 80) || null;

  const prospects = await db.crmProspect.findMany({ where: { id: { in: ids } }, select: PROSPECT_FACTS });
  const byId = new Map(prospects.map((p) => [p.id, p]));
  const [rules, locs] = await Promise.all([loadTerritoryRules(), resolveLocations(prospects, now)]);
  const snapshots: { id: string; name: string; address: string | null; lat: number; lng: number }[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    // A prospect outside the seller's book is indistinguishable from a missing one (no cross-seller probing).
    if (!p || p.assignedStaffId !== staffId) throw new CrmError("STOP_NOT_ALLOWED");
    const block = stopBlock(p, staffId, await coverageOk(actor, p, rules));
    if (block) throw new CrmError(block);
    const loc = locs.get(id)!;
    if (!loc.usable) throw new CrmError("LOCATION_UNAVAILABLE");
    snapshots.push({ id, name: p.name, address: [p.address, p.city, p.province, p.postalCode].filter(Boolean).join(", ") || null, lat: loc.lat, lng: loc.lng });
  }
  const distance = ids.length > 1 ? lengthOfOrder(snapshots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })), ids) : 0;
  const stopRows = (routeId: string) => snapshots.map((s, i) => ({ routeId, prospectId: s.id, position: i + 1, nameSnapshot: s.name, addressSnapshot: s.address, latitude: s.lat, longitude: s.lng }));

  try {
    return await db.$transaction(async (tx) => {
      if (!input.routeId) {
        const dup = await tx.crmFieldRoute.findUnique({ where: { ownerStaffId_clientRequestId: { ownerStaffId: staffId, clientRequestId: input.clientRequestId } }, select: { id: true, version: true } });
        if (dup) return { routeId: dup.id, version: dup.version, replayed: true };
        const route = await tx.crmFieldRoute.create({ data: { ownerStaffId: staffId, clientRequestId: input.clientRequestId, plannedDate, name, areaLabel, estimatedDistanceM: distance }, select: { id: true, version: true } });
        if (ids.length) await tx.crmFieldRouteStop.createMany({ data: stopRows(route.id) });
        await writeCrmAudit({ actorUserId: actor.userId, action: "FIELD_ROUTE_SAVED", entityType: "CrmFieldRoute", entityId: route.id, staffId, metadata: { stops: ids.length, created: true } }, tx);
        return { routeId: route.id, version: route.version, replayed: false };
      }
      // Update: compare-and-set on (owner, DRAFT, version) so two tabs / a retry after another save cannot silently overwrite each other.
      const cas = await tx.crmFieldRoute.updateMany({
        where: { id: input.routeId, ownerStaffId: staffId, status: "DRAFT", ...(input.expectedVersion !== undefined ? { version: input.expectedVersion } : {}) },
        data: { plannedDate, name, areaLabel, estimatedDistanceM: distance, version: { increment: 1 } },
      });
      if (cas.count !== 1) {
        const cur = await tx.crmFieldRoute.findFirst({ where: { id: input.routeId, ownerStaffId: staffId }, select: { status: true } });
        throw new CrmError(!cur ? "NOT_FOUND" : cur.status !== "DRAFT" ? "ROUTE_NOT_EDITABLE" : "STALE_ROUTE");
      }
      await tx.crmFieldRouteStop.deleteMany({ where: { routeId: input.routeId } });
      if (ids.length) await tx.crmFieldRouteStop.createMany({ data: stopRows(input.routeId) });
      const r = await tx.crmFieldRoute.findUniqueOrThrow({ where: { id: input.routeId }, select: { version: true } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "FIELD_ROUTE_SAVED", entityType: "CrmFieldRoute", entityId: input.routeId, staffId, metadata: { stops: ids.length, created: false } }, tx);
      return { routeId: input.routeId, version: r.version, replayed: false };
    });
  } catch (e) {
    if (isUnique(e) && !input.routeId) {
      const dup = await db.crmFieldRoute.findUnique({ where: { ownerStaffId_clientRequestId: { ownerStaffId: staffId, clientRequestId: input.clientRequestId } }, select: { id: true, version: true } });
      if (dup) return { routeId: dup.id, version: dup.version, replayed: true };
    }
    throw e;
  }
}

async function ownRoute(actor: PlatformSalesActor, routeId: string) {
  requirePlanner(actor);
  const route = await db.crmFieldRoute.findFirst({ where: { id: routeId, ...routeScopeWhere(actor) }, select: { id: true, ownerStaffId: true, status: true, version: true } });
  if (!route) throw new CrmError("NOT_FOUND");
  // Visible (e.g. a manager's team) is not mutable.
  if (!canMutateRoute(actor, route)) throw new CrmError("NOT_FOUND");
  return route;
}

async function changeStatus(actor: PlatformSalesActor, routeId: string, to: RouteStatus, extra: Prisma.CrmFieldRouteUpdateManyMutationInput = {}) {
  const route = await ownRoute(actor, routeId);
  if (!canTransitionRoute(route.status as RouteStatus, to)) throw new CrmError("ROUTE_BAD_STATE");
  try {
    await db.$transaction(async (tx) => {
      const cas = await tx.crmFieldRoute.updateMany({ where: { id: routeId, ownerStaffId: route.ownerStaffId, status: route.status }, data: { status: to, version: { increment: 1 }, ...extra } });
      if (cas.count !== 1) throw new CrmError("ROUTE_BAD_STATE");
      if (to === "COMPLETED") await tx.crmFieldRouteStop.updateMany({ where: { routeId, status: "PENDING" }, data: { status: "SKIPPED", skipReason: "ROUTE_COMPLETED", resolvedAt: new Date() } });
      await writeCrmAudit({ actorUserId: actor.userId, action: to === "IN_PROGRESS" ? "FIELD_ROUTE_STARTED" : to === "COMPLETED" ? "FIELD_ROUTE_COMPLETED" : "FIELD_ROUTE_CANCELLED", entityType: "CrmFieldRoute", entityId: routeId, staffId: route.ownerStaffId }, tx);
    });
  } catch (e) {
    if (isUnique(e)) throw new CrmError("ANOTHER_ROUTE_IN_PROGRESS");
    throw e;
  }
}

export async function startRoute(actor: PlatformSalesActor, routeId: string) {
  const route = await ownRoute(actor, routeId);
  const stops = await db.crmFieldRouteStop.count({ where: { routeId: route.id, status: "PENDING" } });
  if (!routeIsEditable(route.status as RouteStatus) || stops === 0) throw new CrmError(stops === 0 ? "ROUTE_EMPTY" : "ROUTE_BAD_STATE");
  await changeStatus(actor, routeId, "IN_PROGRESS", { startedAt: new Date() });
}
export const completeRoute = (actor: PlatformSalesActor, routeId: string) => changeStatus(actor, routeId, "COMPLETED", { completedAt: new Date() });
export const cancelRoute = (actor: PlatformSalesActor, routeId: string) => changeStatus(actor, routeId, "CANCELLED");

/** Skips a pending stop without recording any CRM touch (a skip is not a visit and unlocks nothing). Idempotent. */
export async function skipStop(actor: PlatformSalesActor, stopId: string, reason: string | null) {
  if (!canExecuteVisits(actor)) throw new Error("SALES_FORBIDDEN");
  const stop = await db.crmFieldRouteStop.findFirst({ where: { id: stopId, route: { ...routeScopeWhere(actor) } }, select: { id: true, status: true, routeId: true, route: { select: { ownerStaffId: true, status: true } } } });
  if (!stop || !canMutateRoute(actor, stop.route)) throw new CrmError("NOT_FOUND");
  if (stop.status === "SKIPPED") return { replayed: true };
  if (stop.route.status !== "IN_PROGRESS") throw new CrmError("ROUTE_BAD_STATE");
  const cas = await db.crmFieldRouteStop.updateMany({ where: { id: stopId, status: "PENDING", route: { status: "IN_PROGRESS" } }, data: { status: "SKIPPED", skipReason: (reason ?? "").trim().slice(0, 200) || "SKIPPED", resolvedAt: new Date() } });
  if (cas.count !== 1) throw new CrmError("STOP_NOT_PENDING");
  await writeCrmAudit({ actorUserId: actor.userId, action: "FIELD_STOP_SKIPPED", entityType: "CrmFieldRouteStop", entityId: stopId, staffId: stop.route.ownerStaffId });
  return { replayed: false };
}

/**
 * Records the result of one stop. Exactly-once by construction:
 *  1. a replay of the same submission id returns the original activity;
 *  2. the stop is claimed with a compare-and-set (PENDING → VISITED/UNAVAILABLE) in the SAME transaction as the activity, task,
 *     opportunity movement and audit, so a crash or a concurrent duplicate cannot leave half a result or create a second one;
 *  3. the activity's (author, idempotencyKey) unique index is the final backstop.
 */
export async function submitStopResult(actor: PlatformSalesActor, stopId: string, raw: unknown, now = new Date()): Promise<{ activityId: string; taskId: string | null; replayed: boolean; routeComplete: boolean }> {
  if (!canExecuteVisits(actor)) throw new Error("SALES_FORBIDDEN");
  const input = visitResultSchema.parse(raw);
  const stop = await db.crmFieldRouteStop.findFirst({
    where: { id: stopId, route: { ...routeScopeWhere(actor) } },
    select: { id: true, status: true, prospectId: true, routeId: true, route: { select: { id: true, ownerStaffId: true, status: true } } },
  });
  if (!stop || !canMutateRoute(actor, stop.route)) throw new CrmError("NOT_FOUND");

  const replay = async () => {
    const prior = await findVisitBySubmission(actor.userId, input.submissionId);
    if (!prior) return null;
    if (prior.prospectId !== stop.prospectId) throw new CrmError("IDEMPOTENCY_CONFLICT");
    const pending = await db.crmFieldRouteStop.count({ where: { routeId: stop.routeId, status: "PENDING" } });
    return { activityId: prior.id, taskId: null, replayed: true, routeComplete: pending === 0 };
  };
  const earlier = await replay();
  if (earlier) return earlier;

  if (stop.status !== "PENDING") throw new CrmError("STOP_NOT_PENDING");
  if (stop.route.status !== "IN_PROGRESS") throw new CrmError("ROUTE_BAD_STATE");

  // Stale / merged / archived / DNC / reassigned prospect: close the stop as unavailable and refuse to write a visit against it.
  const p = await db.crmProspect.findUnique({ where: { id: stop.prospectId }, select: PROSPECT_FACTS });
  const block = p ? stopBlock(p, stop.route.ownerStaffId) : "PROSPECT_MERGED";
  if (!p || block) {
    await db.crmFieldRouteStop.updateMany({ where: { id: stopId, status: "PENDING" }, data: { status: "UNAVAILABLE", skipReason: block ?? "PROSPECT_GONE", resolvedAt: now } });
    throw new CrmError(block ?? "PROSPECT_MERGED");
  }
  assertProspectVisitable(p);
  const tz = (await db.platformSalesStaff.findUnique({ where: { id: actor.staffId! }, select: { timezone: true } }))?.timezone ?? "America/Toronto";
  const unavailableStop = input.outcome === "INVALID_LOCATION";

  try {
    const r = await db.$transaction(async (tx) => {
      const claim = await tx.crmFieldRouteStop.updateMany({
        where: { id: stopId, status: "PENDING", route: { status: "IN_PROGRESS", ownerStaffId: actor.staffId! } },
        data: { status: unavailableStop ? "UNAVAILABLE" : "VISITED", outcome: input.outcome as FieldVisitOutcome, resolvedAt: now, skipReason: unavailableStop ? "INVALID_LOCATION" : null },
      });
      if (claim.count !== 1) throw new CrmError("STOP_NOT_PENDING");
      const w = await writeFieldVisit(tx, {
        actor, prospectId: stop.prospectId, outcome: input.outcome as FieldVisitOutcome, note: input.note, nextAction: input.nextAction, followUpDate: input.followUpDate,
        contactId: input.contactId, submissionId: input.submissionId, routeStopId: stopId, timezone: tz, now,
      });
      await tx.crmFieldRouteStop.update({ where: { id: stopId }, data: { activityId: w.activityId } });
      await tx.crmFieldRoute.update({ where: { id: stop.routeId }, data: { version: { increment: 1 } } });
      const pending = await tx.crmFieldRouteStop.count({ where: { routeId: stop.routeId, status: "PENDING" } });
      return { ...w, routeComplete: pending === 0 };
    });
    return { ...r, replayed: false };
  } catch (e) {
    if (e instanceof CrmError && e.code === "STOP_NOT_PENDING" || isUnique(e)) {
      const again = await replay();
      if (again) return again;
    }
    throw e;
  }
}

export interface RouteStopView {
  id: string; prospectId: string; position: number; status: string; name: string; address: string | null; lat: number; lng: number; outcome: string | null; skipReason: string | null;
  /** Live availability of the prospect right now (a stale stop is shown but cannot be executed). */
  blocked: string | null;
  /** Prospect phone, only for the route's owner (tap-to-call). */
  phone: string | null;
}
export interface RouteView {
  id: string; ownerStaffId: string; ownerName: string | null; plannedDate: string; name: string | null; areaLabel: string | null; status: RouteStatus; version: number; estimatedDistanceM: number | null;
  startedAt: Date | null; completedAt: Date | null; stops: RouteStopView[]; canMutate: boolean;
}

export async function getRoute(actor: PlatformSalesActor, routeId: string): Promise<RouteView | null> {
  if (!canViewRoutes(actor)) throw new Error("SALES_FORBIDDEN");
  const r = await db.crmFieldRoute.findFirst({
    where: { id: routeId, ...routeScopeWhere(actor) },
    include: { owner: { select: { user: { select: { name: true } } } }, stops: { orderBy: { position: "asc" }, include: { prospect: { select: { ...PROSPECT_FACTS, phone: true } } } } },
  });
  if (!r) return null;
  return {
    id: r.id, ownerStaffId: r.ownerStaffId, ownerName: r.owner.user.name, plannedDate: r.plannedDate.toISOString().slice(0, 10), name: r.name, areaLabel: r.areaLabel, status: r.status, version: r.version,
    estimatedDistanceM: r.estimatedDistanceM, startedAt: r.startedAt, completedAt: r.completedAt, canMutate: canMutateRoute(actor, r),
    stops: r.stops.map((s) => ({
      id: s.id, prospectId: s.prospectId, position: s.position, status: s.status, name: s.nameSnapshot, address: s.addressSnapshot, lat: s.latitude, lng: s.longitude, outcome: s.outcome, skipReason: s.skipReason,
      blocked: s.status === "PENDING" ? stopBlock(s.prospect, r.ownerStaffId) : null,
      phone: canMutateRoute(actor, r) ? s.prospect.phone : null,
    })),
  };
}

export async function listRoutes(actor: PlatformSalesActor, opts: { take?: number } = {}) {
  if (!canViewRoutes(actor)) throw new Error("SALES_FORBIDDEN");
  const rows = await db.crmFieldRoute.findMany({
    where: routeScopeWhere(actor), orderBy: [{ plannedDate: "desc" }, { createdAt: "desc" }], take: Math.min(opts.take ?? 50, 100),
    include: { owner: { select: { user: { select: { name: true } } } }, stops: { select: { status: true } } },
  });
  return rows.map((r) => ({
    id: r.id, ownerName: r.owner.user.name, ownerStaffId: r.ownerStaffId, plannedDate: r.plannedDate.toISOString().slice(0, 10), name: r.name, areaLabel: r.areaLabel, status: r.status, estimatedDistanceM: r.estimatedDistanceM,
    total: r.stops.length, done: r.stops.filter((s) => s.status !== "PENDING").length,
  }));
}

export interface FieldMetrics {
  routesPlanned: number; routesCompleted: number; stopsPlanned: number; stopsCompleted: number; visitsAttempted: number; decisionMakersReached: number;
  demosDiscussed: number; demosScheduled: number; followUpTasks: number; visitToDemoRate: number | null;
}

/** Counts from existing CRM data, scoped like the routes. Attempted visits and genuine conversations are reported separately. No location data. */
export async function fieldMetrics(actor: PlatformSalesActor, range: { from: Date; to: Date }): Promise<FieldMetrics> {
  if (!canViewRoutes(actor)) throw new Error("SALES_FORBIDDEN");
  const scope = routeScopeWhere(actor);
  const authorIds = actor.all ? undefined : actor.kind === "SALES_MANAGER" ? [...actor.scopeUserIds] : [actor.userId];
  const [routes, stops, visits, tasks] = await Promise.all([
    db.crmFieldRoute.groupBy({ by: ["status"], where: { ...scope, plannedDate: { gte: range.from, lte: range.to } }, _count: true }),
    db.crmFieldRouteStop.groupBy({ by: ["status"], where: { route: { ...scope, plannedDate: { gte: range.from, lte: range.to } } }, _count: true }),
    db.crmActivity.groupBy({ by: ["fieldVisitOutcome"], where: { type: "FIELD_VISIT", fieldVisitOutcome: { not: null }, occurredAt: { gte: range.from, lte: new Date(range.to.getTime() + 86_400_000) }, ...(authorIds ? { authorUserId: { in: authorIds } } : {}), fieldRouteStop: { isNot: null } }, _count: true }),
    db.crmTask.count({ where: { createdAt: { gte: range.from, lte: new Date(range.to.getTime() + 86_400_000) }, title: { in: ["Call after field visit", "Follow up after field visit", "Prepare demo agreed during field visit"] }, ...(authorIds ? { createdByUserId: { in: authorIds } } : {}) } }),
  ]);
  const n = (rows: { _count: number; status?: string }[], f: (r: { status?: string }) => boolean = () => true) => rows.filter(f).reduce((a, r) => a + r._count, 0);
  const by = (o: FieldVisitOutcome) => visits.find((v) => v.fieldVisitOutcome === o)?._count ?? 0;
  const attempted = visits.reduce((a, v) => a + v._count, 0);
  const demos = by("DEMO_DISCUSSED") + by("DEMO_SCHEDULED");
  return {
    routesPlanned: n(routes, (r) => r.status !== "CANCELLED"), routesCompleted: n(routes, (r) => r.status === "COMPLETED"),
    stopsPlanned: n(stops), stopsCompleted: n(stops, (s) => s.status === "VISITED"),
    visitsAttempted: attempted, decisionMakersReached: REACHED_OUTCOMES.reduce((a, o) => a + by(o), 0),
    demosDiscussed: by("DEMO_DISCUSSED"), demosScheduled: by("DEMO_SCHEDULED"), followUpTasks: tasks,
    visitToDemoRate: attempted ? demos / attempted : null,
  };
}
