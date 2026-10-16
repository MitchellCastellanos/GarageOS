/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Field Planner 2.0 map + in-place visit result against a REAL scratch PostgreSQL (see field-route-db.test.ts for the gate).
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Field map database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  delete process.env.GEOCODING_PROVIDER;
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const field = await import("../src/actions/sales-field");
  const { addressFingerprint } = await import("../src/domain/sales-crm/geocoding");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {}; const P: string[] = [];
  let n = 0; const key = () => `map-${run}-${++n}-abcdef`;
  const BBOX = { west: -74.2, south: 45.2, east: -73.3, north: 45.9 };

  async function makeStaff(name: string, mode: "FIELD" | "REMOTE") {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role: "SALES_REP", status: "ACTIVE", displayName: name, salesMode: mode, timezone: "America/Toronto" } });
    staff[name] = s.id; ids[name] = user.id;
  }
  async function makeLocated(name: string, owner: string, i: number, over: Record<string, unknown> = {}) {
    const addr = { address: `${100 + i} Rue Test`, city: "Montréal", province: "QC", postalCode: "H3B 1A1" };
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff[owner], createdByUserId: ids.root, ...addr, ...over } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: staff[owner], createdByUserId: ids.root } });
    await db.crmProspectLocation.create({ data: { prospectId: p.id, status: "GEOCODED", latitude: 45.4 + (i % 40) * 0.01, longitude: -73.9 + Math.floor(i / 40) * 0.01, provider: "overture-places-v1", addressFingerprint: addressFingerprint(p), accuracy: "STREET", geocodedAt: new Date() } });
    return p;
  }
  const viewport = async (who: string, over: Record<string, unknown> = {}) => { as(ids[who]); return (await field.loadFieldMapViewport({ bbox: BBOX, zoom: 10, ...over } as any)) as any; };

  test("setup", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    await makeStaff("Fiona", "FIELD"); await makeStaff("Fred", "FIELD"); await makeStaff("Rene", "REMOTE");
    for (let i = 0; i < 60; i++) P.push((await makeLocated(`F${i}`, "Fiona", i)).id);   // 60 > the 25-stop route limit
    await makeLocated("Other", "Fred", 3);
    await makeLocated("Dnc", "Fiona", 5, { doNotContact: true });
    await makeLocated("NoCoords", "Fiona", 6).then((p) => db.crmProspectLocation.update({ where: { prospectId: p.id }, data: { status: "AMBIGUOUS", latitude: null, longitude: null } }));
    await db.crmProspect.create({ data: { name: `Unlocated ${run}`, nameNormalized: `unlocated-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, address: null } });
  });

  test("the map is not limited by the 25-stop route size, and scoped to the seller's own book", async () => {
    const r = await viewport("Fiona", { zoom: 15 });
    assert.equal(r.ok, true);
    assert.equal(r.counts.inView, 60, "all 60 own located prospects; not the other seller's, DNC, or unlocated");
    assert.equal(r.mode, "points"); assert.equal(r.points.length, 60);
    assert.ok(r.points.every((p: any) => p.status === "PENDING"));
    const low = await viewport("Fiona", { zoom: 9 });
    assert.equal(low.mode, "clusters"); assert.equal(low.clusters.reduce((a: number, c: any) => a + c.count, 0), 60);
    const fred = await viewport("Fred");
    assert.equal(fred.counts.inView, 1);
  });

  test("viewport only returns what is inside it, and rejects garbage", async () => {
    const r = await viewport("Fiona", { zoom: 15, bbox: { west: -74.2, south: 45.2, east: -73.3, north: 45.405 } });
    assert.ok(r.counts.inView > 0 && r.counts.inView < 60);
    const bad: any = await viewport("Fiona", { bbox: { west: 1, south: 2, east: 0, north: 3 } });
    assert.equal(bad.ok, false);
  });

  test("remote sellers cannot use the field map", async () => {
    as(ids.Rene);
    await assert.rejects(async () => { const r: any = await field.loadFieldMapViewport({ bbox: BBOX, zoom: 10 }); if (r?.ok === false) throw new Error("denied"); });
  });

  test("visit from the map updates CRM, marker status, and is idempotent", async () => {
    as(ids.Fiona);
    const sid = key();
    const r1: any = await field.submitMapVisit(P[0], { outcome: "INTERESTED", submissionId: sid, note: "Wants a demo" });
    assert.equal(r1.ok, true); assert.equal(r1.replayed, false);
    const r2: any = await field.submitMapVisit(P[0], { outcome: "INTERESTED", submissionId: sid, note: "Wants a demo" });
    assert.equal(r2.replayed, true); assert.equal(r2.activityId, r1.activityId);
    assert.equal(await db.crmActivity.count({ where: { prospectId: P[0], type: "FIELD_VISIT" } }), 1);
    const opp = await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P[0] } });
    assert.equal(opp.stage, "ENGAGED");
    // follow-up creates exactly one task and flips the marker to FOLLOW_UP
    const r3: any = await field.submitMapVisit(P[1], { outcome: "FOLLOW_UP_REQUIRED", submissionId: key(), followUpDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) });
    assert.equal(r3.ok, true); assert.ok(r3.taskId);
    assert.equal(await db.crmTask.count({ where: { prospectId: P[1], status: "OPEN" } }), 1);
    const nr: any = await field.submitMapVisit(P[2], { outcome: "NO_ANSWER", submissionId: key() });
    assert.equal(nr.ok, true);
    const closed: any = await field.submitMapVisit(P[3], { outcome: "NOT_INTERESTED", submissionId: key() });
    assert.equal(closed.ok, true);
    const v = await viewport("Fiona", { zoom: 15 });
    const st = Object.fromEntries(v.points.map((p: any) => [p.id, p.status]));
    assert.equal(st[P[0]], "INTERESTED"); assert.equal(st[P[1]], "FOLLOW_UP"); assert.equal(st[P[2]], "ATTEMPTED"); assert.equal(st[P[3]], "LOST");
    assert.equal(v.counts.byStatus.PENDING, 56);
    // status filter + combined filter
    const f = await viewport("Fiona", { zoom: 15, statuses: ["INTERESTED", "LOST"] });
    assert.equal(f.counts.matching, 2); assert.equal(f.counts.inView, 60);
    const none = await viewport("Fiona", { zoom: 15, statuses: ["INTERESTED"], q: "F9" });
    assert.equal(none.counts.matching, 0);
    // the detail panel reflects the visit
    const d: any = await field.loadFieldProspect(P[1]);
    assert.equal(d.status, "FOLLOW_UP"); assert.equal(d.lastVisit.outcome, "FOLLOW_UP_REQUIRED"); assert.ok(d.nextTask);
  });

  test("a demo without an attendee email creates a DEMO_PREP task, never a meeting", async () => {
    as(ids.Fiona);
    const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const bad: any = await field.submitMapVisit(P[4], { outcome: "DEMO_SCHEDULED", submissionId: key() });
    assert.equal(bad.ok, false, "date required");
    const ok: any = await field.submitMapVisit(P[4], { outcome: "DEMO_SCHEDULED", submissionId: key(), followUpDate: date });
    assert.equal(ok.ok, true);
    assert.equal((await db.crmTask.findFirstOrThrow({ where: { prospectId: P[4] } })).type, "DEMO_PREP");
    assert.equal(await db.crmMeeting.count({ where: { prospectId: P[4] } }), 0);
    const d: any = await field.loadFieldProspect(P[4]); assert.equal(d.status, "DEMO_SCHEDULED");
  });

  test("another seller's prospect cannot be read or visited; same submission id cannot cross prospects", async () => {
    as(ids.Fiona);
    const other = await db.crmProspect.findFirstOrThrow({ where: { assignedStaffId: staff.Fred } });
    const d: any = await field.loadFieldProspect(other.id); assert.equal(d.ok, false);
    const v: any = await field.submitMapVisit(other.id, { outcome: "NO_ANSWER", submissionId: key() }); assert.equal(v.ok, false);
    const sid = key();
    await field.submitMapVisit(P[10], { outcome: "NO_ANSWER", submissionId: sid });
    const x: any = await field.submitMapVisit(P[11], { outcome: "NO_ANSWER", submissionId: sid }); assert.equal(x.ok, false);
  });

  test("visit on the active route marks the stop VISITED in the same transaction", async () => {
    as(ids.Fiona);
    const today = new Date().toISOString().slice(0, 10);
    const saved: any = await field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: [P[20], P[21]] });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const st: any = await field.startFieldRoute(saved.routeId); assert.equal(st.ok, true, JSON.stringify(st));
    const r: any = await field.submitMapVisit(P[21], { outcome: "NO_ANSWER", submissionId: key() });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.stopId);
    const stop = await db.crmFieldRouteStop.findFirstOrThrow({ where: { id: r.stopId } });
    assert.equal(stop.status, "VISITED"); assert.equal(stop.activityId, r.activityId);
    const d: any = await field.loadFieldProspect(P[20]); assert.ok(d.activeStopId);
  });

  test("nearby, place search and territory summary", async () => {
    as(ids.Fiona);
    const near: any = await field.loadFieldNearby({ lat: 45.4, lng: -73.9, radiusM: 5000 });
    assert.equal(near.ok, true); assert.ok(near.points.length > 0); assert.ok(near.points[0].distanceM <= near.points.at(-1).distanceM);
    const badR: any = await field.loadFieldNearby({ lat: 45.4, lng: -73.9, radiusM: 123 }); assert.equal(badR.ok, false);
    const offshore: any = await field.loadFieldNearby({ lat: 0, lng: 0, radiusM: 5000 }); assert.equal(offshore.ok, false);
    const place: any = await field.searchFieldPlace("h3b"); assert.ok(place.place && place.place.count > 0);
    const none: any = await field.searchFieldPlace("Vancouver"); assert.equal(none.place, null);
    const s: any = await field.loadFieldSummary();
    assert.equal(s.total, 62, "60 located + ambiguous + no-address (DNC excluded)");
    assert.equal(s.located, 60); assert.equal(s.coverage.AMBIGUOUS_FAILED + s.coverage.INSUFFICIENT_ADDRESS + s.coverage.PENDING, 2);
    assert.ok(s.unlocatedSample.length === 2);
  });
}
