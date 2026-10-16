import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { db } from "@/lib/db";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { enrollAutomated } from "@/lib/sales-comms/sequences";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { applyAssignmentProposals, buildAssignmentProposals, loadSellers } from "@/lib/sales-crm/assignment";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { loadEngagements } from "@/lib/sales-crm/territory";
import { assessProspects, refreshEligibility, saveAssessments } from "@/lib/lead-radar/eligibility";
import { importApprovedCandidates } from "@/lib/lead-radar/import-service";
import { autoGeocodeStep } from "@/lib/sales-crm/geocoding-admin-service";
import { getActivePolicy } from "@/lib/lead-radar/policy";
import { qualifyPending } from "@/lib/lead-radar/qualify";
import { backfillCandidateFit } from "@/lib/lead-radar/candidate-fit";
import { isLive, readSettings } from "@/lib/lead-radar/settings";

// Lead Radar automation by approved policy. ONE tick = bounded, idempotent, resumable work over durable queues (the tables themselves):
//   qualify → import (shared CRM transaction) → assign (existing engine) → release (policy-governed) → assess outreach eligibility → pilot enrollment.
// Nothing here sends an email. Every stage is independently switchable and the whole tick is gated by TWO switches (live discovery AND automation) plus a lease.

const ID = "default";
export const TICK_BUDGET_MS = 45_000;
export const LEASE_SLACK_MS = 30_000;
export const MAX_IMPORT_ATTEMPTS = 3;
const SHARE = { classify: 0.05, qualify: 0.3, import: 0.3, assign: 0.15, release: 0.05, locate: 0.1, eligibility: 0.1, pilot: 0.1 } as const;

export async function readAutomation(client: Pick<typeof db, "crmLeadAutomation"> = db) {
  return (await client.crmLeadAutomation.findUnique({ where: { id: ID } })) ?? (await client.crmLeadAutomation.upsert({ where: { id: ID }, create: { id: ID }, update: {} }));
}
export type AutomationSettings = Awaited<ReturnType<typeof readAutomation>>;

export interface AutomationInput {
  qualifyEnabled: boolean; importEnabled: boolean; assignEnabled: boolean; eligibilityEnabled: boolean; releaseUnavailable: boolean;
  assignStaffIds: string[]; importChunkSize: number; pilotSequenceId: string | null; pilotDailyCap: number; pilotTotalCap: number;
}

/** Super Admin only (the caller enforces it). Stage switches, the explicit seller allow-list and pilot caps; the master switch and the pilot switch have their own audited actions. */
export async function saveAutomation(actor: PlatformSalesActor, input: AutomationInput) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  for (const k of ["qualifyEnabled", "importEnabled", "assignEnabled", "eligibilityEnabled", "releaseUnavailable"] as const) if (typeof input[k] !== "boolean") throw new CrmError("INVALID");
  const ints = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!ints(input.importChunkSize, 1, 200) || !ints(input.pilotDailyCap, 0, 100) || !ints(input.pilotTotalCap, 0, 1000) || input.pilotDailyCap > input.pilotTotalCap) throw new CrmError("INVALID_LIMITS");
  const ids = [...new Set(input.assignStaffIds)];
  if (ids.length) {
    // Only ACTIVE sales REPs can ever be on the list: the Super Admin account and managers are never auto-assignment targets.
    const ok = await db.platformSalesStaff.count({ where: { id: { in: ids }, status: "ACTIVE", role: "SALES_REP", user: { role: { not: "SUPER_ADMIN" } } } });
    if (ok !== ids.length) throw new CrmError("INVALID_SELLER");
  }
  if (input.pilotSequenceId) {
    const seq = await db.crmSequence.findUnique({ where: { id: input.pilotSequenceId }, select: { status: true } });
    if (!seq) throw new CrmError("NOT_FOUND");
  }
  const before = await readAutomation();
  await db.crmLeadAutomation.update({
    where: { id: ID },
    data: {
      qualifyEnabled: input.qualifyEnabled, importEnabled: input.importEnabled, assignEnabled: input.assignEnabled, eligibilityEnabled: input.eligibilityEnabled, releaseUnavailable: input.releaseUnavailable,
      assignStaffIds: ids, importChunkSize: input.importChunkSize, pilotSequenceId: input.pilotSequenceId, pilotDailyCap: input.pilotDailyCap, pilotTotalCap: input.pilotTotalCap, updatedByUserId: actor.userId,
    },
  });
  await writeCrmAudit({
    actorUserId: actor.userId, action: "LEAD_RADAR_AUTOMATION_CHANGED", entityType: "CrmLeadAutomation", entityId: ID,
    before: { assignStaffIds: before.assignStaffIds, importChunkSize: before.importChunkSize, pilotSequenceId: before.pilotSequenceId, pilotDailyCap: before.pilotDailyCap, pilotTotalCap: before.pilotTotalCap },
    after: { assignStaffIds: ids, importChunkSize: input.importChunkSize, pilotSequenceId: input.pilotSequenceId, pilotDailyCap: input.pilotDailyCap, pilotTotalCap: input.pilotTotalCap },
    metadata: { stages: { qualify: input.qualifyEnabled, import: input.importEnabled, assign: input.assignEnabled, eligibility: input.eligibilityEnabled, releaseUnavailable: input.releaseUnavailable } },
  });
  return readAutomation();
}

