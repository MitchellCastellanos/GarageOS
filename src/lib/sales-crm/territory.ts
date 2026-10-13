import "server-only";
import type { Prisma } from "@prisma/client";
import type { Mode, TerritoryRule, Engagement, Location, AcquisitionTiming } from "@/domain/sales-crm/territory";
import { evaluateAcquisition, NO_ENGAGEMENT, NO_TIMING, resolveTerritory } from "@/domain/sales-crm/territory";
import { hasQualifiedVisit } from "@/domain/sales-crm/field-visit";
import { db } from "@/lib/db";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { CrmError } from "@/lib/sales-crm/prospects";

const TOUCH_TYPES = ["CALL", "MEETING", "FIELD_VISIT", "EMAIL_SENT", "EMAIL_RECEIVED", "EMAIL_LOGGED", "SEQUENCE", "DEMO"] as const;

export async function loadTerritoryRules(): Promise<TerritoryRule[]> {
  return loadTerritoryRulesWith(db);
}

export async function territoryOfLocation(loc: Location): Promise<TerritoryRule | null> {
  return resolveTerritory(await loadTerritoryRules(), loc);
}

const ACTIVE_STAGES = ["CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/**
 * Documented engagement facts of many prospects at once — the ONE implementation (single-prospect callers use
 * `loadEngagement`). `visited` is any visit attempt; `qualifiedVisit` only a genuine conversation; `otherTouch` any
 * non-visit touch. A failed/no-answer/rejected visit never becomes meaningful engagement.
 */
export async function loadEngagements(ids: string[], client: Prisma.TransactionClient | typeof db = db): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>(ids.map((id) => [id, { ...NO_ENGAGEMENT }]));
  if (!ids.length) return out;
  const [acts, visits, opps] = await Promise.all([
    client.crmActivity.groupBy({ by: ["prospectId", "type"], where: { prospectId: { in: ids }, type: { in: [...TOUCH_TYPES] } }, _count: true }),
    client.crmActivity.findMany({ where: { prospectId: { in: ids }, type: "FIELD_VISIT", fieldVisitOutcome: { not: null } }, select: { prospectId: true, fieldVisitOutcome: true, occurredAt: true, createdAt: true } }),
    client.crmOpportunity.findMany({ where: { prospectId: { in: ids }, stage: { in: [...ACTIVE_STAGES] } }, select: { prospectId: true } }),
  ]);
  for (const a of acts) {
    const e = out.get(a.prospectId)!;
    e.touched = true;
    if (a.type === "FIELD_VISIT") e.visited = true; else e.otherTouch = true;
    if (a.type === "EMAIL_RECEIVED") e.replied = true;
  }
  const byProspect = new Map<string, { outcome: string; at: Date; createdAt: Date }[]>();
  for (const v of visits) byProspect.set(v.prospectId, [...(byProspect.get(v.prospectId) ?? []), { outcome: v.fieldVisitOutcome!, at: v.occurredAt, createdAt: v.createdAt }]);
  for (const [id, list] of byProspect) out.get(id)!.qualifiedVisit = hasQualifiedVisit(list);
  for (const o of opps) out.get(o.prospectId)!.activeOpportunity = true;
  return out;
}

/** Documented engagement facts of one prospect — what unlocks follow-up and keeps ownership with its current owner. */
export async function loadEngagement(prospectId: string): Promise<Engagement> {
  return (await loadEngagements([prospectId])).get(prospectId)!;
}

/** Per-prospect acquisition timing (window start, manual release). Missing prospect → no timing. */
export async function loadTiming(prospectId: string, client: Prisma.TransactionClient | typeof db = db): Promise<AcquisitionTiming> {
  const p = await client.crmProspect.findUnique({ where: { id: prospectId }, select: { fieldPriorityStartedAt: true, remoteReleasedAt: true } });
  return p ?? NO_TIMING;
}

export interface AssigneeFacts { mode: Mode | null; coverageKeys: readonly string[] }

export async function staffAcquirerFacts(staffId: string): Promise<AssigneeFacts> {
  const s = await db.platformSalesStaff.findUnique({ where: { id: staffId }, select: { salesMode: true, coverageTerritoryKeys: true } });
  return { mode: s?.salesMode ?? null, coverageKeys: s?.coverageTerritoryKeys ?? [] };
}

/**
 * Server-side gate for INITIAL acquisition: giving an untouched prospect to `staffId`. Throws CrmError with the
 * territory code. A prospect that already has an owner AND an engagement keeps it (explicit transfers don't call this).
 */
export async function assertAcquisition(staffId: string, location: Location, prospect?: { id: string; assignedStaffId: string | null }, now = new Date()) {
  const [rule, facts] = await Promise.all([territoryOfLocation(location), staffAcquirerFacts(staffId)]);
  const [eng, timing] = prospect ? await Promise.all([loadEngagement(prospect.id), loadTiming(prospect.id)]) : [NO_ENGAGEMENT, NO_TIMING];
  const retains = !!prospect?.assignedStaffId && (eng.activeOpportunity || eng.touched);
  const d = evaluateAcquisition({ ...facts, isSuperAdmin: false }, rule, eng, now, retains, timing);
  if (!d.allowed) throw new CrmError(d.code);
}

/** Same check without throwing (import rows, UI hints). */
export async function canAcquire(staffId: string, location: Location, rules?: TerritoryRule[], now = new Date()): Promise<boolean> {
  const [rule, facts] = await Promise.all([rules ? resolveTerritory(rules, location) : territoryOfLocation(location), staffAcquirerFacts(staffId)]);
  return evaluateAcquisition({ ...facts, isSuperAdmin: false }, rule, NO_ENGAGEMENT, now).allowed;
}
