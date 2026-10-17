import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { db } from "@/lib/db";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { loadSellers } from "@/lib/sales-crm/assignment";
import { MAX_IMPORT_ATTEMPTS, readAutomation } from "@/lib/lead-radar/automation";
import { getActivePolicy, listPolicies } from "@/lib/lead-radar/policy";

// Operations dashboard data. The six stages are DELIBERATELY separate and never summed into one funnel number: an imported prospect is not a
// contacted prospect, and an eligible one is not a sent one. Everything is a count/aggregate (no business contact data leaves the database here).

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
type Pair = { k: string | null; c: bigint };
const toMap = (rows: Pair[]) => Object.fromEntries(rows.map((r) => [r.k ?? "—", n(r.c)])) as Record<string, number>;
const LR = Prisma.sql`EXISTS (SELECT 1 FROM "garageos"."CrmImportBatch" b WHERE b."id" = p."importBatchId" AND b."sourceKey" = ${LEAD_RADAR_SOURCE_KEY})`;

export async function automationDashboard(actor: PlatformSalesActor) {
  const [policy, automation, policies, comms] = await Promise.all([getActivePolicy(), readAutomation(), listPolicies(), getCommsSettings()]);
  const v = policy?.version ?? -1;
  const [byLane, laneReasons, awaiting, awaitingRun, autoPendingImport, humanPending, importByState, stalled, failedCodes, batches] = await Promise.all([
    db.$queryRaw<Pair[]>`SELECT COALESCE("qualificationLane"::text,'NONE') AS k, count(*)::bigint AS c FROM "garageos"."CrmDiscoveryCandidate" WHERE "qualificationPolicyVersion" = ${v} GROUP BY 1`,
    db.$queryRaw<(Pair & { lane: string })[]>`SELECT r AS k, COALESCE(c."qualificationLane"::text,'NONE') AS lane, count(*)::bigint AS c FROM "garageos"."CrmDiscoveryCandidate" c, unnest(c."qualificationReasons") r WHERE c."qualificationPolicyVersion" = ${v} GROUP BY 1,2`,
    db.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmDiscoveryRun" r ON r."id" = c."lastRunId" WHERE c."importState" = 'NOT_IMPORTED' AND r."status" = 'COMPLETED' AND (c."reviewState" = 'PENDING' OR c."approvedByPolicyVersion" IS NOT NULL) AND c."qualificationPolicyVersion" IS DISTINCT FROM ${v}`,
    db.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmDiscoveryRun" r ON r."id" = c."lastRunId" WHERE c."importState" = 'NOT_IMPORTED' AND r."status" <> 'COMPLETED'`,
    db.crmDiscoveryCandidate.count({ where: { reviewState: "APPROVED", importState: "NOT_IMPORTED", importAttempts: { lt: MAX_IMPORT_ATTEMPTS } } }),
    db.crmDiscoveryCandidate.count({ where: { qualificationLane: "HUMAN_REVIEW", reviewState: "PENDING", importState: "NOT_IMPORTED", qualificationPolicyVersion: v } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["importState"], _count: { _all: true } }),
    db.crmDiscoveryCandidate.count({ where: { reviewState: "APPROVED", importState: "NOT_IMPORTED", importAttempts: { gte: MAX_IMPORT_ATTEMPTS } } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["importErrorCode"], where: { importState: "FAILED" }, _count: { _all: true } }),
    db.crmImportBatch.findMany({ where: { sourceKey: LEAD_RADAR_SOURCE_KEY, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 6, select: { id: true, completedAt: true, createdCount: true, summary: true } }),
  ]);
  const lanes = toMap(byLane);
  const reasonsBy = (lane: string) => Object.fromEntries(laneReasons.filter((r) => r.lane === lane).map((r) => [r.k as string, n(r.c)])) as Record<string, number>;
  const imp = Object.fromEntries(importByState.map((r) => [r.importState, r._count._all])) as Record<string, number>;

  const [lrTotal, assignedBy, unassignedBy, eligRows, eligReasons, eligPending, enrollRows, msgRows, replies, pausedBy, recentRuns, lastRun] = await Promise.all([
    db.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "garageos"."CrmProspect" p WHERE p."status" = 'ACTIVE' AND ${LR}`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(p."assignmentMode"::text,'UNTAGGED') AS k, count(*)::bigint AS c FROM "garageos"."CrmProspect" p WHERE p."status" = 'ACTIVE' AND p."assignedStaffId" IS NOT NULL AND ${LR} GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(p."territoryState"::text,'NONE') AS k, count(*)::bigint AS c FROM "garageos"."CrmProspect" p WHERE p."status" = 'ACTIVE' AND p."assignedStaffId" IS NULL AND ${LR} GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT e."decision"::text AS k, count(*)::bigint AS c FROM "garageos"."CrmOutreachEligibility" e JOIN "garageos"."CrmProspect" p ON p."id" = e."prospectId" WHERE p."status" = 'ACTIVE' AND ${LR} GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT r AS k, count(*)::bigint AS c FROM "garageos"."CrmOutreachEligibility" e JOIN "garageos"."CrmProspect" p ON p."id" = e."prospectId", unnest(e."reasons") r WHERE p."status" = 'ACTIVE' AND ${LR} GROUP BY 1`,
    db.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "garageos"."CrmProspect" p LEFT JOIN "garageos"."CrmOutreachEligibility" e ON e."prospectId" = p."id" WHERE p."status" = 'ACTIVE' AND e."id" IS NULL AND ${LR}`,
    db.crmSequenceEnrollment.groupBy({ by: ["status"], where: { autoEnrolledAt: { not: null } }, _count: { _all: true } }),
    db.$queryRaw<Pair[]>`SELECT m."status"::text AS k, count(*)::bigint AS c FROM "garageos"."CrmEmailMessage" m JOIN "garageos"."CrmSequenceEnrollment" e ON e."id" = m."sequenceEnrollmentId" WHERE e."autoEnrolledAt" IS NOT NULL AND m."direction" = 'OUTBOUND' GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT e."stopReason" AS k, count(*)::bigint AS c FROM "garageos"."CrmSequenceEnrollment" e WHERE e."autoEnrolledAt" IS NOT NULL AND e."status" = 'STOPPED' GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT e."stopReason" AS k, count(*)::bigint AS c FROM "garageos"."CrmSequenceEnrollment" e WHERE e."autoEnrolledAt" IS NOT NULL AND e."status" = 'PAUSED' GROUP BY 1`,
    db.crmLeadAutomationRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    db.crmLeadAutomationRun.findFirst({ where: { status: { in: ["COMPLETED", "FAILED"] } }, orderBy: { startedAt: "desc" }, select: { counters: true, startedAt: true } }),
  ]);
  const enr = Object.fromEntries(enrollRows.map((r) => [r.status, r._count._all])) as Record<string, number>;
  const msg = toMap(msgRows);
  const stops = toMap(replies);
  const lastAssign = ((lastRun?.counters ?? {}) as { assign?: { skips?: Record<string, number>; note?: string } }).assign ?? {};

  // Seller workload (all active sales reps, named); allow-list membership and sender readiness make capacity problems visible.
  const sellers = await loadSellers(actor, db);
  const staff = await db.platformSalesStaff.findMany({
    where: { id: { in: sellers.map((s) => s.id) } },
    select: { id: true, user: { select: { name: true, email: true } }, maxActiveLeads: true, maxActiveFieldLeads: true, maxActiveRemoteLeads: true, leadLanguages: true, senderIdentity: { select: { status: true, inboundVerifiedAt: true } } },
  });
  const workload = sellers.map((s) => {
    const st = staff.find((x) => x.id === s.id);
    return {
      id: s.id, name: st?.user.name ?? "—", email: st?.user.email ?? "", mode: s.mode, accepts: s.acceptsAutoAssignment, inAllowList: automation.assignStaffIds.includes(s.id), workload: s.workload,
      field: s.laneWorkload?.FIELD ?? 0, remote: s.laneWorkload?.REMOTE ?? 0, cap: st?.maxActiveLeads ?? null, fieldCap: st?.maxActiveFieldLeads ?? null, remoteCap: st?.maxActiveRemoteLeads ?? null,
      languages: st?.leadLanguages ?? [], senderStatus: st?.senderIdentity?.status ?? null, replyPathVerified: !!st?.senderIdentity?.inboundVerifiedAt,
    };
  });

  // Errors requiring intervention: derived, never hidden in logs.
  const issues: { code: string; count?: number }[] = [];
  if (!policy) issues.push({ code: "NO_ACTIVE_POLICY" });
  if (automation.enabled && !automation.assignStaffIds.length) issues.push({ code: "NO_ASSIGNMENT_SELLER" });
  for (const w of workload.filter((x) => x.inAllowList)) {
    if (w.senderStatus !== "ACTIVE") issues.push({ code: "SENDER_NOT_ACTIVE", count: 1 });
    else if (!w.replyPathVerified) issues.push({ code: "SENDER_REPLY_PATH_UNVERIFIED", count: 1 });
  }
  const failedImports = failedCodes.reduce((a, r) => a + r._count._all, 0);
  if (failedImports) issues.push({ code: "IMPORT_FAILED", count: failedImports });
  if (stalled) issues.push({ code: "IMPORT_STALLED", count: stalled });
  const failedTicks = recentRuns.filter((r) => r.status === "FAILED").length;
  if (failedTicks) issues.push({ code: "AUTOMATION_TICK_FAILED", count: failedTicks });
  const pausedTotal = Object.values(toMap(pausedBy)).reduce((a, b) => a + b, 0);
  if (pausedTotal) issues.push({ code: "ENROLLMENTS_PAUSED", count: pausedTotal });
  if (n(awaitingRun[0]?.c)) issues.push({ code: "RUN_INCOMPLETE", count: n(awaitingRun[0]?.c) });

  const sent = (msg.SENT ?? 0) + (msg.DELIVERED ?? 0) + (msg.DELAYED ?? 0) + (msg.BOUNCED ?? 0) + (msg.COMPLAINED ?? 0);
  return {
    policy: policy ? { id: policy.id, version: policy.version } : null,
    policies: policies.map((p) => ({ id: p.id, version: p.version, name: p.name, status: p.status, previewedAt: p.previewedAt, activatedAt: p.activatedAt, rules: p.rules as Record<string, unknown>, preview: p.previewSummary as null | { evaluated: number; lanes: Record<string, number>; truncated: boolean } })),
    automation: {
      enabled: automation.enabled, pausedReason: automation.pausedReason, pausedAt: automation.pausedAt, lastTickAt: automation.lastTickAt, qualifyEnabled: automation.qualifyEnabled, importEnabled: automation.importEnabled,
      assignEnabled: automation.assignEnabled, eligibilityEnabled: automation.eligibilityEnabled, releaseUnavailable: automation.releaseUnavailable, assignStaffIds: automation.assignStaffIds, importChunkSize: automation.importChunkSize,
      pilotEnabled: automation.pilotEnabled, pilotSequenceId: automation.pilotSequenceId, pilotDailyCap: automation.pilotDailyCap, pilotTotalCap: automation.pilotTotalCap,
    },
    qualification: {
      auto: lanes.AUTO_ELIGIBLE ?? 0, review: lanes.HUMAN_REVIEW ?? 0, blocked: lanes.BLOCKED ?? 0, outOfScope: lanes.NONE ?? 0, awaitingEvaluation: n(awaiting[0]?.c), awaitingRunCompletion: n(awaitingRun[0]?.c),
      humanPending, autoReasons: reasonsBy("AUTO_ELIGIBLE"), reviewReasons: reasonsBy("HUMAN_REVIEW"), blockedReasons: reasonsBy("BLOCKED"),
    },
    crm: { byState: imp, autoPendingImport, stalled, failedCodes: Object.fromEntries(failedCodes.map((r) => [r.importErrorCode ?? "—", r._count._all])), batches: batches.map((b) => ({ id: b.id, at: b.completedAt, created: b.createdCount, automatic: !!(b.summary as { automation?: unknown } | null)?.automation })) },
    assignment: {
      leadRadarProspects: n(lrTotal[0]?.c), field: assignedBy.find((r) => r.k === "FIELD") ? n(assignedBy.find((r) => r.k === "FIELD")!.c) : 0, remote: assignedBy.find((r) => r.k === "REMOTE") ? n(assignedBy.find((r) => r.k === "REMOTE")!.c) : 0,
      untagged: assignedBy.find((r) => r.k === "UNTAGGED") ? n(assignedBy.find((r) => r.k === "UNTAGGED")!.c) : 0, unassigned: Object.values(toMap(unassignedBy)).reduce((a, b) => a + b, 0),
      unassignedByTerritoryState: toMap(unassignedBy), lastSkips: lastAssign.skips ?? {}, lastNote: lastAssign.note ?? null, workload,
    },
    eligibility: { eligible: toMap(eligRows).ELIGIBLE ?? 0, notEligible: toMap(eligRows).NOT_ELIGIBLE ?? 0, awaitingAssessment: n(eligPending[0]?.c), reasons: toMap(eligReasons) },
    sending: {
      sendingEnabled: comms.sendingEnabled && comms.automatedSendingEnabled, enrollments: enr, messages: msg, prospectsWithMessagesSent: sent, replied: stops.REPLIED ?? 0, unsubscribed: stops.OPTED_OUT ?? 0, bounced: stops.BOUNCED ?? 0,
      meetingBooked: stops.MEETING_BOOKED ?? 0, pausedReasons: toMap(pausedBy),
    },
    issues,
    runs: recentRuns.map((r) => ({ id: r.id, trigger: r.trigger, status: r.status, policyVersion: r.policyVersion, startedAt: r.startedAt, finishedAt: r.finishedAt, errorCode: r.errorCode, counters: r.counters as Record<string, unknown> })),
  };
}
export type AutomationDashboard = Awaited<ReturnType<typeof automationDashboard>>;