/** Master switch. Pausing is immediate and safe at any time: in-flight work is bounded by the tick budget and every stage re-checks state. */
export async function setAutomationEnabled(actor: PlatformSalesActor, enabled: boolean, reason?: string | null) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const a = await readAutomation();
  if (enabled && !(await getActivePolicy())) throw new CrmError("NO_ACTIVE_POLICY");
  if (enabled && !a.assignStaffIds.length && a.assignEnabled) { /* allowed: assignment simply does nothing until a seller is named */ }
  const clean = (reason ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 200) || null;
  await db.crmLeadAutomation.update({ where: { id: ID }, data: { enabled, pausedAt: enabled ? null : new Date(), pausedReason: enabled ? null : clean, updatedByUserId: actor.userId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: enabled ? "LEAD_RADAR_AUTOMATION_CHANGED" : "LEAD_RADAR_AUTOMATION_PAUSED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { enabled, reason: clean } });
  return readAutomation();
}

/** Pilot switch: explicit, separately audited. Requires a sequence and bounded caps; it never enables company-wide sending (that stays in CrmCommsSettings). */
export async function setPilotEnabled(actor: PlatformSalesActor, enabled: boolean) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const a = await readAutomation();
  if (enabled) {
    if (!a.pilotSequenceId) throw new CrmError("PILOT_NEEDS_SEQUENCE");
    const seq = await db.crmSequence.findUnique({ where: { id: a.pilotSequenceId }, select: { status: true } });
    if (!seq || seq.status !== "ACTIVE") throw new CrmError("SEQUENCE_NOT_ACTIVE");
    if (!a.assignStaffIds.length) throw new CrmError("PILOT_NEEDS_SELLER");
  }
  await db.crmLeadAutomation.update({ where: { id: ID }, data: { pilotEnabled: enabled, pilotActivatedByUserId: enabled ? actor.userId : a.pilotActivatedByUserId, pilotActivatedAt: enabled ? new Date() : a.pilotActivatedAt, updatedByUserId: actor.userId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_PILOT_CHANGED", entityType: "CrmLeadAutomation", entityId: ID, metadata: { enabled, sequenceId: a.pilotSequenceId, dailyCap: a.pilotDailyCap, totalCap: a.pilotTotalCap } });
  return readAutomation();
}

// ── Import stage ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ImportTally { chunks: number; claimed: number; created: number; linked: number; sentToReview: number; skipped: number; failed: number; isolated: number }
const emptyImport = (): ImportTally => ({ chunks: 0, claimed: 0, created: 0, linked: 0, sentToReview: 0, skipped: 0, failed: 0, isolated: 0 });

/**
 * Hands policy-approved (or human-approved) candidates to the CRM through the shared import transaction, ≤ `chunkSize` per short transaction.
 * A chunk that throws is rolled back entirely, then retried one candidate at a time so ONE bad record can never block the queue: it is marked FAILED
 * (IMPORT_EXCEPTION) and the rest continue. Candidates that stay untouched after a claim are attempt-counted and dropped from the queue after MAX_IMPORT_ATTEMPTS.
 */
export async function importStage(actor: PlatformSalesActor, policyVersion: number, chunkSize: number, deadline: number): Promise<ImportTally> {
  const t = emptyImport();
  const add = (r: Awaited<ReturnType<typeof importApprovedCandidates>>) => {
    t.claimed += r.claimed; t.created += r.created; t.linked += r.linked; t.sentToReview += r.sentToReview; t.skipped += r.skipped; t.failed += r.failed;
  };
  const queue = (size: number) => db.crmDiscoveryCandidate.findMany({
    where: {
      reviewState: "APPROVED", importState: "NOT_IMPORTED", licenseOk: true, tier: { not: "EXCLUDED" }, duplicateOfCandidateId: null, importAttempts: { lt: MAX_IMPORT_ATTEMPTS },
      OR: [{ approvedByPolicyVersion: null }, { approvedByPolicyVersion: policyVersion }],
    },
    orderBy: { id: "asc" }, take: size, select: { id: true },
  });
  let size = chunkSize;
  while (Date.now() < deadline - 3_000) {
    const ids = (await queue(size)).map((r) => r.id);
    if (!ids.length) break;
    try {
      const r = await importApprovedCandidates(actor, { ids, limit: ids.length, automation: { policyVersion, timeoutMs: 30_000 } });
      add(r); t.chunks++;
      if (r.claimed === 0) break; // everything is locked by a concurrent worker: let it finish
      // Anything claimed but left untouched (a plan outcome without a candidate state) is counted so it cannot spin forever.
      await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: ids }, importState: "NOT_IMPORTED" }, data: { importAttempts: { increment: 1 }, importLastAttemptAt: new Date() } });
    } catch {
      size = Math.max(1, Math.floor(size / 2));
      for (const id of ids) {
        if (Date.now() >= deadline - 1_000) break;
        try { add(await importApprovedCandidates(actor, { ids: [id], limit: 1, automation: { policyVersion, timeoutMs: 20_000 } })); t.chunks++; }
        catch {
          t.isolated++; t.failed++;
          await db.crmDiscoveryCandidate.updateMany({ where: { id, importState: "NOT_IMPORTED" }, data: { importState: "FAILED", importErrorCode: "IMPORT_EXCEPTION", importAttempts: { increment: 1 }, importLastAttemptAt: new Date() } });
        }
      }
    }
  }
  return t;
}

