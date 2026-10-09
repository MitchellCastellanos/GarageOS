"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { needInputSchema } from "@/domain/sales-crm/validation";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, recomputeOpportunityScores, requireScopedProspect, touchProspect } from "@/lib/sales-crm/prospects";
import { crmAction, mapUniqueViolation } from "@/lib/sales-crm/result";

const NEED_CATEGORIES = ["BOOKING", "INVOICING", "WORK_ORDERS", "INSPECTIONS", "COMMUNICATIONS", "RETENTION", "INVENTORY", "REPORTING", "MULTI_LOCATION"] as const;

/** Records (or updates) one need assessment. Confirmed evidence requires an evidence note; nothing is inferred automatically. */
export async function assessNeed(prospectId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    await requireScopedProspect(actor, prospectId);
    const input = needInputSchema.parse(Object.fromEntries(form));
    const def = await db.crmNeedDefinition.findUnique({ where: { id: input.definitionId }, select: { id: true, active: true } });
    if (!def || !def.active) throw new CrmError("NOT_FOUND");
    await db.$transaction(async (tx) => {
      await tx.crmProspectNeed.upsert({
        where: { prospectId_definitionId: { prospectId, definitionId: def.id } },
        create: { prospectId, definitionId: def.id, severity: input.severity, priority: input.priority, basis: input.basis, evidence: input.evidence, notes: input.notes, assessedByUserId: actor.userId },
        update: { severity: input.severity, priority: input.priority, basis: input.basis, evidence: input.evidence, notes: input.notes, assessedByUserId: actor.userId, assessedAt: new Date() },
      });
      await writeCrmAudit({
        actorUserId: actor.userId, action: "NEED_ASSESSED", entityType: "CrmProspectNeed", entityId: def.id, prospectId,
        after: { severity: input.severity, priority: input.priority, basis: input.basis },
      }, tx);
      await touchProspect(tx, prospectId);
      await recomputeOpportunityScores(tx, prospectId);
    });
    revalidatePath(PLATFORM.salesProspect(prospectId));
    return {};
  });
}

export async function removeNeed(prospectId: string, definitionId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    await requireScopedProspect(actor, prospectId);
    await db.$transaction(async (tx) => {
      const r = await tx.crmProspectNeed.deleteMany({ where: { prospectId, definitionId } });
      if (r.count !== 1) throw new CrmError("NOT_FOUND");
      await writeCrmAudit({ actorUserId: actor.userId, action: "NEED_REMOVED", entityType: "CrmProspectNeed", entityId: definitionId, prospectId }, tx);
      await recomputeOpportunityScores(tx, prospectId);
    });
    revalidatePath(PLATFORM.salesProspect(prospectId));
    return {};
  });
}

// ── Taxonomy administration (Super Admin) ────────────────────────────────────

const definitionSchema = z.object({
  labelEn: z.string().trim().min(1).max(80),
  labelFr: z.string().trim().min(1).max(80),
  descriptionEn: z.string().trim().max(300).optional().transform((v) => v || null),
  descriptionFr: z.string().trim().max(300).optional().transform((v) => v || null),
  weight: z.coerce.number().int().min(1).max(30),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
  active: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

export async function updateNeedDefinition(definitionId: string, form: FormData) {
  const actor = await requireCrmActor("manage_needs_taxonomy");
  return crmAction(async () => {
    const input = definitionSchema.parse(Object.fromEntries(form));
    const before = await db.crmNeedDefinition.findUnique({ where: { id: definitionId }, select: { weight: true, active: true } });
    if (!before) throw new CrmError("NOT_FOUND");
    await db.$transaction(async (tx) => {
      await tx.crmNeedDefinition.update({ where: { id: definitionId }, data: input });
      await writeCrmAudit({
        actorUserId: actor.userId, action: "NEED_DEFINITION_CHANGED", entityType: "CrmNeedDefinition", entityId: definitionId,
        before: { weight: before.weight, active: before.active }, after: { weight: input.weight, active: input.active },
      }, tx);
    });
    revalidatePath(PLATFORM.salesNeeds);
    return {};
  });
}

const newDefinitionSchema = definitionSchema.extend({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,40}$/),
  category: z.enum(NEED_CATEGORIES),
  suggestedFeature: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,40}$/),
});

export async function createNeedDefinition(form: FormData) {
  const actor = await requireCrmActor("manage_needs_taxonomy");
  return crmAction(async () => {
    const input = newDefinitionSchema.parse(Object.fromEntries(form));
    const created = await db.crmNeedDefinition.create({ data: { ...input, builtIn: false } }).catch((e) => mapUniqueViolation(e, "KEY_EXISTS"));
    await writeCrmAudit({ actorUserId: actor.userId, action: "NEED_DEFINITION_CHANGED", entityType: "CrmNeedDefinition", entityId: created.id, metadata: { created: true, key: input.key } });
    revalidatePath(PLATFORM.salesNeeds);
    return {};
  });
}
