/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Automatic prospect geolocation against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data, LOCAL mock provider:
// no network, no credentials, no paid call. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL replay|test|scratch database.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Prospect source-location database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  delete process.env.GEOCODING_PROVIDER; delete process.env.MAPBOX_GEOCODING_TOKEN; delete process.env.MAPBOX_GEOCODING_ENABLED;
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const geoActions = await import("../src/actions/sales-geocoding");
  const staging = await import("../src/lib/lead-radar/staging");
  const importLib = await import("../src/lib/lead-radar/import-service");
  const svc = await import("../src/lib/sales-crm/source-location-service");
  const gsvc = await import("../src/lib/sales-crm/geocoding-admin-service");
  const route = await import("../src/lib/sales-crm/field-route-service");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { canonicalScope } = await import("../src/domain/lead-radar/scope");
  const { OVERTURE_LOCATION_PROVIDER } = await import("../src/domain/sales-crm/source-location");
  const { MAPBOX_PROVIDER_KEY } = await import("../src/domain/sales-crm/mapbox-geocoding");

  const run = Date.now().toString(36);
  const ids: Record<string, string> = {}, staff: Record<string, string> = {};
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const asRoot = () => setSession({ user: { id: ids.root, role: "SUPER_ADMIN", shopId: null } });
  let root: any, runId = "";
  const NOW = new Date();
  const PH = String(Date.now() % 100000).padStart(5, "0");

  const rec = (n: number, o: Record<string, unknown> = {}) => ({
    v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Garage Geo ${run} ${n}`,
    taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"], alternates: null },
    address: { freeform: `${300 + n} Rue Geo`, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" },
    phones: [`+1514${PH}${String(n).padStart(2, "0")}`.slice(0, 12)], websites: [`https://geo-${run}-${n}.example.ca/`], emails: [],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], ...o,
  });
  const stage = (rs: unknown[]) => db.$transaction((tx) => staging.stageChunk(tx, { id: runId, scope: canonicalScope({ provinces: ["QC"] }), release: "2026-09-23.1" }, rs.map((r) => JSON.stringify(r)).join("\n")));
  const cand = (n: number) => db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { source_sourceRecordId: { source: "OVERTURE", sourceRecordId: rec(n).id } } });
  const loc = (prospectId: string) => db.crmProspectLocation.findUnique({ where: { prospectId } });
  const approveAndImport = async (ns: number[]) => {
    const cs = await Promise.all(ns.map(cand));
    await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: cs.map((c) => c.id) } }, data: { reviewState: "APPROVED" } });
    const r = await importLib.importApprovedCandidates(root, { ids: cs.map((c) => c.id) });
    return { r, byN: Object.fromEntries(await Promise.all(ns.map(async (n) => [n, (await cand(n)).importedProspectId as string]))) as Record<number, string> };
  };
  const mine = () => db.crmProspect.findMany({ where: { OR: [{ name: { contains: `Geo ${run}` } }, { name: { contains: `Own ${run}` } }] }, select: { id: true } }).then((r) => r.map((x) => x.id));

  test("setup", async () => {
    await db.crmGeocodingSettings.deleteMany();
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    for (const [n, role] of [["Fiona", "SALES_REP"], ["Gina", "SALES_REP"], ["Marge", "SALES_MANAGER"]] as const) {
      const u = await db.user.create({ data: { name: n, email: `${n.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
      const s = await db.platformSalesStaff.create({ data: { userId: u.id, role, status: "ACTIVE", displayName: n, salesMode: "FIELD", timezone: "America/Toronto" } });
      ids[n] = u.id; staff[n] = s.id;
    }
    runId = (await db.crmDiscoveryRun.create({ data: { source: "OVERTURE", sourceRelease: "2026-09-23.1", scope: canonicalScope({ provinces: ["QC"] }) as any, planHash: "a".repeat(64), createdByUserId: ids.root } })).id;
    root = await resolvePlatformSalesActor(ids.root);
  });

  test("staging keeps valid source points and drops invalid ones; re-staging is idempotent and never re-opens approvals", async () => {
    const t = await stage([
      rec(1, { geo: { lat: 45.5088, lng: -73.5617 } }),
      rec(2, { geo: { lat: 51.05, lng: -114.07 } }),   // Calgary point on a Québec address → dropped
      rec(3, { geo: { lat: 40.71, lng: -74.0 } }),     // New York → dropped
      rec(4),                                          // old extractor: no point
      rec(5, { geo: { lat: 45.51, lng: -73.57 } }),
    ]);
    assert.equal(t.rejected, 0);
    const c1 = await cand(1), c2 = await cand(2), c3 = await cand(3), c4 = await cand(4);
    assert.deepEqual([c1.sourceLatitude, c1.sourceLongitude], [45.5088, -73.5617]);
    for (const c of [c2, c3, c4]) assert.deepEqual([c.sourceLatitude, c.sourceLongitude], [null, null]);
    await db.crmDiscoveryCandidate.update({ where: { id: c1.id }, data: { reviewState: "APPROVED" } });
    await stage([rec(1, { geo: { lat: 45.5089, lng: -73.5618 } })]);               // moved point only
    const again = await cand(1);
    assert.deepEqual([again.sourceLatitude, again.reviewState, again.contentFingerprint], [45.5089, "APPROVED", c1.contentFingerprint], "a refreshed point is not a business change");
    await stage([rec(1)]);                                                          // extract without a point never clears it
    assert.equal((await cand(1)).sourceLatitude, 45.5089);
    await db.crmDiscoveryCandidate.update({ where: { id: c1.id }, data: { reviewState: "PENDING" } });
  });

  test("the database refuses half or out-of-Canada source points", async () => {
    const c = await cand(1);
    await assert.rejects(db.$executeRaw`UPDATE "garageos"."CrmDiscoveryCandidate" SET "sourceLongitude" = NULL WHERE id = ${c.id}`, /check|constraint/i);
    await assert.rejects(db.$executeRaw`UPDATE "garageos"."CrmDiscoveryCandidate" SET "sourceLatitude" = 10, "sourceLongitude" = 10 WHERE id = ${c.id}`, /check|constraint/i);
  });

  test("new imports are located at import time, for free, without touching assignment or outreach eligibility", async () => {
    const { r, byN } = await approveAndImport([1, 5]);
    assert.equal(r.created, 2);
    for (const n of [1, 5]) {
      const l = await loc(byN[n]);
      assert.deepEqual([l?.status, l?.provider, l?.accuracy, l?.confidence, l?.attempts], ["GEOCODED", OVERTURE_LOCATION_PROVIDER, "STREET", null, 0]);
      assert.ok(l!.latitude && l!.longitude && l!.geocodedAt);
      const p = await db.crmProspect.findUniqueOrThrow({ where: { id: byN[n] } });
      assert.equal(p.assignedStaffId, null, "import stays unassigned");
    }
    assert.equal(await db.crmOutreachEligibility.count({ where: { prospectId: { in: [byN[1], byN[5]] } } }), 0);
    const audit = await db.crmAuditEvent.findFirst({ where: { action: "LEAD_RADAR_IMPORT_COMPLETED" as any }, orderBy: { createdAt: "desc" } });
    assert.equal((audit!.metadata as any).positions.located, 2);
    assert.equal(await db.crmGeocodingSettings.count(), 0, "no provider budget touched");
  });

  test("imports of candidates WITHOUT a point create prospects with no position (pending, never invented)", async () => {
    const { byN } = await approveAndImport([2, 3, 4]);
    for (const n of [2, 3, 4]) assert.equal(await loc(byN[n]), null);
  });

  test("backfill: dry-run writes nothing; apply writes once; a repeated run is a no-op; assignments and prospect rows are untouched", async () => {
    // Older extract: the prospects exist, their candidates just got a point from a refreshed extraction.
    await stage([rec(2, { geo: { lat: 45.52, lng: -73.58 } }), rec(3, { geo: { lat: 45.53, lng: -73.59 } }), rec(4, { geo: { lat: 45.54, lng: -73.60 } })]);
    const c2 = await cand(2), c3 = await cand(3), c4 = await cand(4);
    assert.ok(c2.sourceLatitude && c3.sourceLatitude && c4.sourceLatitude, "imported candidates also receive the refreshed point");
    assert.equal(c2.importState, "CREATED");
    const p2 = c2.importedProspectId!, p3 = c3.importedProspectId!, p4 = c4.importedProspectId!;
    await db.crmProspect.updateMany({ where: { id: { in: [p2, p3, p4] } }, data: { assignedStaffId: staff.Fiona } }); // the seller owns them
    const before = await db.crmProspect.findMany({ where: { id: { in: [p2, p3, p4] } }, orderBy: { id: "asc" } });

    const auditBase = await db.crmAuditEvent.count({ where: { action: "PROSPECT_LOCATION_BACKFILL" as any } });
    const dry = await svc.runSourceLocationBackfill(root, { dryRun: true });
    assert.equal(dry.dryRun, true); assert.equal(dry.located, 3);
    assert.equal(await db.crmProspectLocation.count({ where: { prospectId: { in: [p2, p3, p4] } } }), 0, "dry-run changes nothing");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "PROSPECT_LOCATION_BACKFILL" as any } }), auditBase, "dry-run writes no audit row");
    assert.equal((await svc.runSourceLocationBackfill(root, {})).dryRun, true, "dry-run is the default");

    const applied = await svc.runSourceLocationBackfill(root, { dryRun: false });
    assert.equal(applied.located, 3); assert.equal(applied.skipped.ALREADY_LOCATED, 2, "the two import-time positions are left alone"); assert.equal(applied.done, true);
    for (const id of [p2, p3, p4]) assert.equal((await loc(id))?.provider, OVERTURE_LOCATION_PROVIDER);
    const stamp = (await loc(p2))!.updatedAt;

    const repeat = await svc.runSourceLocationBackfill(root, { dryRun: false });
    assert.equal(repeat.located, 0, "idempotent"); assert.equal((await loc(p2))!.updatedAt.getTime(), stamp.getTime());
    const after = await db.crmProspect.findMany({ where: { id: { in: [p2, p3, p4] } }, orderBy: { id: "asc" } });
    assert.deepEqual(after, before, "the prospect rows (assignment, status, DNC, address…) are byte-identical");
    assert.equal(await db.crmOutreachEligibility.count({ where: { prospectId: { in: [p2, p3, p4] } } }), 0);
    const audit = await db.crmAuditEvent.findMany({ where: { action: "PROSPECT_LOCATION_BACKFILL" as any }, orderBy: { createdAt: "desc" }, take: 2 });
    assert.equal(await db.crmAuditEvent.count({ where: { action: "PROSPECT_LOCATION_BACKFILL" as any } }) - auditBase, 2); assert.ok(!JSON.stringify(audit.map((a) => a.metadata)).includes("45.5"), "audit holds counts only, never coordinates");
  });

  test("backfill is resumable in bounded pages and a restart converges to the same result", async () => {
    await db.crmProspectLocation.deleteMany({ where: { prospect: { name: { contains: `Geo ${run}` } } } });
    const total = await db.crmDiscoveryCandidate.count({ where: { importedProspectId: { not: null }, sourceLatitude: { not: null }, lastRunId: runId } });
    let cursor: string | null = null, located = 0, pages = 0;
    for (;;) {
      const page: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 2, cursor });
      assert.ok(page.scanned <= 2); located += page.located; pages++;
      if (pages === 2) { cursor = page.nextCursor; break; }   // "crash" after two pages: only the cursor is lost, state lives in the table
      cursor = page.nextCursor;
    }
    const restart: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 }); // restart from scratch
    located += restart.located;
    assert.equal(located, total, "every candidate located exactly once across crash + restart");
    assert.equal(await db.crmProspectLocation.count({ where: { provider: OVERTURE_LOCATION_PROVIDER, prospect: { name: { contains: `Geo ${run}` } } } }), total);
  });

  test("a better position is never replaced, and an ambiguous row IS replaced by a source point", async () => {
    const c2 = await cand(2), c3 = await cand(3), c4 = await cand(4);
    const p = await db.crmProspect.findMany({ where: { id: { in: [c2.importedProspectId!, c3.importedProspectId!, c4.importedProspectId!] } } });
    const fp = async (id: string) => (await loc(id))!.addressFingerprint;
    // p2: paid-geocoder position; p3: human-verified; p4: ambiguous earlier answer.
    await db.crmProspectLocation.update({ where: { prospectId: p[0].id }, data: { provider: MAPBOX_PROVIDER_KEY, latitude: 45.1, longitude: -73.1 } });
    await db.crmProspectLocation.update({ where: { prospectId: p[1].id }, data: { status: "VERIFIED", latitude: 45.2, longitude: -73.2, verifiedAt: new Date() } });
    await db.crmProspectLocation.update({ where: { prospectId: p[2].id }, data: { status: "AMBIGUOUS", provider: MAPBOX_PROVIDER_KEY, latitude: null, longitude: null, geocodedAt: null, accuracy: null, failureCode: "MULTIPLE_MATCHES" } });
    void fp;
    const r = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    assert.equal(r.skipped.HIGHER_CONFIDENCE_EXISTS, 2); assert.equal(r.located, 1);
    assert.deepEqual([(await loc(p[0].id))!.latitude, (await loc(p[0].id))!.provider], [45.1, MAPBOX_PROVIDER_KEY]);
    assert.deepEqual([(await loc(p[1].id))!.latitude, (await loc(p[1].id))!.status], [45.2, "VERIFIED"]);
    assert.equal((await loc(p[2].id))!.status, "GEOCODED");
  });

  test("an address change invalidates the old position and the source point is not applied to a different address", async () => {
    const c2 = await cand(2);
    const pid = c2.importedProspectId!;
    await db.crmProspect.update({ where: { id: pid }, data: { address: "999 Rue Ailleurs" } });
    assert.equal((await route.listCandidates(await resolvePlatformSalesActor(ids.Fiona) as any)).find((c) => c.id === pid)?.coverage, "PENDING", "moved address → position no longer valid");
    const r: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    assert.equal(r.skipped.ADDRESS_MISMATCH, 1, "the candidate describes the old address");
    assert.equal(r.located, 0);
    await db.crmProspect.update({ where: { id: pid }, data: { address: c2.address } });
  });

  test("source points outside the prospect's province are rejected at backfill time too (defence in depth)", async () => {
    const c3 = await cand(3);
    await db.crmProspectLocation.deleteMany({ where: { prospectId: c3.importedProspectId! } });
    await db.crmDiscoveryCandidate.update({ where: { id: c3.id }, data: { sourceLatitude: 51.05, sourceLongitude: -114.07 } }); // Calgary, Québec prospect
    const r: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    assert.equal(r.skipped.OUT_OF_PROVINCE, 1);
    assert.equal(await loc(c3.importedProspectId!), null, "nothing fabricated");
    await db.crmDiscoveryCandidate.update({ where: { id: c3.id }, data: { sourceLatitude: 45.53, sourceLongitude: -73.59 } });
  });

  test("inactive, merged, archived and Do-Not-Contact prospects are not located; duplicate candidates for one prospect locate it once", async () => {
    const [a, b] = await Promise.all([cand(3), cand(4)]);
    await db.crmProspectLocation.deleteMany({ where: { prospectId: { in: [a.importedProspectId!, b.importedProspectId!] } } });
    await db.crmProspect.update({ where: { id: a.importedProspectId! }, data: { doNotContact: true } });
    await db.crmProspect.update({ where: { id: b.importedProspectId! }, data: { archivedAt: new Date() } });
    const r: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    assert.equal(r.skipped.PROSPECT_NOT_ELIGIBLE, 2);
    await db.crmProspect.update({ where: { id: a.importedProspectId! }, data: { doNotContact: false } });
    await db.crmProspect.update({ where: { id: b.importedProspectId! }, data: { archivedAt: null } });
    // duplicate: a second candidate pointing at the same prospect (different point) must not move it or write twice
    const dup = await db.crmDiscoveryCandidate.create({ data: { source: "OVERTURE", sourceRecordId: `dup-${run}-0001`, firstRunId: runId, lastRunId: runId, firstSeenRelease: "x", lastSeenRelease: "x", name: a.name, nameNormalized: a.nameNormalized, address: a.address, city: a.city, province: a.province, postalCode: a.postalCode, tier: "PRIMARY", chainSignal: "NO_CHAIN_SIGNAL", completeness: 50, licenseOk: true, reviewState: "APPROVED", contentFingerprint: "d".repeat(40), importedProspectId: a.importedProspectId, importState: "LINKED", sourceLatitude: 45.6, sourceLongitude: -73.7 } });
    const r2: any = await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    const l = await loc(a.importedProspectId!);
    assert.ok(l && [45.53, 45.6].includes(l.latitude!), "located exactly once");
    const first = l!.latitude;
    await svc.runSourceLocationBackfill(root, { dryRun: false, limit: 500 });
    assert.equal((await loc(a.importedProspectId!))!.latitude, first, "stable across runs");
    assert.ok(r2.located >= 1);
    await db.crmDiscoveryCandidate.delete({ where: { id: dup.id } });
  });

  test("authorization: only a Super Admin reaches the backfill; sellers, managers and anonymous callers are refused and nothing is written", async () => {
    await db.crmProspectLocation.deleteMany({ where: { prospect: { name: { contains: `Geo ${run}` } } } });
    for (const who of ["Fiona", "Marge"] as const) {
      as(ids[who]);
      await assert.rejects(() => geoActions.runSourceLocationBackfillAction({ dryRun: false }), /SALES_FORBIDDEN/);
      const actor = await resolvePlatformSalesActor(ids[who]);
      await assert.rejects(() => svc.runSourceLocationBackfill(actor as any, { dryRun: false }), /SALES_FORBIDDEN/);
      await assert.rejects(() => svc.locationCoverageSummary(actor as any), /SALES_FORBIDDEN/);
    }
    as(null); await assert.rejects(() => geoActions.runSourceLocationBackfillAction({ dryRun: false }), /SALES_FORBIDDEN/);
    assert.equal(await db.crmProspectLocation.count({ where: { prospect: { name: { contains: `Geo ${run}` } } } }), 0);
    asRoot();
    const bad: any = await geoActions.runSourceLocationBackfillAction({ dryRun: "no" as any });
    assert.equal(bad.ok, false);
    const ok: any = await geoActions.runSourceLocationBackfillAction({ dryRun: true });
    assert.equal(ok.ok, true); assert.equal(ok.report.dryRun, true); assert.ok(ok.report.located > 0);
    assert.equal(await db.crmProspectLocation.count({ where: { prospect: { name: { contains: `Geo ${run}` } } } }), 0);
    const applied: any = await geoActions.runSourceLocationBackfillAction({ dryRun: false });
    assert.equal(applied.ok, true); assert.ok(applied.report.located > 0);
  });

  test("Field Planner: a seller sees only her own prospects, located ones are usable, the rest carry an honest coverage bucket", async () => {
    const mk = (name: string, staffId: string | null, over: Record<string, unknown> = {}) => db.crmProspect.create({ data: { name: `${name} Own ${run}`, nameNormalized: `${name}-own-${run}`.toLowerCase(), assignedStaffId: staffId, createdByUserId: ids.root, address: "10 Rue Test", city: "Laval", province: "QC", postalCode: "H7N 1A1", ...over } });
    const noCivic = await mk("NoCivic", staff.Fiona, { address: "Rue Sans Numero" });
    const pending = await mk("Pending", staff.Fiona);
    const amb = await mk("Ambiguous", staff.Fiona);
    const other = await mk("Gina", staff.Gina);
    const { addressFingerprint } = await import("../src/domain/sales-crm/geocoding");
    await db.crmProspectLocation.create({ data: { prospectId: amb.id, status: "AMBIGUOUS", provider: MAPBOX_PROVIDER_KEY, addressFingerprint: addressFingerprint(amb), failureCode: "MULTIPLE_MATCHES", attempts: 1 } });
    const fiona: any = await resolvePlatformSalesActor(ids.Fiona), gina: any = await resolvePlatformSalesActor(ids.Gina);
    const list = await route.listCandidates(fiona);
    const by = (id: string) => list.find((c) => c.id === id);
    assert.equal(by(other.id), undefined, "another seller's prospect is invisible");
    assert.equal(by(noCivic.id)?.coverage, "INSUFFICIENT_ADDRESS");
    assert.equal(by(pending.id)?.coverage, "PENDING");
    assert.equal(by(amb.id)?.coverage, "AMBIGUOUS_FAILED");
    const located = list.filter((c) => c.coverage === "LOCATED");
    assert.ok(located.length >= 3 && located.every((c) => c.location.usable));
    assert.ok(list.filter((c) => c.coverage !== "LOCATED").every((c) => !c.location.usable), "coverage and usability agree");
    assert.deepEqual((await route.listCandidates(gina)).map((c) => c.id), [other.id]);
    // the planner's existing filters still work on the same rows
    assert.deepEqual((await route.listCandidates(fiona, { city: "laval" })).map((c) => c.id).sort(), [noCivic.id, pending.id, amb.id].sort());
    // a located prospect can still be put on a route; an unlocated one still cannot
    const okId = located[0].id;
    const saved: any = await route.saveRouteDraft(fiona, { clientRequestId: `req-${run}-1`, plannedDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), prospectIds: [okId] });
    assert.ok(saved.routeId);
    await assert.rejects(route.saveRouteDraft(fiona, { clientRequestId: `req-${run}-2`, plannedDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), prospectIds: [pending.id] }), /LOCATION_UNAVAILABLE/);
    // coverage summary for the owner
    const sum = await svc.locationCoverageSummary(root);
    assert.ok(sum.byCoverage.LOCATED >= 3 && sum.byCoverage.PENDING >= 1 && sum.byCoverage.AMBIGUOUS_FAILED >= 1 && sum.byCoverage.INSUFFICIENT_ADDRESS >= 1);
  });

  // ── Automatic paid fallback: local mock provider, owner budget, retries ───────────────────────────────────────────────
  let calls: string[] = [], answer: (q: string) => any = () => ({ kind: "OK", matches: [{ lat: 45.55, lng: -73.55, accuracy: "ROOFTOP", confidence: 0.95 }] });
  const mock = { key: MAPBOX_PROVIDER_KEY, async geocode(q: string) { calls.push(q); return answer(q); } };
  const OK = () => ({ kind: "OK", matches: [{ lat: 45.55, lng: -73.55, accuracy: "ROOFTOP", confidence: 0.95 }] });
  const FAR = Date.now() + 60_000;

  test("automatic geocoding is inert by default: no provider, disabled, or no budget means zero requests and zero writes", async () => {
    calls = [];
    assert.deepEqual(await gsvc.autoGeocodeStep(root, FAR, NOW, null), { skipped: "PROVIDER_NOT_LIVE" });
    assert.deepEqual(await gsvc.autoGeocodeStep(root, FAR, NOW, mock as any), { skipped: "GEOCODING_DISABLED" });
    asRoot(); await geoActions.saveGeocodingControls({ enabled: true, maxRequests: 0 });
    assert.deepEqual(await gsvc.autoGeocodeStep(root, FAR, NOW, mock as any), { skipped: "BUDGET_EXHAUSTED" });
    assert.equal(calls.length, 0);
  });

  test("automatic geocoding spends only on assigned prospects with a complete address and no position, within the owner's budget", async () => {
    calls = []; answer = OK;
    asRoot(); await geoActions.saveGeocodingControls({ enabled: true, maxRequests: 2 });
    const pendingBefore = await db.crmProspect.findMany({ where: { name: { contains: `Own ${run}` }, assignedStaffId: staff.Fiona, address: "10 Rue Test" } });
    const r = await gsvc.autoGeocodeStep(root, FAR, NOW, mock as any);
    assert.equal(r.attempted, 2, "budget is a hard ceiling"); assert.equal(calls.length, 2);
    assert.ok(calls.every((q) => !/Sans Numero/.test(q)), "incomplete addresses never reach the provider");
    const again = await gsvc.autoGeocodeStep(root, FAR, NOW, mock as any);
    assert.deepEqual(again, { skipped: "BUDGET_EXHAUSTED" });
    assert.ok(pendingBefore.length >= 1);
    const audit = await db.crmAuditEvent.findFirst({ where: { action: "GEOCODING_BATCH_RUN" as any }, orderBy: { createdAt: "desc" } });
    assert.equal((audit!.metadata as any).automatic, true);
  });

  test("provider failures are retried after a back-off, bounded by attempts; bad credentials fail closed; coverage reflects each state", async () => {
    // fresh prospect that nothing has tried yet
    const p = await db.crmProspect.create({ data: { name: `Retry Own ${run}`, nameNormalized: `retry-own-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, address: "77 Rue Retry", city: "Laval", province: "QC", postalCode: "H7N 1A1" } });
    asRoot(); await geoActions.saveGeocodingControls({ enabled: true, maxRequests: 20 });
    calls = []; answer = () => ({ kind: "ERROR", code: "PROVIDER_ERROR" });
    let t = new Date(NOW);
    await gsvc.autoGeocodeStep(root, FAR, t, mock as any);
    assert.equal((await loc(p.id))!.status, "ERROR"); assert.equal((await loc(p.id))!.attempts, 1);
    const n1 = calls.length;
    await gsvc.autoGeocodeStep(root, FAR, new Date(t.getTime() + 5 * 60_000), mock as any);
    assert.equal(calls.length, n1, "no retry inside the back-off window");
    for (let i = 2; i <= 3; i++) { t = new Date(t.getTime() + 61 * 60_000 * (i - 1)); await gsvc.autoGeocodeStep(root, FAR, t, mock as any); }
    assert.equal((await loc(p.id))!.attempts, 3);
    const n3 = calls.length;
    await gsvc.autoGeocodeStep(root, FAR, new Date(t.getTime() + 6 * 3600_000), mock as any);
    assert.equal(calls.length, n3, "after 3 failures the prospect waits for a human, no more spend");
    const fiona: any = await resolvePlatformSalesActor(ids.Fiona);
    assert.equal((await route.listCandidates(fiona)).find((c) => c.id === p.id)?.coverage, "AMBIGUOUS_FAILED");

    // success path after a human corrects nothing: a different prospect with one failure then a success
    const q = await db.crmProspect.create({ data: { name: `Flaky Own ${run}`, nameNormalized: `flaky-own-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, address: "88 Rue Flaky", city: "Laval", province: "QC", postalCode: "H7N 1A1" } });
    answer = (qq: string) => (/Flaky/.test(qq) ? { kind: "ERROR", code: "TIMEOUT" } : { kind: "NOT_FOUND" });
    const t2 = new Date(t.getTime() + 24 * 3600_000);
    await gsvc.autoGeocodeStep(root, FAR, t2, mock as any);
    assert.equal((await loc(q.id))!.status, "ERROR");
    answer = OK;
    await gsvc.autoGeocodeStep(root, FAR, new Date(t2.getTime() + 61 * 60_000), mock as any);
    assert.equal((await loc(q.id))!.status, "GEOCODED");
    assert.equal((await route.listCandidates(fiona)).find((c) => c.id === q.id)?.coverage, "LOCATED");

    // rejected credentials: stop, switch geocoding off, no further spend
    await db.crmProspect.create({ data: { name: `Auth Own ${run}`, nameNormalized: `auth-own-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, address: "99 Rue Auth", city: "Laval", province: "QC", postalCode: "H7N 1A1" } });
    answer = () => ({ kind: "ERROR", code: "AUTH" }); calls = [];
    const r = await gsvc.autoGeocodeStep(root, FAR, new Date(t2.getTime() + 3 * 3600_000), mock as any);
    assert.equal(r.stoppedReason, "AUTH");
    assert.equal((await db.crmGeocodingSettings.findUniqueOrThrow({ where: { id: "default" } })).enabled, false, "fails closed");
    assert.deepEqual(await gsvc.autoGeocodeStep(root, FAR, new Date(t2.getTime() + 4 * 3600_000), mock as any), { skipped: "GEOCODING_DISABLED" });
  });

  test("the geocoder never overwrites an existing source position, and none of this changed any assignment", async () => {
    const located = await db.crmProspectLocation.findMany({ where: { provider: OVERTURE_LOCATION_PROVIDER, prospect: { name: { contains: `Geo ${run}` } } } });
    assert.ok(located.length > 0);
    calls = []; answer = () => ({ kind: "OK", matches: [{ lat: 45.9, lng: -73.9, accuracy: "ROOFTOP", confidence: 0.99 }] });
    asRoot(); await geoActions.saveGeocodingControls({ enabled: true, maxRequests: 100 });
    const o = await gsvc.getGeocodingOverview(root, NOW, located.map((l) => l.prospectId));
    assert.equal(o.counts.ready + o.counts.incomplete + o.counts.toGeocode + o.counts.review + o.counts.errorRetry, o.counts.eligible);
    assert.equal(o.counts.toGeocode, 0, "located prospects are READY: they cost nothing");
    const prospects = await mine();
    assert.ok(prospects.length > 0);
    assert.equal(await db.crmProspect.count({ where: { id: { in: prospects }, assignedStaffId: { notIn: [staff.Fiona, staff.Gina] }, NOT: { assignedStaffId: null } } }), 0);
  });
}
