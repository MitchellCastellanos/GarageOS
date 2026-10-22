# Analytics retention (PageView) — runbook

Status: **implemented, deletion OFF**. Owner target: 13 months, subject to legal review (decision 2026-10-22). Nothing is deleted in production until `ANALYTICS_RETENTION_APPLY=true` is set by the owner.

## What exists
- `src/lib/privacy/retention.ts` — the engine: `retentionCutoff(now, months)` (UTC calendar months, floor of 12 so a typo cannot shorten retention), `runRetention` (dry run, bounded batches, oldest first, strictly older than the cutoff, idempotent, time budget).
- `src/lib/platform/analytics-retention.ts` — Prisma-backed store for `garageos."PageView"` and the wrapper that records every run in `PlatformAuditLog` (`action = ANALYTICS_RETENTION_RUN`, actor `system:analytics-retention`; metadata: counts and dates only).
- `GET /api/webhooks/cron/analytics-retention` — scheduled daily at 08:20 UTC in `vercel.json`, `Authorization: Bearer $CRON_SECRET`. **Without `ANALYTICS_RETENTION_APPLY=true` it is a dry run**: it counts and writes the audit row.
- `scripts/purge-analytics-retention.ts` — manual run (dry run by default).
- Tests: `tests/analytics-retention.test.ts` (in-memory store: boundary, idempotency, batching, floor, time budget, wiring).

`AnalyticsEvent` (Analytics v2) must reuse `runRetention` with its own store when that table exists.

## Reading the result
Each run returns/records: `cutoff`, `candidates` (rows past the cutoff at start), `deleted`, `batches`, `remainingOverdue`, `complete`, `oldestRemaining`. Verifiable invariant after a complete apply: `oldestRemaining >= cutoff` and `remainingOverdue = 0`. Query the log (counts only):

```sql
SELECT "createdAt", metadata->>'dryRun' AS dry_run, metadata->>'candidates' AS candidates, metadata->>'deleted' AS deleted,
       metadata->>'complete' AS complete, metadata->>'oldestRemaining' AS oldest_remaining
FROM "garageos"."PlatformAuditLog" WHERE action = 'ANALYTICS_RETENTION_RUN' ORDER BY "createdAt" DESC LIMIT 10;
```

## Procedure to activate (owner)
1. Legal review of the 13-month figure and of the privacy text (LANG-02 / PRD-08).
2. Read the dry-run numbers from the log above for a few days; confirm `candidates` is what you expect (rows older than 13 months; none if analytics is younger than that).
3. Confirm a restore point: Neon branch or PITR (6 h window on the current plan, `docs/operations-runbook.md`). Rows deleted here cannot be recovered afterwards except from that point or a daily dump, and **dumps keep the rows until they expire (30 days)**.
4. Set `ANALYTICS_RETENTION_APPLY=true` in Vercel (Production). The next daily run deletes in bounded batches (5,000 rows × up to 20 batches per run); a large first backlog finishes over several days (`complete=false` until then). For a one-off faster drain use the script with `--apply --allow-remote --max-batches=200` from a trusted machine.
5. Check the audit rows: `complete = true`, `remainingOverdue = 0`.

To pause: unset the variable (back to dry runs). The schedule can stay.

## Not done here
- A watchdog that alerts when no successful run happened for 3 days (the audit log is the evidence source; a GitHub Actions watchdog like `db-backup-watchdog.yml` is a follow-up).
- Aggregated daily counts to keep after deletion (decision pending: the contract proposes minimum cell size 5, no `visitorHash`).
- A Super Admin read-only screen for `oldestRemaining` (follow-up; the SQL above is the interim check).