// ── Assignment stage ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface AssignTally { considered: number; assigned: number; skipped: number; field: number; remote: number; skips: Record<string, number>; perSeller: Record<string, number>; pages: number; note?: string }
const emptyAssign = (): AssignTally => ({ considered: 0, assigned: 0, skipped: 0, field: 0, remote: 0, skips: {}, perSeller: {}, pages: 0 });
const ASSIGN_PAGE = 200;
const ASSIGN_APPLY_CHUNK = 50;

/**
 * Distributes UNASSIGNED Lead Radar prospects through the EXISTING engine (planAssignments / applyAssignmentProposals), only to the sellers a Super Admin
 * named, honouring mode, coverage, language, pause switch and total + per-lane caps. Ownership is taken by compare-and-set, so a retry or a concurrent worker
 * can never assign twice or take an owned prospect.
 */
export async function assignStage(actor: PlatformSalesActor, staffIds: readonly string[], deadline: number): Promise<AssignTally> {
  const t = emptyAssign();
  if (!staffIds.length) { t.note = "NO_ELIGIBLE_SELLERS_CONFIGURED"; return t; }
  const sellers = await loadSellers(actor, db, staffIds);
  const laneOpen = (s: (typeof sellers)[number], m: "FIELD" | "REMOTE") => (s.laneCaps?.[m] ?? null) === null || (s.laneWorkload?.[m] ?? 0) < s.laneCaps![m]!;
  const room = sellers.some((s) => s.acceptsAutoAssignment && (s.maxActiveLeads === null || s.workload < s.maxActiveLeads) && (laneOpen(s, "FIELD") || laneOpen(s, "REMOTE")));
  if (!sellers.length || !room) { t.note = sellers.length ? "NO_CAPACITY" : "NO_ACTIVE_SELLER"; return t; }
  let after: { createdAt: Date; id: string } | null = null;
  let emptyPages = 0;
  while (Date.now() < deadline - 2_000) {
    const { proposals, considered, next } = await buildAssignmentProposals(actor, { onlyStaffIds: staffIds, leadRadarOnly: true, limit: ASSIGN_PAGE, after });
    t.considered += considered; t.pages++;
    for (const p of proposals) if (p.skip) t.skips[p.skip] = (t.skips[p.skip] ?? 0) + 1;
    const todo = proposals.filter((p) => p.staffId);
    let appliedThisPage = 0;
    for (let i = 0; i < todo.length; i += ASSIGN_APPLY_CHUNK) {
      const r = await db.$transaction((tx) => applyAssignmentProposals(tx, actor, todo.slice(i, i + ASSIGN_APPLY_CHUNK), { via: "lead-radar-automation" }), { timeout: 30_000, maxWait: 10_000 });
      t.assigned += r.applied; t.skipped += r.skipped; appliedThisPage += r.applied;
      for (const [id, n] of Object.entries(r.perSeller)) t.perSeller[id] = (t.perSeller[id] ?? 0) + n;
    }
    for (const p of todo) { if (p.requiredMode === "FIELD") t.field++; else t.remote++; }
    emptyPages = appliedThisPage ? 0 : emptyPages + 1;
    if (!next || emptyPages >= 5) break; // 5 consecutive pages with nothing assignable: the rest is capacity/territory bound, stop walking the pool
    after = next;
  }
  if (t.assigned > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_AUTO_ASSIGNED", entityType: "CrmProspect", metadata: { assigned: t.assigned, field: t.field, remote: t.remote, perSeller: t.perSeller } });
  return t;
}

// ── Policy-governed release of untouched work from an unavailable seller ─────────────────────────────────────────────
export interface ReleaseTally { released: number; keptEngaged: number }

/**
 * When enabled, prospects that were AUTO-assigned to a seller who is now deactivated or has switched off lead intake are returned to the unassigned pool — but ONLY
 * if nothing happened on them (no touch of any kind, no email thread, no enrollment, no opportunity beyond NEW). Anything with history stays with its owner:
 * moving an active conversation is always an explicit human decision. Compare-and-set on the owner, audited per prospect.
 */
export async function releaseUnavailable(actor: PlatformSalesActor, deadline: number): Promise<ReleaseTally> {
  const t: ReleaseTally = { released: 0, keptEngaged: 0 };
  const rows = await db.crmProspect.findMany({
    where: { autoAssignedAt: { not: null }, status: "ACTIVE", assignedStaffId: { not: null }, importBatch: { sourceKey: LEAD_RADAR_SOURCE_KEY }, assignedStaff: { OR: [{ status: { not: "ACTIVE" } }, { acceptsAutoAssignment: false }] } },
    select: { id: true, assignedStaffId: true }, take: 300, orderBy: { id: "asc" },
  });
  if (!rows.length) return t;
  const ids = rows.map((r) => r.id);
  const [eng, threads, enrollments, opps] = await Promise.all([
    loadEngagements(ids),
    db.crmEmailThread.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true } }),
    db.crmSequenceEnrollment.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true } }),
    db.crmOpportunity.findMany({ where: { prospectId: { in: ids }, stage: { not: "NEW" } }, select: { prospectId: true } }),
  ]);
  const busy = new Set([...threads, ...enrollments, ...opps].map((x) => x.prospectId));
  for (const r of rows) {
    if (Date.now() > deadline) break;
    const e = eng.get(r.id)!;
    if (e.touched || e.activeOpportunity || busy.has(r.id)) { t.keptEngaged++; continue; }
    await db.$transaction(async (tx) => {
      const c = await tx.crmProspect.updateMany({ where: { id: r.id, assignedStaffId: r.assignedStaffId, autoAssignedAt: { not: null } }, data: { assignedStaffId: null, assignmentMode: null, autoAssignedAt: null } });
      if (c.count !== 1) return;
      await tx.crmOpportunity.updateMany({ where: { prospectId: r.id, stage: "NEW", assignedStaffId: r.assignedStaffId }, data: { assignedStaffId: null } });
      await tx.crmActivity.create({ data: { prospectId: r.id, type: "ASSIGNMENT", authorUserId: actor.userId, metadata: { from: r.assignedStaffId, to: null, via: "lead-radar-release-unavailable" } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_ASSIGNMENT_RELEASED", entityType: "CrmProspect", entityId: r.id, prospectId: r.id, before: { assignedStaffId: r.assignedStaffId }, after: { assignedStaffId: null }, metadata: { reason: "SELLER_UNAVAILABLE_UNTOUCHED" } }, tx);
      t.released++;
    });
  }
  return t;
}

// ── Outreach pilot ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface PilotTally { considered: number; enrolled: number; blocked: Record<string, number>; note?: string; remainingToday: number; remainingTotal: number }

/**
 * Controlled pilot: enrolls ELIGIBLE prospects into the ONE configured sequence, under explicit daily and total caps, from the assigned seller's own sender.
 * Every candidate is re-assessed from live data immediately before enrolling and the enrollment itself runs the full send policy; the sequence worker re-checks
 * before every step. Enrolling creates no email by itself — messages exist only when the existing sequence worker queues them (sending must be enabled there).
 */
export async function pilotStage(actor: PlatformSalesActor, a: AutomationSettings, deadline: number): Promise<PilotTally> {
  const t: PilotTally = { considered: 0, enrolled: 0, blocked: {}, remainingToday: 0, remainingTotal: 0 };
  if (!a.pilotEnabled || !a.pilotSequenceId || !a.assignStaffIds.length) { t.note = "PILOT_OFF"; return t; }
  const comms = await getCommsSettings();
  if (!comms.sendingEnabled) { t.note = "SENDING_DISABLED"; return t; }
  const seq = await db.crmSequence.findUnique({ where: { id: a.pilotSequenceId }, select: { status: true } });
  if (!seq || seq.status !== "ACTIVE") { t.note = "SEQUENCE_NOT_ACTIVE"; return t; }
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [total, today] = await Promise.all([
    db.crmSequenceEnrollment.count({ where: { autoEnrolledAt: { not: null } } }),
    db.crmSequenceEnrollment.count({ where: { autoEnrolledAt: { gte: dayAgo } } }),
  ]);
  t.remainingTotal = Math.max(0, a.pilotTotalCap - total); t.remainingToday = Math.max(0, a.pilotDailyCap - today);
  let budget = Math.min(t.remainingTotal, t.remainingToday);
  if (budget <= 0) { t.note = "CAP_REACHED"; return t; }
  const cands = await db.crmOutreachEligibility.findMany({
    where: { decision: "ELIGIBLE", staffId: { in: a.assignStaffIds }, contactId: { not: null }, prospect: { status: "ACTIVE", enrollments: { none: {} } } }, // first touch only: a prospect that ever had a sequence (e.g. one that replied or opted out) is never re-enrolled automatically
    orderBy: { evaluatedAt: "asc" }, take: budget * 3, select: { prospectId: true },
  });
  for (const c of cands) {
    if (budget <= 0 || Date.now() > deadline) break;
    t.considered++;
    const live = (await assessProspects([c.prospectId])).get(c.prospectId);
    if (live) await saveAssessments([{ prospectId: c.prospectId, contactId: live.contactId, staffId: live.staffId, decision: live.decision, reasons: live.reasons }]);
    if (!live || live.decision !== "ELIGIBLE" || !live.contactId) { t.blocked[live?.reasons[0] ?? "NOT_FOUND"] = (t.blocked[live?.reasons[0] ?? "NOT_FOUND"] ?? 0) + 1; continue; }
    try {
      await enrollAutomated(a.pilotActivatedByUserId ?? actor.userId, { sequenceId: a.pilotSequenceId, prospectId: c.prospectId, contactId: live.contactId });
      t.enrolled++; budget--;
    } catch (e) {
      const code = e instanceof CrmError ? e.code : "ENROLL_FAILED";
      t.blocked[code] = (t.blocked[code] ?? 0) + 1;
    }
  }
  if (t.enrolled > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_OUTREACH_ENROLLED", entityType: "CrmSequence", entityId: a.pilotSequenceId, metadata: { enrolled: t.enrolled, blocked: t.blocked } });
  return t;
}

// ── The tick ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TickOutcome {
  status: "SKIPPED" | "COMPLETED" | "FAILED";
  reason?: string;
  runId?: string;
  counters?: Record<string, unknown>;
}

async function principal(userId: string | null | undefined): Promise<PlatformSalesActor | null> {
  if (!userId) return null;
  const actor = await resolvePlatformSalesActor(userId);
  // The automation acts with the authority of the Super Admin who activated it — and only while that person still holds it.
  return actor && actor.kind === "SUPER_ADMIN" && can(actor, "manage_lead_radar") ? actor : null;
}

export async function runAutomationTick(opts: { trigger: "CRON" | "MANUAL"; budgetMs?: number } = { trigger: "CRON" }): Promise<TickOutcome> {
  const budget = Math.min(Math.max(5_000, opts.budgetMs ?? TICK_BUDGET_MS), 55_000);
  const started = Date.now();
  const settings = await readSettings();
  if (!isLive(settings)) return { status: "SKIPPED", reason: "LEAD_RADAR_DISABLED" };
  const a = await readAutomation();
  if (!a.enabled) return { status: "SKIPPED", reason: "AUTOMATION_DISABLED" };

  // Single-runner lease (compare-and-set): overlapping cron invocations or a manual run during a cron run simply skip.
  const owner = randomUUID();
  const now = new Date();
  const lease = await db.crmLeadAutomation.updateMany({ where: { id: ID, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + budget + LEASE_SLACK_MS) } });
  if (lease.count !== 1) return { status: "SKIPPED", reason: "ALREADY_RUNNING" };

  const policy = await getActivePolicy();
  const run = await db.crmLeadAutomationRun.create({ data: { trigger: opts.trigger, policyVersion: policy?.version ?? null }, select: { id: true } });
  const counters: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const stage = async <T>(name: keyof typeof SHARE, enabled: boolean, fn: (deadline: number) => Promise<T>) => {
    if (!enabled) { counters[name] = { skipped: "STAGE_OFF" }; return; }
    const deadline = Math.min(started + budget, Date.now() + Math.max(2_000, budget * SHARE[name] * 1.5));
    try {
      // The master switch is re-read between stages: pausing takes effect before the next stage starts.
      if (!(await readAutomation()).enabled) { counters[name] = { skipped: "PAUSED" }; return; }
      counters[name] = await fn(deadline);
    } catch (e) {
      errors[name] = e instanceof CrmError ? e.code : "STAGE_FAILED";
      counters[name] = { error: errors[name] };
      console.error(`[lead-radar] automation stage ${name} failed`, e instanceof Error ? e.message : "unknown");
    }
  };

  try {
    const admin = await principal(policy?.activatedByUserId ?? a.updatedByUserId);
    if (!admin) {
      errors.principal = "ACTOR_INVALID";
      counters.note = "AUTOMATION_PRINCIPAL_NOT_SUPER_ADMIN";
    } else {
      // Derived repair-fit for candidates staged before the national engine (writes only derived columns; always on).
      await stage("classify", true, (deadline) => backfillCandidateFit({ deadline }));
      if (policy) {
        await stage("qualify", a.qualifyEnabled, (deadline) => qualifyPending(policy, { deadline }));
        await stage("import", a.importEnabled, (deadline) => importStage(admin, policy.version, a.importChunkSize, deadline));
      } else counters.note = "NO_ACTIVE_POLICY";
      await stage("assign", a.assignEnabled, (deadline) => assignStage(admin, a.assignStaffIds, deadline));
      await stage("release", a.releaseUnavailable, (deadline) => releaseUnavailable(admin, deadline));
      // Paid geocoding fallback for assigned prospects the source point could not locate. Inert unless Mapbox is configured AND a Super Admin enabled it AND budget remains.
      await stage("locate", true, (deadline) => autoGeocodeStep(admin, deadline));
      await stage("eligibility", a.eligibilityEnabled, (deadline) => refreshEligibility({ deadline }));
      await stage("pilot", a.pilotEnabled, (deadline) => pilotStage(admin, a, deadline));
    }
  } finally {
    const failed = Object.keys(errors).length > 0;
    await db.crmLeadAutomationRun.update({ where: { id: run.id }, data: { status: failed ? "FAILED" : "COMPLETED", counters: { ...counters, ms: Date.now() - started } as unknown as Prisma.InputJsonValue, errorCode: Object.values(errors)[0] ?? null, finishedAt: new Date() } });
    await db.crmLeadAutomation.updateMany({ where: { id: ID, leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null, lastTickAt: new Date() } });
  }
  const failed = Object.keys(errors).length > 0;
  return { status: failed ? "FAILED" : "COMPLETED", runId: run.id, counters, ...(failed ? { reason: Object.values(errors)[0] } : {}) };
}
