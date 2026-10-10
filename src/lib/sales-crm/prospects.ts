import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assignedScopeWhere, canAccessAssignedStaff, canAssignToStaff, type PlatformSalesActor,
} from "@/domain/sales-crm/access";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { classifyAgainstPool, type MatchKey } from "@/domain/sales-crm/dedupe";
import { normalizeBusinessName, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { cityKey, classifyTerritory, type TerritoryRule } from "@/domain/sales-crm/territory";
import type { ProspectInput } from "@/domain/sales-crm/validation";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { recomputeOpportunityScores } from "@/lib/sales-crm/scoring";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

export type Tx = Prisma.TransactionClient;

export class CrmError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/** Loads a prospect only if it is inside the actor's scope; otherwise behaves exactly like "not found". */
export async function getScopedProspect<T extends Prisma.CrmProspectSelect>(actor: PlatformSalesActor, id: string, select: T) {
  const row = await db.crmProspect.findFirst({ where: { id, ...assignedScopeWhere(actor) }, select });
  return row;
}
export async function requireScopedProspect(actor: PlatformSalesActor, id: string) {
  const row = await db.crmProspect.findFirst({
    where: { id, ...assignedScopeWhere(actor) },
    select: { id: true, name: true, assignedStaffId: true, status: true, doNotContact: true, preferredLanguage: true },
  });
  if (!row) throw new CrmError("NOT_FOUND");
  return row;
}

/** Target staff must exist, be ACTIVE and be assignable by this actor. */
export async function resolveAssignee(actor: PlatformSalesActor, staffId: string | null, tx: Tx | typeof db = db): Promise<string | null> {
  if (staffId === null) {
    if (!canAssignToStaff(actor, null)) throw new CrmError("ASSIGNMENT_FORBIDDEN");
    return null;
  }
  if (!canAssignToStaff(actor, staffId)) throw new CrmError("ASSIGNMENT_FORBIDDEN");
  const staff = await tx.platformSalesStaff.findUnique({ where: { id: staffId }, select: { id: true, status: true } });
  if (!staff || staff.status !== "ACTIVE") throw new CrmError("ASSIGNEE_INACTIVE");
  return staff.id;
}

/** Lead Engine derived columns (address key/quality/fingerprint). Pure; recomputed on every write that can change the address. */
export function addressColumns(loc: { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }) {
  const a = canonicalAddress(loc);
  return { addressKey: a.addressKey, postalKey: a.postalKey, addressQuality: a.quality, addressFingerprint: a.fingerprint };
}
/** Territory snapshot for a location given the active rules (loaded once by the caller). */
export function territoryColumns(rules: TerritoryRule[], loc: { city?: string | null; province?: string | null; postalCode?: string | null }, now = new Date()) {
  const c = classifyTerritory(rules, loc);
  return { territoryKey: c.state === "UNRESOLVED" ? null : (c.rule?.key ?? null), territoryState: c.state, territoryResolvedAt: now };
}

export function prospectColumns(input: Omit<ProspectInput, "assignedStaffId" | "tags" | "notes"> & { tags?: string[]; notes?: string | null }) {
  const addr = canonicalAddress(input);
  return {
    name: input.name, nameNormalized: normalizeBusinessName(input.name),
    website: input.website, websiteDomain: websiteDomain(input.website),
    address: input.address, city: input.city, province: input.province, postalCode: addr.postalKey ? addr.postalCode : input.postalCode,
    ...addressColumns(input),
    phone: input.phone, phoneDigits: phoneDigits(input.phone), email: normalizeEmail(input.email),
    industry: input.industry, shopSize: input.shopSize, locationCount: input.locationCount,
    currentSoftware: input.currentSoftware, source: input.source, sourceDetail: input.sourceDetail,
    preferredLanguage: input.preferredLanguage,
    ...(input.tags ? { tags: input.tags } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

export interface DuplicateMatch { id: string; name: string; accessible: boolean; reasons: string[]; strength: "strong" | "possible" }
/**
 * Finds existing prospects (including archived and do-not-contact) that look like the same business. Branch-aware:
 * a shared domain/phone/name at a DIFFERENT address is a separate location and is not reported.
 */
export async function findDuplicateProspects(
  actor: PlatformSalesActor,
  input: { name: string; city: string | null; website: string | null; phone: string | null; address?: string | null; province?: string | null; postalCode?: string | null },
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const addr = canonicalAddress(input);
  const key: MatchKey = { nameNormalized: normalizeBusinessName(input.name), cityKey: cityKey(input.city), websiteDomain: websiteDomain(input.website), phoneDigits: phoneDigits(input.phone), addressKey: addr.addressKey, postalKey: addr.postalKey };
  const pool = (await loadMatchPool([key])).filter((p) => p.id !== excludeId);
  const r = classifyAgainstPool(key, pool);
  const hits = [...(r.strong ? [{ ...r.strong, strength: "strong" as const }] : []), ...r.ambiguous.map((a) => ({ ...a, strength: "possible" as const }))].slice(0, 10);
  if (!hits.length) return [];
  const names = await db.crmProspect.findMany({ where: { id: { in: hits.map((h) => h.id) } }, select: { id: true, name: true, assignedStaffId: true } });
  const byId = new Map(names.map((n) => [n.id, n]));
  return hits.flatMap((h) => {
    const row = byId.get(h.id);
    if (!row) return [];
    const accessible = canAccessAssignedStaff(actor, row.assignedStaffId);
    // Out-of-scope matches are reported without identity so reps cannot browse each other's books.
    return [{ id: accessible ? row.id : "", name: accessible ? row.name : "", accessible, reasons: h.reasons, strength: h.strength }];
  });
}

/**
 * Creates a prospect + its first (NEW) opportunity + timeline entry + audit, all in the caller's transaction.
 * A CRM prospect never creates a Shop.
 */
export async function createProspectRecord(tx: Tx, actor: PlatformSalesActor, input: ProspectInput, assignedStaffId: string | null, extra: { importBatchId?: string; doNotContact?: boolean } = {}) {
  const now = new Date();
  const rules = await loadTerritoryRulesWith(tx);
  const prospect = await tx.crmProspect.create({
    data: {
      ...prospectColumns(input), ...territoryColumns(rules, input, now), assignedStaffId, createdByUserId: actor.userId, importBatchId: extra.importBatchId ?? null,
      doNotContact: !!extra.doNotContact, doNotContactAt: extra.doNotContact ? now : null, lastActivityAt: now,
    },
    select: { id: true },
  });
  const opportunity = await tx.crmOpportunity.create({
    data: { prospectId: prospect.id, assignedStaffId, stage: extra.doNotContact ? "DO_NOT_CONTACT" : "NEW", createdByUserId: actor.userId, closedAt: extra.doNotContact ? now : null },
    select: { id: true },
  });
  await tx.crmStageEvent.create({ data: { opportunityId: opportunity.id, toStage: extra.doNotContact ? "DO_NOT_CONTACT" : "NEW", actorUserId: actor.userId } });
  await tx.crmActivity.create({
    data: { prospectId: prospect.id, opportunityId: opportunity.id, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "PROSPECT_CREATED", source: input.source } },
  });
  await writeCrmAudit({
    actorUserId: actor.userId, action: "PROSPECT_CREATED", entityType: "CrmProspect", entityId: prospect.id, prospectId: prospect.id,
    metadata: { source: input.source, assignedStaffId, importBatchId: extra.importBatchId ?? null },
  }, tx);
  if (!extra.doNotContact) await recomputeOpportunityScores(tx, prospect.id, now);
  return { prospectId: prospect.id, opportunityId: opportunity.id };
}

/** Marks a prospect do-not-contact everywhere it matters: prospect flag, every contact, open opportunity, open tasks. */
export async function applyDoNotContact(tx: Tx, actor: PlatformSalesActor, prospectId: string, note: string | null) {
  const now = new Date();
  await tx.crmProspect.update({ where: { id: prospectId }, data: { doNotContact: true, doNotContactAt: now } });
  await tx.crmContact.updateMany({ where: { prospectId }, data: { doNotContact: true } });
  const open = await tx.crmOpportunity.findFirst({ where: { prospectId, stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { id: true, stage: true } });
  if (open) {
    await tx.crmOpportunity.update({ where: { id: open.id }, data: { stage: "DO_NOT_CONTACT", stageChangedAt: now, closedAt: now, closeNote: note } });
    await tx.crmStageEvent.create({ data: { opportunityId: open.id, fromStage: open.stage, toStage: "DO_NOT_CONTACT", actorUserId: actor.userId, note } });
  }
  await tx.crmTask.updateMany({ where: { prospectId, status: "OPEN" }, data: { status: "CANCELLED", updatedAt: now } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_DNC_SET", entityType: "CrmProspect", entityId: prospectId, prospectId }, tx);
}

export async function touchProspect(tx: Tx, prospectId: string, at = new Date()) {
  await tx.crmProspect.update({ where: { id: prospectId }, data: { lastActivityAt: at } });
}

export { recomputeOpportunityScores };
