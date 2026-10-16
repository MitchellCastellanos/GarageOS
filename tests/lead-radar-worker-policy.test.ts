import assert from "node:assert/strict";
import test from "node:test";
import { afterFailedAttempt, backoffMs, dueProvinces, MAX_ATTEMPTS, parseLatestRelease, type ProvinceState } from "../src/domain/lead-radar/worker-policy";

const NOW = new Date("2026-11-20T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const st = (province: ProvinceState["province"], o: Partial<ProvinceState> = {}): ProvinceState => ({ province, autoRefresh: true, paused: false, refreshIntervalDays: 90, lastSuccessRelease: "2026-09-23.1", lastSuccessAt: day(100), lastFailureAt: null, ...o });

test("retry policy: bounded attempts with growing backoff, then exhausted", () => {
  const a1 = afterFailedAttempt(0, NOW), a2 = afterFailedAttempt(1, NOW), a3 = afterFailedAttempt(MAX_ATTEMPTS - 1, NOW);
  assert.deepEqual([a1.exhausted, a2.exhausted, a3.exhausted], [false, false, true]);
  assert.ok(a1.nextAttemptAt!.getTime() - NOW.getTime() === backoffMs(1) && backoffMs(2) > backoffMs(1) && backoffMs(3) > backoffMs(2));
  assert.equal(a3.nextAttemptAt, null);
});

test("release parsing only trusts a well-formed Overture release id", () => {
  assert.equal(parseLatestRelease({ latest: "2026-11-18.0" }), "2026-11-18.0");
  for (const bad of [null, {}, { latest: "../../etc" }, { latest: 5 }, { latest: "latest" }, { latest: "2026-11-18.0; rm -rf" }]) assert.equal(parseLatestRelease(bad), null);
});

test("nothing is scheduled unless a province is opted in; paused or busy provinces are skipped; no release known → nothing", () => {
  const states = [st("ON", { autoRefresh: false }), st("QC", { paused: true }), st("BC"), st("AB")];
  const due = dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states, activeRuns: [{ provinces: ["BC"], status: "INGESTING", scheduled: false }], limit: 10 });
  assert.deepEqual(due.map((d) => d.province), ["AB"]);
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: null, states, activeRuns: [] }), []);
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON", { autoRefresh: false })], activeRuns: [], limit: 10 }), []);
});

test("freshness: only a NEWER release after the minimum interval is due; a never-extracted opted-in province is due; one automatic run in flight at most", () => {
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-09-23.1", states: [st("ON")], activeRuns: [] }), [], "same release → nothing to do");
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON", { lastSuccessAt: day(10) })], activeRuns: [] }), [], "interval not elapsed");
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON")], activeRuns: [] }), [{ province: "ON", reason: "NEW_RELEASE" }]);
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("NB", { lastSuccessAt: null, lastSuccessRelease: null })], activeRuns: [] }), [{ province: "NB", reason: "NEVER_EXTRACTED" }]);
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON")], activeRuns: [{ provinces: ["QC"], status: "PLANNED", scheduled: true }] }), [], "bounded: one automatic run at a time");
  const many = dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON", { lastSuccessAt: day(100) }), st("BC", { lastSuccessAt: day(200) })], activeRuns: [], limit: 1 });
  assert.deepEqual(many.map((d) => d.province), ["BC"], "oldest data first, one at a time");
});

test("a failed automatic attempt cools the province down for 24 h, a later success clears it", () => {
  assert.deepEqual(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON", { lastFailureAt: new Date(NOW.getTime() - 3600_000) })], activeRuns: [] }), []);
  assert.equal(dueProvinces({ now: NOW, latestRelease: "2026-11-18.0", states: [st("ON", { lastFailureAt: new Date(NOW.getTime() - 25 * 3600_000) })], activeRuns: [] }).length, 1);
});
