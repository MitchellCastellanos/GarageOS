import "server-only";
import type { CrmLevel, CrmTaskType } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import type { Tx } from "@/lib/sales-crm/prospects";

/** Creates one CRM task + its audit event inside the caller's transaction (shared by the task form and field-visit follow-ups). */
export async function insertCrmTask(tx: Tx, p: {
  actor: PlatformSalesActor; prospectId: string; opportunityId: string | null; assignedStaffId: string | null; type: CrmTaskType;
  title: string; notes: string | null; priority: CrmLevel; dueAt: Date;
}) {
  const t = await tx.crmTask.create({
    data: {
      prospectId: p.prospectId, opportunityId: p.opportunityId, assignedStaffId: p.assignedStaffId, type: p.type, title: p.title, notes: p.notes,
      priority: p.priority, dueAt: p.dueAt, createdByUserId: p.actor.userId,
    },
    select: { id: true },
  });
  await writeCrmAudit({ actorUserId: p.actor.userId, action: "TASK_CREATED", entityType: "CrmTask", entityId: t.id, prospectId: p.prospectId, metadata: { assignedStaffId: p.assignedStaffId } }, tx);
  return t;
}
