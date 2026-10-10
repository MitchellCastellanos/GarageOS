"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { assignedScopeWhere, canAssignToStaff } from "@/domain/sales-crm/access";
import { activityInputSchema, taskInputSchema } from "@/domain/sales-crm/validation";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, recomputeOpportunityScores, requireScopedProspect, resolveAssignee, touchProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { insertCrmTask } from "@/lib/sales-crm/task-service";
import { parseShopDateTime } from "@/lib/shop-timezone";

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

function refresh(prospectId: string) {
  revalidatePath(PLATFORM.salesProspect(prospectId));
  revalidatePath(PLATFORM.salesTasks);
  revalidatePath(PLATFORM.sales);
}

/** Appends an immutable timeline entry (note, call, meeting, or an email logged by hand — Agent 2 owns real email). */
export async function logActivity(prospectId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const p = await requireScopedProspect(actor, prospectId);
    const input = activityInputSchema.parse(Object.fromEntries(form));
    if (input.contactId) {
      const c = await db.crmContact.findFirst({ where: { id: input.contactId, prospectId }, select: { id: true } });
      if (!c) throw new CrmError("NOT_FOUND");
    }
    const opp = await db.crmOpportunity.findFirst({ where: { prospectId, stage: { in: [...OPEN_STAGES] } }, select: { id: true } });
    const created = await db.$transaction(async (tx) => {
      const row = await tx.crmActivity.create({
        data: {
          prospectId, opportunityId: opp?.id ?? null, contactId: input.contactId, type: input.type, outcome: input.type === "CALL" ? input.outcome : null,
          subject: input.subject, body: input.body, occurredAt: input.occurredAt, authorUserId: actor.userId,
        },
        select: { id: true },
      });
      await touchProspect(tx, prospectId, input.occurredAt);
      await recomputeOpportunityScores(tx, prospectId);
      return row;
    });
    void p;
    refresh(prospectId);
    return { activityId: created.id };
  });
}

async function taskDue(date: string, time: string, staffId: string | null, actorTimezone: string | null) {
  let tz = actorTimezone ?? "America/Toronto";
  if (staffId) {
    const s = await db.platformSalesStaff.findUnique({ where: { id: staffId }, select: { timezone: true } });
    if (s) tz = s.timezone;
  }
  return parseShopDateTime(date, time, tz);
}

export async function createTask(prospectId: string, form: FormData) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const p = await requireScopedProspect(actor, prospectId);
    if (p.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    if (p.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    const input = taskInputSchema.parse(Object.fromEntries(form));
    // Default assignee: the prospect's owner, else the creator.
    const assignee = await resolveAssignee(actor, input.assignedStaffId ?? p.assignedStaffId ?? actor.staffId);
    const dueAt = await taskDue(input.dueDate, input.dueTime, assignee, null);
    const opp = await db.crmOpportunity.findFirst({ where: { prospectId, stage: { in: [...OPEN_STAGES] } }, select: { id: true } });
    const created = await db.$transaction(async (tx) => {
      const t = await insertCrmTask(tx, { actor, prospectId, opportunityId: opp?.id ?? null, assignedStaffId: assignee, type: input.type, title: input.title, notes: input.notes, priority: input.priority, dueAt });
      return t;
    });
    refresh(prospectId);
    return { taskId: created.id };
  });
}

async function scopedTask(actor: Awaited<ReturnType<typeof requireCrmActor>>, taskId: string) {
  const t = await db.crmTask.findFirst({
    where: { id: taskId, prospect: assignedScopeWhere(actor) },
    select: { id: true, prospectId: true, status: true, assignedStaffId: true },
  });
  if (!t) throw new CrmError("NOT_FOUND");
  // Within a manager's/rep's prospect scope a task is still only editable by its assignee's scope.
  if (!actor.all && t.assignedStaffId && !actor.scopeStaffIds.includes(t.assignedStaffId)) throw new CrmError("NOT_FOUND");
  return t;
}

export async function completeTask(taskId: string, outcomeNote?: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const t = await scopedTask(actor, taskId);
    const note = (outcomeNote ?? "").trim().slice(0, 2000) || null;
    await db.$transaction(async (tx) => {
      const done = await tx.crmTask.updateMany({ where: { id: taskId, status: "OPEN" }, data: { status: "DONE", completedAt: new Date(), completedByUserId: actor.userId } });
      if (done.count !== 1) throw new CrmError("TASK_NOT_OPEN");
      if (note) await tx.crmActivity.create({ data: { prospectId: t.prospectId, type: "NOTE", authorUserId: actor.userId, body: note, metadata: { event: "TASK_OUTCOME", taskId } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "TASK_COMPLETED", entityType: "CrmTask", entityId: taskId, prospectId: t.prospectId }, tx);
      await touchProspect(tx, t.prospectId);
    });
    refresh(t.prospectId);
    return {};
  });
}

export async function reopenTask(taskId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const t = await scopedTask(actor, taskId);
    await db.$transaction(async (tx) => {
      const r = await tx.crmTask.updateMany({ where: { id: taskId, status: { in: ["DONE", "CANCELLED"] } }, data: { status: "OPEN", completedAt: null, completedByUserId: null } });
      if (r.count !== 1) throw new CrmError("TASK_NOT_CLOSED");
      await writeCrmAudit({ actorUserId: actor.userId, action: "TASK_REOPENED", entityType: "CrmTask", entityId: taskId, prospectId: t.prospectId }, tx);
    });
    refresh(t.prospectId);
    return {};
  });
}

export async function cancelTask(taskId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const t = await scopedTask(actor, taskId);
    await db.$transaction(async (tx) => {
      const r = await tx.crmTask.updateMany({ where: { id: taskId, status: "OPEN" }, data: { status: "CANCELLED" } });
      if (r.count !== 1) throw new CrmError("TASK_NOT_OPEN");
      await writeCrmAudit({ actorUserId: actor.userId, action: "TASK_CANCELLED", entityType: "CrmTask", entityId: taskId, prospectId: t.prospectId }, tx);
    });
    refresh(t.prospectId);
    return {};
  });
}

export async function reassignTask(taskId: string, staffId: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const t = await scopedTask(actor, taskId);
    if (!canAssignToStaff(actor, staffId)) throw new CrmError("ASSIGNMENT_FORBIDDEN");
    const target = await resolveAssignee(actor, staffId);
    await db.$transaction(async (tx) => {
      await tx.crmTask.update({ where: { id: taskId }, data: { assignedStaffId: target } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "TASK_REASSIGNED", entityType: "CrmTask", entityId: taskId, prospectId: t.prospectId, before: { assignedStaffId: t.assignedStaffId }, after: { assignedStaffId: target } }, tx);
    });
    refresh(t.prospectId);
    return {};
  });
}
