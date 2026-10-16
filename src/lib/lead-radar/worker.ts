import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { buildPlan, canonicalScope, planHashOf, type DiscoveryScope } from "@/domain/lead-radar/scope";
import { afterFailedAttempt, dueProvinces, LEASE_MS, MAX_ATTEMPTS, parseLatestRelease } from "@/domain/lead-radar/worker-policy";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { isLive, readSettings } from "@/lib/lead-radar/settings";
import { listProvinceStates, noteRunOutcome } from "@/lib/lead-radar/province-state";
import { attachManifest, completeRun, createRun, ingestChunk, type RunActor } from "@/lib/lead-radar/runs";

// Server side of the discovery worker (a scheduled GitHub Actions job — never a Vercel request handler — does the heavy extraction and talks to this module
// through /api/lead-radar/worker). A run is only executable by the worker when a Super Admin QUEUED it (execution = WORKER) or opted its province into the schedule.
// Leases + attempts make it resumable: a dead worker's run becomes claimable again, continues from the last confirmed chunk, and stops after MAX_ATTEMPTS.

export const STAC_URL = "https://stac.overturemaps.org/catalog.json";

const ACTIVE = ["PLANNED", "INGESTING"] as const;

/** Queue a province (or any scope) for the automated worker. This is the owner's explicit start; nothing runs until a worker claims it. */
export async function queueWorkerRun(actor: PlatformSalesActor, input: { scope: unknown; release: string; acknowledgeLargeScope?: boolean }) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const created = await createRun(actor, input);
  await db.crmDiscoveryRun.update({ where: { id: created.runId }, data: { execution: "WORKER", queuedAt: new Date() } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_QUEUED", entityType: "CrmDiscoveryRun", entityId: created.runId, metadata: { by: "owner" } });
  return created;
}

const claimable = (now: Date): Prisma.CrmDiscoveryRunWhereInput => ({
  execution: "WORKER", status: { in: [...ACTIVE] }, cancelRequestedAt: null, attempts: { lt: MAX_ATTEMPTS },
  AND: [{ OR: [{ workerLeaseUntil: null }, { workerLeaseUntil: { lt: now } }] }, { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }],
});

/** Is there anything a worker could claim right now? Cheap, no side effects (lets the scheduled job exit before installing Python). */
export async function peekWork(now = new Date()) {
  const s = await readSettings();
  if (!isLive(s)) return { pending: false, reason: "LEAD_RADAR_DISABLED" as const };
  await recoverStalledRuns(now);
  const runs = await db.crmDiscoveryRun.findMany({ where: claimable(now), select: { scope: true } });
  const paused = await pausedProvinces();
  const n = runs.filter((r) => !((r.scope as { provinces?: string[] }).provinces ?? []).some((p) => paused.has(p))).length;
  return { pending: n > 0, reason: n > 0 ? ("QUEUED" as const) : ("NOTHING_QUEUED" as const), count: n };
}

async function pausedProvinces() {
  return new Set((await db.crmDiscoveryProvince.findMany({ where: { paused: true }, select: { province: true } })).map((p) => p.province));
}

/** A run whose worker stopped heartbeating counts one failed attempt and becomes claimable again (or is failed for good after MAX_ATTEMPTS). */
export async function recoverStalledRuns(now = new Date()) {
  const stalled = await db.crmDiscoveryRun.findMany({ where: { execution: "WORKER", status: { in: [...ACTIVE] }, workerId: { not: null }, workerLeaseUntil: { lt: now } }, select: { id: true, attempts: true, createdByUserId: true } });
  let recovered = 0, failed = 0;
  for (const r of stalled) {
    const o = afterFailedAttempt(r.attempts, now);
    const upd = await db.crmDiscoveryRun.updateMany({
      where: { id: r.id, workerId: { not: null }, workerLeaseUntil: { lt: now }, status: { in: [...ACTIVE] } },
      data: { workerId: null, workerLeaseUntil: null, attempts: o.attempts, nextAttemptAt: o.nextAttemptAt, lastFailureCode: "WORKER_STALLED", ...(o.exhausted ? { status: "FAILED" as const, errorCode: "WORKER_RETRIES_EXHAUSTED", finishedAt: now } : {}) },
    });
    if (upd.count !== 1) continue;
    await writeCrmAudit({ actorUserId: r.createdByUserId, action: "LEAD_RADAR_RUN_STALLED", entityType: "CrmDiscoveryRun", entityId: r.id, metadata: { attempts: o.attempts, exhausted: o.exhausted } });
    if (o.exhausted) { failed++; await noteRunOutcome(r.id); } else recovered++;
  }
  return { recovered, failed };
}

export interface ClaimedRun {
  runId: string; workerId: string; attempt: number; leaseMs: number;
  plan: ReturnType<typeof buildPlan>;
  /** Highest chunk the server already applied (-1 = none): the worker resumes from lastChunkSeq + 1. */
  lastChunkSeq: number; manifestAttached: boolean; expectedRecords: number | null;
}

export async function claimRun(workerId: string, now = new Date()): Promise<ClaimedRun | null> {
  const s = await readSettings();
  if (!isLive(s)) throw new CrmError("LEAD_RADAR_DISABLED");
  await recoverStalledRuns(now);
  const paused = await pausedProvinces();
  const candidates = await db.crmDiscoveryRun.findMany({ where: claimable(now), orderBy: [{ queuedAt: "asc" }, { id: "asc" }], take: 10 });
  for (const run of candidates) {
    if (((run.scope as { provinces?: string[] }).provinces ?? []).some((p) => paused.has(p))) continue;
    const upd = await db.crmDiscoveryRun.updateMany({
      where: { id: run.id, ...claimable(now) },
      data: { workerId, workerLeaseUntil: new Date(now.getTime() + LEASE_MS), workerHeartbeatAt: now },
    });
    if (upd.count !== 1) continue; // another worker won the race
    await writeCrmAudit({ actorUserId: run.createdByUserId, action: "LEAD_RADAR_WORKER_CLAIMED", entityType: "CrmDiscoveryRun", entityId: run.id, metadata: { attempt: run.attempts + 1, resumeFrom: run.lastChunkSeq + 1 } });
    return {
      runId: run.id, workerId, attempt: run.attempts + 1, leaseMs: LEASE_MS, plan: buildPlan(run.scope, run.sourceRelease),
      lastChunkSeq: run.lastChunkSeq, manifestAttached: !!run.manifest, expectedRecords: run.expectedRecords,
    };
  }
  return null;
}

async function ownedRun(runId: string, workerId: string, now = new Date()) {
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new CrmError("NOT_FOUND");
  if (run.execution !== "WORKER") throw new CrmError("RUN_NOT_WORKER");
  if (run.workerId !== workerId || !run.workerLeaseUntil || run.workerLeaseUntil < now) throw new CrmError("LEASE_LOST");
  return run;
}
const actorOf = (run: { createdByUserId: string }): RunActor => ({ userId: run.createdByUserId });
const extend = (runId: string, workerId: string, now: Date) =>
  db.crmDiscoveryRun.updateMany({ where: { id: runId, workerId }, data: { workerLeaseUntil: new Date(now.getTime() + LEASE_MS), workerHeartbeatAt: now } });

export async function workerHeartbeat(runId: string, workerId: string) {
  const now = new Date();
  await ownedRun(runId, workerId, now);
  await extend(runId, workerId, now);
  return { leaseMs: LEASE_MS };
}
export async function workerAttach(runId: string, workerId: string, manifest: unknown) {
  const now = new Date();
  const run = await ownedRun(runId, workerId, now);
  const r = await attachManifest(actorOf(run), runId, manifest);
  await extend(runId, workerId, now);
  return r;
}
export async function workerIngest(runId: string, workerId: string, seq: number, ndjson: string) {
  const now = new Date();
  const run = await ownedRun(runId, workerId, now);
  const r = await ingestChunk(actorOf(run), runId, seq, ndjson);
  await extend(runId, workerId, now);
  return r;
}
export async function workerComplete(runId: string, workerId: string) {
  const now = new Date();
  const run = await ownedRun(runId, workerId, now);
  const r = await completeRun(actorOf(run), runId);
  await db.crmDiscoveryRun.updateMany({ where: { id: runId, workerId }, data: { workerId: null, workerLeaseUntil: null, nextAttemptAt: null } });
  return r;
}

/** The worker reports a failed attempt (code only, never record data). Retries with backoff; fails the run for good after MAX_ATTEMPTS. */
export async function workerFail(runId: string, workerId: string, code: string) {
  const now = new Date();
  const run = await ownedRun(runId, workerId, now);
  const clean = (code || "WORKER_ERROR").replace(/[^A-Z0-9_]/gi, "_").slice(0, 60).toUpperCase();
  const o = afterFailedAttempt(run.attempts, now);
  await db.crmDiscoveryRun.updateMany({
    where: { id: runId, workerId },
    data: { workerId: null, workerLeaseUntil: null, attempts: o.attempts, nextAttemptAt: o.nextAttemptAt, lastFailureCode: clean, ...(o.exhausted ? { status: "FAILED" as const, errorCode: clean, finishedAt: now } : {}) },
  });
  await writeCrmAudit({ actorUserId: run.createdByUserId, action: "LEAD_RADAR_WORKER_FAILED", entityType: "CrmDiscoveryRun", entityId: runId, metadata: { code: clean, attempts: o.attempts, exhausted: o.exhausted } });
  if (o.exhausted) await noteRunOutcome(runId);
  return { exhausted: o.exhausted, attempts: o.attempts, nextAttemptAt: o.nextAttemptAt };
}

// ── Release detection + opt-in province schedule ─────────────────────────────────────────────────────────────────────────
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(STAC_URL, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return parseLatestRelease(await res.json());
  } catch { return null; }
}

