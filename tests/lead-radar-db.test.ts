/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// National Lead Radar against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data only; no network, no paid calls.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch (same rule as lead-engine-db.test.ts).
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Lead Radar database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const staffActions = await import("../src/actions/sales-staff");
  const radar = await import("../src/actions/lead-radar");
  const assignment = await import("../src/lib/sales-crm/assignment");
  const access = await import("../src/lib/sales-crm/access");
  const budget = await import("../src/lib/lead-radar/budget");
  const settingsLib = await import("../src/lib/lead-radar/settings");
  const runsLib = await import("../src/lib/lead-radar/runs");
  const candLib = await import("../src/lib/lead-radar/candidates");
  const importLib = await import("../src/lib/lead-radar/import-service");
  const scope = await import("../src/domain/lead-radar/scope");
  const { MICRO } = await import("../src/domain/lead-radar/budget");

  const run = Date.now().toString(36);
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const token = (url: string) => /#token=([a-f0-9]{64})/.exec(url)![1];
  const staff: Record<string, string> = {}, users: Record<string, string> = {};
  const PH = String(Date.now() % 100000).padStart(5, "0");
  const phone = (n: number) => `+1514${PH}${String(n).padStart(2, "0")}`.slice(0, 12);

  async function invite(name: string, role: "SALES_REP" | "SALES_MANAGER", extra: Record<string, string> = {}) {
    as(users.Root);
    const r: any = await staffActions.createSalesStaff(fd({ name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, recoveryEmail: `${name.toLowerCase()}-${run}@personal.test`, role, uiLocale: "EN", salesMode: "FIELD", ...extra }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId } });
    staff[name] = row.id; users[name] = row.userId;
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "correct horse battery"), { ok: true });
  }
  const rec = (n: number, o: Record<string, unknown> = {}) => ({
    v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Garage Radar ${run} ${n}`,
    taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"], alternates: null },
    address: { freeform: `${100 + n} Rue Radar`, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" },
    phones: [phone(n)], websites: [`https://radar-${run}-${n}.example.ca/`], emails: [`info${n}@radar-${run}-${n}.example.ca`],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }], ...o,
  });
  const lines = (rs: unknown[]) => rs.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n");

  async function startRun(provinces: string[], release: string, extra: Record<string, unknown> = {}) {
    as(users.Root);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces, groups: ["REPAIR", "BODY_GLASS", "DEALER", "PARTS", "OTHER_AUTOMOTIVE"], ...extra }, release });
    assert.equal(created.ok, true, JSON.stringify(created));
    return created.runId as string;
  }
  async function manifest(runId: string, release: string, count: number) {
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    return JSON.stringify({ extractor: "t", extractorVersion: "1", planHash: r.planHash, release, recordCount: count, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats: {} });
  }

  test("setup: Super Admin, a manager and two sellers; live discovery is OFF by default (no env switch, no DB switch)", async () => {
    const root = await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } });
    users.Root = root.id;
    await invite("MgrA", "SALES_MANAGER", { salesMode: "REMOTE" });
    await invite("FieldA", "SALES_REP", { managerId: "", salesMode: "FIELD" }).catch(() => undefined);
    const s = await settingsLib.readSettings();
    assert.equal(s.enabled, false);
    assert.equal(s.managersCanReview, false);
    assert.equal(s.monthlyBudgetMicroCad, 25 * MICRO);
    assert.equal(settingsLib.liveEnvironmentEnabled(), false);
  });

  test("permissions: nobody but the Super Admin reaches the Lead Radar by default; reps never; managers only when the Super Admin allows review; tenant users never", async () => {
    await invite("RepA", "SALES_REP", { managerId: staff.MgrA, salesMode: "REMOTE" });
    const tenant = await db.user.create({ data: { name: "Tenant", email: `tenant-${run}@shop.test`, role: "OWNER" } });
    for (const who of ["RepA", "MgrA"]) {
      as(users[who]);
      await assert.rejects(radar.createDiscoveryRun({ scope: { provinces: ["QC"] }, release: "latest" }), /SALES_FORBIDDEN/);
      await assert.rejects(radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: true }), /SALES_FORBIDDEN/);
      await assert.rejects(radar.reviewDiscoveryCandidates({ ids: ["x"], decision: "APPROVED" }), /SALES_FORBIDDEN/);
      await assert.rejects(radar.importApprovedDiscoveryCandidates({}), /SALES_FORBIDDEN/);
    }
    as(tenant.id);
    await assert.rejects(radar.reviewDiscoveryCandidates({ ids: ["x"], decision: "APPROVED" }), /SALES_FORBIDDEN/);
    setSession(null);
    await assert.rejects(radar.reviewDiscoveryCandidates({ ids: ["x"], decision: "APPROVED" }), /SALES_FORBIDDEN/);
  });

  test("live discovery is gated twice: the database switch AND LEAD_RADAR_ENABLED=1; a run cannot be created or ingested while either is off", async () => {
    as(users.Root);
    const off: any = await radar.createDiscoveryRun({ scope: { provinces: ["QC"] }, release: "2026-09-23.1" });
    assert.deepEqual([off.ok, off.error], [false, "LEAD_RADAR_DISABLED"]);
    const saved: any = await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const stillOff: any = await radar.createDiscoveryRun({ scope: { provinces: ["QC"] }, release: "2026-09-23.1" });
    assert.deepEqual([stillOff.ok, stillOff.error], [false, "LEAD_RADAR_DISABLED"], "DB switch alone is not enough");
    process.env.LEAD_RADAR_ENABLED = "1";
  });

  test("settings: the monthly budget can be lowered but never above CAD 25.00 (code and database CHECK); invalid FX refused; every change audited", async () => {
    as(users.Root);
    for (const bad of [25.01, -1, Number.NaN]) assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: bad, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, false);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 0.5, managersCanReview: false })) as any).error, "INVALID_FX");
    await assert.rejects(db.$executeRaw`UPDATE "garageos"."CrmDiscoverySettings" SET "monthlyBudgetMicroCad" = 26000000 WHERE "id" = 'default'`, /check|constraint/i);
    const n = await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_SETTINGS_CHANGED" as any } });
    assert.ok(n >= 1);
  });

  test("ingestion: classification, geography, licences, malformed input and missing fields are handled per record; bad records never block good ones", async () => {
    const release = "2026-09-23.1";
    const runId = await startRun(["QC", "AB"], release);
    const recs: unknown[] = [
      rec(1),                                                                                                   // primary repair, Montréal
      rec(2, { taxonomy: { primary: "auto_body_shop", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } }),
      rec(3, { taxonomy: { primary: "auto_dealer", hierarchy: ["shopping", "vehicle_dealer", "auto_dealer"], alternates: null } }),
      rec(4, { taxonomy: { primary: "car_wash", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } }),
      rec(5, { name: "Midas Radar", brandWikidata: "Q1234567" }),                                                 // chain signal
      rec(6, { websites: ["https://www.facebook.com/12345"] }),                                                  // social page is not a website
      rec(7, { operatingStatus: "closed" }),                                                                     // excluded
      rec(8, { address: { freeform: "1 Main St", locality: "Buffalo", postcode: "14201", region: "NY", country: "US" } }), // outside Canada
      rec(9, { name: "" }),                                                                                      // missing name
      rec(10, { sources: [{ dataset: "OpenStreetMap", license: "ODbL-1.0" }] }),                                  // licence-blocked
      rec(11, { sources: [{ dataset: "meta", license: null }] }),                                                  // missing licence = blocked
      rec(12, { taxonomy: { primary: "brand_new_code", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } }), // unknown subcategory → AMBIGUOUS
      rec(13, { taxonomy: { primary: "gas_station", hierarchy: ["travel_and_transportation", "fueling_station"], alternates: null } }),     // not automotive
      rec(14, { address: { freeform: "5 Calgary Tr", locality: "Calgary", postcode: "T2P 1J9", region: "Alberta", country: "CA" } }),        // AB from "Alberta"
      rec(15, { address: { freeform: "5 Ontario St", locality: "Ottawa", postcode: "K1A 0B1", region: "ON", country: "CA" } }),            // out of scope province
      rec(16, { address: { freeform: null, locality: null, postcode: "G1R 4S9", region: null, country: null }, phones: [] }),               // province from postal only
      { v: 1, id: "short" },                                                                                    // schema invalid
      { v: 2, id: "00000000-0000-4000-8000-000000000099" },                                                      // unsupported schema version
      "{not json",                                                                                                // malformed
      rec(17, { websites: ["https://x.example/" + "a".repeat(600)], extraneousField: "SECRET-UPSTREAM-FIELD" }), // long url dropped; unknown field never stored
    ];
    const m: any = await radar.attachDiscoveryManifest(runId, await manifest(runId, release, recs.length));
    assert.equal(m.ok, true, JSON.stringify(m));
    const c0: any = await radar.ingestDiscoveryChunk(runId, 0, lines(recs));
    assert.equal(c0.ok, true, JSON.stringify(c0));
    const rows = await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: runId } });
    const by = (n: number) => rows.find((r) => r.sourceRecordId.endsWith(String(n).padStart(6, "0")))!;
    assert.equal(by(1).tier, "PRIMARY"); assert.equal(by(1).province, "QC"); assert.equal(by(1).territoryKey, "greater-montreal");
    assert.equal(by(2).tier, "SECONDARY"); assert.equal(by(2).industry, "BODY_SHOP");
    assert.equal(by(3).tier, "SECONDARY"); assert.ok(by(3).classReasons.includes("DEALERSHIP"));
    assert.ok(by(4).classReasons.includes("CAR_WASH"));
    assert.equal(by(5).chainSignal, "CHAIN_SIGNAL"); assert.equal(by(1).chainSignal, "NO_CHAIN_SIGNAL", "independence is never asserted");
    assert.equal(by(6).website, null); assert.ok(by(6).qualityFlags.includes("WEBSITE_IS_SOCIAL"));
    assert.equal(by(7).tier, "EXCLUDED");
    assert.equal(rows.find((r) => r.sourceRecordId.endsWith("000008")), undefined, "US record never staged");
    assert.equal(by(10).licenseOk, false); assert.ok(by(10).qualityFlags.includes("LICENSE_BLOCKED"));
    assert.equal(by(11).licenseOk, false);
    assert.equal(by(12).tier, "AMBIGUOUS"); assert.ok(by(12).classReasons.includes("UNKNOWN_SUBCATEGORY"));
    assert.equal(by(13).tier, "EXCLUDED");
    assert.equal(by(14).province, "AB");
    assert.equal(rows.find((r) => r.sourceRecordId.endsWith("000015")), undefined, "Ontario is outside the QC+AB scope");
    assert.equal(by(16).province, "QC"); assert.ok(by(16).qualityFlags.includes("GEO_FROM_POSTAL"));
    assert.equal(by(17).website, null);
    assert.ok(!JSON.stringify(rows).includes("SECRET-UPSTREAM-FIELD"), "only whitelisted fields are ever stored");
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    assert.equal(r.receivedRecords, recs.length);
    const diag = Object.fromEntries((r.diagnostics as any[]).map((d) => [d.code, d.count]));
    assert.equal(diag.MALFORMED_JSON, 1); assert.equal(diag.SCHEMA_INVALID, 1); assert.equal(diag.SCHEMA_VERSION_UNSUPPORTED, 1); assert.equal(diag.MISSING_NAME, 1);
    assert.equal(diag.OUTSIDE_CANADA, 1); assert.equal(diag.OUT_OF_SCOPE_PROVINCE, 1);
    assert.equal(r.stagedNew + r.rejectedRecords, recs.length);
    const done: any = await radar.completeDiscoveryRun(runId);
    assert.equal(done.ok, true, JSON.stringify(done));
    // approval is impossible for licence-blocked and excluded candidates (API and database CHECK)
    const bad = await candLib.reviewCandidates((await access.resolvePlatformSalesActor(users.Root))!, [by(10).id, by(11).id, by(7).id, by(13).id], "APPROVED");
    assert.deepEqual([bad.updated, bad.blocked], [0, 4]);
    await assert.rejects(db.$executeRaw`UPDATE "garageos"."CrmDiscoveryCandidate" SET "reviewState" = 'APPROVED' WHERE "id" = ${by(10).id}`, /check|constraint/i);
  });

  test("job interruption and recovery: replayed chunks are no-ops, gaps are refused, cancel stops work, resume continues from the right chunk, completion needs every record", async () => {
    const release = "2026-09-24.0";
    const runId = await startRun(["QC"], release);
    const all = Array.from({ length: 6 }, (_, i) => rec(100 + i));
    await radar.attachDiscoveryManifest(runId, await manifest(runId, release, all.length));
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 0, lines(all.slice(0, 2)))) as any).stagedNew, 2);
    const replay: any = await radar.ingestDiscoveryChunk(runId, 0, lines(all.slice(0, 2)));
    assert.deepEqual([replay.ok, replay.duplicate], [true, true], "re-sent chunk after a lost response is a no-op");
    const gap: any = await radar.ingestDiscoveryChunk(runId, 2, lines(all.slice(2, 4)));
    assert.deepEqual([gap.ok, gap.error], [false, "CHUNK_OUT_OF_ORDER"]);
    const incomplete: any = await radar.completeDiscoveryRun(runId);
    assert.equal(incomplete.error, "RUN_INCOMPLETE");
    assert.equal(((await radar.cancelDiscoveryRun(runId)) as any).ok, true);
    assert.equal(((await radar.cancelDiscoveryRun(runId)) as any).alreadyCancelled, true, "cancel is idempotent");
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 1, lines(all.slice(2, 4)))) as any).error, "RUN_CANCELLED");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { lastRunId: runId } }), 2, "nothing staged while cancelled");
    const res: any = await radar.resumeDiscoveryRun(runId);
    assert.deepEqual([res.ok, res.lastChunkSeq], [true, 0]);
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 1, lines(all.slice(2, 4)))) as any).stagedNew, 2);
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 2, lines(all.slice(4)))) as any).stagedNew, 2);
    assert.equal(((await radar.completeDiscoveryRun(runId)) as any).ok, true);
    assert.equal(((await radar.resumeDiscoveryRun(runId)) as any).error, "RUN_NOT_RESUMABLE");
    // manifest for another plan or release is refused
    const other = await startRun(["AB"], "2026-09-24.0");
    const badPlan: any = await radar.attachDiscoveryManifest(other, JSON.stringify({ ...JSON.parse(await manifest(other, "2026-09-24.0", 1)), planHash: "b".repeat(64) }));
    assert.equal(badPlan.error, "MANIFEST_PLAN_MISMATCH");
    const badRel: any = await radar.attachDiscoveryManifest(other, await manifest(other, "2026-09-25.0", 1));
    assert.equal(badRel.error, "MANIFEST_RELEASE_MISMATCH");
    // oversize chunk refused without side effects
    await radar.attachDiscoveryManifest(other, await manifest(other, "2026-09-24.0", 400));
    const big: any = await radar.ingestDiscoveryChunk(other, 0, lines(Array.from({ length: 301 }, (_, i) => rec(500 + i))));
    assert.equal(big.error, "CHUNK_TOO_LARGE");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { lastRunId: other } }), 0);
  });

  test("large scopes need an explicit acknowledgement (nationwide / >300 MB); a small scope does not; workload preview makes no write", async () => {
    as(users.Root);
    const all = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
    const refused: any = await radar.createDiscoveryRun({ scope: { provinces: all }, release: "latest" });
    assert.equal(refused.error, "LARGE_SCOPE_NOT_ACKNOWLEDGED");
    const before = await db.crmDiscoveryRun.count();
    const prev: any = await radar.previewDiscoveryWorkload({ provinces: all });
    assert.equal(prev.work.nationwide, true); assert.equal(prev.work.requiresAcknowledgement, true); assert.equal(prev.cost.paidRequests, 0);
    assert.equal(await db.crmDiscoveryRun.count(), before);
    const ok: any = await radar.createDiscoveryRun({ scope: { provinces: all }, release: "latest", acknowledgeLargeScope: true });
    assert.equal(ok.ok, true);
    await radar.cancelDiscoveryRun(ok.runId);
    assert.equal(((await radar.createDiscoveryRun({ scope: { provinces: ["QC"] }, release: "../../etc/passwd" })) as any).error, "INVALID_RELEASE");
    assert.equal(((await radar.createDiscoveryRun({ scope: { provinces: ["XX"] }, release: "latest" })) as any).error, "INVALID_SCOPE");
    assert.ok(scope.estimateWorkload(scope.canonicalScope({ provinces: ["QC"] })).megabytes <= 300);
  });

  test("repeated releases: same business keeps ONE candidate; decisions persist; an approval is withdrawn when the facts change; imported candidates are only flagged", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const r1 = await startRun(["QC"], "2026-10-01.0");
    const a = rec(200), b = rec(201), c = rec(202);
    await radar.attachDiscoveryManifest(r1, await manifest(r1, "2026-10-01.0", 3));
    await radar.ingestDiscoveryChunk(r1, 0, lines([a, b, c]));
    const idOf = async (n: number) => (await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: (n === 200 ? a : n === 201 ? b : c).id } })).id;
    await candLib.reviewCandidates(actor, [await idOf(200), await idOf(201)], "APPROVED");
    await candLib.reviewCandidates(actor, [await idOf(202)], "REJECTED", "not a shop");
    const r2 = await startRun(["QC"], "2026-10-15.0");
    const changed = rec(201, { phones: [phone(77)] });                         // facts changed → approval withdrawn
    await radar.attachDiscoveryManifest(r2, await manifest(r2, "2026-10-15.0", 3));
    const out: any = await radar.ingestDiscoveryChunk(r2, 0, lines([a, changed, c]));
    assert.deepEqual([out.stagedNew, out.stagedUpdated], [0, 3], "no duplicate candidates across releases");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: await idOf(200) } })).reviewState, "APPROVED", "unchanged approval stays");
    const b2 = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: await idOf(201) } });
    assert.equal(b2.reviewState, "PENDING", "approval was given on old facts");
    assert.equal(b2.lastSeenRelease, "2026-10-15.0"); assert.equal(b2.firstSeenRelease, "2026-10-01.0");
    const c2 = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: await idOf(202) } });
    assert.equal(c2.reviewState, "REJECTED", "a rejection survives later releases");
    // import candidate 200, then a third release changes it: flagged, CRM untouched
    const imp = await importLib.importApprovedCandidates(actor, { ids: [await idOf(200)] });
    assert.equal(imp.created, 1);
    const prospectId = imp.createdProspectIds[0];
    const before = await db.crmProspect.findUniqueOrThrow({ where: { id: prospectId } });
    const r3 = await startRun(["QC"], "2026-11-01.0");
    await radar.attachDiscoveryManifest(r3, await manifest(r3, "2026-11-01.0", 1));
    await radar.ingestDiscoveryChunk(r3, 0, lines([rec(200, { phones: [phone(88)] })]));
    const a3 = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: await idOf(200) } });
    assert.equal(a3.changedSinceImport, true); assert.equal(a3.importState, "CREATED"); assert.equal(a3.phone, a.phones[0]);
    const after = await db.crmProspect.findUniqueOrThrow({ where: { id: prospectId } });
    assert.deepEqual([after.phone, after.updatedAt.getTime()], [before.phone, before.updatedAt.getTime()], "the CRM prospect is never overwritten by a later release");
  });

  test("CRM deduplication at staging: strong match, branch of an existing chain, ambiguous; and an email on the suppression list is dropped from the candidate", async () => {
    const root = (await access.resolvePlatformSalesActor(users.Root))!;
    const existing = await db.crmProspect.create({ data: { name: `Garage Existant ${run}`, nameNormalized: `garage existant ${run}`, address: "300 rue Existante", city: "Montréal", province: "QC", postalCode: "H3B 2Y5", addressKey: "300 rue existante", postalKey: "H3B2Y5", phone: "5145559000", phoneDigits: "5145559000", createdByUserId: root.userId } });
    await db.crmEmailSuppression.create({ data: { emailNormalized: `blocked-${run}@sup.example.ca`, reason: "UNSUBSCRIBE", source: "test" } });
    const runId = await startRun(["QC"], "2026-10-02.0");
    const strong = rec(300, { name: `Garage Existant ${run}`, address: { freeform: "300 Rue Existante", locality: "Montréal", postcode: "H3B 2Y5", region: "QC", country: "CA" }, phones: [], websites: [], emails: [`blocked-${run}@sup.example.ca`] });
    const branch = rec(301, { name: `Garage Existant ${run}`, address: { freeform: "900 Boul Autre", locality: "Laval", postcode: "H7N 1A1", region: "QC", country: "CA" }, phones: [], websites: [], emails: [] });
    const ambiguous = rec(302, { name: `Totalement Autre Nom ${run}`, address: { freeform: null, locality: "Montréal", postcode: null, region: "QC", country: "CA" }, phones: ["+15145559000"], websites: [], emails: [] });
    await radar.attachDiscoveryManifest(runId, await manifest(runId, "2026-10-02.0", 3));
    await radar.ingestDiscoveryChunk(runId, 0, lines([strong, branch, ambiguous]));
    const get = (r: any) => db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: r.id } });
    const s = await get(strong), b = await get(branch), a = await get(ambiguous);
    assert.deepEqual([s.matchState, s.matchProspectId], ["EXISTING_STRONG", existing.id]);
    assert.equal(s.email, null); assert.ok(s.qualityFlags.includes("EMAIL_SUPPRESSED"));
    assert.equal(b.matchState, "BRANCH_OF_EXISTING", "physical branches stay distinct businesses");
    assert.equal(a.matchState, "AMBIGUOUS");
    ids.dedupe = { existing: existing.id, strong: s.id, branch: b.id, ambiguous: a.id };
  });
  const ids: Record<string, any> = {};

  test("batch review is idempotent and compare-and-set; managers get review rights only when the Super Admin allows it and still cannot administer", async () => {
    const root = (await access.resolvePlatformSalesActor(users.Root))!;
    const list = [ids.dedupe.strong, ids.dedupe.branch, ids.dedupe.ambiguous];
    const first = await candLib.reviewCandidates(root, list, "APPROVED");
    const again = await candLib.reviewCandidates(root, list, "APPROVED");
    assert.deepEqual([first.updated, again.updated, again.unchanged], [3, 0, 3]);
    const auditBefore = await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_CANDIDATES_REVIEWED" as any } });
    await candLib.reviewCandidates(root, list, "APPROVED");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_CANDIDATES_REVIEWED" as any } }), auditBefore, "a no-op review writes no audit noise");
    // manager: forbidden → allowed to review after the switch → still not admin
    as(users.MgrA);
    await assert.rejects(radar.reviewDiscoveryCandidates({ ids: list, decision: "PENDING" }), /SALES_FORBIDDEN/);
    as(users.Root);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: true })) as any).ok, true);
    as(users.MgrA);
    const r: any = await radar.reviewDiscoveryCandidates({ ids: list, decision: "PENDING" });
    assert.deepEqual([r.ok, r.result.updated], [true, 3]);
    await assert.rejects(radar.createDiscoveryRun({ scope: { provinces: ["QC"] }, release: "latest" }), /SALES_FORBIDDEN/);
    await assert.rejects(radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: true }), /SALES_FORBIDDEN/);
    await assert.rejects(radar.attachDiscoveryManifest("x", "{}"), /SALES_FORBIDDEN/);
    as(users.RepA);
    await assert.rejects(radar.reviewDiscoveryCandidates({ ids: list, decision: "PENDING" }), /SALES_FORBIDDEN/);
    as(users.Root);
    await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false });
    as(users.MgrA);
    await assert.rejects(radar.reviewDiscoveryCandidates({ ids: list, decision: "PENDING" }), /SALES_FORBIDDEN/);
  });

  test("approved import: unassigned, territory resolved, provenance recorded, existing ownership/DNC/notes/phone untouched, ambiguous held for duplicate review, never any outreach artefact; safe to retry; concurrent imports never double-create", async () => {
    const root = (await access.resolvePlatformSalesActor(users.Root))!;
    // the existing prospect is owned, do-not-contact, has notes and a verified phone
    await db.crmProspect.update({ where: { id: ids.dedupe.existing }, data: { assignedStaffId: staff.RepA, doNotContact: true, doNotContactAt: new Date(), notes: "verified by owner", website: null } });
    const fresh = [rec(400), rec(401, { name: `Garage Neuf ${run}` })];
    const rid = await startRun(["QC"], "2026-10-03.0");
    await radar.attachDiscoveryManifest(rid, await manifest(rid, "2026-10-03.0", 2));
    await radar.ingestDiscoveryChunk(rid, 0, lines(fresh));
    const freshIds = (await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: rid }, select: { id: true } })).map((x) => x.id);
    // re-stage the dedupe trio against the CRM's current state
    const mix = [ids.dedupe.strong, ids.dedupe.branch, ids.dedupe.ambiguous, ...freshIds];
    await candLib.reviewCandidates(root, mix, "APPROVED");
    // pending candidates are NOT imported: import takes only approved
    const pending = await db.crmDiscoveryCandidate.create({ data: { source: "OVERTURE", sourceRecordId: `pending-${run}-0001`, firstRunId: rid, lastRunId: rid, firstSeenRelease: "x", lastSeenRelease: "x", name: `Pending ${run}`, nameNormalized: `pending ${run}`, tier: "PRIMARY", chainSignal: "NO_CHAIN_SIGNAL", completeness: 50, licenseOk: true, contentFingerprint: "f", phone: "+15145551234" } });

    const [x, y] = await Promise.all([importLib.importApprovedCandidates(root, { ids: mix }), importLib.importApprovedCandidates(root, { ids: mix })]);
    assert.equal(x.claimed + y.claimed, mix.length, "each candidate is claimed by exactly one of two concurrent imports");
    assert.equal(x.created + y.created, 3, "two fresh prospects + the distinct branch; concurrent imports create each exactly once");
    const again = await importLib.importApprovedCandidates(root, { ids: mix });
    assert.equal(again.claimed, 0, "retry after success is a no-op");
    const rows = await db.crmDiscoveryCandidate.findMany({ where: { id: { in: mix } } });
    const st = Object.fromEntries(rows.map((r) => [r.id, r.importState]));
    assert.equal(st[ids.dedupe.strong], "LINKED"); assert.equal(st[ids.dedupe.ambiguous], "SENT_TO_REVIEW");
    assert.equal(st[ids.dedupe.branch], "CREATED"); for (const f of freshIds) assert.equal(st[f], "CREATED");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: pending.id } })).importState, "NOT_IMPORTED");

    // created prospects: unassigned, territory resolved, DIRECTORY source, observation with provenance, no sending basis/enrollment/message
    const created = rows.filter((r) => r.importState === "CREATED").map((r) => r.importedProspectId!);
    const ps = await db.crmProspect.findMany({ where: { id: { in: created } }, include: { observations: true, contacts: true } });
    assert.equal(ps.length, 3);
    for (const p of ps) {
      assert.equal(p.assignedStaffId, null, "imports never assign");
      assert.equal(p.source, "DIRECTORY");
      assert.ok(p.territoryState === "LOCAL" || p.territoryState === "NATIONAL");
      assert.equal(p.observations[0].sourceKey, "overture-places");
      assert.equal(p.contacts.length, 0);
      assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: p.id } } }), 0);
      assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: p.id } }), 0);
      assert.equal(await db.crmEmailThread.count({ where: { prospectId: p.id } }), 0);
    }
    const mtl = ps.find((p) => p.city === "Montréal" && p.name.startsWith("Garage Neuf"));
    assert.equal(mtl?.territoryKey, "greater-montreal");
    // existing prospect: ownership, DNC, notes, phone untouched; only EMPTY fields may be enriched
    const ex = await db.crmProspect.findUniqueOrThrow({ where: { id: ids.dedupe.existing } });
    assert.deepEqual([ex.assignedStaffId, ex.doNotContact, ex.notes, ex.phone], [staff.RepA, true, "verified by owner", "5145559000"]);
    // ambiguous goes to the EXISTING duplicate-review queue
    assert.equal(await db.crmDuplicateReview.count({ where: { prospectId: ids.dedupe.existing, status: "PENDING" } }), 1);
    // outcome is visible on the candidate (handoff)
    const batch = await db.crmImportBatch.findUniqueOrThrow({ where: { id: x.batchId ?? y.batchId! } });
    assert.equal(batch.sourceKey, "overture-places");
    ids.created = created;
  });

  test("assignment handoff: imported prospects enter the EXISTING manual preview; FIELD-exclusive Montréal never goes to a REMOTE seller; nothing is assigned until the manager confirms", async () => {
    const mgr = (await access.resolvePlatformSalesActor(users.Root))!;
    await invite("FieldB", "SALES_REP", { managerId: staff.MgrA, salesMode: "FIELD" });
    const { proposals } = await assignment.buildAssignmentProposals(mgr, { limit: 500 });
    const mine = proposals.filter((p) => ids.created.includes(p.prospectId));
    assert.ok(mine.length >= 1, "new prospects appear in the existing assignment preview");
    for (const p of mine.filter((q) => q.territoryKey === "greater-montreal")) assert.notEqual(p.staffId, staff.RepA, "REMOTE seller is not proposed for a FIELD-exclusive territory");
    assert.equal(await db.crmProspect.count({ where: { id: { in: ids.created }, assignedStaffId: { not: null } } }), 0, "a preview assigns nothing");
    // capacity: a seller at their cap is never proposed
    await db.platformSalesStaff.update({ where: { id: staff.FieldB }, data: { maxActiveLeads: 0 } });
    const capped = (await assignment.buildAssignmentProposals(mgr, { limit: 500 })).proposals.filter((p) => ids.created.includes(p.prospectId) && p.staffId === staff.FieldB);
    assert.equal(capped.length, 0);
  });

  test("budget ledger: hard stop at the monthly limit, atomic under concurrency, idempotent, conservative FX, invalid estimates refused, per-month accounting, no billable work when disabled", async () => {
    await db.crmDiscoveryBudgetLedger.deleteMany({});
    as(users.Root);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 1, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => budget.reserveBudget({ provider: "google-places", estimateMicroCad: 300_000, idempotencyKey: `k-${run}-${i}`, description: "t" })));
    assert.equal(results.filter((r) => r.ok).length, 3, "exactly floor(1.00 / 0.30) concurrent reservations fit");
    const ov = await budget.budgetOverview();
    assert.equal(ov.reservedMicroCad, 900_000); assert.equal(ov.remainingMicroCad, 100_000);
    const one = results.find((r) => r.ok) as any;
    const re = await budget.reserveBudget({ provider: "google-places", estimateMicroCad: 300_000, idempotencyKey: `k-${run}-${results.findIndex((r) => r.ok)}`, description: "t" });
    assert.deepEqual([(re as any).ok, (re as any).reused], [true, true], "same idempotency key never reserves twice");
    for (const bad of [0, -5, 1.5, Number.NaN]) assert.deepEqual((await budget.reserveBudget({ provider: "p", estimateMicroCad: bad, idempotencyKey: `bad-${run}-${bad}`, description: "t" }) as any).reason, "INVALID_ESTIMATE");
    assert.equal(((await budget.reserveBudget({ provider: "p", description: "t", idempotencyKey: `noest-${run}` })) as any).reason, "INVALID_ESTIMATE", "no estimate, no request");
    assert.equal(((await budget.reserveBudget({ provider: "p", estimateMicroCad: 200_000, idempotencyKey: `big-${run}`, description: "t" })) as any).reason, "INSUFFICIENT_BUDGET");
    // settling lower frees budget; releasing frees it all; settling is once-only
    assert.equal(await budget.settleBudget(one.ledgerId, 100_000), true);
    assert.equal(await budget.settleBudget(one.ledgerId, 100_000), false);
    assert.equal((await budget.budgetOverview()).remainingMicroCad, 300_000);
    // USD estimates convert at the conservative rate, rounded up
    const usd = await budget.reserveBudget({ provider: "p", usd: { micro: 100_001 }, idempotencyKey: `usd-${run}`, description: "t" }) as any;
    assert.equal(usd.ok, true);
    const row = await db.crmDiscoveryBudgetLedger.findUniqueOrThrow({ where: { id: usd.ledgerId } });
    assert.deepEqual([row.estimatedMicroCad, row.fxRateMilli, row.originalCurrency], [145_002, 1450, "USD"]);
    // each month is accounted separately
    const nextMonth = new Date(Date.now() + 40 * 86_400_000);
    assert.equal(((await budget.reserveBudget({ provider: "p", estimateMicroCad: 900_000, idempotencyKey: `nm-${run}`, description: "t", now: nextMonth })) as any).ok, true);
    // guardedPaidCall: refusal means the provider is never called; errors settle at the estimate; NotBilled releases
    let called = 0;
    await assert.rejects(budget.guardedPaidCall({ provider: "p", estimateMicroCad: 5_000_000, idempotencyKey: `g1-${run}`, description: "t" }, async () => { called++; return { result: 1 }; }), /BUDGET_INSUFFICIENT_BUDGET/);
    assert.equal(called, 0);
    await db.crmDiscoveryBudgetLedger.deleteMany({ where: { monthKey: (await budget.budgetOverview()).month } });
    await assert.rejects(budget.guardedPaidCall({ provider: "p", estimateMicroCad: 400_000, idempotencyKey: `g2-${run}`, description: "t" }, async () => { throw new Error("provider 500"); }), /provider 500/);
    assert.equal((await budget.budgetOverview()).settledMicroCad, 400_000, "a possibly-sent request is assumed billed");
    await assert.rejects(budget.guardedPaidCall({ provider: "p", estimateMicroCad: 400_000, idempotencyKey: `g3-${run}`, description: "t" }, async () => { throw new budget.NotBilledError("validation"); }), /validation/);
    assert.equal((await budget.budgetOverview()).settledMicroCad, 400_000, "a request that never left is released");
    const out = await budget.guardedPaidCall({ provider: "p", estimateMicroCad: 100_000, idempotencyKey: `g4-${run}`, description: "t" }, async () => ({ result: "ok", actualMicroCad: 60_000 }));
    assert.equal(out, "ok"); assert.equal((await budget.budgetOverview()).settledMicroCad, 460_000);
    await assert.rejects(budget.guardedPaidCall({ provider: "p", estimateMicroCad: 100_000, idempotencyKey: `g4-${run}`, description: "t" }, async () => { called++; return { result: "again" }; }), /BUDGET_/, "a finished call's key can never trigger a second paid request");
    assert.equal(called, 0);
    // disabled ⇒ nothing billable
    await radar.saveLeadRadarSettings({ enabled: false, monthlyBudgetCad: 1, usdToCadRate: 1.45, managersCanReview: false });
    assert.equal(((await budget.reserveBudget({ provider: "p", estimateMicroCad: 10_000, idempotencyKey: `off-${run}`, description: "t" })) as any).reason, "DISABLED");
    // the monthly limit cannot be lowered below what the month has already committed
    await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 1, usdToCadRate: 1.45, managersCanReview: false });
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 0.1, usdToCadRate: 1.45, managersCanReview: false })) as any).error, "INVALID_BUDGET");
    // the existing Mapbox geocoding budget is a different table and was never touched
    assert.equal(await db.crmGeocodingSettings.count(), 0);
  });

}
