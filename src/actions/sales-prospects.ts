"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import {
  CrmError, applyDoNotContact, createProspectRecord, findDuplicateProspects, prospectColumns, recomputeOpportunityScores,
  requireScopedProspect, resolveAssignee, touchProspect,
} from "@/lib/sales-crm/prospects";
import { crmAction, mapUniqueViolation } from "@/lib/sales-crm/result";
import { contactInputSchema, prospectInputSchema } from "@/domain/sales-crm/validation";
import { normalizeEmail } from "@/domain/sales-crm/normalize";


function refresh(prospectId?: string) {
  revalidatePath(PLATFORM.salesProspects);
  revalidatePath(PLATFORM.salesPipeline);
  if (prospectId) revalidatePath(PLATFORM.salesProspect(prospectId));
}

export async function createProspect(form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const raw = Object.fromEntries(form);
    const input = prospectInputSchema.parse(raw);
    // Default owner: the creator when they carry a staff profile; Super Admin without one leaves it in the pool.
    const requested = input.assignedStaffId ?? actor.staffId;
    const assignedStaffId = await resolveAssignee(actor, requested);
    if (assignedStaffId === null && !actor.all && actor.kind !== "SALES_MANAGER") throw new CrmError("ASSIGNMENT_FORBIDDEN");
    if (raw.allowDuplicate !== "on") {
      const dupes = await findDuplicateProspects(actor, input);
      if (dupes.length) throw new CrmError(dupes.some((d) => d.accessible) ? "DUPLICATE" : "DUPLICATE_RESTRICTED");
    }
    const created = await db.$transaction((tx) => createProspectRecord(tx, actor, input, assignedStaffId));
    refresh();
    return created;
  });
}

export async function updateProspect(prospectId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const existing = await requireScopedProspect(actor, prospectId);
    const input = prospectInputSchema.parse(Object.fromEntries(form));
    const { assignedStaffId: _ignored, ...data } = input; void _ignored; // ownership changes go through assignProspect
    await db.$transaction(async (tx) => {
      const before = await tx.crmProspect.findUniqueOrThrow({ where: { id: prospectId } });
      const cols = prospectColumns(data);
      await tx.crmProspect.update({ where: { id: prospectId }, data: cols });
      const changed = Object.keys(cols).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((cols as Record<string, unknown>)[k]) && !["nameNormalized", "websiteDomain", "phoneDigits"].includes(k));
      if (changed.length) {
        await tx.crmActivity.create({ data: { prospectId, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "PROSPECT_UPDATED", fields: changed } } });
        // Field NAMES only: notes/contact details never enter the audit trail.
        await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_UPDATED", entityType: "CrmProspect", entityId: prospectId, prospectId, metadata: { fields: changed } }, tx);
      }
      await touchProspect(tx, prospectId);
      await recomputeOpportunityScores(tx, prospectId);
    });
    void existing;
    refresh(prospectId);
    return {};
  });
}

export async function archiveProspect(prospectId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    await requireScopedProspect(actor, prospectId);
    await db.$transaction(async (tx) => {
      await tx.crmProspect.update({ where: { id: prospectId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ARCHIVED", entityType: "CrmProspect", entityId: prospectId, prospectId }, tx);
    });
    refresh(prospectId);
    return {};
  });
}

export async function restoreProspect(prospectId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    await requireScopedProspect(actor, prospectId);
    await db.$transaction(async (tx) => {
      await tx.crmProspect.update({ where: { id: prospectId }, data: { status: "ACTIVE", archivedAt: null } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_RESTORED", entityType: "CrmProspect", entityId: prospectId, prospectId }, tx);
    });
    refresh(prospectId);
    return {};
  });
}

/** Persistent opt-out. Any seller with access can set it; only Super Admin can reverse it. */
export async function markDoNotContact(prospectId: string, note: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const p = await requireScopedProspect(actor, prospectId);
    if (p.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    const clean = (note ?? "").trim().slice(0, 1000);
    if (!clean) throw new CrmError("NOTE_REQUIRED");
    await db.$transaction(async (tx) => {
      await applyDoNotContact(tx, actor, prospectId, clean);
      await tx.crmActivity.create({ data: { prospectId, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "DO_NOT_CONTACT_SET" }, body: clean } });
    });
    refresh(prospectId);
    return {};
  });
}

