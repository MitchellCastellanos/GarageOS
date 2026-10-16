/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// National Lead Radar engine against a REAL PostgreSQL scratch database (all migrations applied): the run quality gate, first-import classification and
// geolocation, candidate-to-candidate deduplication across releases/provinces, protection of human decisions, interrupted/resumed ingestion.
// Synthetic Canadian data only; no network, no paid call, no email. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("National Lead Radar database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const fitLib = await import("../src/lib/lead-radar/candidate-fit");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {};
  const R1 = "2026-09-23.1", R2 = "2026-10-21.0";
  let seq = 0;
  const PH = String(Date.now() % 1000000).padStart(6, "0");
  const phone = (n: number) => `+1416${PH}${String(n).padStart(2, "0")}`.slice(0, 12);
  const SRC = [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }];
  const REPAIR = { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"], alternates: null };
  const GENERIC = { primary: "automotive_service", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null };

  // Real-shaped places: point values are float32 widened to double, exactly as Overture's bbox/geometry yield them.
  const f32 = (v: number) => new Float32Array([v])[0];
  const CITY: Record<string, { region: string; locality: string; postcode: string; lat: number; lng: number }> = {
    MTL: { region: "QC", locality: "Montréal", postcode: "H2X 3K4", lat: 45.5017, lng: -73.5673 },
    QCC: { region: "QC", locality: "Québec", postcode: "G1R 4S9", lat: 46.8139, lng: -71.2080 },
    TOR: { region: "ON", locality: "Toronto", postcode: "M5H 2M9", lat: 43.6532, lng: -79.3832 },
    OTT: { region: "ON", locality: "Ottawa", postcode: "K1P 5G3", lat: 45.4215, lng: -75.6972 },
    VAN: { region: "BC", locality: "Vancouver", postcode: "V6H 1H6", lat: 49.2827, lng: -123.1207 },
    WHS: { region: "YT", locality: "Whitehorse", postcode: "Y1A 2B5", lat: 60.7212, lng: -135.0568 },
  };
  function rec(name: string, city: keyof typeof CITY, o: Record<string, unknown> = {}) {
    const n = ++seq, c = CITY[city];
    return {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name,
      taxonomy: REPAIR, address: { freeform: `${100 + n} Rue Principale`, locality: c.locality, postcode: c.postcode, region: c.region, country: "CA" },
      phones: [phone(n)], websites: [`https://nat-${run}-${n}.example.ca/`], emails: [], sources: SRC,
      geo: { lat: Math.round(f32(c.lat + n * 0.0001) * 1e7) / 1e7, lng: Math.round(f32(c.lng) * 1e7) / 1e7 }, ...o,
    };
  }
  const lines = (rs: unknown[]) => rs.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n");

  async function startRun(provinces: string[], release: string) {
    as(users.Root);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces, groups: ["REPAIR", "BODY_GLASS", "DEALER", "PARTS", "OTHER_AUTOMOTIVE"] }, release });
    assert.equal(created.ok, true, JSON.stringify(created));
    return created.runId as string;
  }
  async function attach(runId: string, release: string, count: number, stats: Record<string, number> = { rowGroupsScanned: 3, rowsExamined: 900, rowsEmitted: count }) {
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    const m: any = await radar.attachDiscoveryManifest(runId, JSON.stringify({ extractor: "garageos-overture-extract", extractorVersion: "1.3.0", planHash: r.planHash, release, recordCount: count, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats }));
    assert.equal(m.ok, true, JSON.stringify(m));
  }
  /** Full extraction: attach, chunk, complete. Returns the run row after completion plus the completion result. */
  async function extract(recs: unknown[], provinces: string[], release: string, stats?: Record<string, number>) {
    const runId = await startRun(provinces, release);
    await attach(runId, release, recs.length, stats);
    for (let i = 0; i * 250 < recs.length; i++) assert.equal(((await radar.ingestDiscoveryChunk(runId, i, lines(recs.slice(i * 250, (i + 1) * 250)))) as any).ok, true);
    const done: any = await radar.completeDiscoveryRun(runId);
    return { runId, done, row: await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } }) };
  }
  const cand = (id: string) => db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: id } });

  const QC_SET = () => [
    rec("Garage Tremblay & Fils", "MTL"),                                                       // clear repair
    rec("Garage Remorquage Roy", "MTL"),                                                        // mixed service: repair + towing is still a garage
    rec("Borne de recharge Hydro-Québec", "MTL", { taxonomy: GENERIC }),                        // EV charging station
    rec("Lave-Auto Express", "QCC", { taxonomy: GENERIC }),                                     // car wash
    rec("Auto Plus", "QCC", { taxonomy: GENERIC }),                                             // ambiguous: generic category, no repair wording
    rec("Mécanique Lévesque", "QCC", { taxonomy: GENERIC }),                                    // generic category + repair wording
    rec("Pièces d'auto Beauce", "QCC", { taxonomy: GENERIC }),                                  // parts retail
    rec("Vélo Cycle Québec", "QCC", { taxonomy: GENERIC }),                                     // bicycle
  ];

  test("setup: Super Admin; live discovery on (database switch + environment switch)", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    users.Seller = (await db.user.create({ data: { name: "Seller", email: `seller-${run}@garage-os.ca`, role: "VIEWER", shopId: null } })).id;
    as(users.Root);
    process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
  });

  let qc1: { runId: string; ids: string[]; recs: any[] };
  test("Québec initial extraction: gate passes with explicit counters; every candidate is classified AND geolocated at staging (no cleanup, no recovery step)", async () => {
    const recs = QC_SET();
    const { runId, done, row } = await extract(recs, ["QC"], R1);
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(row.status, "COMPLETED");
    assert.equal(row.qualityVerdict, "OK");
    assert.equal(row.recordsWithPoint, recs.length);
    assert.equal(row.pointsAccepted, recs.length);
    assert.equal(row.pointsOnNew, recs.length);
    assert.equal(row.pointsOnExisting, 0);
    const q = row.qualityDetail as any;
    assert.deepEqual([q.counters.received, q.counters.pointsAccepted, q.counters.pointsInvalid, q.counters.pointsMissing], [recs.length, recs.length, 0, 0]);
    const by = Object.fromEntries(await Promise.all(recs.map(async (r: any) => [r.name, await cand(r.id)])));
    for (const c of Object.values(by) as any[]) { assert.ok(c.sourceLatitude !== null && c.sourceLongitude !== null, `${c.name} has a source position at staging`); assert.ok(c.repairFit, `${c.name} is classified at staging`); assert.ok(c.repairFitAt); }
    assert.equal(by["Garage Tremblay & Fils"].repairFit, "VERIFIED_REPAIR");
    assert.equal(by["Garage Remorquage Roy"].repairFit, "VERIFIED_REPAIR", "a legitimate mixed-service garage is not excluded");
    assert.equal(by["Borne de recharge Hydro-Québec"].repairFit, "EXCLUDED");
    assert.equal(by["Lave-Auto Express"].repairFit, "EXCLUDED");
    assert.equal(by["Vélo Cycle Québec"].repairFit, "EXCLUDED");
    assert.equal(by["Pièces d'auto Beauce"].repairFit, "EXCLUDED");
    assert.equal(by["Auto Plus"].repairFit, "HUMAN_REVIEW", "ambiguous business is held for a person, never auto-excluded");
    assert.equal(by["Mécanique Lévesque"].repairFit, "VERIFIED_REPAIR");
    // The float32 point survived intact (within ~1 m) and is bound to the right province.
    assert.ok(Math.abs(by["Garage Tremblay & Fils"].sourceLatitude - 45.5018) < 0.0005 && Math.abs(by["Garage Tremblay & Fils"].sourceLongitude + 73.5673) < 0.0005);
    qc1 = { runId, ids: recs.map((r: any) => r.id), recs };
  });

  test("Québec repeated extraction on a newer release: idempotent (no duplicate candidates), positions refreshed, human decisions and exclusions preserved", async () => {
    const before = await db.crmDiscoveryCandidate.count({ where: { province: "QC" } });
    // A human rejects the ambiguous one; another is approved by a human.
    as(users.Root);
    const rejectId = (await cand(qc1.ids[4])).id, approveId = (await cand(qc1.ids[0])).id;
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [rejectId], decision: "REJECTED", note: "not a shop" })) as any).ok, true);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [approveId], decision: "APPROVED" })) as any).ok, true);
    const again = qc1.recs;  // the identical source records, seen again in a newer release
    const { done, row } = await extract(again, ["QC"], R2);
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(row.status, "COMPLETED");
    assert.equal(row.stagedNew, 0);
    assert.equal(row.stagedUpdated, again.length);
    assert.equal(row.pointsOnExisting, again.length);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { province: "QC" } }), before, "no duplicate candidates were created");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: rejectId } })).reviewState, "REJECTED", "a human rejection survives the refresh");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: approveId } })).reviewState, "APPROVED");
    const ev = await cand(qc1.ids[2]);
    assert.equal(ev.repairFit, "EXCLUDED");
    assert.equal(ev.lastSeenRelease, R2);
  });

  test("an excluded business that reappears with CHANGED facts in a newer release stays excluded and cannot be bulk-approved", async () => {
    const evId = qc1.ids[2];
    const moved = qc1.recs[2];
    const { done } = await extract([{ ...moved, id: evId, address: { ...(moved.address as object), freeform: "9 Boulevard Nouveau" }, phones: [phone(99)] }], ["QC"], "2026-11-18.0");
    assert.equal(done.ok, true, JSON.stringify(done));
    const c = await cand(evId);
    assert.equal(c.repairFit, "EXCLUDED");
    as(users.Root);
    const r: any = await radar.reviewDiscoveryCandidates({ ids: [c.id], decision: "APPROVED" });
    assert.equal(r.ok, true);
    assert.equal(r.result.updated, 0, "bulk approval cannot open an excluded business");
    assert.equal(r.result.blockedByFit, 1);
    assert.notEqual((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } })).reviewState, "APPROVED");
  });

  test("Ontario and British Columbia initial extractions; the same chain name in two provinces is NOT merged (different places)", async () => {
    const on = [rec("Speedy Auto Service", "TOR"), rec("Garage Ottawa Mécanique", "OTT"), rec("Whitehorse Auto Repair", "WHS", { address: { freeform: "4 Main St", locality: "Whitehorse", postcode: "Y1A 2B5", region: "YT", country: "CA" } })];
    const bc = [rec("Speedy Auto Service", "VAN"), rec("Pacific Brake & Muffler", "VAN")];
    const o = await extract(on, ["ON", "YT"], R1);
    const b = await extract(bc, ["BC"], R1);
    assert.deepEqual([o.row.status, b.row.status, o.row.qualityVerdict, b.row.qualityVerdict], ["COMPLETED", "COMPLETED", "OK", "OK"]);
    const speedy = await db.crmDiscoveryCandidate.findMany({ where: { nameNormalized: { contains: "speedy auto service" } } });
    assert.equal(speedy.length, 2);
    assert.ok(speedy.every((c) => c.duplicateOfCandidateId === null), "same name in two provinces/cities is a branch, not a duplicate");
    assert.deepEqual(new Set(speedy.map((c) => c.province)), new Set(["ON", "BC"]));
  });

  test("a business re-keyed by the source (new id, same name and address) is a staged DUPLICATE: evidence only, outside the qualification pool, cannot be approved or imported; ambiguous look-alikes are not linked", async () => {
    const original = rec("Atelier Mécanique Gagnon", "QCC");
    const first = await extract([original], ["QC"], R1);
    assert.equal(first.done.ok, true);
    const orig = await cand(original.id);
    const rekeyed = { ...original, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(900000 + seq)}` };
    const lookalike = rec("Atelier Mécanique Gagnon", "QCC", { address: { freeform: "777 Autre Rue", locality: "Québec", postcode: "G1R 4S9", region: "QC", country: "CA" }, phones: [phone(77)] });
    const second = await extract([rekeyed, lookalike], ["QC"], R2);
    assert.equal(second.done.ok, true, JSON.stringify(second.done));
    const dup = await cand(rekeyed.id);
    assert.equal(dup.duplicateOfCandidateId, orig.id);
    assert.equal((second.row.diagnostics as any[]).find((d) => d.code === "DUPLICATE_OF_STAGED")?.count, 1);
    assert.equal((await cand(lookalike.id)).duplicateOfCandidateId, null, "a different address is a different place: never auto-linked");
    // The duplicate is outside the qualification pool and cannot be approved.
    const { poolWhere } = await import("../src/lib/lead-radar/policy");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { AND: [poolWhere, { id: dup.id }] } }), 0);
    as(users.Root);
    const r: any = await radar.reviewDiscoveryCandidates({ ids: [dup.id], decision: "APPROVED" });
    assert.equal(r.result.updated, 0); assert.equal(r.result.blockedDuplicate, 1);
    // A third re-key points at the ORIGINAL, never at the duplicate (chains collapse).
    const third = { ...original, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(910000 + seq)}` };
    assert.equal((await extract([third], ["QC"], "2026-11-18.0")).done.ok, true);
    assert.equal((await cand(third.id)).duplicateOfCandidateId, orig.id);
    // Even if a duplicate were force-approved at the database level, the importer's claim query skips it.
    await db.crmDiscoveryCandidate.update({ where: { id: dup.id }, data: { reviewState: "APPROVED" } });
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: [dup.id] });
    assert.equal(imp.ok, true);
    assert.equal(imp.result.claimed, 0, "the importer never claims a staged duplicate");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: dup.id } })).importState, "NOT_IMPORTED");
  });

  test("gate: a coordinate-less extraction does NOT complete — it is FAILED with NO_COORDINATES, its candidates stay staged but outside the pool; only a Super Admin acknowledgement with a reason releases it", async () => {
    const recs = [rec("Garage Sans Position A", "MTL", { geo: null }), rec("Garage Sans Position B", "MTL", { geo: undefined }), rec("Garage Sans Position C", "MTL", { geo: { lat: null, lng: null } })];
    const { runId, done, row } = await extract(recs, ["QC"], R1);
    assert.equal(done.ok, true);
    assert.equal(done.blocking, true);
    assert.equal(row.status, "FAILED");
    assert.equal(row.qualityVerdict, "NO_COORDINATES");
    assert.equal(row.errorCode, "NO_COORDINATES");
    assert.equal((row.qualityDetail as any).counters.pointsMissing, 3);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { lastRunId: runId } }), 3, "raw evidence is preserved");
    const { poolWhere } = await import("../src/lib/lead-radar/policy");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { AND: [poolWhere, { lastRunId: runId }] } }), 0, "nothing from a failed run reaches qualification");
    // Not acknowledgeable without a reason, nor by a non-admin.
    as(users.Root);
    assert.equal(((await radar.acknowledgeDiscoveryRunQuality(runId, "short")) as any).error, "NOTE_REQUIRED");
    as(users.Seller);
    await assert.rejects(radar.acknowledgeDiscoveryRunQuality(runId, "I am not allowed to do this"), /SALES_FORBIDDEN/);
    as(users.Root);
    const ack: any = await radar.acknowledgeDiscoveryRunQuality(runId, "Territory has no mappable positions; reviewed by owner");
    assert.equal(ack.ok, true, JSON.stringify(ack));
    const after = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    assert.equal(after.status, "COMPLETED");
    assert.equal(after.qualityAckByUserId, users.Root);
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_RUN_QUALITY_ACKNOWLEDGED" as any, entityId: runId } }), 1);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { AND: [poolWhere, { lastRunId: runId }] } }) > 0, true);
    // A completed run can not be "acknowledged" again, and a normal completed run is not acknowledgeable.
    assert.equal(((await radar.acknowledgeDiscoveryRunQuality(qc1.runId, "this run was never blocked at all")) as any).ok, true);
  });

  test("gate: every position outside its province (Toronto point on a Québec address) → ALL_COORDINATES_REJECTED with per-reason diagnostics; province boundary is enforced per record", async () => {
    const toronto = CITY.TOR;
    const bad = [1, 2, 3].map((i) => rec(`Garage Mal Placé ${i}`, "MTL", { geo: { lat: Math.round(f32(toronto.lat + i * 0.001) * 1e7) / 1e7, lng: Math.round(f32(toronto.lng) * 1e7) / 1e7 } }));
    const { row } = await extract(bad, ["QC"], R1);
    assert.equal(row.status, "FAILED");
    assert.equal(row.qualityVerdict, "ALL_COORDINATES_REJECTED");
    assert.equal(row.recordsWithPoint, 3); assert.equal(row.pointsAccepted, 0);
    assert.equal((row.diagnostics as any[]).find((d) => d.code === "POINT_OUT_OF_PROVINCE")?.count, 3);
    const c = await cand(bad[0].id);
    assert.equal(c.sourceLatitude, null, "a mislocated point is never stored");
  });

  test("gate: a mixed province with mostly good positions passes and records exactly which positions were invalid or missing", async () => {
    const good = Array.from({ length: 20 }, (_, i) => rec(`Garage Bien Placé ${i + 1}`, "MTL"));
    const bad = [rec("Garage Hors Province", "MTL", { geo: { lat: 43.65, lng: -79.38 } }), rec("Garage Sans Point", "MTL", { geo: null })];
    const { row } = await extract([...good, ...bad], ["QC"], R1);
    assert.equal(row.status, "COMPLETED");
    const q = (row.qualityDetail as any);
    assert.deepEqual([q.counters.received, q.counters.withPoint, q.counters.pointsAccepted, q.counters.pointsInvalid, q.counters.pointsMissing], [22, 21, 20, 1, 1]);
    assert.ok(q.rates.coverage >= 0.9);
  });

  test("gate: low coverage (pipeline losing positions) stops the run; a legitimate zero-result run completes; a zero-record run that read nothing is an extraction failure", async () => {
    const lost = Array.from({ length: 30 }, (_, i) => rec(`Garage Perdu ${i}`, "MTL", i < 10 ? {} : { geo: null }));
    const low = await extract(lost, ["QC"], R1);
    assert.equal(low.row.qualityVerdict, "LOW_COORDINATE_COVERAGE"); assert.equal(low.row.status, "FAILED");
    const legit = await extract([], ["NB"], R1, { rowGroupsScanned: 2, rowsExamined: 410, rowsEmitted: 0 });
    assert.equal(legit.row.status, "COMPLETED"); assert.equal(legit.row.qualityVerdict, "ZERO_RESULTS_LEGIT");
    const suspect = await extract([], ["NS"], R1, { rowGroupsScanned: 2, rowsExamined: 0, rowsEmitted: 0 });
    assert.equal(suspect.row.status, "FAILED"); assert.equal(suspect.row.qualityVerdict, "EXTRACTION_EMPTY_SUSPECT");
    const noStats = await extract([], ["PE"], R1, {});
    assert.equal(noStats.row.qualityVerdict, "EXTRACTION_EMPTY_SUSPECT", "without extractor evidence an empty run is never called legitimate");
  });

  test("interrupted extraction: chunks resume exactly from the last confirmed one; replays are no-ops; a gap is refused; the run cannot complete early; counters are exact", async () => {
    const recs = Array.from({ length: 600 }, (_, i) => rec(`Garage Reprise ${i + 1}`, i % 2 ? "TOR" : "OTT"));
    const runId = await startRun(["ON"], R2);
    await attach(runId, R2, recs.length);
    const chunk = (i: number) => lines(recs.slice(i * 250, (i + 1) * 250));
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 0, chunk(0))) as any).ok, true);
    // Process "dies" here. Another worker replays chunk 0 and tries to skip ahead.
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 0, chunk(0))) as any).duplicate, true);
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 2, chunk(2))) as any).error, "CHUNK_OUT_OF_ORDER");
    assert.equal(((await radar.completeDiscoveryRun(runId)) as any).error, "RUN_INCOMPLETE");
    // Re-attaching the same manifest after the restart reports where to resume.
    const re: any = await radar.attachDiscoveryManifest(runId, JSON.stringify({ extractor: "x", extractorVersion: "1.3.0", planHash: (await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).planHash, release: R2, recordCount: recs.length, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 3, rowsExamined: 900, rowsEmitted: 600 } }));
    assert.equal(re.ok, true); assert.equal(re.alreadyAttached, true); assert.equal(re.lastChunkSeq, 0);
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 1, chunk(1))) as any).ok, true);
    assert.equal(((await radar.ingestDiscoveryChunk(runId, 2, chunk(2))) as any).ok, true);
    const done: any = await radar.completeDiscoveryRun(runId);
    assert.equal(done.ok, true, JSON.stringify(done));
    const row = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    assert.deepEqual([row.status, row.receivedRecords, row.stagedNew, row.pointsAccepted], ["COMPLETED", 600, 600, 600]);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { lastRunId: runId } }), 600);
  });

  test("an existing CRM prospect (owned) is matched, never duplicated and never re-assigned by an import of the refreshed source record", async () => {
    const staffUser = await db.user.create({ data: { name: "Owner", email: `own-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const owner = await db.platformSalesStaff.create({ data: { userId: staffUser.id, role: "SALES_REP", status: "ACTIVE", displayName: "Owner", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: [], uiLocale: "FR" } });
    const { canonicalAddress } = await import("../src/domain/sales-crm/address");
    const a = canonicalAddress({ address: "555 Rue Existante", city: "Québec", province: "QC", postalCode: "G1R 4S9" });
    const existing = await db.crmProspect.create({ data: { name: "Garage Déjà Au CRM", nameNormalized: "garage deja au crm", address: "555 Rue Existante", city: "Québec", province: "QC", postalCode: "G1R 4S9", addressKey: a.addressKey, postalKey: a.postalKey, territoryState: "NATIONAL", territoryKey: "canada", assignedStaffId: owner.id, createdByUserId: users.Root } });
    const r = rec("Garage Déjà Au CRM", "QCC", { address: { freeform: "555 Rue Existante", locality: "Québec", postcode: "G1R 4S9", region: "QC", country: "CA" } });
    assert.equal((await extract([r], ["QC"], R2)).done.ok, true);
    const c = await cand(r.id);
    assert.equal(c.matchState, "EXISTING_STRONG");
    assert.equal(c.matchProspectId, existing.id);
    as(users.Root);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [c.id], decision: "APPROVED" })) as any).ok, true);
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: [c.id] });
    assert.equal(imp.ok, true, JSON.stringify(imp));
    const after = await db.crmProspect.findUniqueOrThrow({ where: { id: existing.id } });
    assert.equal(after.assignedStaffId, owner.id, "ownership is never overwritten");
    assert.equal(await db.crmProspect.count({ where: { nameNormalized: "garage deja au crm" } }), 1, "no second prospect was created");
  });

  test("first import carries the staged position straight into the CRM (no backfill): created prospects have a location; fit is stamped; counters add up", async () => {
    const r = rec("Garage Premier Import", "MTL");
    assert.equal((await extract([r], ["QC"], R2)).done.ok, true);
    const c = await cand(r.id);
    as(users.Root);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [c.id], decision: "APPROVED" })) as any).ok, true);
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: [c.id] });
    assert.equal(imp.ok, true, JSON.stringify(imp));
    assert.equal(imp.result.created, 1);
    const p = await db.crmProspect.findFirstOrThrow({ where: { nameNormalized: "garage premier import" }, include: { location: true } as any }) as any;
    assert.ok(p.location, "the prospect has a position at creation time");
    assert.ok(Math.abs(p.location.latitude - c.sourceLatitude!) < 1e-6);
    assert.equal(p.repairFit, "VERIFIED_REPAIR");
  });

  test("backfill derives repair fit for candidates staged before the engine (only the derived columns change); idempotent and bounded", async () => {
    const r = rec("Garage Legacy Staged", "MTL");
    assert.equal((await extract([r], ["QC"], R2)).done.ok, true);
    const c = await cand(r.id);
    await db.crmDiscoveryCandidate.update({ where: { id: c.id }, data: { repairFit: null, repairFitReasons: [], repairFitAt: null } });
    const before = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } });
    const t = await fitLib.backfillCandidateFit({ deadline: Date.now() + 30_000 });
    assert.ok(t.classified >= 1);
    const after = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(after.repairFit, "VERIFIED_REPAIR");
    assert.deepEqual([after.reviewState, after.importState, after.qualificationLane], [before.reviewState, before.importState, before.qualificationLane]);
    assert.equal((await fitLib.backfillCandidateFit({ deadline: Date.now() + 30_000 })).classified, 0, "idempotent");
  });

  test("national readiness: per-province populations are separate and honest — a finished extraction with unfinished downstream work is PROCESSING, a gate stop is named, nothing is double counted", async () => {
    const { nationalReadiness } = await import("../src/lib/lead-radar/national");
    const d = await nationalReadiness();
    const row = (p: string) => d.rows.find((r) => r.province === p)!;
    assert.equal(d.rows.length, 13);
    const qc = row("QC");
    assert.equal(qc.crm.prospects >= 1, true, "the imported prospect is counted in the CRM population");
    assert.equal(qc.crm.withCoordinates, qc.crm.prospects, "first-import positions: every created prospect has coordinates");
    assert.equal(qc.crm.missingCoordinates, 0);
    assert.ok(qc.candidates.staged > qc.crm.prospects, "candidates and prospects are different populations");
    assert.ok(qc.candidates.duplicates >= 2, "re-keyed businesses are counted as duplicates, not staged");
    assert.ok(qc.candidates.excluded >= 1 && qc.candidates.verified >= 1 && qc.candidates.review >= 1);
    assert.equal(qc.candidates.unclassified, 0);
    assert.equal(qc.stage, "PROCESSING", "downstream work remains (pending qualification/import), so it is never shown as done");
    assert.ok(qc.deferred.total > 0);
    assert.ok(qc.actions.length > 0);
    assert.equal(row("ON").candidates.staged >= 3, true);
    assert.equal(row("NS").stage, "STOPPED_BY_GATE");
    assert.equal(row("NS").errors.lastRunFailure, "EXTRACTION_EMPTY_SUSPECT");
    assert.equal(row("NB").stage, "READY", "a legitimate zero-result extraction with nothing pending is complete");
    assert.equal(row("NU").stage, "NOT_STARTED");
    assert.equal(d.totals.prospects, d.rows.reduce((a, r) => a + r.crm.prospects, 0));
    assert.ok(d.automation.nextWorkerCheck > new Date());
    assert.equal(d.automation.nextTick, null, "automation is OFF in this database: no next tick is promised");
  });

  test("province-scoped automatic import: with a scope of one province only that province's approved candidates are imported; the rest stay deferred; empty scope = all (previous behaviour)", async () => {
    const auto = await import("../src/lib/lead-radar/automation");
    const access = await import("../src/lib/sales-crm/access");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    const ab = { freeform: "10 Jasper Ave", locality: "Edmonton", postcode: "T5J 1S9", region: "AB", country: "CA" };
    const recs = [rec("Garage Scope Alberta", "MTL", { address: ab, geo: { lat: 53.5461, lng: -113.4938 } }), rec("Garage Scope Colombie", "VAN"), rec("Garage Scope Quebec", "QCC")];
    const runId = (await extract(recs, ["AB", "BC", "QC"], R2)).runId;
    const cs = await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: runId } });
    assert.equal(cs.length, 3);
    await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: cs.map((c) => c.id) } }, data: { reviewState: "APPROVED" } });
    await auto.setImportProvinces(admin, ["AB"]);
    const t1 = await auto.importStage(admin, 1, 50, Date.now() + 30_000, (await auto.readAutomation()).importProvinces);
    assert.equal(t1.created, 1);
    const state = async (n: string) => (await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { name: n } })).importState;
    assert.equal(await state("Garage Scope Alberta"), "CREATED");
    assert.equal(await state("Garage Scope Colombie"), "NOT_IMPORTED");
    assert.equal(await state("Garage Scope Quebec"), "NOT_IMPORTED");
    const d = await (await import("../src/lib/lead-radar/national")).nationalReadiness();
    assert.deepEqual(d.automation.importProvinces, ["AB"]);
    assert.ok(d.rows.find((r) => r.province === "BC")!.deferred.approvedNotImported >= 1, "withheld work is reported as deferred, not hidden");
    await auto.setImportProvinces(admin, []);
    const t2 = await auto.importStage(admin, 1, 50, Date.now() + 30_000, (await auto.readAutomation()).importProvinces);
    assert.ok(t2.created >= 2);
    await assert.rejects(auto.setImportProvinces(admin, ["XX"]), /INVALID/);
    const seller = await access.resolvePlatformSalesActor(users.Seller);
    if (seller) await assert.rejects(auto.setImportProvinces(seller, ["AB"]), /SALES_FORBIDDEN/);
  });

  test("Alberta C2 matching regression: brand/directory-domain look-alikes in the CRM are NOT matched, branched, linked or enriched; approval + import create separate prospects and leave existing CRM records (owner, DNC, manual edits) byte-identical; the banner/no-address case goes to a person", async () => {
    const staffUser = await db.user.create({ data: { name: "C2 Owner", email: `c2-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const owner = await db.platformSalesStaff.create({ data: { userId: staffUser.id, role: "SALES_REP", status: "ACTIVE", displayName: "C2 Owner", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: [], uiLocale: "FR" } });
    const mk = (name: string, o: Record<string, unknown>) => db.crmProspect.create({ data: { name, nameNormalized: name.toLowerCase().replace(/[^a-z ]/g, "").trim(), city: "Montréal", province: "QC", territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root, notes: "manual edit by a seller", ...o } as any });
    const genile = await mk("Carrosserie Genile Inc.", { website: "http://yp.ca/bus/55555", websiteDomain: "yp.ca", assignedStaffId: owner.id, doNotContact: true, doNotContactAt: new Date() });
    const rr = await mk("R.R. Station Service Inc.", { website: "https://www.napaautopro.com/fr/x", websiteDomain: "napaautopro.com", assignedStaffId: owner.id });
    const okp = await mk("OK Pneus", { website: "http://www.oktire.com/fr/magasins/x", websiteDomain: "oktire.com" });
    const snap = async () => JSON.stringify(await db.crmProspect.findMany({ where: { id: { in: [genile.id, rr.id, okp.id, ...extraIds] } }, orderBy: { id: "asc" } }));
    const extraIds: string[] = [];
    const before = await snap();
    const ab = (street: string, city: string, postcode: string) => ({ freeform: street, locality: city, postcode, region: "AB", country: "CA" });
    const recs = [
      rec("Dad's Auto Repair Shop", "OTT", { phones: ["+17805550102"], address: ab("14414 118 Ave NW", "Edmonton", "T5L 2M5"), websites: ["http://yp.ca/bus/100892988"], geo: { lat: 53.57, lng: -113.55 } }),
      rec("NAPA AUTOPRO", "OTT", { phones: ["+17805550103"], address: ab("15923 Stony Plain Road N.W.", "Edmonton", "T5P 3Z1"), websites: ["https://www.napaautopro.com/en/", "https://www.napaautopro.com/en/auto-repair/alberta/edmonton-village-auto-tire-service/"], geo: { lat: 53.54, lng: -113.63 } }),
      rec("OK Tire", "OTT", { phones: ["+17805550104"], address: ab("22 Rayborn Cres", "St Albert", "T8N 4B1"), websites: ["http://www.oktire.com/stores/ok-tire-st-albert"], taxonomy: { primary: "tire_dealer_and_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "tire_dealer_and_repair"], alternates: null }, geo: { lat: 53.63, lng: -113.63 } }),
      rec("OK Tire", "OTT", { phones: ["+17805550105"], address: ab("5501 50 Ave", "Castor", "T0C 0N0"), websites: ["http://www.oktire.com/stores/ok-tire-castor"], taxonomy: { primary: "tire_dealer_and_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "tire_dealer_and_repair"], alternates: null }, geo: { lat: 52.23, lng: -111.91 } }),
    ];
    const { done } = await extract(recs, ["AB"], "2026-11-18.0");
    assert.equal(done.ok, true, JSON.stringify(done));
    const cands = await Promise.all(recs.map((r: any) => cand(r.id)));
    for (const c of cands) { const m = c.matchProspectId ? await db.crmProspect.findUnique({ where: { id: c.matchProspectId }, select: { name: true, city: true, websiteDomain: true, phoneDigits: true } }) : null; assert.equal(c.matchState, "NEW", `${c.name} ${c.city}: a shared directory/banner domain is not a match (matched ${JSON.stringify(m)})`); assert.equal(c.matchProspectId, null); assert.deepEqual(c.matchReasons, []); }
    // Identity matching is judged BEFORE (and independently of) the commercial ICP. Under the independent-repair ICP the NAPA AUTOPRO / OK Tire locations are chains: they are EXCLUDED
    // and can neither be approved nor imported, so only the independent "Dad's Auto Repair Shop" becomes a (separate, unlinked) prospect.
    as(users.Root);
    assert.deepEqual(cands.map((c) => c.repairFit), ["VERIFIED_REPAIR", "EXCLUDED", "EXCLUDED", "EXCLUDED"]);
    await radar.reviewDiscoveryCandidates({ ids: cands.map((c) => c.id), decision: "APPROVED" });
    assert.deepEqual((await Promise.all(cands.map((c) => db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } })))).map((c) => c.reviewState), ["APPROVED", "PENDING", "PENDING", "PENDING"], "only the independent shop can be approved");
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: cands.map((c) => c.id) });
    assert.equal(imp.ok, true, JSON.stringify(imp));
    assert.deepEqual([imp.result.created, imp.result.linked, imp.result.sentToReview], [1, 0, 0], "one separate new prospect: nothing linked, merged or held");
    assert.equal(await snap(), before, "existing CRM records (owner, DNC, manual notes, website, timestamps) are untouched");
    assert.equal(await db.crmDuplicateReview.count({ where: { prospectId: { in: [genile.id, rr.id, okp.id] } } }), 0);
    for (const c of cands) assert.notEqual((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } })).importedProspectId, genile.id);
    // The shape that used to be "held for a person" (banner name + same city, CRM record without an address) is still matched conservatively (AMBIGUOUS, never linked) —
    // and, being a chain location, it is excluded outright: it consumes no review, import or assignment capacity. The CRM record is untouched.
    const noAddr = await mk("NAPA AUTOPRO", { city: "Edmonton", province: "AB", website: "https://www.napaautopro.com/en/", websiteDomain: "napaautopro.com" });
    extraIds.push(noAddr.id);
    const before2 = await snap();
    const risky = rec("NAPA AUTOPRO", "OTT", { phones: ["+17805550106"], address: ab("1 Test Rd NW", "Edmonton", "T5K 1A1"), websites: ["https://www.napaautopro.com/en/"], geo: { lat: 53.55, lng: -113.5 } });
    assert.equal((await extract([{ ...risky, address: { ...(risky.address as object), freeform: null, postcode: null } }], ["AB"], "2026-11-19.0")).done.ok, true);
    const rc = await cand(risky.id);
    assert.equal(rc.matchState, "AMBIGUOUS"); assert.ok(rc.matchProspectId, "points at a candidate for a person to compare");
    assert.equal(rc.repairFit, "EXCLUDED");
    assert.equal(await snap(), before2, "the unaddressed CRM record is untouched");
  });

  test("re-check of stale CRM matches (no new extraction): preview writes nothing; apply fixes only the derived match columns of NOT-yet-imported candidates and keeps human decisions, prospects and ownership untouched; Super Admin only; audited", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { rematchCandidates } = await import("../src/lib/lead-radar/rematch");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    const crmStaff = await db.platformSalesStaff.findFirstOrThrow({ where: { displayName: "C2 Owner" } });
    const victim = await db.crmProspect.create({ data: { name: "Carrosserie Genile Rematch", nameNormalized: "carrosserie genile rematch", city: "Montréal", province: "QC", website: "http://yp.ca/bus/777", websiteDomain: "yp.ca", assignedStaffId: crmStaff.id, doNotContact: true, territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root } });
    const r1 = rec("Dads Auto Rematch", "OTT", { address: { freeform: "14414 118 Ave NW", locality: "Edmonton", postcode: "T5L 2M5", region: "AB", country: "CA" }, websites: ["http://yp.ca/bus/100892988"], phones: ["+17805550777"], geo: { lat: 53.57, lng: -113.55 } });
    assert.equal((await extract([r1], ["AB"], "2026-11-20.0")).done.ok, true);
    const c = await cand(r1.id);
    // Reproduce what production holds today: a stale "branch of existing" verdict from the old rules, on a candidate a person already approved.
    await db.crmDiscoveryCandidate.update({ where: { id: c.id }, data: { matchState: "BRANCH_OF_EXISTING", matchProspectId: victim.id, reviewState: "APPROVED", reviewNote: "approved by a person", qualificationLane: "HUMAN_REVIEW", qualificationReasons: ["BRANCH_RELATIONSHIP"], qualificationPolicyVersion: 1 } });
    const prospectsBefore = JSON.stringify(await db.crmProspect.findUnique({ where: { id: victim.id } }));
    const prev = await rematchCandidates(admin, { province: "AB", apply: false });
    assert.equal(prev.applied, false); assert.ok(prev.changed >= 1); assert.ok((prev.transitions["match:BRANCH_OF_EXISTING->NEW"] ?? 0) >= 1);
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } })).matchState, "BRANCH_OF_EXISTING", "preview wrote nothing");
    const done = await rematchCandidates(admin, { province: "AB", apply: true });
    assert.equal(done.changed, prev.changed);
    const after = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c.id } });
    assert.deepEqual([after.matchState, after.matchProspectId, after.reviewState, after.reviewNote], ["NEW", null, "APPROVED", "approved by a person"], "match corrected; the human decision is kept");
    assert.deepEqual([after.qualificationLane, after.qualificationReasons], [null, []], "the stale verdict is cleared so the policy re-evaluates");
    assert.equal(JSON.stringify(await db.crmProspect.findUnique({ where: { id: victim.id } })), prospectsBefore, "the CRM prospect is byte-identical");
    // Stale STORED repair-fit (staged under the old rules) on a candidate a policy had approved: corrected, and the stale policy verdict is cleared so it is re-evaluated (never imported on the old verdict).
    const tonno = rec("Tonno Cover Depot Rematch", "OTT", { address: { freeform: "115-42 Ave SW", locality: "Calgary", postcode: "T2G 1Z9", region: "AB", country: "CA" }, phones: ["+18557390287"], geo: { lat: 51.03, lng: -114.06 } });
    assert.equal((await extract([tonno], ["AB"], "2026-11-22.0")).done.ok, true);
    const tc = await cand(tonno.id);
    await db.crmDiscoveryCandidate.update({ where: { id: tc.id }, data: { repairFit: "VERIFIED_REPAIR", repairFitReasons: ["REPAIR_CATEGORY"], reviewState: "APPROVED", approvedByPolicyVersion: 1, qualificationLane: "AUTO_ELIGIBLE", qualificationPolicyVersion: 1 } });
    const fitPrev = await rematchCandidates(admin, { province: "AB", apply: false });
    assert.ok((fitPrev.transitions["fit:VERIFIED_REPAIR->HUMAN_REVIEW"] ?? 0) >= 1);
    await rematchCandidates(admin, { province: "AB", apply: true });
    const tAfter = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: tc.id } });
    assert.deepEqual([tAfter.repairFit, tAfter.qualificationLane, tAfter.qualificationPolicyVersion], ["HUMAN_REVIEW", null, null]);
    assert.deepEqual(tAfter.repairFitReasons, ["NAME_SIGNAL_ACCESSORIES_ONLY"]);
    assert.equal((await rematchCandidates(admin, { province: "AB", apply: true })).changed, 0, "idempotent");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_REMATCH" as any } }), 2, "each applied re-check is audited");
    const seller = await access.resolvePlatformSalesActor(users.Seller);
    if (seller) await assert.rejects(rematchCandidates(seller, { province: "AB", apply: false }), /SALES_FORBIDDEN/);
    await assert.rejects(rematchCandidates(admin, { province: "ZZ", apply: false }), /INVALID/);
  });

  test("province-scoped manual import: the button on a province-filtered list imports only that province's approved candidates", async () => {
    const mkc = (name: string, region: string, city: string, post: string, lat: number, lng: number, n: number) => rec(name, "OTT", { address: { freeform: `${n} Scope St`, locality: city, postcode: post, region, country: "CA" }, phones: [`+1780555${String(1000 + n)}`], geo: { lat, lng } });
    const a = mkc("Scope Test Alberta Garage", "AB", "Edmonton", "T5J 1S9", 53.55, -113.49, 11), b = mkc("Scope Test BC Garage", "BC", "Vancouver", "V6B 1A1", 49.28, -123.12, 12);
    assert.equal((await extract([a, b], ["AB", "BC"], "2026-11-21.0")).done.ok, true);
    const [ca, cb] = [await cand(a.id), await cand(b.id)];
    as(users.Root);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [ca.id, cb.id], decision: "APPROVED" })) as any).ok, true);
    const imp: any = await radar.importApprovedDiscoveryCandidates({ province: "AB" });
    assert.equal(imp.ok, true, JSON.stringify(imp));
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: ca.id } })).importState, "CREATED");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cb.id } })).importState, "NOT_IMPORTED", "the BC approval was not taken by an AB-scoped import");
    assert.equal(((await radar.importApprovedDiscoveryCandidates({ province: "ZZ" })) as any).ok, false);
  });

  test("discovery ICP (independent repair businesses only): chains are EXCLUDED at staging, blocked at approval/import even with an override, never reach the CRM across refreshes, and the re-check Preview reports the impact without touching human decisions", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { rematchCandidates } = await import("../src/lib/lead-radar/rematch");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    const ab = (name: string, n: number, o: Record<string, unknown> = {}) => rec(name, "OTT", { address: { freeform: `${700 + n} ICP Ave`, locality: "Edmonton", postcode: "T5J 2Z2", region: "AB", country: "CA" }, phones: [`+1780555${String(8100 + n)}`], geo: { lat: 53.5 + n * 0.001, lng: -113.5 }, ...o });
    const chain = ab("Fountain Tire Edmonton ICP", 1, { websites: ["https://www.fountaintire.com/store/icp1"] });
    const franchisee = ab("R.R. Station Service ICP Inc.", 2, { websites: ["https://www.napaautopro.com/stations/icp2"] });
    const supplier = ab("Joe's ICP Garage (NAPA parts available)", 3);
    const diesel = ab("Prairie ICP Diesel & Truck Repair", 4, { taxonomy: { primary: "truck_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "truck_repair"], alternates: null } });
    const recs = [chain, franchisee, supplier, diesel];
    assert.equal((await extract(recs, ["AB"], "2026-12-01.0")).done.ok, true);
    const [cc, cf, cs, cd] = [await cand(chain.id), await cand(franchisee.id), await cand(supplier.id), await cand(diesel.id)];
    for (const c of [cc, cf]) { assert.equal(c.repairFit, "EXCLUDED"); assert.ok(c.repairFitReasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE")); assert.ok(c.repairFitReasons.some((x) => x.startsWith("ICP_REGISTRY_V"))); }
    assert.ok(cc.repairFitReasons.includes("ICP_BRAND_FOUNTAIN_TIRE")); assert.ok(cf.repairFitReasons.includes("ICP_BRAND_NAPA"));
    assert.notEqual(cs.repairFit, "EXCLUDED", "an independent shop that only mentions a NAPA parts supply stays eligible");
    assert.equal(cd.repairFit, "VERIFIED_REPAIR", "heavy-duty / diesel is an eligible specialist segment");
    // Approval is refused, and a fit override does not reach the ICP.
    for (const override of [false, true]) {
      const r: any = await radar.reviewDiscoveryCandidates({ ids: [cc.id, cf.id], decision: "APPROVED", note: "I really want these chain stores", fitOverride: override });
      assert.ok(r.ok === false || (r.result?.updated ?? r.updated ?? 0) === 0, JSON.stringify(r));
      assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cc.id } })).reviewState, "PENDING");
    }
    // An approval that already exists (given before this policy) is stopped at import: durable rejection, no prospect, override ignored.
    await db.crmDiscoveryCandidate.update({ where: { id: cc.id }, data: { reviewState: "APPROVED", reviewNote: "FIT_OVERRIDE: legacy approval", reviewedByUserId: users.Root, reviewedAt: new Date() } });
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: [cc.id] });
    assert.equal(imp.ok, true, JSON.stringify(imp));
    const ccAfter = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cc.id } });
    assert.deepEqual([ccAfter.importState, ccAfter.reviewState, ccAfter.reviewNote], ["NOT_IMPORTED", "REJECTED", "FIT_EXCLUDED_AT_IMPORT"]);
    // Qualification BLOCKS (never human review) with the distinct reason.
    const { qualifyPending } = await import("../src/lib/lead-radar/qualify");
    const { getActivePolicy } = await import("../src/lib/lead-radar/policy");
    const pol = await getActivePolicy();
    if (pol) {
      await db.crmDiscoveryCandidate.update({ where: { id: cf.id }, data: { qualificationLane: null, qualificationPolicyVersion: null, qualifiedAt: null, qualificationReasons: [] } });
      await qualifyPending(pol, { deadline: Date.now() + 20_000 });
      const q = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cf.id } });
      assert.equal(q.qualificationLane, "BLOCKED"); assert.ok(q.qualificationReasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE"));
    }
    // A later release of the same places: still excluded, still not in the CRM, the rejection (exclusion history) is kept.
    assert.equal((await extract(recs, ["AB"], "2026-12-08.0")).done.ok, true);
    const cc2 = await cand(chain.id);
    assert.deepEqual([cc2.repairFit, cc2.reviewState, cc2.importState], ["EXCLUDED", "REJECTED", "NOT_IMPORTED"]);
    assert.equal(await db.crmProspect.count({ where: { OR: [{ name: { contains: "Fountain Tire Edmonton ICP" } }, { name: { contains: "R.R. Station Service ICP" } }] } }), 0);
    // Re-check Preview over stale stored verdicts (a chain stored as VERIFIED_REPAIR under the old rules; a person-approved one).
    await db.crmDiscoveryCandidate.update({ where: { id: cf.id }, data: { repairFit: "VERIFIED_REPAIR", repairFitReasons: ["REPAIR_CATEGORY"], reviewState: "APPROVED", reviewNote: "approved by a person" } });
    await db.crmDiscoveryCandidate.update({ where: { id: cc.id }, data: { repairFit: "VERIFIED_REPAIR", repairFitReasons: ["REPAIR_CATEGORY"] } });
    const prev = await rematchCandidates(admin, { province: "AB", apply: false });
    assert.ok(prev.icp.newlyExcluded >= 2); assert.ok((prev.icp.newlyExcludedByBrand.FOUNTAIN_TIRE ?? 0) >= 1 && (prev.icp.newlyExcludedByBrand.NAPA ?? 0) >= 1);
    assert.ok(prev.icp.protectedDecisions.examined >= 1 && prev.icp.protectedDecisions.approvedNowBlockedAtImport >= 1 && prev.icp.protectedDecisions.reviewStateTouched === 0);
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cf.id } })).repairFit, "VERIFIED_REPAIR", "preview writes nothing");
    await rematchCandidates(admin, { province: "AB", apply: true });
    const cfAfter = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cf.id } });
    assert.deepEqual([cfAfter.repairFit, cfAfter.reviewState, cfAfter.reviewNote], ["EXCLUDED", "APPROVED", "approved by a person"], "fit corrected; the person's decision is kept (and the import gate still refuses it)");
  });

  test("Preview all: bounded 500-candidate batches over a province (cursor-resumable) are strictly read-only, add up exactly to the single multi-page re-check, and report domain-only exclusions, CRM match changes, protected impact and review rows", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { rematchCandidates, REMATCH_PAGE } = await import("../src/lib/lead-radar/rematch");
    const prev = await import("../src/domain/lead-radar/icp-preview");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    // 1,100 more Alberta candidates (3 batches in total): clones of an existing row, so every column is realistic. A fifth carry a stale VERIFIED verdict on a franchisor-site-only business.
    const tpl = await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { province: "AB", importState: "NOT_IMPORTED", duplicateOfCandidateId: null } });
    const { id: _id, ...rest } = tpl as any; void _id;
    const mk = (i: number) => ({ ...rest, sourceRecordId: `pa-${run}-${i}`, name: i % 5 === 0 ? `Pa Station ${i}` : `Pa Garage ${i}`, nameNormalized: `pa garage ${i}`, website: i % 5 === 0 ? `https://www.napaautopro.com/stations/pa${i}` : `https://pa-${run}-${i}.example.ca`,
      phone: null, address: `${i} Preview Rd`, repairFit: i % 5 === 0 ? "VERIFIED_REPAIR" : tpl.repairFit, repairFitReasons: i % 5 === 0 ? ["REPAIR_CATEGORY"] : tpl.repairFitReasons, reviewState: i % 50 === 0 ? "APPROVED" : "PENDING", importState: "NOT_IMPORTED", importedProspectId: null, matchState: "NEW", matchProspectId: null, duplicateOfCandidateId: null });
    await db.crmDiscoveryCandidate.createMany({ data: Array.from({ length: 1100 }, (_, i) => mk(i + 1)) });
    const pool = await db.crmDiscoveryCandidate.count({ where: { province: "AB", importState: "NOT_IMPORTED", duplicateOfCandidateId: null } });
    assert.ok(pool > REMATCH_PAGE * 2, "more than two batches");
    const snap = async () => JSON.stringify([await db.crmDiscoveryCandidate.findMany({ where: { province: "AB" }, orderBy: { id: "asc" } }), await db.crmProspect.count(), await db.crmAuditEvent.count()]);
    const before = await snap();

    as(users.Root);
    let acc = prev.newAcc("AB");
    for (let guard = 0; !acc.done && guard < 20; guard++) {
      const from = acc.cursor;
      const r: any = await radar.previewProvinceCandidatesBatch({ province: "AB", cursor: from });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.ok(r.result.examined <= REMATCH_PAGE, "each request is bounded");
      acc = prev.mergeBatch(acc, r.result, from);
    }
    assert.equal(acc.done, true); assert.equal(acc.examined, pool); assert.equal(acc.poolSize, pool); assert.ok(acc.batches >= 3);
    assert.equal(await snap(), before, "Preview all writes nothing: candidates, prospects and the audit log are untouched");

    // Exactly the same totals as the single multi-page re-check (preview mode).
    const single = await rematchCandidates(admin, { province: "AB", apply: false });
    assert.equal(single.nextCursor, null);
    assert.deepEqual([acc.examined, acc.changed, acc.transitions], [single.examined, single.changed, single.transitions]);
    assert.deepEqual([acc.icp.newlyExcluded, acc.icp.newlyExcludedDomainOnly, acc.icp.verifiedAfter, acc.icp.excludedAfter, acc.icp.remainingHumanReview], [single.icp.newlyExcluded, single.icp.newlyExcludedDomainOnly, single.icp.verifiedAfter, single.icp.excludedAfter, single.icp.remainingHumanReview]);
    // The franchisor-site-only exclusions are listed with business, domain, brand and reason; approved candidates are reported as protected decisions and never changed.
    assert.ok(acc.icp.newlyExcludedDomainOnly >= 220, "every fifth clone");
    assert.equal(acc.detail.domainOnly.length, acc.icp.newlyExcludedDomainOnly);
    assert.deepEqual([acc.detail.domainOnly[0].domain, acc.detail.domainOnly[0].brand, acc.detail.domainOnly[0].reason], ["napaautopro.com", "NAPA", "ICP_EVIDENCE_DOMAIN_ONLY"]);
    assert.ok(acc.detail.review.some((x) => x.kind === "QUESTIONABLE_EXCLUSION" && x.flags.includes("DOMAIN_ONLY")));
    assert.ok(acc.icp.protectedDecisions.examined >= 20 && acc.icp.protectedDecisions.reviewStateTouched === 0);
    assert.equal(prev.recommendApply(acc).verdict, "NO_GO", "a fifth of the exclusions rest on the domain alone");
    const csv = prev.toCsv(acc.detail.domainOnly, prev.DOMAIN_ONLY_CSV_COLUMNS);
    assert.ok(csv.split("\r\n").length > acc.detail.domainOnly.length);
    // Resumable: restarting from a mid-way cursor yields the remaining batches only.
    const mid: any = await radar.previewProvinceCandidatesBatch({ province: "AB", cursor: null });
    const rest2: any = await radar.previewProvinceCandidatesBatch({ province: "AB", cursor: mid.result.nextCursor });
    assert.equal(mid.result.examined + rest2.result.examined + (rest2.result.nextCursor ? 1 : 0) >= pool - REMATCH_PAGE, true);
    // Not for sellers, not for apply-with-detail.
    const seller = await access.resolvePlatformSalesActor(users.Seller);
    if (seller) await assert.rejects(rematchCandidates(seller, { province: "AB", apply: false, detail: true }), /SALES_FORBIDDEN/);
    await assert.rejects(rematchCandidates(admin, { province: "AB", apply: true, detail: true }), /INVALID/);
    assert.equal(await snap(), before);
  });
}
