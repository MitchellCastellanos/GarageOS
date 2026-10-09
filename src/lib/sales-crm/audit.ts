import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Stable action vocabulary (string column on purpose, like PlatformAuditLog: new actions need no migration). */
export type CrmAuditAction =
  | "STAFF_CREATED" | "STAFF_UPDATED" | "STAFF_ROLE_CHANGED" | "STAFF_DEACTIVATED" | "STAFF_REACTIVATED" | "STAFF_INVITE_SENT" | "STAFF_INVITE_ACCEPTED" | "STAFF_WORK_REASSIGNED"
  | "PROSPECT_CREATED" | "PROSPECT_UPDATED" | "PROSPECT_ARCHIVED" | "PROSPECT_RESTORED" | "PROSPECT_ASSIGNED" | "PROSPECT_DNC_SET" | "PROSPECT_DNC_CLEARED"
  | "CONTACT_CREATED" | "CONTACT_UPDATED" | "CONTACT_ARCHIVED"
  | "NEED_ASSESSED" | "NEED_REMOVED" | "NEED_DEFINITION_CHANGED" | "SCORE_OVERRIDDEN"
  | "OPPORTUNITY_CREATED" | "OPPORTUNITY_UPDATED" | "STAGE_CHANGED" | "OPPORTUNITY_ASSIGNED" | "DEMO_LINKED"
  | "TASK_CREATED" | "TASK_COMPLETED" | "TASK_REOPENED" | "TASK_CANCELLED" | "TASK_REASSIGNED"
  | "IMPORT_PREVIEWED" | "IMPORT_COMPLETED" | "IMPORT_CANCELLED";

export interface CrmAuditInput {
  actorUserId: string;
  action: CrmAuditAction;
  entityType: string;
  entityId?: string | null;
  prospectId?: string | null;
  staffId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

type Client = Pick<typeof db, "crmAuditEvent">;

/** Writes one audit row. Pass a transaction client so the audit and the change commit (or fail) together. Never put secrets/PII bodies in before/after. */
export async function writeCrmAudit(input: CrmAuditInput, client: Client = db): Promise<void> {
  await client.crmAuditEvent.create({
    data: {
      actorUserId: input.actorUserId, action: input.action, entityType: input.entityType,
      entityId: input.entityId ?? null, prospectId: input.prospectId ?? null, staffId: input.staffId ?? null,
      before: input.before, after: input.after, metadata: input.metadata ?? {},
    },
  });
}