export async function reinstateProspect(prospectId: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const p = await db.crmProspect.findUnique({ where: { id: prospectId }, select: { id: true, doNotContact: true, assignedStaffId: true, status: true } });
    if (!p) throw new CrmError("NOT_FOUND");
    if (!p.doNotContact) throw new CrmError("NOT_DO_NOT_CONTACT");
    await db.$transaction(async (tx) => {
      await tx.crmProspect.update({ where: { id: prospectId }, data: { doNotContact: false, doNotContactAt: null } });
      await tx.crmContact.updateMany({ where: { prospectId }, data: { doNotContact: false } });
      const opp = await tx.crmOpportunity.create({ data: { prospectId, assignedStaffId: p.assignedStaffId, createdByUserId: actor.userId }, select: { id: true } });
      await tx.crmStageEvent.create({ data: { opportunityId: opp.id, toStage: "NEW", actorUserId: actor.userId, note: "reinstated" } });
      await tx.crmActivity.create({ data: { prospectId, opportunityId: opp.id, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "DO_NOT_CONTACT_CLEARED" } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_DNC_CLEARED", entityType: "CrmProspect", entityId: prospectId, prospectId }, tx);
    }).catch((e) => mapUniqueViolation(e, "OPEN_OPPORTUNITY_EXISTS"));
    refresh(prospectId);
    return {};
  });
}

// ── Contacts ────────────────────────────────────────────────────────────────

export async function addContact(prospectId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const prospect = await requireScopedProspect(actor, prospectId);
    const input = contactInputSchema.parse(Object.fromEntries(form));
    const contact = await db.$transaction(async (tx) => {
      const activeCount = await tx.crmContact.count({ where: { prospectId, archivedAt: null } });
      const makePrimary = input.isPrimary || activeCount === 0;
      if (makePrimary) await tx.crmContact.updateMany({ where: { prospectId, isPrimary: true, archivedAt: null }, data: { isPrimary: false } });
      const created = await tx.crmContact.create({
        data: {
          prospectId, name: input.name, title: input.title, email: input.email, emailNormalized: normalizeEmail(input.email), phone: input.phone,
          isPrimary: makePrimary, isDecisionMaker: input.isDecisionMaker, preferredLanguage: input.preferredLanguage, notes: input.notes,
          doNotContact: prospect.doNotContact,
        },
        select: { id: true },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_CREATED", entityType: "CrmContact", entityId: created.id, prospectId }, tx);
      await touchProspect(tx, prospectId);
      await recomputeOpportunityScores(tx, prospectId);
      return created;
    }).catch((e) => mapUniqueViolation(e, "PRIMARY_CONFLICT"));
    refresh(prospectId);
    return { contactId: contact.id };
  });
}

export async function updateContact(contactId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const current = await db.crmContact.findUnique({ where: { id: contactId }, select: { id: true, prospectId: true, archivedAt: true } });
    if (!current || current.archivedAt) throw new CrmError("NOT_FOUND");
    await requireScopedProspect(actor, current.prospectId);
    const input = contactInputSchema.parse(Object.fromEntries(form));
    await db.$transaction(async (tx) => {
      if (input.isPrimary) await tx.crmContact.updateMany({ where: { prospectId: current.prospectId, isPrimary: true, archivedAt: null, id: { not: contactId } }, data: { isPrimary: false } });
      const activePrimary = await tx.crmContact.count({ where: { prospectId: current.prospectId, isPrimary: true, archivedAt: null, id: { not: contactId } } });
      await tx.crmContact.update({
        where: { id: contactId },
        data: {
          name: input.name, title: input.title, email: input.email, emailNormalized: normalizeEmail(input.email), phone: input.phone,
          // Unticking "primary" on the only primary contact keeps it primary: a prospect with contacts always has one.
          isPrimary: input.isPrimary || activePrimary === 0, isDecisionMaker: input.isDecisionMaker, preferredLanguage: input.preferredLanguage, notes: input.notes,
        },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_UPDATED", entityType: "CrmContact", entityId: contactId, prospectId: current.prospectId }, tx);
      await touchProspect(tx, current.prospectId);
      await recomputeOpportunityScores(tx, current.prospectId);
    }).catch((e) => mapUniqueViolation(e, "PRIMARY_CONFLICT"));
    refresh(current.prospectId);
    return {};
  });
}

/** Archives (never deletes) a contact so past activities keep their reference. Promotes another contact if it was primary. */
export async function archiveContact(contactId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const current = await db.crmContact.findUnique({ where: { id: contactId }, select: { id: true, prospectId: true, isPrimary: true, archivedAt: true } });
    if (!current || current.archivedAt) throw new CrmError("NOT_FOUND");
    await requireScopedProspect(actor, current.prospectId);
    await db.$transaction(async (tx) => {
      await tx.crmContact.update({ where: { id: contactId }, data: { archivedAt: new Date(), isPrimary: false } });
      if (current.isPrimary) {
        const next = await tx.crmContact.findFirst({ where: { prospectId: current.prospectId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (next) await tx.crmContact.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_ARCHIVED", entityType: "CrmContact", entityId: contactId, prospectId: current.prospectId }, tx);
      await recomputeOpportunityScores(tx, current.prospectId);
    });
    refresh(current.prospectId);
    return {};
  });
}

