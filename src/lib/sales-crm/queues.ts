import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { remoteNoEmailWhere } from "@/lib/lead-radar/remote-email";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

/** Commercial lead queues. Every queue is just a `where` fragment ANDed with the actor's scope — one definition drives list, counts and pagination. */
export const PROSPECT_QUEUES = ["new", "mine", "ready", "eligibility", "field", "followup", "duplicates", "missing", "dnc"] as const;
export type ProspectQueue = (typeof PROSPECT_QUEUES)[number];
export const isProspectQueue = (v: string | undefined): v is ProspectQueue => !!v && (PROSPECT_QUEUES as readonly string[]).includes(v);

const NONE: Prisma.CrmProspectWhereInput = { id: "__none__" };

export interface QueueContext { now: Date; fieldTerritoryKeys: string[]; fieldRules: { key: string; priorityDays: number | null }[] }
export async function loadQueueContext(now = new Date()): Promise<QueueContext> {
  const rules = await loadTerritoryRulesWith(db);
  const fieldRules = rules.filter((r) => r.acquisition !== "REMOTE_DEFAULT" && (r.cities.length > 0 || r.postalPrefixes.length > 0));
  return { now, fieldTerritoryKeys: fieldRules.map((r) => r.key), fieldRules: fieldRules.map((r) => ({ key: r.key, priorityDays: r.acquisition === "FIELD_PRIORITY" ? r.priorityDays : null })) };
}

/**
 * FIELD still holds the prospect: not manually released, and — under FIELD_PRIORITY — its OWN window is open/not started, or it
 * has meaningful engagement (SQL approximation of `acquisitionState`: any non-visit touch, an active opportunity or a qualifying visit).
 */
function fieldHeldWhere(ctx: QueueContext): Prisma.CrmProspectWhereInput {
  return {
    remoteReleasedAt: null,
    OR: ctx.fieldRules.map((r) => r.priorityDays
      ? { territoryKey: r.key, OR: [
          { fieldPriorityStartedAt: null }, { fieldPriorityStartedAt: { gt: new Date(ctx.now.getTime() - r.priorityDays * 86_400_000) } },
          { activities: { some: { type: { in: ["CALL", "MEETING", "EMAIL_SENT", "EMAIL_RECEIVED", "EMAIL_LOGGED", "SEQUENCE", "DEMO"] } } } },
          { opportunities: { some: { stage: { in: ["CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } } } },
          { activities: { some: { type: "FIELD_VISIT", fieldVisitOutcome: { in: ["DECISION_MAKER_CONTACTED", "INTERESTED", "DEMO_DISCUSSED", "DEMO_SCHEDULED"] } } } },
        ] }
      : { territoryKey: r.key }),
  };
}

/** A contact basis that could authorise a send today (pre-check only; the full send policy still runs at send time). */
function usableBasis(now: Date): Prisma.CrmSendingBasisWhereInput {
  return {
    revokedAt: null,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [
        // reviewStatus null = pre-Lead-Engine legacy row: valid exactly as before until explicitly reclassified.
        { reviewStatus: null },
        { kind: { notIn: ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"] }, reviewStatus: { in: ["NOT_REQUIRED", "LEGACY_UNREVIEWED", "APPROVED"] } },
        { kind: { in: ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"] }, reviewStatus: "APPROVED" },
      ] },
    ],
  };
}

export function queueWhere(queue: ProspectQueue, actor: PlatformSalesActor, ctx: QueueContext): Prisma.CrmProspectWhereInput {
  const active: Prisma.CrmProspectWhereInput = { status: "ACTIVE", doNotContact: false };
  switch (queue) {
    // Email-only REMOTE strategy: national prospects with no email are kept (never deleted or reassigned) but are not active work, so they leave these two queues.
    case "new": return { ...active, assignedStaffId: null, NOT: remoteNoEmailWhere };
    case "mine": return actor.staffId ? { ...active, assignedStaffId: actor.staffId, NOT: remoteNoEmailWhere } : NONE;
    case "ready":
      return {
        ...active, assignedStaffId: { not: null }, territoryState: { in: ["LOCAL", "NATIONAL"] },
        AND: [
          { OR: [{ preferredLanguage: { in: ["FR", "EN"] } }, { contacts: { some: { archivedAt: null, preferredLanguage: { in: ["FR", "EN"] } } } }] },
          // A revoked row anywhere in a contact's history disqualifies it here (conservative: newest-row-wins is decided at send time).
          { contacts: { some: { archivedAt: null, doNotContact: false, emailNormalized: { not: null }, sendingBases: { some: usableBasis(ctx.now), none: { revokedAt: { not: null } } } } } },
        ],
      };
    case "eligibility":
      return { status: "ACTIVE", contacts: { some: { archivedAt: null, sendingBases: { some: { revokedAt: null, OR: [{ reviewStatus: null }, { reviewStatus: { in: ["PENDING_REVIEW", "LEGACY_UNREVIEWED"] } }] } } } } };
    case "field":
      if (!actor.all && actor.kind === "SALES_REP" && actor.salesMode !== "FIELD") return NONE; // REMOTE sellers have no field work
      return ctx.fieldTerritoryKeys.length
        ? { ...active, territoryState: "LOCAL", addressQuality: { in: ["PARTIAL", "COMPLETE"] }, AND: [fieldHeldWhere(ctx), { OR: [{ assignedStaffId: null }, { assignedStaff: { is: { salesMode: "FIELD" } } }] }] }
        : NONE;
    case "followup": return { ...active, tasks: { some: { status: "OPEN", dueAt: { lt: ctx.now } } } };
    case "duplicates": return { status: "ACTIVE", duplicateReviews: { some: { status: "PENDING" } } };
    case "missing":
      return { ...active, OR: [{ addressQuality: { in: ["UNKNOWN", "INCOMPLETE"] } }, { AND: [{ phone: null }, { email: null }] }, { preferredLanguage: "UNKNOWN" }] };
    case "dnc": return { doNotContact: true };
  }
}

/** Counts per queue under the actor's scope; identical fragments to the list query so numbers always match the rows. */
export async function queueCounts(actor: PlatformSalesActor, ctx?: QueueContext): Promise<Record<ProspectQueue, number>> {
  const c = ctx ?? (await loadQueueContext());
  const scope = assignedScopeWhere(actor);
  const entries = await Promise.all(PROSPECT_QUEUES.map(async (q) => [q, await db.crmProspect.count({ where: { AND: [scope, queueWhere(q, actor, c)] } })] as const));
  return Object.fromEntries(entries) as Record<ProspectQueue, number>;
}
