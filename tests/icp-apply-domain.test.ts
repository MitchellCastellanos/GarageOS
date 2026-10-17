import test from "node:test";
import assert from "node:assert/strict";
import { applyGate, mergeApplyBatch, newApplyAcc, progressPct, type ApplyBatch } from "../src/domain/lead-radar/icp-apply";
import { emptyDetail, emptyIcp, mergeBatch, newAcc, type PreviewAcc, type PreviewBatch } from "../src/domain/lead-radar/icp-preview";

const pb = (o: Partial<PreviewBatch> & { next: string | null }): PreviewBatch => { const { next, ...r } = o; return { examined: 500, changed: 0, transitions: {}, icp: emptyIcp(3), detail: emptyDetail(), poolSize: 1300, nextCursor: next, ...r }; };
const previewOf = (batches: PreviewBatch[]): PreviewAcc => { let acc = newAcc("AB"), from: string | null = null; for (const b of batches) { acc = mergeBatch(acc, b, from); from = b.nextCursor; } return acc; };
const ab = (o: Partial<ApplyBatch> & { next: string | null }): ApplyBatch => { const { next, ...r } = o; return { examined: 500, changed: 0, written: 0, skipped: 0, tombstonesCreated: 0, transitions: {}, poolSize: 1300, nextCursor: next, ...r }; };

test("the reported symptom: a first batch with no change and more candidates remaining is NOT 'nothing to apply' — Apply stays locked for a stated reason until a COMPLETE preview exists", () => {
  const first = previewOf([pb({ next: "c1" })]);
  assert.deepEqual([first.changed, first.done], [0, false]);
  const g = applyGate(first, null, false, null);
  assert.deepEqual([g.state, g.canApply], ["NEEDS_PREVIEW", false]);
  assert.equal(applyGate(null, null, false, null).state, "NEEDS_PREVIEW");
  // later batches carry the changes: the complete preview unlocks Apply with the true total
  const full = previewOf([pb({ next: "c1" }), pb({ next: "c2", changed: 120 }), pb({ next: null, examined: 300, changed: 80 })]);
  assert.deepEqual([full.done, full.changed], [true, 200]);
  const ok = applyGate(full, null, false, "GO");
  assert.deepEqual([ok.state, ok.canApply, ok.expectedChanges, ok.needsAcknowledgement], ["READY", true, 200, false]);
  assert.equal(applyGate(full, null, false, "NO_GO").needsAcknowledgement, true, "a NO-GO recommendation needs an explicit acknowledgement");
});

test("a COMPLETE preview with no change anywhere is the only 'nothing to apply'; running and applied states lock the button", () => {
  const none = previewOf([pb({ next: "c1" }), pb({ next: null, examined: 800 })]);
  assert.equal(applyGate(none, null, false, "GO").state, "NOTHING_TO_APPLY");
  assert.equal(applyGate(none, null, false, "GO").canApply, false);
  const full = previewOf([pb({ next: null, examined: 1300, changed: 5 })]);
  assert.equal(applyGate(full, null, true, "GO").state, "RUNNING");
  assert.equal(applyGate(full, null, true, "GO").canApply, false);
  const done = mergeApplyBatch(newApplyAcc("AB"), ab({ next: null }), null);
  assert.equal(applyGate(full, done, false, "GO").state, "APPLIED");
  const half = mergeApplyBatch(newApplyAcc("AB"), ab({ next: "c1", written: 3 }), null);
  const g = applyGate(full, half, false, "GO");
  assert.deepEqual([g.state, g.canApply], ["RESUMABLE", true]);
});

test("apply batches fold into exact totals; a replayed or out-of-order batch is ignored whole (no double counting)", () => {
  let a = newApplyAcc("AB");
  a = mergeApplyBatch(a, ab({ next: "c1", changed: 4, written: 4, tombstonesCreated: 3, transitions: { "fit:VERIFIED_REPAIR->EXCLUDED": 4 } }), null);
  assert.equal(mergeApplyBatch(a, ab({ next: "c1", changed: 4, written: 4 }), null).written, 4, "same starting cursor again");
  assert.equal(mergeApplyBatch(a, ab({ next: "c9", written: 9 }), "zzz").written, 4, "wrong starting cursor");
  a = mergeApplyBatch(a, ab({ next: null, examined: 300, changed: 2, written: 1, skipped: 1, tombstonesCreated: 1, transitions: { "fit:VERIFIED_REPAIR->EXCLUDED": 2 } }), "c1");
  assert.deepEqual([a.examined, a.changed, a.written, a.skipped, a.tombstonesCreated, a.batches, a.done, a.cursor, a.transitions["fit:VERIFIED_REPAIR->EXCLUDED"]], [800, 6, 5, 1, 4, 2, true, null, 6]);
  assert.equal(mergeApplyBatch(a, ab({ next: null, written: 1 }), null).written, 5, "a finished apply accepts nothing more");
});

test("progress is accurate: never 100 % until the walk finished, never above 100", () => {
  assert.equal(progressPct(0, 0, false), 0);
  assert.equal(progressPct(500, 1300, false), 38);
  assert.equal(progressPct(1300, 1300, false), 99);
  assert.equal(progressPct(1300, 1300, true), 100);
  assert.equal(progressPct(5000, 1300, false), 99);
});
