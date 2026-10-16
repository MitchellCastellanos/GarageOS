// Run quality gate (pure) + the Python→TypeScript contract: records exactly as the extractor emits them for realistic Overture rows must stage WITH coordinates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateRunQuality, MIN_COORDINATE_SHARE } from "../src/domain/lead-radar/run-quality";
import { toCandidate } from "../src/domain/lead-radar/record";
import { cityKey } from "../src/domain/sales-crm/territory";

const base = { expectedRecords: 100, receivedRecords: 100, rejectedRecords: 0, recordsWithPoint: 100, pointsAccepted: 100, stats: { rowGroupsScanned: 5, rowsExamined: 5000, rowsEmitted: 100 } };

test("a healthy run passes with exact counters", () => {
  const q = evaluateRunQuality(base);
  assert.equal(q.verdict, "OK"); assert.equal(q.blocking, false);
  assert.deepEqual(q.counters, { received: 100, rejected: 0, withPoint: 100, pointsAccepted: 100, pointsInvalid: 0, pointsMissing: 0 });
  assert.equal(q.rates.coverage, 1);
});

test("zero accepted coordinates can never succeed silently — at any size", () => {
  for (const n of [1, 3, 25, 10_000]) {
    const q = evaluateRunQuality({ ...base, expectedRecords: n, receivedRecords: n, recordsWithPoint: 0, pointsAccepted: 0 });
    assert.equal(q.verdict, "NO_COORDINATES", `n=${n}`); assert.equal(q.blocking, true);
  }
  const rejected = evaluateRunQuality({ ...base, recordsWithPoint: 100, pointsAccepted: 0 });
  assert.equal(rejected.verdict, "ALL_COORDINATES_REJECTED"); assert.equal(rejected.blocking, true);
});

test("coverage below the minimum share blocks (only with a meaningful sample); small samples with some positions pass", () => {
  const low = evaluateRunQuality({ ...base, recordsWithPoint: 70, pointsAccepted: 70 });
  assert.equal(low.verdict, "LOW_COORDINATE_COVERAGE"); assert.equal(low.blocking, true);
  const edge = evaluateRunQuality({ ...base, recordsWithPoint: MIN_COORDINATE_SHARE * 100, pointsAccepted: MIN_COORDINATE_SHARE * 100 });
  assert.equal(edge.verdict, "OK");
  const tiny = evaluateRunQuality({ ...base, expectedRecords: 5, receivedRecords: 5, recordsWithPoint: 3, pointsAccepted: 3 });
  assert.equal(tiny.verdict, "OK", "ratios need a sample; below it only the 'none at all' rules apply");
});

test("legitimate zero-result runs are distinguished from extraction failures", () => {
  const empty = { ...base, expectedRecords: 0, receivedRecords: 0, recordsWithPoint: 0, pointsAccepted: 0 };
  assert.equal(evaluateRunQuality({ ...empty, stats: { rowGroupsScanned: 2, rowsExamined: 410, rowsEmitted: 0 } }).verdict, "ZERO_RESULTS_LEGIT");
  assert.equal(evaluateRunQuality({ ...empty, stats: { rowGroupsScanned: 2, rowsExamined: 410, rowsEmitted: 0 } }).blocking, false);
  assert.equal(evaluateRunQuality({ ...empty, stats: { rowGroupsScanned: 2, rowsExamined: 0, rowsEmitted: 0 } }).verdict, "EXTRACTION_EMPTY_SUSPECT");
  assert.equal(evaluateRunQuality({ ...empty, stats: null }).verdict, "EXTRACTION_EMPTY_SUSPECT");
  assert.equal(evaluateRunQuality({ ...empty, stats: { rowGroupsScanned: 0, rowsExamined: 0 } }).verdict, "EXTRACTION_EMPTY_SUSPECT");
});

test("high rejection and count mismatch block; the most severe verdict wins; nothing divides by zero", () => {
  assert.equal(evaluateRunQuality({ ...base, rejectedRecords: 60, recordsWithPoint: 40, pointsAccepted: 40 }).verdict, "HIGH_REJECTION");
  assert.equal(evaluateRunQuality({ ...base, expectedRecords: 99 }).verdict, "COUNT_MISMATCH");
  const mixed = evaluateRunQuality({ ...base, expectedRecords: 99, recordsWithPoint: 0, pointsAccepted: 0 });
  assert.equal(mixed.verdict, "COUNT_MISMATCH"); assert.ok(mixed.codes.includes("NO_COORDINATES"));
  const allRejected = evaluateRunQuality({ ...base, rejectedRecords: 100, recordsWithPoint: 0, pointsAccepted: 0 });
  assert.equal(allRejected.verdict, "HIGH_REJECTION"); assert.equal(allRejected.rates.coverage, 0);
  // Counters are clamped so a bad upstream tally can never produce a negative or >100 % figure.
  const odd = evaluateRunQuality({ ...base, recordsWithPoint: 500, pointsAccepted: 900 });
  assert.ok(odd.counters.pointsInvalid >= 0 && (odd.rates.coverage ?? 0) <= 1);
});

// ── Cross-language contract ────────────────────────────────────────────────────────────────────────────────────────────────
// tests/fixtures/lead-radar/overture-records.ndjson is produced by scripts/lead-radar/test_extract.py from a Parquet file with the REAL Overture column types
// (float32 bbox). The Python suite asserts the file is exactly what the extractor emits; this test asserts GarageOS stages it with its coordinates intact.
test("contract: real-shaped extractor output for QC / ON / BC / YT / NS stages with a valid source point per province (float32 widening survived)", () => {
  const lines = readFileSync(new URL("./fixtures/lead-radar/overture-records.ndjson", import.meta.url), "utf8").split("\n").filter(Boolean);
  assert.equal(lines.length, 5, "the US row was filtered by the extractor");
  const provinces = new Set<string>();
  for (const l of lines) {
    const r = toCandidate(JSON.parse(l), { provinces: ["QC", "ON", "BC", "YT", "NS"], cityKeys: [] }, { cityKeyOf: cityKey });
    assert.equal(r.ok, true, l);
    if (!r.ok) continue;
    assert.ok(r.candidate.sourceLatitude !== null && r.candidate.sourceLongitude !== null, `${r.candidate.name} keeps its position`);
    assert.equal(r.candidate.sourcePointIssue, null);
    provinces.add(r.candidate.province!);
  }
  assert.deepEqual([...provinces].sort(), ["BC", "NS", "ON", "QC", "YT"]);
});

test("contract: the same point attached to the wrong province is rejected with a reason, never stored", () => {
  const l = JSON.parse(readFileSync(new URL("./fixtures/lead-radar/overture-records.ndjson", import.meta.url), "utf8").split("\n").filter(Boolean)[0]);
  const wrong = { ...l, address: { ...l.address, region: "BC", postcode: "V6H 1H6" } };
  const r = toCandidate(wrong, { provinces: ["BC"], cityKeys: [] }, { cityKeyOf: cityKey });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.candidate.sourceLatitude, null); assert.equal(r.candidate.sourcePointIssue, "OUT_OF_PROVINCE"); }
});
