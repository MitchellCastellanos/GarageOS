import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Stable action vocabulary (string column on purpose, like PlatformAuditLog: new actions need no migration). */
export type CrmAuditAction =
  | "STAFF_CREATED" | "STAFF_UPDATED" | "STAFF_ROLE_CHANGED" | "STAFF_MODE_CHANGED" | "STAFF_CORPORATE_EMAIL_ASSIGNED" | "STAFF_PASSWORD_RESET_REQUESTED" | "STAFF_RECOVERY_EMAIL_REQUESTED" | "STAFF_RECOVERY_EMAIL_CONFIRMED" | "VIDEO_SAVED" | "VIDEO_PUBLISHED" | "TERRITORY_SAVED" | "TEST_EMAIL_SENT" | "FIELD_VISIT_LOGGED" | "STAFF_DEACTIVATED" | "STAFF_REACTIVATED" | "STAFF_INVITE_SENT" | "STAFF_INVITE_ACCEPTED" | "STAFF_WORK_REASSIGNED"
  | "PROSPECT_CREATED" | "PROSPECT_UPDATED" | "PROSPECT_ARCHIVED" | "PROSPECT_RESTORED" | "PROSPECT_ASSIGNED" | "PROSPECT_DNC_SET" | "PROSPECT_DNC_CLEARED"
  | "CONTACT_CREATED" | "CONTACT_UPDATED" | "CONTACT_ARCHIVED"
  | "NEED_ASSESSED" | "NEED_REMOVED" | "NEED_DEFINITION_CHANGED" | "SCORE_OVERRIDDEN"
  | "OPPORTUNITY_CREATED" | "OPPORTUNITY_UPDATED" | "STAGE_CHANGED" | "OPPORTUNITY_ASSIGNED" | "DEMO_LINKED"
  | "TASK_CREATED" | "TASK_COMPLETED" | "TASK_REOPENED" | "TASK_CANCELLED" | "TASK_REASSIGNED"
  | "IMPORT_PREVIEWED" | "IMPORT_COMPLETED" | "IMPORT_CANCELLED"
  // Sales communications & scheduling (Agent 2)
  | "SENDER_IDENTITY_CREATED" | "SENDER_IDENTITY_UPDATED" | "SENDER_IDENTITY_ACTIVATED" | "SENDER_IDENTITY_DISABLED" | "COMMS_SETTINGS_UPDATED"
  | "TEMPLATE_APPROVED" | "SEQUENCE_CREATED" | "SEQUENCE_UPDATED" | "SEQUENCE_ACTIVATED" | "SEQUENCE_PAUSED" | "SEQUENCE_ARCHIVED"
  | "ENROLLMENT_CREATED" | "ENROLLMENT_PAUSED" | "ENROLLMENT_RESUMED" | "ENROLLMENT_STOPPED"
  | "EMAIL_QUEUED" | "EMAIL_CANCELLED" | "EMAIL_UNROUTED" | "THREAD_ASSIGNED" | "THREAD_STATUS_CHANGED" | "THREAD_LINKED" | "OPT_OUT_RECORDED"
  | "SENDING_BASIS_RECORDED" | "SENDING_BASIS_REVOKED" | "SUPPRESSION_ADDED" | "SUPPRESSION_LIFTED"
  | "MEETING_BOOKED" | "MEETING_RESCHEDULED" | "MEETING_CANCELLED" | "MEETING_OUTCOME" | "AVAILABILITY_UPDATED" | "BOOKING_LINK_CREATED" | "BOOKING_LINK_REVOKED";

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
