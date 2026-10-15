import "server-only";
import { Prisma } from "@prisma/client";
import { evaluateQualification, type QualificationLane, type QualificationResult } from "@/domain/lead-radar/qualification";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { FACT_SELECT, factsOf, poolWhere, type ActivePolicy, type FactRow } from "@/lib/lead-radar/policy";

export const QUALIFY_PAGE = 500;

export interface QualifyTally { evaluated: number; auto: number; review: number; blocked: number; outOfScope: number; approved: number; revoked: number; pages: number }
export const emptyQualifyTally = (): QualifyTally => ({ evaluated: 0, auto: 0, review: 0, blocked: 0, outOfScope: 0, approved: 0, revoked: 0, pages: 0 });

/**
 * Evaluates every pool candidate whose stored verdict is not from the ACTIVE policy version (never evaluated, a staged update cleared it, or the policy changed),
 * in pages of ≤ 500 rows. Each page is one short transaction that locks its rows (FOR UPDATE SKIP LOCKED), so a concurrent worker or a staging chunk can never be
 * overwritten with a stale verdict, and a crashed worker simply leaves the rest for the next tick (the queue is the table itself — no cursor to lose).
 *
 *  · AUTO_ELIGIBLE → reviewState APPROVED by the policy (`approvedByPolicyVersion`), the only way the policy advances a record.
 *  · HUMAN_REVIEW / BLOCKED / out of scope → a previous policy approval that has NOT been imported is revoked back to PENDING.
 *  · A candidate a human decided (approved or rejected) is outside the pool and is never modified.
 */
export async function qualifyPending(policy: ActivePolicy, opts: { deadline: number; maxPages?: number }): Promise<QualifyTally> {
  const tally = emptyQualifyTally();
  const version = policy.version;
  const actorUserId = policy.activatedByUserId ?? "system";
  for (let page = 0; page < (opts.maxPages ?? 1000) && Date.now() < opts.deadline; page++) {
    const n = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c."id" FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmDiscoveryRun" r ON r."id" = c."lastRunId"
        WHERE c."importState" = 'NOT_IMPORTED' AND r."status" = 'COMPLETED' AND (c."reviewState" = 'PENDING' OR c."approvedByPolicyVersion" IS NOT NULL)
          AND c."qualificationPolicyVersion" IS DISTINCT FROM ${version}
        ORDER BY c."id" LIMIT ${QUALIFY_PAGE} FOR UPDATE OF c SKIP LOCKED`);
      if (!locked.length) return 0;
      const rows: FactRow[] = await tx.crmDiscoveryCandidate.findMany({ where: { AND: [poolWhere, { id: { in: locked.map((l) => l.id) } }] }, select: FACT_SELECT });
      const now = new Date();
      // Group identical verdicts so a page costs a handful of UPDATEs, not one per row.
      const groups = new Map<string, { ids: string[]; result: QualificationResult; approve: boolean; revoke: boolean }>();
      for (const r of rows) {
        const result = evaluateQualification(policy.rules, factsOf(r));
        // Auto-eligible: newly approved, or an earlier policy version's approval carried onto the current version (still not imported).
        const approve = result.lane === "AUTO_ELIGIBLE" && (r.reviewState === "PENDING" || (r.approvedByPolicyVersion !== null && r.approvedByPolicyVersion !== version));
        const revoke = result.lane !== "AUTO_ELIGIBLE" && r.approvedByPolicyVersion !== null;
        const key = JSON.stringify([result.lane, result.reasons, approve, revoke]);
        const g = groups.get(key) ?? { ids: [], result, approve, revoke };
        g.ids.push(r.id); groups.set(key, g);
        tally.evaluated++;
        if (result.lane === "AUTO_ELIGIBLE") tally.auto++; else if (result.lane === "HUMAN_REVIEW") tally.review++; else if (result.lane === "BLOCKED") tally.blocked++; else tally.outOfScope++;
        if (approve && r.reviewState === "PENDING") tally.approved++;
        if (revoke) tally.revoked++;
      }
      for (const g of groups.values()) {
        await tx.crmDiscoveryCandidate.updateMany({
          // Compare-and-set on the state we evaluated: if anything moved meanwhile (it cannot while locked, but the guard documents the invariant) nothing is written.
          where: { id: { in: g.ids }, importState: "NOT_IMPORTED" },
          data: {
            qualificationLane: g.result.lane as QualificationLane | null, qualificationReasons: g.result.reasons, qualificationPolicyVersion: version, qualifiedAt: now,
            ...(g.approve ? { reviewState: "APPROVED" as const, reviewedByUserId: actorUserId, reviewedAt: now, reviewNote: `POLICY_V${version}`, approvedByPolicyVersion: version } : {}),
            ...(g.revoke ? { reviewState: "PENDING" as const, reviewedByUserId: null, reviewedAt: null, reviewNote: null, approvedByPolicyVersion: null } : {}),
          },
        });
      }
      return rows.length;
    }, { timeout: 30_000, maxWait: 10_000 });
    if (!n) break;
    tally.pages++;
  }
  if (tally.evaluated > 0) {
    await writeCrmAudit({ actorUserId: policy.activatedByUserId ?? "system", action: "LEAD_RADAR_AUTO_QUALIFIED", entityType: "CrmLeadPolicy", entityId: policy.id, metadata: { version, ...tally } });
  }
  return tally;
}
