import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import {
  HALT_CODES, ROLLOUT_ASSIGN_PROVINCES, ROLLOUT_EXISTING, ROLLOUT_NEVER, ROLLOUT_PROVINCES, ROLLOUT_SELLER_EMAIL, planRollout, safetyViolation,
  type HaltCode, type ProvinceFacts, type SafetyFacts,
} from "@/domain/lead-radar/rollout";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MAX_IMPORT_ATTEMPTS, readAutomation, type AutomationSettings } from "@/lib/lead-radar/automation";
import { isLive, readSettings } from "@/lib/lead-radar/settings";
import { getActivePolicy } from "@/lib/lead-radar/policy";
import { MAX_FIRST_PASS_ERRORS } from "@/lib/lead-radar/casl-evidence";
import { nationalReadiness } from "@/lib/lead-radar/national";
import { deferredNoEmailByProvince, prospectUsableEmailSql } from "@/lib/lead-radar/remote-email";
import { queueWorkerRun } from "@/lib/lead-radar/worker";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

// One-time national rollout orchestration. It reuses every existing stage: the GitHub worker (province queue), the run quality gate, ICP classification at staging,
// qualification, the importer (province scope) and the assignment engine (scoped, REMOTE only, one seller). This module only decides WHEN a province is queued or opened
// for import, checks safety on every tick, and halts — never silently skips — when a check fails. It sends nothing and contacts no one.
const ID = "default";
const GROUPS = ["REPAIR", "BODY_GLASS"];

/** Seller allowed for the rollout, resolved by email and validated (active Sales Rep, accepts auto-assignment, never the Super Admin login). */
async function resolveSeller() {
  const s = await db.platformSalesStaff.findFirst({
    where: { user: { email: { equals: ROLLOUT_SELLER_EMAIL, mode: "insensitive" } } },
    select: { id: true, status: true, role: true, acceptsAutoAssignment: true, user: { select: { role: true } } },
  });
  return s ? { id: s.id, active: s.status === "ACTIVE", role: s.role as string, superAdminLogin: s.user.role === "SUPER_ADMIN", acceptsAutoAssignment: s.acceptsAutoAssignment } : null;
}

/** One-time activation (Super Admin). Sets the automation stages the rollout needs — and ONLY those — and keeps outreach, release and pilot OFF. */
export async function activateNationalRollout(actor: PlatformSalesActor) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  if (!isLive(await readSettings())) throw new CrmError("LEAD_RADAR_DISABLED");
  if (!(await getActivePolicy())) throw new CrmError("NO_ACTIVE_POLICY");
  const a = await readAutomation();
  if (a.rolloutEnabled) throw new CrmError("ROLLOUT_ALREADY_ACTIVE");
  if (a.rolloutFinishedAt) throw new CrmError("ROLLOUT_ALREADY_DONE");
  if (a.pilotEnabled) throw new CrmError("ROLLOUT_PILOT_ON");
  { const c = await getCommsSettings(); if (c.sendingEnabled && c.automatedSendingEnabled) throw new CrmError("ROLLOUT_SENDING_ON"); }
  if (!a.importProvinces.length) throw new CrmError("ROLLOUT_IMPORT_SCOPE_EMPTY");
  const seller = await resolveSeller();
  if (!seller || !seller.active || seller.role !== "SALES_REP" || seller.superAdminLogin || !seller.acceptsAutoAssignment) throw new CrmError("ROLLOUT_SELLER_INVALID");
  await db.crmLeadAutomation.update({
    where: { id: ID },
    data: {
      enabled: true, pausedAt: null, pausedReason: null, qualifyEnabled: true, importEnabled: true, assignEnabled: true, evidenceEnabled: true, eligibilityEnabled: false, releaseUnavailable: false,
      assignStaffIds: [seller.id], rolloutEnabled: true, rolloutPaused: false, rolloutProvinces: [...ROLLOUT_PROVINCES], rolloutStaffId: seller.id, rolloutStartedAt: new Date(),
      rolloutFinishedAt: null, rolloutHaltProvince: null, rolloutHaltCode: null, rolloutHaltAt: null, updatedByUserId: actor.userId,
    },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_ACTIVATED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { provinces: [...ROLLOUT_PROVINCES], sellerId: seller.id, importProvinces: a.importProvinces } });
  return readAutomation();
}

