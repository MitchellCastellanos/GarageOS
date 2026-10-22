// Retention engine for first-party analytics rows (PageView, later AnalyticsEvent). Pure logic with an injected store so it can be tested
// without a database; the Prisma-backed store lives in src/lib/platform/analytics-retention.ts.
//
// Safety properties (all covered by tests/analytics-retention.test.ts):
//  - dry run never deletes: it only counts;
//  - only rows strictly older than the cutoff are ever deleted, oldest first, in bounded batches;
//  - the cutoff cannot be moved closer than MIN_RETENTION_MONTHS to now (a typo cannot wipe recent data);
//  - idempotent: running again after completion deletes nothing;
//  - bounded by batch size, batch count and a time budget, so a cron invocation can never run away; an unfinished run reports
//    complete=false and simply continues on the next invocation.

/** Owner-selected target (2026-10-22), subject to legal review. */
export const ANALYTICS_RETENTION_MONTHS = 13;
/** Floor: a configuration or call error can never shorten retention below this. */
export const MIN_RETENTION_MONTHS = 12;

export const DEFAULT_BATCH_SIZE = 5000;
export const MAX_BATCH_SIZE = 10000;

/** now minus `months` calendar months in UTC (clamping the day: 31 Mar − 1 month = 28/29 Feb). */
export function retentionCutoff(now: Date, months: number = ANALYTICS_RETENTION_MONTHS): Date {
  if (!Number.isInteger(months) || months < MIN_RETENTION_MONTHS) {
    throw new Error(`retention must be an integer number of months >= ${MIN_RETENTION_MONTHS}`);
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return target;
}

export interface RetentionStore {
  /** Rows with createdAt strictly before the cutoff. */
  countOlderThan(cutoff: Date): Promise<number>;
  /** Oldest createdAt still stored, or null when empty. */
  oldestCreatedAt(): Promise<Date | null>;
  /** Deletes up to `limit` of the OLDEST rows strictly before the cutoff; returns how many were deleted. */
  deleteOldestBatch(cutoff: Date, limit: number): Promise<number>;
}

export interface RetentionOptions {
  store: RetentionStore;
  now?: Date;
  months?: number;
  dryRun: boolean;
  batchSize?: number;
  maxBatches?: number;
  timeBudgetMs?: number;
  clock?: () => number;
}

export interface RetentionResult {
  cutoff: string;
  months: number;
  dryRun: boolean;
  /** Rows older than the cutoff when the run started. */
  candidates: number;
  deleted: number;
  batches: number;
  /** Rows older than the cutoff that remain (0 after a complete apply; equals candidates on a dry run). */
  remainingOverdue: number;
  /** True when nothing overdue is left (always true for a dry run that found nothing). */
  complete: boolean;
  /** Oldest row still stored after the run (ISO), or null. Invariant after a complete apply: >= cutoff. */
  oldestRemaining: string | null;
  durationMs: number;
}

export async function runRetention(opts: RetentionOptions): Promise<RetentionResult> {
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const months = opts.months ?? ANALYTICS_RETENTION_MONTHS;
  const now = opts.now ?? new Date();
  const cutoff = retentionCutoff(now, months);
  const batchSize = Math.max(1, Math.min(Math.floor(opts.batchSize ?? DEFAULT_BATCH_SIZE), MAX_BATCH_SIZE));
  const maxBatches = Math.max(1, Math.floor(opts.maxBatches ?? 20));
  const budget = opts.timeBudgetMs ?? 20_000;

  const candidates = await opts.store.countOlderThan(cutoff);
  let deleted = 0;
  let batches = 0;

  if (!opts.dryRun) {
    while (batches < maxBatches && clock() - started < budget) {
      const n = await opts.store.deleteOldestBatch(cutoff, batchSize);
      if (n <= 0) break;
      deleted += n;
      batches += 1;
      if (n < batchSize) break;
    }
  }

  const remainingOverdue = opts.dryRun ? candidates : await opts.store.countOlderThan(cutoff);
  const oldest = await opts.store.oldestCreatedAt();
  return {
    cutoff: cutoff.toISOString(),
    months,
    dryRun: opts.dryRun,
    candidates,
    deleted,
    batches,
    remainingOverdue,
    complete: remainingOverdue === 0,
    oldestRemaining: oldest ? oldest.toISOString() : null,
    durationMs: clock() - started,
  };
}
