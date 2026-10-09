import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  assignedScopeWhere, canAccessAssignedStaff, canAssignToStaff, type PlatformSalesActor,
} from "@/domain/sales-crm/access";
import { normalizeBusinessName, normalizeCity, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import type { ProspectInput } from "@/domain/sales-crm/validation";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { recomputeOpportunityScores } from "@/lib/sales-crm/scoring";

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

export function prospectColumns(input: Omit<ProspectInput, "assignedStaffId" | "tags" | "notes"> & { tags?: string[]; notes?: string | null }) {
  return {
    name: input.name, nameNormalized: normalizeBusinessName(input.name),
    website: input.website, websiteDomain: websiteDomain(input.website),
    address: input.address, city: input.city, province: input.province, postalCode: input.postalCode,
    phone: input.phone, phoneDigits: phoneDigits(input.phone), email: normalizeEmail(input.email),
    industry: input.industry, shopSize: input.shopSize, locationCount: input.locationCount,
    currentSoftware: input.currentSoftware, source: input.source, sourceDetail: input.sourceDetail,
    preferredLanguage: input.preferredLanguage,
    ...(input.tags ? { tags: input.tags } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

export interface DuplicateMatch { id: string; name: string; accessible: boolean; reason: "website" | "phone" | "name_city" }
/** Finds existing prospects (including archived and do-not-contact) that look like the same business. */
export async function findDuplicateProspects(actor: PlatformSalesActor, input: { name: string; city: string | null; website: string | null; phone: string | null }, excludeId?: string): Promise<DuplicateMatch[]> {
  const domain = websiteDomain(input.website), digits = phoneDigits(input.phone), nameN = normalizeBusinessName(input.name);
  const or: Prisma.CrmProspectWhereInput[] = [];
  if (domain) or.push({ websiteDomain: domain });
  if (digits) or.push({ phoneDigits: digits });
  if (nameN) or.push({ nameNormalized: nameN });
  if (!or.length) return [];
  const rows = await db.crmProspect.findMany({
    where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, city: true, websiteDomain: true, phoneDigits: true, nameNormalized: true, assignedStaffId: true },
    take: 10,
  });
  const city = normalizeCity(input.city);
  const out: DuplicateMatch[] = [];
  for (const r of rows) {
    const reason = domain && r.websiteDomain === domain ? "website" : digits && r.phoneDigits === digits ? "phone"
      : r.nameNormalized === nameN && normalizeCity(r.city) === city ? "name_city" : null;
    if (!reason) continue;
    const accessible = canAccessAssignedStaff(actor, r.assignedStaffId);
    // Out-of-scope matches are reported without identity so reps cannot browse each other's books.
    out.push({ id: accessible ? r.id : "", name: accessible ? r.name : "", accessible, reason });
  }
  return out;
}

/**
 * Creates a prospect + its first (NEW) opportunity + timeline entry + audit, all in the caller's transaction.
 * A CRM prospect never creates a Shop.
 */
export async function createProspectRecord(tx: Tx, actor: PlatformSalesActor, input: ProspectInput, assignedStaffId: string | null, extra: { importBatchId?: string; doNotContact?: boolean } = {}) {
  const now = new Date();
  const prospect = await tx.crmProspect.create({
    data: {
      ...prospectColumns(input), assignedStaffId, createdByUserId: actor.userId, importBatchId: extra.importBatchId ?? null,
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
