// Applying the approved reclassification in bounded, resumable batches (pure). The owner first runs "Preview all" (read-only, whole province); only then may Apply run, one 500-candidate batch per
// request, driven by the browser with the cursor of the previous batch. This module holds the running totals, the cursor guard that makes a replayed batch a no-op, the progress arithmetic and the
// single place that decides whether the Apply button is enabled (so "disabled" is always explained, never silent).
import type { ApplyVerdict, PreviewAcc } from "@/domain/lead-radar/icp-preview";

export interface ApplyBatch { examined: number; changed: number; written: number; skipped: number; tombstonesCreated: number; transitions: Record<string, number>; poolSize: number; nextCursor: string | null }
export interface ApplyAcc {
  province: string; poolSize: number; batches: number; examined: number; changed: number; written: number; skipped: number; tombstonesCreated: number; transitions: Record<string, number>;
  /** Where a resumed apply continues. null with `done` = the whole pool was walked. */
  cursor: string | null; done: boolean;
}
export const newApplyAcc = (province: string): ApplyAcc => ({ province, poolSize: 0, batches: 0, examined: 0, changed: 0, written: 0, skipped: 0, tombstonesCreated: 0, transitions: {}, cursor: null, done: false });

const addRec = (a: Record<string, number>, b: Record<string, number>) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v; return o; };

/** Folds one server batch. A batch whose starting cursor is not the accumulator's current cursor (a replay after a dropped response, or an out-of-order response) is ignored whole:
 *  the server already wrote it, and applying is idempotent, so nothing is lost and nothing is counted twice. */
export function mergeApplyBatch(acc: ApplyAcc, b: ApplyBatch, fromCursor: string | null): ApplyAcc {
  if (acc.done || fromCursor !== acc.cursor) return acc;
  return {
    ...acc, poolSize: b.poolSize, batches: acc.batches + 1, examined: acc.examined + b.examined, changed: acc.changed + b.changed, written: acc.written + b.written, skipped: acc.skipped + b.skipped,
    tombstonesCreated: acc.tombstonesCreated + b.tombstonesCreated, transitions: addRec(acc.transitions, b.transitions), cursor: b.nextCursor, done: b.nextCursor === null,
  };
}

/** Whole-number percentage of the pool walked so far (never above 100, never 100 until the walk really finished). */
export function progressPct(examined: number, poolSize: number, done: boolean): number {
  if (done) return 100;
  if (poolSize <= 0) return 0;
  return Math.min(99, Math.floor((100 * examined) / poolSize));
}

export type ApplyGateState =
  | "NEEDS_PREVIEW"      // no complete Preview all for this province yet: the first batch alone proves nothing
  | "NOTHING_TO_APPLY"   // a COMPLETE preview found no change anywhere in the province
  | "READY"              // complete preview with changes; nothing applied yet
  | "RESUMABLE"          // an apply was started and stopped part-way
  | "RUNNING"
  | "APPLIED";           // the whole pool was walked; verify with a fresh Preview all
export interface ApplyGate { state: ApplyGateState; canApply: boolean; needsAcknowledgement: boolean; expectedChanges: number }

/** The one rule for the Apply button. It is enabled only after a COMPLETE province-wide preview that found changes; a NO-GO recommendation additionally needs an explicit acknowledgement. */
export function applyGate(preview: PreviewAcc | null, apply: ApplyAcc | null, running: boolean, verdict: ApplyVerdict | null): ApplyGate {
  const expected = preview?.changed ?? 0;
  if (running) return { state: "RUNNING", canApply: false, needsAcknowledgement: false, expectedChanges: expected };
  if (apply?.done) return { state: "APPLIED", canApply: false, needsAcknowledgement: false, expectedChanges: expected };
  if (!preview || !preview.done || preview.examined === 0 || preview.examined < preview.poolSize) return { state: "NEEDS_PREVIEW", canApply: false, needsAcknowledgement: false, expectedChanges: expected };
  if (preview.changed === 0) return { state: "NOTHING_TO_APPLY", canApply: false, needsAcknowledgement: false, expectedChanges: 0 };
  const started = !!apply && apply.batches > 0;
  return { state: started ? "RESUMABLE" : "READY", canApply: true, needsAcknowledgement: verdict === "NO_GO", expectedChanges: expected };
}
