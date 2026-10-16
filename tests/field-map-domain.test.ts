import assert from "node:assert/strict";
import test from "node:test";
import { bboxOfRadius, clusterPoints, mapStatusOf, normalizePostalQuery, parseBbox, parseRadius, withinRadius, MAP_STATUSES } from "../src/domain/sales-crm/field-map";

const base = { stage: null, lastVisitOutcome: null, openTaskCount: 0, activityCount: 0 };

test("status: every bucket is reachable and precedence is deterministic", () => {
  assert.equal(mapStatusOf(base), "PENDING");
  assert.equal(mapStatusOf({ ...base, stage: "NEW" }), "PENDING");
  assert.equal(mapStatusOf({ ...base, activityCount: 2 }), "NOT_VISITED");
  assert.equal(mapStatusOf({ ...base, stage: "CONTACTED" }), "NOT_VISITED");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "NO_ANSWER", activityCount: 1 }), "ATTEMPTED");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "NO_ANSWER", openTaskCount: 1 }), "FOLLOW_UP");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "FOLLOW_UP_REQUIRED" }), "FOLLOW_UP");
  assert.equal(mapStatusOf({ ...base, stage: "ENGAGED", openTaskCount: 1 }), "INTERESTED");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "DEMO_DISCUSSED" }), "INTERESTED");
  assert.equal(mapStatusOf({ ...base, stage: "DEMO_SCHEDULED", lastVisitOutcome: "INTERESTED" }), "DEMO_SCHEDULED");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "DEMO_SCHEDULED" }), "DEMO_SCHEDULED");
  assert.equal(mapStatusOf({ ...base, stage: "WON", lastVisitOutcome: "NOT_INTERESTED" }), "WON");
  assert.equal(mapStatusOf({ ...base, stage: "LOST" }), "LOST");
  assert.equal(mapStatusOf({ ...base, lastVisitOutcome: "NOT_INTERESTED", stage: "ENGAGED" }), "LOST", "a refusal wins over an older interest");
  const seen = new Set(MAP_STATUSES.map((s) => s));
  assert.equal(seen.size, 8);
});

test("viewport validation rejects junk and clamps to Canada", () => {
  assert.equal(parseBbox(null), null);
  assert.equal(parseBbox({ west: -73, south: 45, east: -74, north: 46 }), null);
  assert.equal(parseBbox({ west: "a", south: 45, east: -73, north: 46 }), null);
  assert.equal(parseBbox({ west: NaN, south: 45, east: -73, north: 46 }), null);
  assert.deepEqual(parseBbox({ west: -200, south: 0, east: 10, north: 90 }), { west: -141.1, south: 41.5, east: -52, north: 84 });
  assert.equal(parseBbox({ west: 5, south: 0, east: 10, north: 3 }), null, "entirely outside Canada");
});

test("clustering is exact, bounded and deterministic", () => {
  const pts = Array.from({ length: 3000 }, (_, i) => ({ id: `p${i}`, lat: 45.3 + (i % 60) * 0.004, lng: -73.9 + Math.floor(i / 60) * 0.006, status: MAP_STATUSES[i % 8] }));
  const low = clusterPoints(pts, 9);
  assert.equal(low.reduce((a, c) => a + c.count, 0), 3000, "no prospect is dropped by clustering");
  assert.ok(low.length < 40, `few clusters at low zoom (${low.length})`);
  assert.ok(low.every((c) => c.ids.length <= 12));
  const high = clusterPoints(pts, 14);
  assert.ok(high.length > low.length);
  assert.deepEqual(clusterPoints(pts, 12).map((c) => c.key), clusterPoints([...pts].reverse(), 12).map((c) => c.key));
  for (const c of low) assert.equal(Object.values(c.statusCounts).reduce((a, n) => a + (n ?? 0), 0), c.count);
});

test("radius and place helpers", () => {
  const c = { lat: 45.5, lng: -73.57 };
  const pts = [{ id: "a", lat: 45.5, lng: -73.57 }, { id: "b", lat: 45.51, lng: -73.57 }, { id: "c", lat: 45.7, lng: -73.57 }];
  assert.deepEqual(withinRadius(pts, c, 2000).map((p) => p.id), ["a", "b"]);
  const bb = bboxOfRadius(c, 2000);
  assert.ok(bb.west < c.lng && bb.east > c.lng && bb.south < c.lat && bb.north > c.lat);
  assert.equal(parseRadius(5000), 5000); assert.equal(parseRadius(7), null); assert.equal(parseRadius("5000"), null);
  assert.equal(normalizePostalQuery("h3b"), "H3B"); assert.equal(normalizePostalQuery("h3b1a1"), "H3B 1A1"); assert.equal(normalizePostalQuery("laval"), null);
});
