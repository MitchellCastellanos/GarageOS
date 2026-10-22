import "server-only";
import { db } from "@/lib/db";
import { logPlatformAction } from "@/lib/platform/audit";
import { runRetention, type RetentionResult, type RetentionStore } from "@/lib/privacy/retention";

/** Prisma-backed store for PageView. The DELETE is bounded (LIMIT inside a sub-select) and only ever touches rows older than the cutoff. */
export const pageViewRetentionStore: RetentionStore = {
  async countOlderThan(cutoff) {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "garageos"."PageView" WHERE "createdAt" < ${cutoff}`;
    return Number(rows[0]?.n ?? 0);
  },
  async oldestCreatedAt() {
    const rows = await db.$queryRaw<{ d: Date | null }[]>`SELECT min("createdAt") AS d FROM "garageos"."PageView"`;
    return rows[0]?.d ?? null;
  },
  async deleteOldestBatch(cutoff, limit) {
    return db.$executeRaw`
      DELETE FROM "garageos"."PageView"
      WHERE "id" IN (
        SELECT "id" FROM "garageos"."PageView" WHERE "createdAt" < ${cutoff} ORDER BY "createdAt" LIMIT ${limit}
      )`;
  },
};

/**
 * Deletion is OFF unless ANALYTICS_RETENTION_APPLY=true is set explicitly (owner decision, after legal review). Without it every run is a
 * dry run that only counts and records the result, so the schedule can ship before anything is deleted.
 */
export function retentionApplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ANALYTICS_RETENTION_APPLY === "true";
}

export const RETENTION_ACTOR = "system:analytics-retention";

export async function runPageViewRetention(opts: { apply?: boolean } = {}): Promise<RetentionResult> {
  const dryRun = !(opts.apply ?? retentionApplyEnabled());
  const result = await runRetention({ store: pageViewRetentionStore, dryRun });
  // Append-only, counts and dates only (no paths, hashes or any row content).
  await logPlatformAction({
    actorUserId: RETENTION_ACTOR,
    action: "ANALYTICS_RETENTION_RUN",
    targetType: "PageView",
    metadata: {
      dryRun: result.dryRun,
      cutoff: result.cutoff,
      months: result.months,
      candidates: result.candidates,
      deleted: result.deleted,
      batches: result.batches,
      remainingOverdue: result.remainingOverdue,
      complete: result.complete,
      oldestRemaining: result.oldestRemaining,
      durationMs: result.durationMs,
    },
  });
  return result;
}
