import "server-only";
import { Prisma } from "@prisma/client";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { PROVINCE_CODES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { actionsFor, conversion, deriveStage, nextAutomationTick, nextWorkerCheck } from "@/domain/lead-radar/national-readiness";
import { db } from "@/lib/db";
import { readAutomation } from "@/lib/lead-radar/automation";
import { getActivePolicy } from "@/lib/lead-radar/policy";
import { listProvinceStates } from "@/lib/lead-radar/province-state";

// National readiness per province. Three populations are kept strictly apart and labelled as such:
//   RAW      records the extractor delivered (CrmDiscoveryRun counters)
//   STAGED   CrmDiscoveryCandidate rows (evidence; includes duplicates/excluded/review)
//   CRM      CrmProspect rows created by Lead Radar imports
// Counts only; no business contact data.

const n = (v: bigint | number | string | null | undefined) => Number(v ?? 0);
const LR = Prisma.sql`EXISTS (SELECT 1 FROM "garageos"."CrmImportBatch" b WHERE b."id" = p."importBatchId" AND b."sourceKey" = ${LEAD_RADAR_SOURCE_KEY})`;

export async function nationalReadiness(now = new Date()) {
  const policy = await getActivePolicy();
  const v = policy?.version ?? -1;
  const [cand, pros, runs, states, automation, lastTick] = await Promise.all([
    db.$queryRaw<Record<string, bigint | string | null>[]>(Prisma.sql`
      SELECT c."province" AS province,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL) AS staged,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NOT NULL) AS duplicates,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'VERIFIED_REPAIR') AS verified,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'HUMAN_REVIEW') AS review,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'EXCLUDED') AS excluded,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."repairFit" IS NULL) AS unclassified,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."sourceLatitude" IS NOT NULL) AS cand_with_point,
        count(*) FILTER (WHERE c."importState" = 'FAILED') AS import_failed,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."reviewState" = 'APPROVED' AND c."importState" = 'NOT_IMPORTED') AS approved_not_imported,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."importState" = 'NOT_IMPORTED' AND c."reviewState" = 'PENDING' AND r."status" = 'COMPLETED' AND c."repairFit" IS DISTINCT FROM 'EXCLUDED' AND c."qualificationPolicyVersion" IS DISTINCT FROM ${v}) AS awaiting_qualification,
        count(*) FILTER (WHERE c."duplicateOfCandidateId" IS NULL AND c."importState" = 'NOT_IMPORTED' AND r."status" NOT IN ('COMPLETED','CANCELLED')) AS in_unfinished_run
      FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmDiscoveryRun" r ON r."id" = c."lastRunId" GROUP BY 1`),
    db.$queryRaw<Record<string, bigint | string | null>[]>(Prisma.sql`
      SELECT p."province" AS province, count(*) AS prospects,
        count(*) FILTER (WHERE p."assignedStaffId" IS NOT NULL) AS assigned,
        count(*) FILTER (WHERE p."assignedStaffId" IS NULL AND p."repairFit" = 'VERIFIED_REPAIR' AND p."doNotContact" = false) AS eligible_unassigned,
        count(*) FILTER (WHERE l."status" IN ('GEOCODED','VERIFIED') AND l."latitude" IS NOT NULL) AS with_coordinates,
        count(*) FILTER (WHERE l."id" IS NULL OR NOT (l."status" IN ('GEOCODED','VERIFIED') AND l."latitude" IS NOT NULL)) AS missing_coordinates
      FROM "garageos"."CrmProspect" p LEFT JOIN "garageos"."CrmProspectLocation" l ON l."prospectId" = p."id"
      WHERE p."status" = 'ACTIVE' AND ${LR} GROUP BY 1`),
    db.crmDiscoveryRun.findMany({
      orderBy: { createdAt: "desc" }, take: 120,
      select: { id: true, status: true, scope: true, sourceRelease: true, receivedRecords: true, rejectedRecords: true, finishedAt: true, createdAt: true, execution: true, workerId: true, attempts: true, nextAttemptAt: true, qualityVerdict: true, errorCode: true, lastFailureCode: true, scheduled: true },
    }),
    listProvinceStates(),
    readAutomation(),
    db.crmLeadAutomationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, finishedAt: true, status: true, errorCode: true } }),
  ]);
  const by = (rows: Record<string, bigint | string | null>[]) => new Map(rows.map((r) => [String(r.province ?? ""), r]));
  const C = by(cand), P = by(pros);
  const provincesOf = (r: { scope: unknown }) => (((r.scope as { provinces?: string[] }).provinces) ?? []) as string[];

  const rows = PROVINCE_CODES.map((province: ProvinceCode) => {
    const c = C.get(province) ?? {}, p = P.get(province) ?? {}, st = states.find((s) => s.province === province)!;
    const mine = runs.filter((r) => provincesOf(r).includes(province));
    const activeRun = mine.find((r) => r.status === "PLANNED" || r.status === "INGESTING") ?? null;
    const finished = mine.find((r) => r.status === "COMPLETED" || r.status === "FAILED") ?? null;
    const lastOk = mine.find((r) => r.status === "COMPLETED") ?? null;
    // Raw records can only be attributed to a province by a run that covered that province alone.
    const lastOkSolo = mine.find((r) => r.status === "COMPLETED" && provincesOf(r).length === 1) ?? null;
    const deferred = n(c.approved_not_imported) + n(c.awaiting_qualification) + n(c.in_unfinished_run);
    const stage = deriveStage({
      active: activeRun ? { execution: activeRun.execution, status: activeRun.status, claimed: !!activeRun.workerId, attempts: activeRun.attempts } : null,
      latest: finished ? { status: finished.status, qualityVerdict: finished.qualityVerdict, errorCode: finished.errorCode } : null,
      stagedTotal: n(c.staged), deferred, failed: n(c.import_failed), unclassified: n(c.unclassified),
    });
    const raw = lastOkSolo ? lastOkSolo.receivedRecords : null;
    const nextRefresh = st.autoRefresh && !st.paused ? new Date((st.lastSuccessAt ?? now).getTime() + st.refreshIntervalDays * 86_400_000) : null;
    return {
      province,
      stage,
      lastSuccessAt: st.lastSuccessAt ?? lastOk?.finishedAt ?? null,
      release: st.lastSuccessRelease ?? lastOk?.sourceRelease ?? null,
      raw: { records: raw, rejected: lastOkSolo?.rejectedRecords ?? null, attributable: lastOkSolo !== null },
      candidates: {
        staged: n(c.staged), verified: n(c.verified), review: n(c.review), excluded: n(c.excluded), unclassified: n(c.unclassified), duplicates: n(c.duplicates), withPoint: n(c.cand_with_point),
      },
      crm: { prospects: n(p.prospects), assigned: n(p.assigned), eligibleUnassigned: n(p.eligible_unassigned), withCoordinates: n(p.with_coordinates), missingCoordinates: n(p.missing_coordinates) },
      errors: { importFailed: n(c.import_failed), lastRunFailure: finished?.status === "FAILED" ? (finished.qualityVerdict ?? finished.errorCode ?? finished.lastFailureCode ?? "RUN_FAILED") : null, lastRunId: finished?.id ?? null },
      deferred: { total: deferred, approvedNotImported: n(c.approved_not_imported), awaitingQualification: n(c.awaiting_qualification), inUnfinishedRun: n(c.in_unfinished_run) },
      activeRun: activeRun ? { id: activeRun.id, status: activeRun.status, execution: activeRun.execution, claimed: !!activeRun.workerId, attempts: activeRun.attempts, nextAttemptAt: activeRun.nextAttemptAt, scheduled: activeRun.scheduled } : null,
      schedule: { autoRefresh: st.autoRefresh, paused: st.paused, refreshIntervalDays: st.refreshIntervalDays, nextRefreshNotBefore: nextRefresh },
      rates: conversion({ raw, staged: n(c.staged), verified: n(c.verified), prospects: n(p.prospects), withCoordinates: n(p.with_coordinates) }),
      actions: actionsFor(stage, { failed: n(c.import_failed), deferred, unclassified: n(c.unclassified), prospectsMissingCoordinates: n(p.missing_coordinates), automationEnabled: automation.enabled }),
    };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    rows,
    totals: {
      staged: sum((r) => r.candidates.staged), verified: sum((r) => r.candidates.verified), review: sum((r) => r.candidates.review), excluded: sum((r) => r.candidates.excluded), duplicates: sum((r) => r.candidates.duplicates),
      prospects: sum((r) => r.crm.prospects), assigned: sum((r) => r.crm.assigned), eligibleUnassigned: sum((r) => r.crm.eligibleUnassigned), withCoordinates: sum((r) => r.crm.withCoordinates), missingCoordinates: sum((r) => r.crm.missingCoordinates),
      deferred: sum((r) => r.deferred.total), importFailed: sum((r) => r.errors.importFailed),
    },
    automation: {
      enabled: automation.enabled, activePolicyVersion: policy?.version ?? null,
      lastExecution: lastTick ? { at: lastTick.startedAt, finishedAt: lastTick.finishedAt, status: lastTick.status, errorCode: lastTick.errorCode } : null,
      nextTick: automation.enabled ? nextAutomationTick(now) : null, nextWorkerCheck: nextWorkerCheck(now),
    },
  };
}
export type NationalReadiness = Awaited<ReturnType<typeof nationalReadiness>>;
