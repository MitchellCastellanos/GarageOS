import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { buildPlan, canonicalScope, estimateWorkload, manifestSchema, NATIONWIDE_MB_THRESHOLD, planHashOf, RELEASE_ID, type DiscoveryScope, type ExtractionManifest } from "@/domain/lead-radar/scope";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { isLive, readSettings } from "@/lib/lead-radar/settings";
import { stageChunk } from "@/lib/lead-radar/staging";

// Discovery run lifecycle. Open-data ingestion has no per-record fee, so it does not spend ledger money — but it is still
// gated (environment switch AND database setting), bounded (chunk limits), restartable (chunk sequence compare-and-set) and audited.

async function requireLive() {
  const s = await readSettings();
  if (!isLive(s)) throw new CrmError("LEAD_RADAR_DISABLED");
}

export interface CreateRunInput { scope: unknown; release: string; acknowledgeLargeScope?: boolean }

export async function createRun(actor: PlatformSalesActor, input: CreateRunInput) {
  await requireLive();
  const release = input.release.trim();
  if (release !== "latest" && !RELEASE_ID.test(release)) throw new CrmError("INVALID_RELEASE");
  let scope: DiscoveryScope;
  try { scope = canonicalScope(input.scope); } catch { throw new CrmError("INVALID_SCOPE"); }
  const work = estimateWorkload(scope);
  // Owner approval gate: a nationwide / large extraction must be acknowledged explicitly, never implied.
  if ((work.nationwide || work.megabytes > NATIONWIDE_MB_THRESHOLD) && input.acknowledgeLargeScope !== true) throw new CrmError("LARGE_SCOPE_NOT_ACKNOWLEDGED");
  const run = await db.crmDiscoveryRun.create({
    data: { source: "OVERTURE", sourceRelease: release, scope: scope as unknown as Prisma.InputJsonValue, planHash: planHashOf(scope), createdByUserId: actor.userId },
    select: { id: true },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_CREATED", entityType: "CrmDiscoveryRun", entityId: run.id, metadata: { provinces: scope.provinces, groups: scope.groups, cities: scope.cities.length, release, estimatedMB: work.megabytes } });
  return { runId: run.id, planHash: planHashOf(scope), work };
}

export async function planFileFor(runId: string) {
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new CrmError("NOT_FOUND");
  return buildPlan(run.scope, run.sourceRelease);
}

export async function attachManifest(actor: PlatformSalesActor, runId: string, rawManifest: unknown) {
  await requireLive();
  const parsed = manifestSchema.safeParse(rawManifest);
  if (!parsed.success) throw new CrmError("MANIFEST_INVALID");
  const m: ExtractionManifest = parsed.data;
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new CrmError("NOT_FOUND");
  if (m.planHash !== run.planHash) throw new CrmError("MANIFEST_PLAN_MISMATCH");
  if (run.sourceRelease !== "latest" && run.sourceRelease !== m.release) throw new CrmError("MANIFEST_RELEASE_MISMATCH");
  if (run.status === "INGESTING" && (run.manifest as { fileSha256?: string } | null)?.fileSha256 === m.fileSha256) return { runId, lastChunkSeq: run.lastChunkSeq, alreadyAttached: true };
  if (run.status !== "PLANNED") throw new CrmError("RUN_NOT_PLANNED");
  const r = await db.crmDiscoveryRun.updateMany({
    where: { id: runId, status: "PLANNED" },
    data: { status: "INGESTING", manifest: m as unknown as Prisma.InputJsonValue, expectedRecords: m.recordCount, sourceRelease: m.release, startedAt: new Date() },
  });
  if (r.count !== 1) throw new CrmError("RUN_NOT_PLANNED");
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_STARTED", entityType: "CrmDiscoveryRun", entityId: runId, metadata: { release: m.release, records: m.recordCount } });
  return { runId, lastChunkSeq: -1, alreadyAttached: false };
}

export type ChunkResult = { duplicate: true; lastChunkSeq: number } | { duplicate: false; lastChunkSeq: number; received: number; stagedNew: number; stagedUpdated: number; rejected: number };

/** Applies chunk `seq` exactly once. A replay of an applied chunk is a harmless no-op; a gap is refused so a client always resumes from lastChunkSeq + 1. */
export async function ingestChunk(actor: PlatformSalesActor, runId: string, seq: number, text: string): Promise<ChunkResult> {
  await requireLive();
  if (!Number.isInteger(seq) || seq < 0 || seq > 100_000) throw new CrmError("CHUNK_SEQ_INVALID");
  try {
    return await db.$transaction(async (tx): Promise<ChunkResult> => {
      const claimed = await tx.crmDiscoveryRun.updateMany({ where: { id: runId, status: "INGESTING", lastChunkSeq: seq - 1, cancelRequestedAt: null }, data: { lastChunkSeq: seq } });
      if (claimed.count !== 1) {
        const run = await tx.crmDiscoveryRun.findUnique({ where: { id: runId }, select: { status: true, lastChunkSeq: true } });
        if (!run) throw new CrmError("NOT_FOUND");
        if (run.status === "CANCELLED") throw new CrmError("RUN_CANCELLED");
        if (run.status !== "INGESTING") throw new CrmError("RUN_NOT_INGESTING");
        if (run.lastChunkSeq >= seq) return { duplicate: true, lastChunkSeq: run.lastChunkSeq };
        throw new CrmError("CHUNK_OUT_OF_ORDER");
      }
      const run = await tx.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
      const t = await stageChunk(tx, { id: run.id, scope: run.scope as unknown as DiscoveryScope, release: run.sourceRelease }, text);
      const diag = new Map((Array.isArray(run.diagnostics) ? (run.diagnostics as { code: string; count: number }[]) : []).map((d) => [d.code, d.count]));
      for (const [code, n] of Object.entries(t.issues)) diag.set(code, (diag.get(code) ?? 0) + n);
      await tx.crmDiscoveryRun.update({
        where: { id: runId },
        data: {
          receivedRecords: { increment: t.received }, stagedNew: { increment: t.stagedNew }, stagedUpdated: { increment: t.stagedUpdated }, rejectedRecords: { increment: t.rejected },
          diagnostics: [...diag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([code, count]) => ({ code, count })) as unknown as Prisma.InputJsonValue,
        },
      });
      return { duplicate: false, lastChunkSeq: seq, received: t.received, stagedNew: t.stagedNew, stagedUpdated: t.stagedUpdated, rejected: t.rejected };
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (err) {
    if (err instanceof CrmError) throw err;
    throw new CrmError("CHUNK_FAILED"); // nothing was applied (transaction rolled back); the client may retry the same sequence number
  }
}

export async function completeRun(actor: PlatformSalesActor, runId: string) {
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new CrmError("NOT_FOUND");
  if (run.status === "COMPLETED") return { runId, alreadyCompleted: true };
  if (run.status !== "INGESTING") throw new CrmError("RUN_NOT_INGESTING");
  if (run.expectedRecords === null || run.receivedRecords !== run.expectedRecords) throw new CrmError("RUN_INCOMPLETE");
  const r = await db.crmDiscoveryRun.updateMany({ where: { id: runId, status: "INGESTING", receivedRecords: run.receivedRecords }, data: { status: "COMPLETED", finishedAt: new Date() } });
  if (r.count !== 1) throw new CrmError("RUN_INCOMPLETE");
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_COMPLETED", entityType: "CrmDiscoveryRun", entityId: runId, metadata: { received: run.receivedRecords, rejected: run.rejectedRecords } });
  return { runId, alreadyCompleted: false };
}

/** Cancel is always allowed (it can only stop work). Staged candidates stay; nothing is imported or deleted. */
export async function cancelRun(actor: PlatformSalesActor, runId: string) {
  const r = await db.crmDiscoveryRun.updateMany({ where: { id: runId, status: { in: ["PLANNED", "INGESTING"] } }, data: { status: "CANCELLED", cancelRequestedAt: new Date(), finishedAt: new Date() } });
  if (r.count !== 1) {
    const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run) throw new CrmError("NOT_FOUND");
    if (run.status === "CANCELLED") return { runId, alreadyCancelled: true };
    throw new CrmError("RUN_NOT_CANCELLABLE");
  }
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_CANCELLED", entityType: "CrmDiscoveryRun", entityId: runId });
  return { runId, alreadyCancelled: false };
}

export async function resumeRun(actor: PlatformSalesActor, runId: string) {
  await requireLive();
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId } });
  if (!run) throw new CrmError("NOT_FOUND");
  if (run.status === "INGESTING") return { runId, lastChunkSeq: run.lastChunkSeq };
  if (run.status !== "CANCELLED" || !run.manifest || run.expectedRecords === null || run.receivedRecords >= run.expectedRecords) throw new CrmError("RUN_NOT_RESUMABLE");
  const r = await db.crmDiscoveryRun.updateMany({ where: { id: runId, status: "CANCELLED" }, data: { status: "INGESTING", cancelRequestedAt: null, finishedAt: null } });
  if (r.count !== 1) throw new CrmError("RUN_NOT_RESUMABLE");
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_RUN_RESUMED", entityType: "CrmDiscoveryRun", entityId: runId, metadata: { fromChunk: run.lastChunkSeq + 1 } });
  return { runId, lastChunkSeq: run.lastChunkSeq };
}
