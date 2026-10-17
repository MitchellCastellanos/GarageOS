import "server-only";
import { Prisma } from "@prisma/client";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { PROVINCE_CODES, isProvinceCode, type ProvinceCode } from "@/domain/lead-radar/geo";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { ICP_REGISTRY_VERSION } from "@/domain/lead-radar/icp-registry";
import { planAssignments } from "@/domain/sales-crm/assignment";
import { classifyTerritory, NO_ENGAGEMENT, requiredMode, resolveTerritory } from "@/domain/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { CrmError } from "@/lib/sales-crm/prospects";
import { actionsFor, c3Verdict, conversion, deriveStage, nextAutomationTick, nextWorkerCheck } from "@/domain/lead-radar/national-readiness";
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
      enabled: automation.enabled, importProvinces: automation.importProvinces, activePolicyVersion: policy?.version ?? null,
      lastExecution: lastTick ? { at: lastTick.startedAt, finishedAt: lastTick.finishedAt, status: lastTick.status, errorCode: lastTick.errorCode } : null,
      nextTick: automation.enabled ? nextAutomationTick(now) : null, nextWorkerCheck: nextWorkerCheck(now),
    },
  };
}
export type NationalReadiness = Awaited<ReturnType<typeof nationalReadiness>>;

// ── C3 import preflight (READ-ONLY) ────────────────────────────────────────────────────────────────────────────────────
// Answers, for one province and BEFORE anything is imported: of the VERIFIED_REPAIR candidates, how many can the existing importer take, why the others are blocked, what still needs approval,
// which territory/mode they resolve to, and whether the named Sales Rep could receive them. It evaluates the same gates the import path enforces (c3Verdict) and writes nothing.
const PREFLIGHT_PAGE = 500;
export async function c3Preflight(provinceIn: string) {
  if (!isProvinceCode(provinceIn)) throw new CrmError("INVALID");
  const province = provinceIn;
  const rules = await loadTerritoryRulesWith(db);
  const [pool, tombs, crmExisting, imported] = await Promise.all([
    db.$queryRaw<Record<string, bigint>[]>(Prisma.sql`
      SELECT count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL) AS staged, count(*) FILTER (WHERE "duplicateOfCandidateId" IS NOT NULL) AS duplicates,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'VERIFIED_REPAIR') AS verified,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'HUMAN_REVIEW') AS review,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'EXCLUDED') AS excluded,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'EXCLUDED' AND 'OUTSIDE_ICP_CHAIN_OR_CORPORATE' = ANY("repairFitReasons")) AS icp_excluded,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" IS NULL) AS unclassified,
        count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'VERIFIED_REPAIR' AND "importState" <> 'NOT_IMPORTED') AS verified_already_imported
      FROM "garageos"."CrmDiscoveryCandidate" WHERE "province" = ${province}`),
    db.crmDiscoveryExclusion.count({ where: { province, status: "ACTIVE" } }),
    db.crmProspect.count({ where: { province, status: "ACTIVE" } }),
    db.crmProspect.count({ where: { province, status: "ACTIVE", importBatch: { sourceKey: LEAD_RADAR_SOURCE_KEY } } }),
  ]);
  const blockers: Record<string, number> = {}, approvals: Record<string, number> = { APPROVED: 0, POLICY_AUTO: 0, NEEDS_PERSON: 0, NOT_QUALIFIED: 0 }, kinds = { NEW: 0, LINK: 0 }, territories: Record<string, number> = {}, modes: Record<string, number> = {};
  let evaluated = 0, importable = 0, readyNew = 0, readyLink = 0;
  const now = new Date();
  let cursor: string | null = null;
  for (;;) {
    const rows: { id: string; name: string; city: string | null; province: string | null; postalCode: string | null; address: string | null; phone: string | null; website: string | null; taxonomyPrimary: string | null; classReasons: string[]; licenseOk: boolean; tier: string; reviewState: string; qualificationLane: string | null; matchState: string; sourceLatitude: number | null; repairFit: string | null; repairFitReasons: string[]; icpOverride: boolean }[] = await db.crmDiscoveryCandidate.findMany({
      where: { province, duplicateOfCandidateId: null, repairFit: "VERIFIED_REPAIR", importState: "NOT_IMPORTED", ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: PREFLIGHT_PAGE,
      select: { id: true, name: true, city: true, province: true, postalCode: true, address: true, phone: true, website: true, taxonomyPrimary: true, classReasons: true, licenseOk: true, tier: true, reviewState: true, qualificationLane: true, matchState: true, sourceLatitude: true, repairFit: true, repairFitReasons: true, icpOverride: true },
    });
    if (!rows.length) break;
    for (const r of rows) {
      evaluated++;
      const live = assessRepairFit({ name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons, website: r.website, city: r.city, icpOverride: r.icpOverride, storedReasons: r.repairFitReasons });
      const terr = classifyTerritory(rules, { province: r.province, city: r.city, postalCode: r.postalCode });
      const v = c3Verdict({ liveFit: live.fit, licenseOk: r.licenseOk, tier: r.tier, reviewState: r.reviewState, qualificationLane: r.qualificationLane, matchState: r.matchState, hasPoint: r.sourceLatitude !== null, phone: r.phone, address: r.address, postalCode: r.postalCode, territoryState: terr.state });
      if (!v.importable) { blockers[v.blocker] = (blockers[v.blocker] ?? 0) + 1; continue; }
      importable++; kinds[v.kind]++; approvals[v.approval]++;
      const key = terr.rule?.key ?? "national"; territories[key] = (territories[key] ?? 0) + 1;
      const mode = requiredMode(terr.rule, NO_ENGAGEMENT, now); modes[mode] = (modes[mode] ?? 0) + 1;
      if (v.approval === "APPROVED" || v.approval === "POLICY_AUTO") { if (v.kind === "NEW") readyNew++; else readyLink++; }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PREFLIGHT_PAGE) break;
  }
  // Sellers: every active Sales Rep, whether the automation names them, and whether the existing engine would give them a NATIONAL (remote) prospect from this province.
  const [automation, policy, staff] = await Promise.all([
    readAutomation(), getActivePolicy(),
    db.platformSalesStaff.findMany({ where: { status: "ACTIVE", role: { in: ["SALES_REP", "SALES_MANAGER"] } }, select: { id: true, role: true, displayName: true, salesMode: true, acceptsAutoAssignment: true, maxActiveLeads: true, maxActiveRemoteLeads: true, leadLanguages: true, coverageTerritoryKeys: true, user: { select: { email: true, role: true } } }, orderBy: { displayName: "asc" } }),
  ]);
  const sample = { province, city: null, postalCode: null };
  const rule = resolveTerritory(rules, sample);
  const sellers = staff.map((s) => {
    const probe = planAssignments([{ id: "probe", status: "ACTIVE", doNotContact: false, assignedStaffId: null, territoryState: "NATIONAL", rule, engagement: NO_ENGAGEMENT, repairFit: "VERIFIED_REPAIR", language: "EN" }],
      [{ id: s.id, mode: s.salesMode, coverageKeys: s.coverageTerritoryKeys, active: true, acceptsAutoAssignment: s.acceptsAutoAssignment, maxActiveLeads: s.maxActiveLeads, workload: 0, laneCaps: { FIELD: null, REMOTE: s.maxActiveRemoteLeads }, languages: s.leadLanguages.filter((l) => l === "FR" || l === "EN") }], now)[0];
    return {
      id: s.id, name: s.displayName, email: s.user.email, role: s.role, superAdminLogin: s.user.role === "SUPER_ADMIN", mode: s.salesMode, acceptsAuto: s.acceptsAutoAssignment, maxLeads: s.maxActiveLeads, maxRemote: s.maxActiveRemoteLeads, languages: s.leadLanguages,
      namedByAutomation: automation.assignStaffIds.includes(s.id), wouldReceiveRemoteProspect: s.role === "SALES_REP" && !!probe && probe.staffId === s.id && !(s.user.role === "SUPER_ADMIN"), probeSkip: probe?.skip ?? null,
    };
  });
  return {
    province, generatedAt: now.toISOString(), registryVersion: ICP_REGISTRY_VERSION,
    pool: { staged: n(pool[0]?.staged), duplicates: n(pool[0]?.duplicates), verified: n(pool[0]?.verified), review: n(pool[0]?.review), excluded: n(pool[0]?.excluded), icpExcluded: n(pool[0]?.icp_excluded), unclassified: n(pool[0]?.unclassified), verifiedAlreadyImported: n(pool[0]?.verified_already_imported), activeTombstones: tombs, crmProspectsInProvince: crmExisting, leadRadarProspectsInProvince: imported },
    verifiedEvaluated: evaluated, importable, newProspects: kinds.NEW, linksToExisting: kinds.LINK, approvals, readyNow: { newProspects: readyNew, links: readyLink }, blockers, territories, modes, territoryRule: rule ? { key: rule.key, name: (rule as { name?: string }).name ?? rule.key } : null,
    automation: { policyVersion: policy?.version ?? null, qualifyEnabled: automation.qualifyEnabled, importEnabled: automation.importEnabled, assignEnabled: automation.assignEnabled, importProvinces: automation.importProvinces, importChunkSize: automation.importChunkSize, enabled: automation.enabled },
    sellers,
    isolation: { writes: "platform CRM tables only (CrmProspect, CrmContact, CrmImportBatch, CrmDiscoveryCandidate); no shop/tenant table is read or written by the importer", leadRadarRowsHaveNoShopColumn: true },
  };
}