/** Pause: stops the whole automation at once (master OFF) and the rollout's own steps. Safe at any time; resumable. */
export async function pauseNationalRollout(actor: PlatformSalesActor) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const a = await readAutomation();
  if (!a.rolloutEnabled) throw new CrmError("ROLLOUT_NOT_ACTIVE");
  await db.crmLeadAutomation.update({ where: { id: ID }, data: { rolloutPaused: true, enabled: false, pausedAt: new Date(), pausedReason: "ROLLOUT_PAUSED", updatedByUserId: actor.userId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_PAUSED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { halted: a.rolloutHaltCode } });
  return readAutomation();
}

/** Resume: clears a halt or pause and turns the automation back on. Every safety check re-runs on the next tick, so a condition that still holds simply halts again. */
export async function resumeNationalRollout(actor: PlatformSalesActor) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const a = await readAutomation();
  if (!a.rolloutEnabled) throw new CrmError("ROLLOUT_NOT_ACTIVE");
  if (!(await getActivePolicy())) throw new CrmError("NO_ACTIVE_POLICY");
  await db.crmLeadAutomation.update({ where: { id: ID }, data: { rolloutPaused: false, rolloutHaltProvince: null, rolloutHaltCode: null, rolloutHaltAt: null, enabled: true, pausedAt: null, pausedReason: null, updatedByUserId: actor.userId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_RESUMED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { clearedHalt: a.rolloutHaltCode, province: a.rolloutHaltProvince } });
  return readAutomation();
}

async function halt(actor: PlatformSalesActor, province: string, code: HaltCode, detail?: string) {
  await db.crmLeadAutomation.update({ where: { id: ID }, data: { rolloutHaltProvince: province, rolloutHaltCode: code, rolloutHaltAt: new Date(), enabled: false, pausedAt: new Date(), pausedReason: `ROLLOUT_HALT:${province}:${code}` } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_HALTED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { province, code, detail: detail ?? null } });
}

async function safetyFacts(a: AutomationSettings): Promise<SafetyFacts> {
  const since = a.rolloutStartedAt ?? new Date();
  // Only the automation's own assignments are judged (a manual assignment by a person is that person's decision and is never a rollout violation).
  const auto = { type: "ASSIGNMENT" as const, createdAt: { gte: since }, metadata: { path: ["via"], equals: "lead-radar-automation" } };
  const [seller, comms, policy, outOfScope, otherSeller, fieldMode] = await Promise.all([
    resolveSeller(), getCommsSettings(), getActivePolicy(),
    db.crmActivity.count({ where: { ...auto, prospect: { OR: [{ province: null }, { province: { notIn: [...ROLLOUT_ASSIGN_PROVINCES] } }] } } }),
    a.rolloutStaffId ? db.crmActivity.count({ where: { AND: [auto, { metadata: { path: ["to"], not: a.rolloutStaffId } }] } }) : Promise.resolve(0),
    db.crmActivity.count({ where: { AND: [auto, { metadata: { path: ["mode"], equals: "FIELD" } }] } }),
  ]);
  return {
    settings: { eligibilityEnabled: a.eligibilityEnabled, releaseUnavailable: a.releaseUnavailable, pilotEnabled: a.pilotEnabled, sendingEnabled: comms.sendingEnabled && comms.automatedSendingEnabled, assignStaffIds: a.assignStaffIds, rolloutStaffId: a.rolloutStaffId, importProvincesIncludeAll: a.importProvinces.length === 0 },
    seller: seller && a.rolloutStaffId === seller.id ? seller : null, hasActivePolicy: !!policy, violations: { outOfScope, otherSeller, fieldMode },
  };
}

