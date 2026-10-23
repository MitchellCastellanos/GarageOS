// Manual run of the analytics retention policy (13 months, subject to legal review) for PageView and AnalyticsEvent
// (separate counts per table, one shared time budget).
//
//   npx tsx scripts/purge-analytics-retention.ts                         # dry run (default): counts only
//   npx tsx scripts/purge-analytics-retention.ts --apply                 # deletes rows older than the cutoff, in bounded batches
//   npx tsx scripts/purge-analytics-retention.ts --allow-remote          # required when DATABASE_URL is not local
//   npx tsx scripts/purge-analytics-retention.ts --max-batches=200       # raise the per-table bound (default 20 x 5000 rows)
//
// Prints counts and dates only (never paths, hashes or any row content). Idempotent. Never run --apply against production without the
// owner's explicit authorization and a restore point (docs/analytics-retention-runbook.md).
import { db } from "@/lib/db";
import { runRetentionForTables } from "@/lib/privacy/retention";
import { analyticsEventRetentionStore, pageViewRetentionStore } from "@/lib/platform/analytics-retention";

const apply = process.argv.includes("--apply");
const allowRemote = process.argv.includes("--allow-remote");
const maxBatchesArg = process.argv.find((a) => a.startsWith("--max-batches="));
const maxBatches = maxBatchesArg ? Number(maxBatchesArg.split("=")[1]) : 20;

function isLocalDatabase(): boolean {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "";
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main() {
  if (!isLocalDatabase() && !allowRemote) {
    console.error("DATABASE_URL is not local. Re-run with --allow-remote if this is intentional (read the runbook first).");
    process.exit(2);
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    console.error("--max-batches must be a positive integer");
    process.exit(2);
  }
  const outcomes = await runRetentionForTables({
    stores: { PageView: pageViewRetentionStore, AnalyticsEvent: analyticsEventRetentionStore },
    dryRun: !apply,
    maxBatches,
    timeBudgetMs: 10 * 60_000,
  });
  for (const [table, o] of Object.entries(outcomes)) {
    console.log(`--- ${table}`);
    if (!o.ok) {
      console.log(`failed:             ${o.error}`);
      process.exitCode = 1;
      continue;
    }
    const r = o.result;
    console.log(`mode:               ${r.dryRun ? "DRY RUN (nothing deleted)" : "APPLY"}`);
    console.log(`retention:          ${r.months} months`);
    console.log(`cutoff (UTC):       ${r.cutoff}`);
    console.log(`rows past cutoff:   ${r.candidates}`);
    console.log(`deleted this run:   ${r.deleted} in ${r.batches} batch(es)`);
    console.log(`still past cutoff:  ${r.remainingOverdue}${r.complete ? " (complete)" : " (re-run to continue)"}`);
    console.log(`oldest row stored:  ${r.oldestRemaining ?? "none"}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
