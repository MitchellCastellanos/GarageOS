import assert from "node:assert/strict";
import test from "node:test";
import { nextWindowOpening, pickWeighted, provinceWeights, randomOffset } from "../src/domain/sales-crm/calling-selection";
import { callingWindow } from "../src/domain/sales-crm/phone-eligibility";

// Seeded RNG so the statistical assertions are deterministic.
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test("province weights: √count (a 100× larger province is ~10× likelier), empty provinces dropped, last province down-weighted", () => {
  const w = provinceWeights({ ON: 10_000, QC: 100, AB: 0, BC: 4 }, null);
  assert.deepEqual(w.map((x) => x.province), ["BC", "ON", "QC"]);
  assert.equal(w.find((x) => x.province === "ON")!.weight / w.find((x) => x.province === "QC")!.weight, 10);
  const again = provinceWeights({ ON: 100, QC: 100 }, "qc");
  assert.equal(again.find((x) => x.province === "QC")!.weight, 2.5);
  assert.equal(again.find((x) => x.province === "ON")!.weight, 10);
});

test("balanced draw: Ontario does not dominate, every open province is reached, and the province just worked is chosen less often", () => {
  const counts = { ON: 5000, QC: 300, AB: 120, NS: 40 };
  const draw = (last: string | null, seed: number) => {
    const rng = mulberry32(seed), tally: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const p = pickWeighted(provinceWeights(counts, last), rng)!.province; tally[p] = (tally[p] ?? 0) + 1; }
    return tally;
  };
  const free = draw(null, 7);
  assert.ok(free.ON / 4000 < 0.72, `Ontario share ${free.ON / 4000} (proportional would be ~92%)`);
  for (const p of Object.keys(counts)) assert.ok(free[p] > 100, `${p} reached`);
  const afterQc = draw("QC", 7);
  assert.ok(afterQc.QC < free.QC * 0.5, "the province worked last is down-weighted");
  assert.equal(pickWeighted([], mulberry32(1)), null);
});

test("random offsets stay inside the pool", () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 2000; i++) { const o = randomOffset(7, rng); assert.ok(o >= 0 && o < 7); }
  assert.equal(randomOffset(1, rng), 0); assert.equal(randomOffset(0, rng), 0);
  assert.equal(randomOffset(5, () => 0.999999999), 4);
});

test("next window is computed from the calling-hours rule, never guessed", () => {
  // Wed 2026-10-21 01:00 Toronto (05:00Z): the Ontario window opens at 09:00 EDT = 13:00Z.
  assert.equal(nextWindowOpening("ON", new Date("2026-10-21T05:00:00Z"))!.toISOString(), "2026-10-21T13:00:00.000Z");
  // Already open ⇒ now.
  const open = new Date("2026-10-21T16:00:00Z");
  assert.equal(nextWindowOpening("ON", open)!.getTime(), open.getTime());
  // Weekday evening close at 21:30 local: Wed 21:30 Toronto (01:30Z Thu) is closed, next opening Thu 09:00 EDT.
  assert.equal(callingWindow("ON", new Date("2026-10-22T01:29:00Z")).open, true);
  assert.equal(callingWindow("ON", new Date("2026-10-22T01:30:00Z")).open, false);
  assert.equal(nextWindowOpening("ON", new Date("2026-10-22T01:30:00Z"))!.toISOString(), "2026-10-22T13:00:00.000Z");
  // Saturday opens at 10:00 local: Sat 2026-10-24 09:55 EDT closed, 10:00 open.
  assert.equal(callingWindow("QC", new Date("2026-10-24T13:55:00Z")).open, false);
  assert.equal(nextWindowOpening("QC", new Date("2026-10-24T13:55:00Z"))!.toISOString(), "2026-10-24T14:00:00.000Z");
  // Sunday 18:00 closes, Monday 09:00 opens.
  assert.equal(nextWindowOpening("ON", new Date("2026-10-25T22:00:00Z"))!.toISOString(), "2026-10-26T13:00:00.000Z");
  // Unknown province / zone ⇒ no invented time.
  assert.equal(nextWindowOpening("XX", new Date("2026-10-21T05:00:00Z")), null);
});