async function provinceFacts(a: AutomationSettings): Promise<ProvinceFacts[]> {
  const scope = [...ROLLOUT_EXISTING, ...a.rolloutProvinces];
  const [national, runs, queued, stuck, noEmail] = await Promise.all([
    nationalReadiness(),
    db.crmDiscoveryRun.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { status: true, scope: true, qualityVerdict: true, errorCode: true } }),
    // What the importer will actually still take (its own queue filter): approved, not imported, importable, not given up on.
    db.crmDiscoveryCandidate.groupBy({ by: ["province"], where: { province: { in: scope }, reviewState: "APPROVED", importState: "NOT_IMPORTED", licenseOk: true, tier: { not: "EXCLUDED" }, duplicateOfCandidateId: null, importAttempts: { lt: MAX_IMPORT_ATTEMPTS } }, _count: { _all: true } }),
    // Approved candidates the importer gave up on after repeated attempts are import errors, not "pending".
    db.crmDiscoveryCandidate.groupBy({ by: ["province"], where: { province: { in: scope }, reviewState: "APPROVED", importState: "NOT_IMPORTED", duplicateOfCandidateId: null, importAttempts: { gte: MAX_IMPORT_ATTEMPTS } }, _count: { _all: true } }),
    // Email-only REMOTE: queued candidates the importer intentionally skips (no usable email, REMOTE territory). They stay in Lead Radar but are not pending work, or the rollout could never finish.
    deferredNoEmailByProvince({ provinces: scope, strict: true, maxAttempts: MAX_IMPORT_ATTEMPTS }),
  ]);
  const count = (rows: { province: string | null; _count: { _all: number } }[], p: string) => rows.find((r) => r.province === p)?._count._all ?? 0;
  return scope.map((province) => {
    const row = national.rows.find((r) => r.province === province)!;
    const mine = runs.filter((r) => (((r.scope as { provinces?: string[] }).provinces) ?? []).includes(province));
    const latest = mine.find((r) => r.status === "COMPLETED" || r.status === "FAILED" || r.status === "CANCELLED") ?? null;
    return {
      province, existing: ROLLOUT_EXISTING.includes(province), activeRun: mine.some((r) => r.status === "PLANNED" || r.status === "INGESTING"),
      latestRun: latest ? { status: latest.status as "COMPLETED" | "FAILED" | "CANCELLED", verdict: latest.qualityVerdict, errorCode: latest.errorCode } : null,
      staged: row.candidates.staged, duplicates: row.candidates.duplicates, unclassified: row.candidates.unclassified, withPoint: row.candidates.withPoint, verified: row.candidates.verified, review: row.candidates.review, excluded: row.candidates.excluded,
      importFailed: row.errors.importFailed + count(stuck, province), approvedNotImported: Math.max(0, count(queued, province) - (noEmail.get(province) ?? 0)), awaitingQualification: row.deferred.awaitingQualification,
      inImportScope: a.importProvinces.includes(province),
    };
  });
}

/** Assignable REMOTE Lead Radar prospects (rollout provinces + ON + AB) still without an owner and with a usable email. Human-owned, FIELD-lane (local territory), Québec and non-Lead-Radar prospects never count. */
async function pendingAssignment() {
  // Only prospects the assignment stage can actually take: a REMOTE prospect with no usable email is deferred by policy (email-only), so it must not hold the rollout open.
  const [row] = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM "garageos"."CrmProspect" p JOIN "garageos"."CrmImportBatch" b ON b."id" = p."importBatchId"
    WHERE b."sourceKey" = ${LEAD_RADAR_SOURCE_KEY} AND p."status" = 'ACTIVE' AND p."assignedStaffId" IS NULL AND p."doNotContact" = false AND p."repairFit" = 'VERIFIED_REPAIR'
      AND p."territoryState" = 'NATIONAL' AND p."province" IN (${Prisma.join([...ROLLOUT_ASSIGN_PROVINCES])}) AND ${prospectUsableEmailSql}`);
  return Number(row?.n ?? 0);
}

/**
 * Addresses of qualified REMOTE shops (active, VERIFIED_REPAIR, NATIONAL territory, not DNC) that have never had a CASL evidence decision. This is the national first pass: it ends when
 * every such address has an outcome (SUPPORTED / INSUFFICIENT / BLOCKED), including a documented INSUFFICIENT for a technical failure that is now on its bounded retry schedule.
 * Later revalidations are maintenance and never keep the one-time rollout open.
 */
export async function pendingEvidenceFirstPass() {
  const [row] = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT count(*) AS n FROM "garageos"."CrmDiscoveredContact" d JOIN "garageos"."CrmProspect" p ON p."id" = d."prospectId"
    WHERE d."syntaxValid" = true AND d."status" IN ('PENDING','ACCEPTED') AND d."assessedAt" IS NULL AND d."assessAttempts" < ${MAX_FIRST_PASS_ERRORS}
      AND p."status" = 'ACTIVE' AND p."doNotContact" = false AND p."mergedIntoId" IS NULL AND p."repairFit" = 'VERIFIED_REPAIR' AND p."territoryState" = 'NATIONAL'`);
  return Number(row?.n ?? 0);
}

export interface RolloutTally { halted?: { province: string; code: string }; queued?: string; openedImport: string[]; finished?: boolean; waiting?: string }

