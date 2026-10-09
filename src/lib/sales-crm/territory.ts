import "server-only";
import type { Mode, TerritoryRule, Engagement, Location } from "@/domain/sales-crm/territory";
import { evaluateAcquisition, resolveTerritory } from "@/domain/sales-crm/territory";
import { db } from "@/lib/db";
import { CrmError } from "@/lib/sales-crm/prospects";

const TOUCH_TYPES = ["CALL", "MEETING", "FIELD_VISIT", "EMAIL_SENT", "EMAIL_RECEIVED", "EMAIL_LOGGED", "SEQUENCE", "DEMO"] as const;

export async function loadTerritoryRules(): Promise<TerritoryRule[]> {
  const rows = await db.crmTerritory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ key: r.key, nameEn: r.nameEn, nameFr: r.nameFr, acquisition: r.acquisition, provinces: r.provinces, cities: r.cities, postalPrefixes: r.postalPrefixes, priorityDays: r.priorityDays, priorityStartedAt: r.priorityStartedAt, active: r.active, sortOrder: r.sortOrder }));
}

export async function territoryOfLocation(loc: Location): Promise<TerritoryRule | null> {
  return resolveTerritory(await loadTerritoryRules(), loc);
}

/** Documented engagement facts of one prospect — what unlocks follow-up and keeps ownership with its current owner. */
export async function loadEngagement(prospectId: string): Promise<Engagement> {
  const [acts, opp] = await Promise.all([
    db.crmActivity.groupBy({ by: ["type"], where: { prospectId, type: { in: [...TOUCH_TYPES] } }, _count: true }),
    db.crmOpportunity.findFirst({ where: { prospectId, stage: { in: ["CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { id: true } }),
  ]);
  const has = (t: string) => acts.some((a) => a.type === t);
  return { touched: acts.length > 0, visited: has("FIELD_VISIT"), replied: has("EMAIL_RECEIVED"), activeOpportunity: !!opp };
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
  const eng = prospect ? await loadEngagement(prospect.id) : { touched: false, visited: false, replied: false, activeOpportunity: false };
  const retains = !!prospect?.assignedStaffId && (eng.activeOpportunity || eng.touched);
  const d = evaluateAcquisition({ ...facts, isSuperAdmin: false }, rule, eng, now, retains);
  if (!d.allowed) throw new CrmError(d.code);
}

/** Same check without throwing (import rows, UI hints). */
export async function canAcquire(staffId: string, location: Location, rules?: TerritoryRule[], now = new Date()): Promise<boolean> {
  const [rule, facts] = await Promise.all([rules ? resolveTerritory(rules, location) : territoryOfLocation(location), staffAcquirerFacts(staffId)]);
  return evaluateAcquisition({ ...facts, isSuperAdmin: false }, rule, { touched: false, visited: false, replied: false, activeOpportunity: false }, now).allowed;
}
