import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

/** Commercial lead queues. Every queue is just a `where` fragment ANDed with the actor's scope — one definition drives list, counts and pagination. */
export const PROSPECT_QUEUES = ["new", "mine", "ready", "eligibility", "field", "followup", "duplicates", "missing", "dnc"] as const;
export type ProspectQueue = (typeof PROSPECT_QUEUES)[number];
export const isProspectQueue = (v: string | undefined): v is ProspectQueue => !!v && (PROSPECT_QUEUES as readonly string[]).includes(v);

const NONE: Prisma.CrmProspectWhereInput = { id: "__none__" };

export interface QueueContext { now: Date; fieldTerritoryKeys: string[] }
export async function loadQueueContext(now = new Date()): Promise<QueueContext> {
  const rules = await loadTerritoryRulesWith(db);
  return { now, fieldTerritoryKeys: rules.filter((r) => r.acquisition !== "REMOTE_DEFAULT" && (r.cities.length > 0 || r.postalPrefixes.length > 0)).map((r) => r.key) };
}

/** A contact basis that could authorise a send today (pre-check only; the full send policy still runs at send time). */
function usableBasis(now: Date): Prisma.CrmSendingBasisWhereInput {
  return {
    revokedAt: null,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      { OR: [
        { kind: { notIn: ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"] }, reviewStatus: { in: ["NOT_REQUIRED", "LEGACY_UNREVIEWED", "APPROVED"] } },
        { kind: { in: ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"] }, reviewStatus: "APPROVED" },
      ] },
    ],
  };
}

export function queueWhere(queue: ProspectQueue, actor: PlatformSalesActor, ctx: QueueContext): Prisma.CrmProspectWhereInput {
  const active: Prisma.CrmProspectWhereInput = { status: "ACTIVE", doNotContact: false };
  switch (queue) {
    case "new": return { ...active, assignedStaffId: null };
    case "mine": return actor.staffId ? { ...active, assignedStaffId: actor.staffId } : NONE;
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
      return { status: "ACTIVE", contacts: { some: { archivedAt: null, sendingBases: { some: { revokedAt: null, reviewStatus: { in: ["PENDING_REVIEW", "LEGACY_UNREVIEWED"] } } } } } };
    case "field":
      if (!actor.all && actor.kind === "SALES_REP" && actor.salesMode !== "FIELD") return NONE; // REMOTE sellers have no field work
      return ctx.fieldTerritoryKeys.length
        ? { ...active, territoryState: "LOCAL", territoryKey: { in: ctx.fieldTerritoryKeys }, addressQuality: { in: ["PARTIAL", "COMPLETE"] }, OR: [{ assignedStaffId: null }, { assignedStaff: { is: { salesMode: "FIELD" } } }] }
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