export interface MaintenanceResult { skipped?: string; release: string | null; newRelease: boolean; stalled: { recovered: number; failed: number }; scheduled: { province: string; runId: string; reason: string }[] }

/**
 * Bounded, idempotent housekeeping run by the Lead Radar cron: recover stalled worker runs, remember a newly published Overture release, and — only for provinces a
 * Super Admin opted in — queue ONE automatic province extraction at a time. With no opted-in province this creates nothing, ever.
 */
export async function runDiscoveryMaintenance(opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<MaintenanceResult> {
  const now = opts.now ?? new Date();
  const s = await readSettings();
  const out: MaintenanceResult = { release: null, newRelease: false, stalled: { recovered: 0, failed: 0 }, scheduled: [] };
  if (!isLive(s)) return { ...out, skipped: "LEAD_RADAR_DISABLED" };
  out.stalled = await recoverStalledRuns(now);
  const latest = await fetchLatestRelease(opts.fetchImpl);
  out.release = latest;
  if (latest) {
    const known = await db.crmDiscoveryRelease.findUnique({ where: { release: latest } });
    if (!known) {
      await db.crmDiscoveryRelease.createMany({ data: [{ release: latest }], skipDuplicates: true });
      out.newRelease = true;
      const anyAdmin = await db.crmDiscoveryProvince.findFirst({ where: { enabledByUserId: { not: null } }, select: { enabledByUserId: true } });
      if (anyAdmin?.enabledByUserId) await writeCrmAudit({ actorUserId: anyAdmin.enabledByUserId, action: "LEAD_RADAR_RELEASE_DETECTED", entityType: "CrmDiscoveryRelease", entityId: latest });
    }
  }
  const [states, active] = await Promise.all([
    listProvinceStates(),
    db.crmDiscoveryRun.findMany({ where: { status: { in: [...ACTIVE] } }, select: { scope: true, status: true, scheduled: true } }),
  ]);
  const due = dueProvinces({
    now, latestRelease: latest ?? (await db.crmDiscoveryRelease.findFirst({ orderBy: { release: "desc" } }))?.release ?? null,
    states: states.map((p) => ({ province: p.province, autoRefresh: p.autoRefresh, paused: p.paused, refreshIntervalDays: p.refreshIntervalDays, lastSuccessRelease: p.lastSuccessRelease, lastSuccessAt: p.lastSuccessAt, lastFailureAt: p.lastFailureAt })),
    activeRuns: active.map((r) => ({ provinces: (r.scope as { provinces?: string[] }).provinces ?? [], status: r.status, scheduled: r.scheduled })),
  });
  for (const d of due) {
    const st = states.find((p) => p.province === d.province)!;
    if (!st.enabledByUserId) continue; // the opt-in must be attributable to a Super Admin
    const release = latest ?? (await db.crmDiscoveryRelease.findFirst({ orderBy: { release: "desc" } }))!.release;
    const scope: DiscoveryScope = canonicalScope({ provinces: [d.province], groups: ["REPAIR", "BODY_GLASS"], cities: [], minConfidence: 0 });
    const created = await db.crmDiscoveryRun.create({
      data: { source: "OVERTURE", sourceRelease: release, scope: scope as unknown as Prisma.InputJsonValue, planHash: planHashOf(scope), createdByUserId: st.enabledByUserId, execution: "WORKER", scheduled: true, queuedAt: now },
      select: { id: true },
    });
    await writeCrmAudit({ actorUserId: st.enabledByUserId, action: "LEAD_RADAR_RUN_QUEUED", entityType: "CrmDiscoveryRun", entityId: created.id, metadata: { by: "schedule", province: d.province, reason: d.reason, release } });
    out.scheduled.push({ province: d.province, runId: created.id, reason: d.reason });
  }
  return out;
}

export const newWorkerId = () => `gh-${randomUUID().slice(0, 12)}`;
