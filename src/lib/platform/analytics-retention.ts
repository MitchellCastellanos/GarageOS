import "server-only";
import { db } from "@/lib/db";
import { logPlatformAction } from "@/lib/platform/audit";
import {
  runRetention,
  runRetentionForTables,
  type RetentionResult,
  type RetentionStore,
  type TableRetentionOutcome,
} from "@/lib/privacy/retention";

/**
 * Prisma-backed stores. Table names come from a closed union (never from input) and each statement is written out in full because Prisma
 * tagged templates cannot parameterise identifiers. DELETEs are bounded (LIMIT inside a sub-select) and only ever touch rows strictly
 * older than the cutoff.
 */
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

export const analyticsEventRetentionStore: RetentionStore = {
  async countOlderThan(cutoff) {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "garageos"."AnalyticsEvent" WHERE "createdAt" < ${cutoff}`;
    return Number(rows[0]?.n ?? 0);
  },
  async oldestCreatedAt() {
    const rows = await db.$queryRaw<{ d: Date | null }[]>`SELECT min("createdAt") AS d FROM "garageos"."AnalyticsEvent"`;
    return rows[0]?.d ?? null;
  },
  async deleteOldestBatch(cutoff, limit) {
    return db.$executeRaw`
      DELETE FROM "garageos"."AnalyticsEvent"
      WHERE "id" IN (
        SELECT "id" FROM "garageos"."AnalyticsEvent" WHERE "createdAt" < ${cutoff} ORDER BY "createdAt" LIMIT ${limit}
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

export const RETENTION_TABLES = ["PageView", "AnalyticsEvent"] as const;
export type RetentionTable = (typeof RETENTION_TABLES)[number];
export type AnalyticsRetentionRun = Record<RetentionTable, TableRetentionOutcome>;

/**
 * One run covering PageView AND AnalyticsEvent: separate counts per table, a shared time budget split fairly, and one audit entry per
 * table (action ANALYTICS_RETENTION_RUN, targetType = table name). Stores/audit are injectable for tests.
 */
export async function runAnalyticsRetention(
  opts: { apply?: boolean; stores?: Record<RetentionTable, RetentionStore>; audit?: boolean; timeBudgetMs?: number; maxBatches?: number } = {},
): Promise<AnalyticsRetentionRun> {
  const dryRun = !(opts.apply ?? retentionApplyEnabled());
  const stores = opts.stores ?? { PageView: pageViewRetentionStore, AnalyticsEvent: analyticsEventRetentionStore };
  const outcomes = (await runRetentionForTables({ stores, dryRun, timeBudgetMs: opts.timeBudgetMs, maxBatches: opts.maxBatches })) as AnalyticsRetentionRun;
  if (opts.audit === false) return outcomes;
  for (const table of RETENTION_TABLES) {
    const o = outcomes[table];
    // Append-only, counts and dates only (no paths, hashes or any row content). One table's audit failure never blocks the other's.
    try {
      await logPlatformAction({
        actorUserId: RETENTION_ACTOR,
        action: "ANALYTICS_RETENTION_RUN",
        targetType: table,
        metadata: o.ok
          ? {
              dryRun: o.result.dryRun,
              cutoff: o.result.cutoff,
              months: o.result.months,
              candidates: o.result.candidates,
              deleted: o.result.deleted,
              batches: o.result.batches,
              remainingOverdue: o.result.remainingOverdue,
              complete: o.result.complete,
              oldestRemaining: o.result.oldestRemaining,
              durationMs: o.result.durationMs,
            }
          : { dryRun, status: "error", error: o.error },
      });
    } catch (err) {
      console.error("[analytics-retention] audit write failed:", err instanceof Error ? err.name : "unknown");
    }
  }
  return outcomes;
}

/** PageView only (kept for existing callers). Prefer runAnalyticsRetention. */
export async function runPageViewRetention(opts: { apply?: boolean } = {}): Promise<RetentionResult> {
  const dryRun = !(opts.apply ?? retentionApplyEnabled());
  return runRetention({ store: pageViewRetentionStore, dryRun });
}
