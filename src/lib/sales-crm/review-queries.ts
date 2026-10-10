import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, canAccessAssignedStaff, type PlatformSalesActor } from "@/domain/sales-crm/access";
import type { ImportCandidate } from "@/domain/sales-crm/import";
import { canReviewEvidence } from "@/domain/sales-crm/casl-evidence";

export const REVIEW_PAGE_SIZE = 20;

/**
 * Duplicate reviews the actor may see. Super Admin: all. Others: reviews whose EXISTING prospect is in their scope
 * (fully visible and decidable) plus reviews from their own imports (shown "restricted" — no identity of the other
 * prospect is ever revealed, and they cannot be decided from here).
 */
export async function listDuplicateReviews(actor: PlatformSalesActor, opts: { status: "PENDING" | "DECIDED"; page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where: Prisma.CrmDuplicateReviewWhereInput = {
    AND: [
      opts.status === "PENDING" ? { status: "PENDING" } : { status: { not: "PENDING" } },
      actor.all ? {} : { OR: [{ prospect: assignedScopeWhere(actor) }, { createdByUserId: actor.userId }] },
    ],
  };
  const [total, rows] = await Promise.all([
    db.crmDuplicateReview.count({ where }),
    db.crmDuplicateReview.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * REVIEW_PAGE_SIZE, take: REVIEW_PAGE_SIZE,
      select: {
        id: true, status: true, reasons: true, pendingCandidate: true, createdAt: true, decidedAt: true, resultProspectId: true,
        observation: { select: { sourceKey: true, snapshot: true, rowNumber: true } },
        prospect: { select: { id: true, name: true, address: true, city: true, province: true, postalCode: true, phone: true, website: true, assignedStaffId: true, assignedStaff: { select: { user: { select: { name: true } } } } } },
      },
    }),
  ]);
  return {
    total, page, pages: Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)),
    rows: rows.map((r) => {
      const accessible = canAccessAssignedStaff(actor, r.prospect.assignedStaffId);
      const c = r.pendingCandidate as unknown as ImportCandidate | null;
      const snap = r.observation.snapshot as Record<string, string | null>;
      return {
        id: r.id, status: r.status, reasons: r.reasons, createdAt: r.createdAt, decidedAt: r.decidedAt, accessible, resultProspectId: accessible ? r.resultProspectId : null,
        sourceKey: r.observation.sourceKey, row: r.observation.rowNumber,
        incoming: { name: c?.prospect.name ?? snap.name ?? "—", address: c?.prospect.address ?? snap.address ?? null, city: c?.prospect.city ?? snap.city ?? null, province: c?.prospect.province ?? snap.province ?? null, postalCode: c?.prospect.postalCode ?? snap.postalCode ?? null, phone: c?.prospect.phone ?? snap.phone ?? null, website: c?.prospect.website ?? snap.websiteDomain ?? null },
        existing: accessible ? { id: r.prospect.id, name: r.prospect.name, address: r.prospect.address, city: r.prospect.city, province: r.prospect.province, postalCode: r.prospect.postalCode, phone: r.prospect.phone, website: r.prospect.website, owner: r.prospect.assignedStaff?.user.name ?? null } : null,
      };
    }),
  };
}

/** Pending CASL evidence the actor is allowed to review (manager: own team's prospects; Super Admin: all), with audit history. */
export async function listPendingEvidence(actor: PlatformSalesActor) {
  const rows = await db.crmSendingBasis.findMany({
    where: {
      reviewStatus: "PENDING_REVIEW", revokedAt: null,
      contact: { prospect: actor.all ? {} : { assignedStaffId: { in: [...actor.scopeStaffIds] } } },
    },
    orderBy: { recordedAt: "asc" }, take: 100,
    select: {
      id: true, kind: true, evidence: true, evidenceType: true, sourceUrl: true, capturedAt: true, supportingFacts: true, roleRelevance: true, publishedConditionsConfirmed: true,
      recordedAt: true, recordedByUserId: true, reviewStatus: true,
      contact: { select: { id: true, name: true, email: true, prospect: { select: { id: true, name: true, assignedStaffId: true } } } },
    },
  });
  const userIds = [...new Set(rows.map((r) => r.recordedByUserId))];
  const [users, history] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    db.crmAuditEvent.findMany({ where: { entityType: "CrmSendingBasis", entityId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: "asc" }, select: { entityId: true, action: true, createdAt: true, actorUserId: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const d = canReviewEvidence(actor, r, r.contact.prospect.assignedStaffId);
    return {
      ...r, recordedBy: names.get(r.recordedByUserId) ?? "—", prospect: r.contact.prospect,
      canApprove: d.allowed, blocked: d.allowed ? null : d.code,
      history: history.filter((h) => h.entityId === r.id).map((h) => ({ action: h.action, at: h.createdAt })),
    };
  });
}

/** Sellers and their assignment settings/workload for the assignment screen (scoped like the assignment run itself). */
export async function listSellerAvailability(actor: PlatformSalesActor) {
  const staff = await db.platformSalesStaff.findMany({
    where: { status: "ACTIVE", role: "SALES_REP", ...(actor.all ? {} : { id: { in: [...actor.scopeStaffIds] } }) },
    orderBy: { user: { name: "asc" } },
    select: { id: true, salesMode: true, acceptsAutoAssignment: true, maxActiveLeads: true, coverageTerritoryKeys: true, user: { select: { name: true } }, _count: { select: { prospects: { where: { status: "ACTIVE", doNotContact: false } } } } },
  });
  return staff.map((s) => ({ id: s.id, name: s.user.name, mode: s.salesMode, accepts: s.acceptsAutoAssignment, cap: s.maxActiveLeads, coverage: s.coverageTerritoryKeys, workload: s._count.prospects }));
}