/** Tick stage: safety first, then at most one extraction queued, import scope opened only for provinces whose extraction passed every gate. Idempotent and resumable (state is derived from the tables). */
export async function rolloutStage(actor: PlatformSalesActor, a: AutomationSettings): Promise<RolloutTally> {
  const t: RolloutTally = { openedImport: [] };
  if (!a.rolloutEnabled || a.rolloutPaused) return { ...t, waiting: "ROLLOUT_OFF" };
  const unsafe = safetyViolation(await safetyFacts(a));
  if (unsafe) { await halt(actor, "*", unsafe.code, unsafe.detail); t.halted = { province: "*", code: unsafe.code }; return t; }
  const plan = planRollout(await provinceFacts(a), await pendingAssignment(), await pendingEvidenceFirstPass());
  if (plan.halt) { await halt(actor, plan.halt.province, plan.halt.code, plan.halt.detail); t.halted = { province: plan.halt.province, code: plan.halt.code }; return t; }
  if (plan.openImport.length) {
    const next = [...new Set([...a.importProvinces, ...plan.openImport])].sort();
    await db.crmLeadAutomation.update({ where: { id: ID }, data: { importProvinces: next } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_PROGRESS", entityType: "CrmLeadAutomation", entityId: ID, metadata: { openedImport: plan.openImport } });
    t.openedImport = plan.openImport;
  }
  if (plan.queue) {
    if (ROLLOUT_NEVER.includes(plan.queue) || !a.rolloutProvinces.includes(plan.queue)) { await halt(actor, plan.queue, "SETTINGS_UNSAFE", "NEVER_EXTRACT"); t.halted = { province: plan.queue, code: "SETTINGS_UNSAFE" }; return t; }
    try {
      await queueWorkerRun(actor, { scope: { provinces: [plan.queue], groups: GROUPS }, release: "latest" });
      t.queued = plan.queue;
    } catch (e) {
      const detail = e instanceof CrmError ? e.code : "QUEUE_FAILED";
      await halt(actor, plan.queue, "EXTRACTION_FAILED", detail); t.halted = { province: plan.queue, code: "EXTRACTION_FAILED" }; return t;
    }
  }
  if (plan.waitingForAssignment) t.waiting = "ASSIGNMENT";
  else if (plan.waitingForEvidence) t.waiting = "EVIDENCE";
  if (plan.finished) {
    // The one-time national extraction, qualification, import and assignment stop here. The master switch stays ON on purpose so the CASL evidence stage keeps revalidating (30-day freshness,
    // expiry, revocation) and any later incremental refresh keeps working; every outreach switch (eligibility, release, pilot) and every send switch is untouched and stays OFF.
    await db.crmLeadAutomation.update({ where: { id: ID }, data: { rolloutEnabled: false, rolloutFinishedAt: new Date(), qualifyEnabled: false, importEnabled: false, assignEnabled: false, evidenceEnabled: true, pausedAt: null, pausedReason: null } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ROLLOUT_FINISHED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { provinces: a.rolloutProvinces } });
    t.finished = true;
  }
  return t;
}

/** Read-only status for the National page: per-province progress (from the existing readiness rows), the halt, and the final totals. */
export async function rolloutStatus() {
  const [a, national, pending] = await Promise.all([readAutomation(), nationalReadiness(), pendingAssignment()]);
  const scope = a.rolloutProvinces.length ? a.rolloutProvinces : [...ROLLOUT_PROVINCES];
  const rows = [...ROLLOUT_EXISTING, ...scope].map((p) => national.rows.find((r) => r.province === p)!).filter(Boolean);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((x, r) => x + f(r), 0);
  return {
    state: a.rolloutFinishedAt ? ("FINISHED" as const) : a.rolloutHaltCode ? ("HALTED" as const) : a.rolloutEnabled && a.rolloutPaused ? ("PAUSED" as const) : a.rolloutEnabled ? ("RUNNING" as const) : ("NOT_STARTED" as const),
    pendingAssignment: pending, startedAt: a.rolloutStartedAt, finishedAt: a.rolloutFinishedAt, halt: a.rolloutHaltCode ? { province: a.rolloutHaltProvince, code: a.rolloutHaltCode, at: a.rolloutHaltAt } : null,
    provinces: rows.map((r) => ({ province: r.province, stage: r.stage, staged: r.candidates.staged, verified: r.candidates.verified, prospects: r.crm.prospects, assigned: r.crm.assigned, failed: r.errors.importFailed, deferred: r.deferred.total, inImportScope: a.importProvinces.includes(r.province), activeRun: !!r.activeRun, lastRunFailure: r.errors.lastRunFailure })),
    totals: { staged: sum((r) => r.candidates.staged), verified: sum((r) => r.candidates.verified), review: sum((r) => r.candidates.review), excluded: sum((r) => r.candidates.excluded), prospects: sum((r) => r.crm.prospects), assigned: sum((r) => r.crm.assigned), failed: sum((r) => r.errors.importFailed) },
    haltCodes: HALT_CODES,
  };
}
export type RolloutStatus = Awaited<ReturnType<typeof rolloutStatus>>;
