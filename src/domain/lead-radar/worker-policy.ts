// Discovery worker policy (pure): leases, retry/backoff and which provinces are due for an automatic refresh.
// Nothing here starts work on its own: a province is only ever scheduled when a Super Admin opted it in (`autoRefresh`), and one province at a time.
import { RELEASE_ID } from "@/domain/lead-radar/scope";
import type { ProvinceCode } from "@/domain/lead-radar/geo";

/** A worker must heartbeat (every chunk does) at least this often; otherwise the run is considered stalled and becomes claimable again. */
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Wait before the next attempt after the Nth failed attempt (1-based): 5 min, 30 min, 2 h. */
export const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 3600_000] as const;
export const backoffMs = (failedAttempts: number) => BACKOFF_MS[Math.min(Math.max(failedAttempts, 1), BACKOFF_MS.length) - 1];
/** After a failed automatic refresh, the schedule leaves the province alone for this long (a person can still queue it manually). */
export const SCHEDULE_FAILURE_COOLDOWN_MS = 24 * 3600_000;
export const DAY_MS = 86_400_000;

export type FailureOutcome = { exhausted: boolean; nextAttemptAt: Date | null; attempts: number };

/** What happens when an attempt fails or its lease expires. */
export function afterFailedAttempt(attemptsSoFar: number, now: Date): FailureOutcome {
  const attempts = attemptsSoFar + 1;
  if (attempts >= MAX_ATTEMPTS) return { exhausted: true, nextAttemptAt: null, attempts };
  return { exhausted: false, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)), attempts };
}

/** The newest release id advertised by the STAC catalog JSON, or null when the document is not trustworthy. */
export function parseLatestRelease(doc: unknown): string | null {
  const latest = (doc as { latest?: unknown } | null)?.latest;
  return typeof latest === "string" && RELEASE_ID.test(latest) ? latest : null;
}

export interface ProvinceState {
  province: ProvinceCode; autoRefresh: boolean; paused: boolean; refreshIntervalDays: number;
  lastSuccessRelease: string | null; lastSuccessAt: Date | null; lastFailureAt: Date | null;
}
export interface ActiveRun { provinces: string[]; status: string; scheduled: boolean }

export type DueReason = "NEW_RELEASE" | "NEVER_EXTRACTED";
export interface DueProvince { province: ProvinceCode; reason: DueReason }

/**
 * Provinces that should get an automatic refresh now. Conservative by construction:
 *  · only provinces a Super Admin opted in and did not pause;
 *  · never while ANY run for that province is planned/receiving (no overlap), and never more than ONE automatic run in flight nationally (bounded workload);
 *  · only when the latest known release is newer than the last successful extraction, and the minimum interval since that success has passed;
 *  · a province whose last automatic attempt failed is left alone for 24 h.
 * At most `limit` (default 1) provinces are returned, oldest data first.
 */
export function dueProvinces(input: { now: Date; latestRelease: string | null; states: readonly ProvinceState[]; activeRuns: readonly ActiveRun[]; limit?: number }): DueProvince[] {
  const { now, latestRelease, states, activeRuns } = input;
  if (!latestRelease) return [];
  if (activeRuns.some((r) => r.scheduled && (r.status === "PLANNED" || r.status === "INGESTING"))) return [];
  const busy = new Set(activeRuns.filter((r) => r.status === "PLANNED" || r.status === "INGESTING").flatMap((r) => r.provinces));
  const due: (DueProvince & { since: number })[] = [];
  for (const s of states) {
    if (!s.autoRefresh || s.paused || busy.has(s.province)) continue;
    if (s.lastFailureAt && now.getTime() - s.lastFailureAt.getTime() < SCHEDULE_FAILURE_COOLDOWN_MS && (!s.lastSuccessAt || s.lastFailureAt > s.lastSuccessAt)) continue;
    if (!s.lastSuccessRelease || !s.lastSuccessAt) { due.push({ province: s.province, reason: "NEVER_EXTRACTED", since: 0 }); continue; }
    if (s.lastSuccessRelease >= latestRelease) continue; // release ids sort chronologically (YYYY-MM-DD[.n])
    if (now.getTime() - s.lastSuccessAt.getTime() < s.refreshIntervalDays * DAY_MS) continue;
    due.push({ province: s.province, reason: "NEW_RELEASE", since: s.lastSuccessAt.getTime() });
  }
  return due.sort((a, b) => a.since - b.since || a.province.localeCompare(b.province)).slice(0, Math.max(1, input.limit ?? 1)).map(({ province, reason }) => ({ province, reason }));
}
