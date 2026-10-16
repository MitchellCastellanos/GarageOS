/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// End-to-end recovery of source positions on a REAL scratch PostgreSQL: candidates imported BEFORE positions existed (extractor 1.0/1.1 lost them), a position file,
// preview → apply → free backfill → Field Planner markers; no paid request, no new candidates or prospects, better positions never overwritten, bad points refused.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Source-points refresh database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  delete process.env.GEOCODING_PROVIDER; delete process.env.MAPBOX_GEOCODING_TOKEN; delete process.env.MAPBOX_GEOCODING_ENABLED;
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const geo = await import("../src/actions/sales-geocoding");
  const field = await import("../src/actions/sales-field");
  const staging = await import("../src/lib/lead-radar/staging");
  const importLib = await import("../src/lib/lead-radar/import-service");
  const pts = await import("../src/lib/lead-radar/points-refresh");
  const svc = await import("../src/lib/sales-crm/source-location-service");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { canonicalScope } = await import("../src/domain/lead-radar/scope");
  const { OVERTURE_LOCATION_PROVIDER } = await import("../src/domain/sales-crm/source-location");

  const run = Date.now().toString(36);
  const ids: Record<string, string> = {}, staff: Record<string, string> = {};
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const asRoot = () => setSession({ user: { id: ids.root, role: "SUPER_ADMIN", shopId: null } });
  let root: any, runId = "";
  const rec = (n: number, o: Record<string, unknown> = {}) => ({
    v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Garage Pts ${run} ${n}`,
    taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null },
    address: { freeform: `${400 + n} Rue Pts`, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" },
    phones: [`+15145${String(600000 + n)}`], websites: [`https://pts-${run}-${n}.example.ca/`], emails: [], sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "foursquare", license: "Apache-2.0" }], ...o,
  });
  const stage = (rs: unknown[]) => db.$transaction((tx) => staging.stageChunk(tx, { id: runId, scope: canonicalScope({ provinces: ["QC"] }), release: "2026-09-23.1" }, rs.map((r) => JSON.stringify(r)).join("\n")));
  const cand = (n: number) => db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { source_sourceRecordId: { source: "OVERTURE", sourceRecordId: rec(n).id } } });
  const loc = (id: string) => db.crmProspectLocation.findUnique({ where: { prospectId: id } });
  const file = (items: { n?: number; id?: string; lat?: unknown; lng?: unknown }[]) => items.map((i) => JSON.stringify({ id: i.id ?? rec(i.n!).id, lat: i.lat, lng: i.lng })).join("\n");
  const P: Record<number, string> = {};

  test("setup: candidates staged by the OLD extractor (no positions) and imported; a seller owns the prospects", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    const u = await db.user.create({ data: { name: "Fiona", email: `fiona-${run}@sales.test`, role: "VIEWER", shopId: null } });
    staff.Fiona = (await db.platformSalesStaff.create({ data: { userId: u.id, role: "SALES_REP", status: "ACTIVE", displayName: "Fiona", salesMode: "FIELD", timezone: "America/Toronto", acceptsAutoAssignment: true } })).id; ids.Fiona = u.id;
    runId = (await db.crmDiscoveryRun.create({ data: { source: "OVERTURE", sourceRelease: "2026-09-23.1", scope: canonicalScope({ provinces: ["QC"] }) as any, planHash: "c".repeat(64), createdByUserId: ids.root, status: "COMPLETED" } })).id;
    root = await resolvePlatformSalesActor(ids.root);
    const t = await stage([rec(1), rec(2), rec(3), rec(4), rec(5)]);                      // NO geo: exactly what the lost-bbox extraction uploaded
    assert.deepEqual([t.withPoint, t.pointsAccepted, t.issues.POINT_MISSING], [0, 0, 5], "the tally shows the failure instead of hiding it");
    const cs = await Promise.all([1, 2, 3, 4].map(cand));
    await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: cs.map((c) => c.id) } }, data: { reviewState: "APPROVED" } });
    const r = await importLib.importApprovedCandidates(root, { ids: cs.map((c) => c.id) });
    assert.equal(r.created, 4);
    for (const n of [1, 2, 3, 4]) P[n] = (await cand(n)).importedProspectId!;
    await db.crmProspect.updateMany({ where: { id: { in: Object.values(P) } }, data: { assignedStaffId: staff.Fiona } });
    for (const n of [1, 2, 3, 4]) assert.equal(await loc(P[n]), null);
  });

  test("the bug is visible: the free backfill examines 0 candidates, and diagnostics say why", async () => {
    const r = await svc.runSourceLocationBackfill(root, { dryRun: true });
    assert.deepEqual([r.scanned, r.located], [0, 0]);
    const d = await pts.pointDiagnostics(root);
    assert.equal(d.database.pointColumnsPresent, true);
    assert.ok(d.database.migrations?.some((m) => m.name === "20261017090000_prospect_source_coordinates" && m.finishedAt), "the migration is read from _prisma_migrations");
    assert.deepEqual([d.candidates.total, d.candidates.withPoint, d.candidates.imported, d.candidates.importedWithoutPoint], [5, 0, 4, 4]);
  });

  test("authorization: only a Super Admin can preview, apply or read diagnostics", async () => {
    as(ids.Fiona);
    for (const f of [() => geo.refreshSourcePointsAction({ text: file([{ n: 1, lat: 45.5, lng: -73.6 }]), apply: false }), () => geo.loadPointDiagnosticsAction()] as any[]) {
      await assert.rejects(async () => { const r: any = await f(); if (r?.ok === false) throw new Error("denied"); });
    }
    await assert.rejects(pts.refreshSourcePoints(await resolvePlatformSalesActor(ids.Fiona) as any, "", { apply: false }));
  });

  test("preview is read-only and classifies every line; invalid, out-of-province, unknown ids and garbage are refused with reasons", async () => {
    const text = [
      file([{ n: 1, lat: 45.5088158, lng: -73.5617027 }, { n: 2, lat: 45.52, lng: -73.58 }, { n: 3, lat: 45.53, lng: -73.59 }, { n: 4, lat: 51.05, lng: -114.07 }]), // 4 = Calgary for a Québec business
      file([{ n: 5, lat: 10, lng: 10 }]),                                    // outside Canada
      file([{ id: "00000000-0000-4000-8000-ffffffffffff", lat: 45.5, lng: -73.5 }]), // not staged
      "not json", JSON.stringify({ id: rec(1).id, lat: "45.5", lng: -73.5 }),         // malformed
    ].join("\n");
    asRoot();
    const pre: any = await geo.refreshSourcePointsAction({ text, apply: false });
    assert.equal(pre.ok, true);
    const rep = pre.report;
    assert.deepEqual([rep.dryRun, rep.wouldUpdate, rep.updated, rep.importedAmongUpdated], [true, 3, 0, 3]);
    assert.deepEqual(rep.skipped, { OUT_OF_PROVINCE: 1, OUT_OF_CANADA: 1, NOT_STAGED: 1, MALFORMED: 2 });
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { sourceLatitude: { not: null } } }), 0, "preview wrote nothing");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_POINTS_REFRESHED" as any } }), 0, "preview writes no audit row");
    (globalThis as any).__text = text;
  });

  test("apply attaches positions ONLY to existing candidates; idempotent; nothing else changes; no paid request; no duplicate candidates or prospects", async () => {
    const before = { cands: await db.crmDiscoveryCandidate.count(), prospects: await db.crmProspect.count(), c1: await cand(1) };
    asRoot();
    const text = (globalThis as any).__text as string;
    const a: any = await geo.refreshSourcePointsAction({ text, apply: true });
    assert.equal(a.ok, true); assert.equal(a.report.updated, 3);
    const again: any = await geo.refreshSourcePointsAction({ text, apply: true });
    assert.equal(again.report.updated, 0); assert.equal(again.report.skipped.UNCHANGED, 3, "idempotent");
    const c1 = await cand(1);
    assert.deepEqual([c1.sourceLatitude, c1.sourceLongitude], [45.5088158, -73.5617027]);
    assert.deepEqual([c1.lastRunId, c1.contentFingerprint, c1.reviewState, c1.importState, c1.importedProspectId, c1.qualificationLane], [before.c1.lastRunId, before.c1.contentFingerprint, before.c1.reviewState, before.c1.importState, before.c1.importedProspectId, before.c1.qualificationLane], "only the point moved");
    assert.deepEqual([(await cand(4)).sourceLatitude, (await cand(5)).sourceLatitude], [null, null], "rejected points are not stored");
    assert.deepEqual([await db.crmDiscoveryCandidate.count(), await db.crmProspect.count()], [before.cands, before.prospects], "no duplicate candidate or prospect");
    assert.equal(await db.crmGeocodingSettings.count(), 0, "no geocoding budget or provider was touched");
    const audit = await db.crmAuditEvent.findFirst({ where: { action: "LEAD_RADAR_POINTS_REFRESHED" as any } });
    assert.ok(audit && !JSON.stringify(audit.metadata).includes("45.5"), "audit holds counts only");
  });

  test("the free preview moves from 0 to a real number; better positions are never overwritten; apply is idempotent and creates map markers", async () => {
    // p3 already has a human-verified position: it must be kept.
    const p3 = await db.crmProspect.findUniqueOrThrow({ where: { id: P[3] } });
    const { addressFingerprint } = await import("../src/domain/sales-crm/geocoding");
    await db.crmProspectLocation.create({ data: { prospectId: P[3], status: "VERIFIED", latitude: 45.9, longitude: -73.9, provider: "manual", addressFingerprint: addressFingerprint(p3), verifiedAt: new Date(), verifiedByUserId: ids.root } });
    const dry = await svc.runSourceLocationBackfill(root, { dryRun: true });
    assert.deepEqual([dry.scanned, dry.located, dry.skipped.HIGHER_CONFIDENCE_EXISTS], [3, 2, 1], "was 0 before the refresh");
    assert.equal(await db.crmProspectLocation.count({ where: { provider: OVERTURE_LOCATION_PROVIDER } }), 0, "dry-run wrote nothing");
    const applied = await svc.runSourceLocationBackfill(root, { dryRun: false });
    assert.equal(applied.located, 2);
    assert.equal((await loc(P[3]))!.status, "VERIFIED"); assert.equal((await loc(P[3]))!.latitude, 45.9);
    assert.equal((await svc.runSourceLocationBackfill(root, { dryRun: false })).located, 0, "idempotent");
    as(ids.Fiona);
    const v: any = await field.loadFieldMapViewport({ bbox: { west: -74.5, south: 45.0, east: -73.0, north: 46.2 }, zoom: 16 });
    assert.equal(v.ok, true);
    const names = v.points.map((p: any) => p.name);
    assert.ok(names.some((nm: string) => nm.includes(`Pts ${run} 1`)) && names.some((nm: string) => nm.includes(`Pts ${run} 2`)) && names.some((nm: string) => nm.includes(`Pts ${run} 3`)), "usable Field Planner markers exist");
    assert.ok(!names.some((nm: string) => nm.includes(`Pts ${run} 4`)), "the rejected-point prospect has no marker (nothing invented)");
  });

  test("a refreshed staging run of an already-imported candidate stores the point, counts it, and creates no prospect", async () => {
    const prospects = await db.crmProspect.count();
    const t = await stage([rec(4, { geo: { lat: 45.54, lng: -73.6 } }), rec(6, { geo: { lat: 45.55, lng: -73.61 } }), rec(7, { geo: { lat: 10, lng: 10 } })]);
    assert.deepEqual([t.withPoint, t.pointsAccepted, t.pointsOnExisting, t.pointsOnNew, t.issues.POINT_OUT_OF_CANADA], [3, 2, 1, 1, 1]);
    assert.equal((await cand(4)).sourceLatitude, 45.54);
    assert.equal(await db.crmProspect.count(), prospects, "staging never creates CRM prospects");
    const d = await pts.pointDiagnostics(root);
    assert.ok(d.candidates.importedWithPoint >= 4 && d.lastRun?.id === runId);
  });
}
