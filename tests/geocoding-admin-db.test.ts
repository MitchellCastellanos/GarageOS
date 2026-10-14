/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Super Admin geocoding workflow against a REAL PostgreSQL scratch database (all migrations applied). The provider is a LOCAL MOCK:
// no network, no credentials, no paid call. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL replay|test|scratch database.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Geocoding admin database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  delete process.env.GEOCODING_PROVIDER; delete process.env.MAPBOX_GEOCODING_TOKEN; delete process.env.MAPBOX_GEOCODING_ENABLED;
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const geo = await import("../src/actions/sales-geocoding");
  const svc = await import("../src/lib/sales-crm/geocoding-admin-service");
  const field = await import("../src/actions/sales-field");
  const { resolveLocations } = await import("../src/lib/sales-crm/location-service");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { MAPBOX_PROVIDER_KEY } = await import("../src/domain/sales-crm/mapbox-geocoding");

  const run = Date.now().toString(36);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {}; const P: Record<string, string> = {};
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const asRoot = () => setSession({ user: { id: ids.root, role: "SUPER_ADMIN", shopId: null } });
  let root: any;
  type Answer = (query: string) => any;
  let calls: string[] = [];
  let answer: Answer = () => ({ kind: "OK", matches: [{ lat: 45.52, lng: -73.58, accuracy: "ROOFTOP", confidence: 0.95 }] });
  const mock = { key: MAPBOX_PROVIDER_KEY, async geocode(q: string) { calls.push(q); await new Promise((r) => setTimeout(r, 5)); return answer(q); } };
  const reset = () => { calls = []; answer = () => ({ kind: "OK", matches: [{ lat: 45.52, lng: -73.58, accuracy: "ROOFTOP", confidence: 0.95 }] }); };
  const setBudget = async (enabled_: boolean, max: number) => { asRoot(); return geo.saveGeocodingControls({ enabled: enabled_, maxRequests: max }) as Promise<any>; };

  // Scope every service call to THIS suite's prospects, so leftover data from other suites in a shared scratch database cannot interfere or be touched.
  const mine = () => Object.values(P);
  const batch = (opts: Record<string, unknown>) => svc.runGeocodingBatch(root, { ...opts, only: mine() } as any, new Date(), mock as any);
  const overview = () => svc.getGeocodingOverview(root, new Date(), mine());

  async function makeProspect(name: string, over: Record<string, unknown> = {}) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff.Fiona, createdByUserId: ids.root, address: `${200 + Object.keys(P).length} Rue Test`, city: "Montréal", province: "QC", postalCode: "H3B 1A1", ...over } });
    P[name] = p.id; return p;
  }

  test("setup", async () => {
    await db.crmGeocodingSettings.deleteMany(); // the singleton belongs to this feature; start each run from a clean, disabled state
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    const u = await db.user.create({ data: { name: "Fiona", email: `fiona-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: u.id, role: "SALES_REP", status: "ACTIVE", displayName: "Fiona", salesMode: "FIELD", timezone: "America/Toronto" } });
    staff.Fiona = s.id; ids.Fiona = u.id;
    const m = await db.user.create({ data: { name: "Marge", email: `marge-${run}@sales.test`, role: "VIEWER", shopId: null } });
    await db.platformSalesStaff.create({ data: { userId: m.id, role: "SALES_MANAGER", status: "ACTIVE", displayName: "Marge", salesMode: "FIELD", timezone: "America/Toronto" } });
    ids.Marge = m.id;
    for (const n of ["G1", "G2", "G3", "G4"]) await makeProspect(n);
    await makeProspect("NoCivic", { address: "Rue Sans Numero" });
    await makeProspect("Unassigned", { assignedStaffId: null });
    await makeProspect("Dnc", { doNotContact: true });
    await makeProspect("Arch", { status: "ARCHIVED", archivedAt: new Date() });
    root = await resolvePlatformSalesActor(ids.root);
  });

  test("authorization: reps and managers cannot read, configure or run geocoding; nothing happens by default", async () => {
    for (const who of [ids.Fiona, ids.Marge]) {
      as(who);
      await assert.rejects(() => geo.saveGeocodingControls({ enabled: true, maxRequests: 10 }), /SALES_FORBIDDEN/);
      await assert.rejects(() => geo.runGeocoding({ mode: "TEST" }), /SALES_FORBIDDEN/);
      const actor = await resolvePlatformSalesActor(who);
      await assert.rejects(() => svc.getGeocodingOverview(actor!), /SALES_FORBIDDEN/);
      await assert.rejects(() => svc.runGeocodingBatch(actor!, { mode: "TEST" }, new Date(), mock as any), /SALES_FORBIDDEN/);
    }
    as(null); await assert.rejects(() => geo.runGeocoding({ mode: "TEST" }), /SALES_FORBIDDEN/);
    assert.equal(await db.crmProspectLocation.count({ where: { prospectId: { in: Object.values(P) } } }), 0);
  });

  test("fails safe: no provider, switched off, and zero budget all refuse before any request", async () => {
    reset();
    await assert.rejects(() => svc.runGeocodingBatch(root, { mode: "TEST" }, new Date(), null), /GEOCODING_NOT_LIVE/);
    asRoot(); assert.deepEqual(await geo.runGeocoding({ mode: "TEST" }), { ok: false, error: "GEOCODING_NOT_LIVE" }, "no credentials in the test environment → not live");
    await assert.rejects(() => batch({ mode: "TEST" }), /GEOCODING_DISABLED/);
    await setBudget(true, 0);
    await assert.rejects(() => batch({ mode: "TEST" }), /BUDGET_EXHAUSTED/);
    assert.equal(calls.length, 0);
  });

  test("budget input is validated against the hard cap and never lowered below usage", async () => {
    asRoot();
    assert.deepEqual(await geo.saveGeocodingControls({ enabled: true, maxRequests: -1 }), { ok: false, error: "INVALID_BUDGET" });
    assert.deepEqual(await geo.saveGeocodingControls({ enabled: true, maxRequests: 1.5 }), { ok: false, error: "INVALID_BUDGET" });
    assert.deepEqual(await geo.saveGeocodingControls({ enabled: true, maxRequests: 501 }), { ok: false, error: "INVALID_BUDGET" }, "default hard cap is 500");
    assert.equal(((await geo.saveGeocodingControls({ enabled: true, maxRequests: 3 })) as any).settings.maxRequests, 3);
  });

  test("preview makes no request and counts only eligible, complete addresses", async () => {
    reset();
    const o = await overview();
    assert.equal(o.estimatedRequests, 4); assert.equal(o.counts.toGeocode, 4); assert.equal(o.counts.incomplete, 1);
    assert.ok(o.review.some((r) => r.id === P.NoCivic && r.reason === "NO_CIVIC_NUMBER"));
    assert.ok(!o.samples.some((s) => [P.Unassigned, P.Dnc, P.Arch].includes(s.id)));
    assert.equal(calls.length, 0);
  });

  test("test batch is capped, budget is a hard ceiling, and a spent request is never refunded", async () => {
    reset(); await setBudget(true, 3);
    const r = await batch({ mode: "BATCH" });
    assert.equal(r.attempted, 3); assert.equal(calls.length, 3); assert.equal(r.geocoded, 3);
    assert.equal(r.settings.requestsUsed, 3); assert.equal(r.settings.remaining, 0);
    await assert.rejects(() => batch({ mode: "TEST" }), /BUDGET_EXHAUSTED/);
    assert.equal(calls.length, 3);
  });

  test("idempotent: located prospects are never requested again; only the remainder is", async () => {
    reset(); await setBudget(true, 50);
    const before = await db.crmProspectLocation.count({ where: { prospectId: { in: Object.values(P) }, status: "GEOCODED" } });
    assert.equal(before, 3);
    const r = await batch({ mode: "BATCH" });
    assert.equal(r.attempted, 1); assert.equal(calls.length, 1);
    const again = await batch({ mode: "BATCH" });
    assert.equal(again.attempted, 0); assert.equal(calls.length, 1, "nothing left to locate → zero requests");
    const rows = await db.crmProspectLocation.findMany({ where: { prospectId: { in: Object.values(P) } } });
    assert.equal(rows.length, 4); assert.ok(rows.every((x) => x.provider === MAPBOX_PROVIDER_KEY && x.status === "GEOCODED" && x.latitude !== null));
  });

  test("planner integration: located prospects are usable, assignment and prospect rows are untouched", async () => {
    const p = await db.crmProspect.findUniqueOrThrow({ where: { id: P.G1 } });
    assert.equal(p.assignedStaffId, staff.Fiona);
    const prospects = await db.crmProspect.findMany({ where: { id: { in: [P.G1, P.NoCivic] } } });
    const m = await resolveLocations(prospects);
    assert.equal(m.get(P.G1)!.usable, true); assert.equal(m.get(P.NoCivic)!.usable, false);
    // the seller's own locate action never calls Mapbox: already cached → no provider, and still works without any provider configured
    as(ids.Fiona);
    const r: any = await field.requestGeocoding([P.G1]);
    assert.equal(r.results[0].outcome, "CACHED");
  });

  test("ambiguous and failed answers store NO coordinates, go to manual review, and are not re-requested until retried", async () => {
    reset(); await setBudget(true, 60);
    const amb = await makeProspect("Amb");
    answer = () => ({ kind: "OK", matches: [{ lat: 45.5, lng: -73.5, accuracy: "ROOFTOP", confidence: 0.9 }, { lat: 45.6, lng: -73.7, accuracy: "ROOFTOP", confidence: 0.9 }] });
    let r = await batch({ mode: "TEST" });
    assert.equal(r.needsReview, 1); assert.equal(r.geocoded, 0);
    const loc = await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: amb.id } });
    assert.equal(loc.status, "AMBIGUOUS"); assert.equal(loc.latitude, null); assert.equal(loc.failureCode, "MULTIPLE_MATCHES");
    let o = await overview();
    assert.ok(o.review.some((x) => x.id === amb.id && x.reason === "AMBIGUOUS" && x.retryable));
    reset();
    r = await batch({ mode: "BATCH" });
    assert.equal(r.attempted, 0, "reviewed items are not re-requested automatically");
    // explicit retry (after the address was fixed or the answer improved)
    r = await batch({ mode: "RETRY", prospectIds: [amb.id, P.G1] });
    assert.equal(r.attempted, 1, "READY prospects are refused for retry");
    assert.equal(r.items.find((i) => i.prospectId === P.G1)!.outcome, "NOT_ELIGIBLE");
    assert.equal((await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: amb.id } })).status, "GEOCODED");
    o = await overview(); assert.ok(!o.review.some((x) => x.id === amb.id));
  });

  test("transient errors are stored retryable; rejected credentials / rate limits stop the batch and store nothing", async () => {
    reset(); await setBudget(true, 100);
    const e1 = await makeProspect("E1"), e2 = await makeProspect("E2");
    answer = () => ({ kind: "ERROR", code: "PROVIDER_ERROR" });
    let r = await batch({ mode: "BATCH" });
    assert.equal(r.failed, 2);
    assert.equal((await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: e1.id } })).status, "ERROR");
    reset();
    r = await batch({ mode: "BATCH" });
    assert.equal(r.attempted, 0, "errors are only retried explicitly");
    answer = () => ({ kind: "ERROR", code: "AUTH" });
    r = await batch({ mode: "BATCH", includeErrors: true });
    assert.equal(r.stoppedReason, "AUTH"); assert.equal(r.attempted, 1, "stops at the first rejected request");
    assert.equal((await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: e2.id } })).attempts, 1, "no attempt recorded for an auth/rate-limit stop");
    answer = () => ({ kind: "ERROR", code: "RATE_LIMITED" });
    r = await batch({ mode: "BATCH", includeErrors: true });
    assert.equal(r.stoppedReason, "RATE_LIMITED");
  });

  test("only one batch at a time (lease): a concurrent click cannot double-spend", async () => {
    reset(); await setBudget(true, 200);
    for (const n of ["C1", "C2", "C3"]) await makeProspect(n);
    const [a, b] = await Promise.allSettled([batch({ mode: "BATCH" }), batch({ mode: "BATCH" })]);
    const fulfilled = [a, b].filter((x) => x.status === "fulfilled"), rejected = [a, b].filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    assert.equal(fulfilled.length, 1); assert.equal(rejected.length, 1); assert.match(String(rejected[0].reason), /RUN_IN_PROGRESS/);
    assert.equal(calls.length, 3, "each prospect requested exactly once");
    const s = await db.crmGeocodingSettings.findUniqueOrThrow({ where: { id: "default" } });
    assert.equal(s.runLeaseUntil, null, "lease released");
  });

  test("audit trail: counts only (no addresses, coordinates or secrets)", async () => {
    const ev = await db.crmAuditEvent.findMany({ where: { action: "GEOCODING_BATCH_RUN", actorUserId: ids.root } });
    assert.ok(ev.length >= 3);
    for (const e of ev) { const j = JSON.stringify(e.metadata); assert.ok(!/Rue|lat|lng|sk\.|pk\./i.test(j), j); }
  });
}
