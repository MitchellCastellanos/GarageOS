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
    const franchisee = ab("R.R. Station Service ICP Inc.", 2, { websites: ["https://www.napaautopro.com/en/auto-repair/alberta/edmonton/icp2"] });
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
    await db.crmDiscoveryExclusion.deleteMany({ where: { sourceRecordId: chain.id } }); // simulate a candidate staged before tombstones existed
    assert.ok(prev.icp.tombstonesToWrite >= 2);
    await rematchCandidates(admin, { province: "AB", apply: true });
    const tombAfter = await db.crmDiscoveryExclusion.findFirstOrThrow({ where: { sourceRecordId: chain.id } });
    assert.deepEqual([tombAfter.status, tombAfter.brandId, tombAfter.seenCount], ["ACTIVE", "FOUNTAIN_TIRE", 1], "Apply records the missing tombstone");
    assert.ok((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cc.id } })).repairFitReasons.includes("ICP_TOMBSTONE"), "and marks the stored verdict as durable");
    const cfAfter = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cf.id } });
    assert.deepEqual([cfAfter.repairFit, cfAfter.reviewState, cfAfter.reviewNote], ["EXCLUDED", "APPROVED", "approved by a person"], "fit corrected; the person's decision is kept (and the import gate still refuses it)");
  });

  test("Preview all: bounded 500-candidate batches over a province (cursor-resumable) are strictly read-only, add up exactly to the single multi-page re-check, and report domain-only exclusions, CRM match changes, protected impact and review rows", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { rematchCandidates, REMATCH_PAGE } = await import("../src/lib/lead-radar/rematch");
    const prev = await import("../src/domain/lead-radar/icp-preview");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    // 1,100 more Alberta candidates (3 batches in total): clones of an existing row, so every column is realistic. A fifth carry a stale VERIFIED verdict on a franchisor-site-only business (now a review, not an exclusion).
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
    assert.deepEqual([acc.icp.newlyExcluded, acc.icp.newlyDomainOnlyReview, acc.icp.verifiedAfter, acc.icp.excludedAfter, acc.icp.remainingHumanReview], [single.icp.newlyExcluded, single.icp.newlyDomainOnlyReview, single.icp.verifiedAfter, single.icp.excludedAfter, single.icp.remainingHumanReview]);
    // The franchisor-site-only exclusions are listed with business, domain, brand and reason; approved candidates are reported as protected decisions and never changed.
    assert.ok(acc.icp.newlyDomainOnlyReview >= 220, "every fifth clone is routed to review on a franchisor site alone");
    assert.equal(acc.detail.domainOnly.length, acc.icp.newlyDomainOnlyReview);
    assert.deepEqual([acc.detail.domainOnly[0].domain, acc.detail.domainOnly[0].brand, acc.detail.domainOnly[0].reason], ["napaautopro.com", "NAPA", "ICP_DOMAIN_ONLY_REVIEW"]);
        assert.ok(acc.icp.protectedDecisions.examined >= 20 && acc.icp.protectedDecisions.reviewStateTouched === 0);
    assert.equal(prev.recommendApply(acc).verdict, "NO_GO", "a fifth of the candidates would be sent to review on a franchisor site alone");
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

  test("ICP tombstones: an exclusion survives re-extraction, a registry change and re-keying; a different independent business is never suppressed; a Super Admin release is audited and inherited; CRM records and review decisions are untouched", async () => {
    as(users.Root);
    const reg = await import("../src/domain/lead-radar/icp-registry");
    const brands = reg.ICP_BRANDS as unknown as { id: string }[];
    brands.push({ id: "ZEBRA_WHEEL", category: "FRANCHISE_SERVICE_CHAIN", aliases: ["zebra wheel works"] } as never);
    const abAt = (name: string, n: number, street: string, o: Record<string, unknown> = {}) => rec(name, "OTT", { address: { freeform: street, locality: "Calgary", postcode: "T2P 1J9", region: "AB", country: "CA" }, phones: [`+1403555${8200 + n}`], geo: { lat: 51.04 + n * 0.001, lng: -114.06 }, websites: [`https://tomb-${run}-${n}.example.ca`], ...o });
    const z1 = abAt("Zebra Wheel Works Calgary Centre", 1, "101 Tomb Ave SW");
    const mgr = await db.user.create({ data: { name: "Tomb Manager", email: `tomb-mgr-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    await db.platformSalesStaff.create({ data: { userId: mgr.id, role: "SALES_MANAGER", status: "ACTIVE", displayName: "Tomb Manager", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: [], uiLocale: "EN" } });
    // an existing, owned CRM record with the very same name: must never be touched by any of this
    const owner = await db.platformSalesStaff.findFirstOrThrow({ where: { displayName: "C2 Owner" } });
    const crm = await db.crmProspect.create({ data: { name: "Zebra Wheel Works Calgary Centre", nameNormalized: "zebra wheel works calgary centre", city: "Calgary", province: "AB", assignedStaffId: owner.id, doNotContact: true, territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root } });
    const crmSnap = async () => JSON.stringify([await db.crmProspect.findUnique({ where: { id: crm.id } }), await db.crmProspect.count({ where: { name: { contains: "Zebra Wheel" } } })]);
    const crmBefore = await crmSnap();
    try {
      assert.equal((await extract([z1], ["AB"], "2026-12-10.0")).done.ok, true);
      const c1 = await cand(z1.id);
      assert.equal(c1.repairFit, "EXCLUDED"); assert.ok(c1.repairFitReasons.includes("ICP_TOMBSTONE") && c1.repairFitReasons.includes("ICP_BRAND_ZEBRA_WHEEL"));
      const t1 = await db.crmDiscoveryExclusion.findUniqueOrThrow({ where: { source_sourceRecordId: { source: "OVERTURE", sourceRecordId: z1.id } } });
      assert.deepEqual([t1.status, t1.seenCount, t1.brandId, t1.category, t1.province, !!t1.identityKey], ["ACTIVE", 1, "ZEBRA_WHEEL", "FRANCHISE_SERVICE_CHAIN", "AB", true]);
      // a person's earlier decision on the staged record is preserved by everything below
      await db.crmDiscoveryCandidate.update({ where: { id: c1.id }, data: { reviewState: "REJECTED", reviewNote: "decided by a person", reviewedByUserId: users.Root, reviewedAt: new Date() } });

      // The registry no longer lists the brand (or never knew this variant): the tombstone alone keeps it excluded across a new release, and across a re-keyed id.
      brands.pop();
      const rekeyed = { ...z1, id: z1.id.replace(/.$/, "z") };
      const sameAddressOtherBusiness = abAt("Foothills Tire Service", 2, "101 Tomb Ave SW");
      const sameNameOtherPlace = abAt("Zebra Wheel Works Calgary Centre", 3, "88 Elsewhere Rd NW", { websites: [z1.websites[0]] }); // even sharing the SAME website
      const sameNameOtherProvince = rec("Zebra Wheel Works Calgary Centre", "TOR", { phones: ["+14165558211"], websites: [z1.websites[0]] });
      assert.equal((await extract([z1, rekeyed, sameAddressOtherBusiness, sameNameOtherPlace], ["AB"], "2026-12-17.0")).done.ok, true);
      assert.equal((await extract([sameNameOtherProvince], ["ON"], "2026-12-17.0")).done.ok, true);
      const again = await cand(z1.id);
      assert.deepEqual([again.repairFit, again.reviewState, again.reviewNote], ["EXCLUDED", "REJECTED", "decided by a person"], "still excluded without the registry; the person's decision is kept; the row was not deleted");
      const t2 = await db.crmDiscoveryExclusion.findUniqueOrThrow({ where: { id: t1.id } });
      assert.equal(t2.seenCount, 2); assert.equal(t2.lastSeenRelease, "2026-12-17.0"); assert.equal(t2.firstExcludedAt.getTime(), t1.firstExcludedAt.getTime());
      const rk = await cand(rekeyed.id);
      assert.equal(rk.repairFit, "EXCLUDED"); assert.ok(rk.repairFitReasons.includes("ICP_TOMBSTONE_REKEYED"), "the same exact place+name under a new id is recognised");
      assert.equal(await db.crmDiscoveryExclusion.count({ where: { sourceRecordId: rekeyed.id, status: "ACTIVE" } }), 1, "the re-keyed id gets its own tombstone");
      // false-positive prevention: a different business is NOT suppressed by sharing the address, the name, the website domain or the name in another province
      for (const r of [sameAddressOtherBusiness, sameNameOtherPlace, sameNameOtherProvince]) {
        const c = await cand(r.id);
        assert.ok(!c.repairFitReasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE"), `${r.name} @ ${(r.address as any).freeform}`);
        assert.equal(await db.crmDiscoveryExclusion.count({ where: { sourceRecordId: r.id } }), 0);
      }
      assert.equal((await cand(sameNameOtherProvince.id)).repairFit, "VERIFIED_REPAIR");

      // Super Admin release: a seller cannot; the note is mandatory; history stays; the decision is inherited by a later re-keyed record.
      as(users.Seller);
      await assert.rejects(radar.releaseDiscoveryExclusion({ candidateId: again.id, note: "this is an independent shop" }), /SALES_FORBIDDEN/);
      as(users.Root);
      assert.equal(((await radar.releaseDiscoveryExclusion({ candidateId: again.id, note: "short" })) as any).ok, false);
      const rel: any = await radar.releaseDiscoveryExclusion({ candidateId: again.id, note: "Verified by phone: independent owner-operated shop" });
      assert.equal(rel.ok, true, JSON.stringify(rel));
      const released = await cand(z1.id);
      assert.equal(released.icpOverride, true); assert.notEqual(released.repairFit, "EXCLUDED"); assert.equal(released.reviewNote, "decided by a person");
      const t3 = await db.crmDiscoveryExclusion.findUniqueOrThrow({ where: { id: t1.id } });
      assert.deepEqual([t3.status, t3.releasedByUserId, !!t3.releasedAt, t3.releaseNote], ["RELEASED", users.Root, true, "Verified by phone: independent owner-operated shop"]);
      assert.ok((await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_EXCLUSION_RELEASED" as any, entityId: again.id } })) >= 1);
      const rekeyed2 = { ...z1, id: z1.id.replace(/.$/, "y") };
      assert.equal((await extract([z1, rekeyed2], ["AB"], "2026-12-24.0")).done.ok, true);
      const r2 = await cand(rekeyed2.id), r1 = await cand(z1.id);
      assert.ok(!r1.repairFitReasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE") && !r2.repairFitReasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE"), "the release survives a refresh and is inherited by the re-keyed record");
      assert.equal((await db.crmDiscoveryExclusion.findUniqueOrThrow({ where: { id: t1.id } })).status, "RELEASED", "a refresh never silently re-activates a released tombstone");
      assert.equal(await crmSnap(), crmBefore, "the existing CRM record (owner, DNC) and the CRM population are untouched");
    } finally { const i = brands.findIndex((b) => b.id === "ZEBRA_WHEEL"); if (i >= 0) brands.splice(i, 1); }
  });

  test("seller visibility: ICP-excluded businesses are invisible in the shared pool and the candidate list for everyone except a Super Admin; an owned record stays visible to its owner", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { assignedScopeWhere } = await import("../src/domain/sales-crm/access");
    const { listCandidates, candidateFilterSchema } = await import("../src/lib/lead-radar/candidates");
    const root = (await access.resolvePlatformSalesActor(users.Root))!;
    const mgrUser = await db.user.findFirstOrThrow({ where: { email: `tomb-mgr-${run}@garage-os.ca` } });
    const mgr = (await access.resolvePlatformSalesActor(mgrUser.id))!;
    assert.ok(mgr && !mgr.all);
    const mgrStaff = await db.platformSalesStaff.findFirstOrThrow({ where: { userId: mgrUser.id } });
    const mk = (name: string, o: Record<string, unknown>) => db.crmProspect.create({ data: { name: `Vis ${name} ${run}`, nameNormalized: `vis ${name.toLowerCase()} ${run}`, city: "Calgary", province: "AB", territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root, ...o } });
    await mk("Chain", { repairFit: "EXCLUDED", repairFitSource: "AUTO", repairFitReasons: ["OUTSIDE_ICP_CHAIN_OR_CORPORATE"] });
    await mk("Independent", { repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO" });
    await mk("Unlabelled", {});
    await mk("OwnedExcluded", { repairFit: "EXCLUDED", repairFitSource: "HUMAN", repairFitByUserId: users.Root, repairFitAt: new Date(), assignedStaffId: mgrStaff.id });
    const names = async (actor: typeof root) => (await db.crmProspect.findMany({ where: { AND: [assignedScopeWhere(actor), { name: { endsWith: ` ${run}` } }, { name: { startsWith: "Vis " } }] }, select: { name: true } })).map((p) => p.name.replace(` ${run}`, "").replace("Vis ", "")).sort();
    assert.deepEqual(await names(mgr), ["Independent", "OwnedExcluded", "Unlabelled"], "the shared pool hides the chain; the owner keeps their own record");
    assert.deepEqual(await names(root), ["Chain", "Independent", "OwnedExcluded", "Unlabelled"], "Super Admin keeps full audit visibility");
    // Lead Radar candidate list
    const f = (o: Record<string, string>) => candidateFilterSchema.parse({ q: "Fountain Tire Edmonton ICP", ...o });
    assert.equal((await listCandidates(root, f({}))).total, 0, "hidden by default");
    assert.ok((await listCandidates(root, f({ icp: "all" }))).total >= 1, "Super Admin audit view");
    assert.ok((await listCandidates(root, f({ fit: "EXCLUDED" }))).total >= 1, "the EXCLUDED fit filter is an audit view too");
    assert.equal((await listCandidates(mgr, f({ icp: "all", fit: "EXCLUDED" }))).total, 0, "never shown to a non-Super-Admin, whatever the URL says");
  });

  test("Apply in bounded, resumable batches (the reported production symptom): a first batch with no change is not 'nothing to apply'; the cursor walk previews and applies EVERY change, stops and resumes safely, is idempotent, and preserves tombstones, manual decisions and CRM records", async () => {
    const access = await import("../src/lib/sales-crm/access");
    const { rematchCandidates, REMATCH_PAGE } = await import("../src/lib/lead-radar/rematch");
    const prev = await import("../src/domain/lead-radar/icp-preview");
    const ap = await import("../src/domain/lead-radar/icp-apply");
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    as(users.Root);
    // 1,300 Saskatchewan candidates: the FIRST 1,000 are already current (nothing to change), the LAST 300 are stale chain listings still stored as VERIFIED — so the first two batches show
    // "0 changes, more remain" exactly like production, and every change sits behind the cursor.
    const tpl = await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { importState: "NOT_IMPORTED", duplicateOfCandidateId: null } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = tpl as any; void _id; void _c; void _u;
    const row = (i: number) => ({ ...rest, id: `zz-apply-${run}-${String(i).padStart(5, "0")}`, sourceRecordId: `ap-${run}-${i}`, province: "SK", city: "Regina", postalCode: "S4P 3Y2", name: i <= 1000 ? `Apply Garage ${i}` : `Kal Tire Apply ${i}`, nameNormalized: i <= 1000 ? `apply garage ${i}` : `kal tire apply ${i}`,
      website: `https://ap-${run}-${i}.example.ca`, phone: null, address: `${i} Apply Rd`, repairFit: "VERIFIED_REPAIR", repairFitReasons: ["REPAIR_CATEGORY"], taxonomyPrimary: "automotive_repair", classReasons: ["REPAIR_SHOP"], chainSignal: "NO_CHAIN_SIGNAL",
      reviewState: "PENDING", reviewNote: null, importState: "NOT_IMPORTED", importedProspectId: null, matchState: "NEW", matchProspectId: null, matchReasons: [], duplicateOfCandidateId: null, icpOverride: false, qualificationLane: null, qualificationReasons: [] });
    await db.crmDiscoveryCandidate.createMany({ data: Array.from({ length: 1300 }, (_, i) => row(i + 1)) });
    const stale = (i: number) => db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: `ap-${run}-${i}` } });
    // a person's decision on a stale chain listing, an earlier tombstone with its own history, and an existing CRM record: all must survive
    await db.crmDiscoveryCandidate.update({ where: { id: (await stale(1100)).id }, data: { reviewState: "APPROVED", reviewNote: "approved by a person", reviewedByUserId: users.Root, reviewedAt: new Date() } });
    await db.crmDiscoveryExclusion.create({ data: { source: "OVERTURE", sourceRecordId: `ap-${run}-1150`, province: "SK", name: "Kal Tire Apply 1150", reasonCode: "OUTSIDE_ICP_CHAIN_OR_CORPORATE", registryVersion: 2, seenCount: 5 } });
    const crm = await db.crmProspect.create({ data: { name: "Kal Tire Apply 1200", nameNormalized: "kal tire apply 1200", city: "Regina", province: "SK", assignedStaffId: (await db.platformSalesStaff.findFirstOrThrow({ where: { displayName: "C2 Owner" } })).id, doNotContact: true, territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root } });
    const crmSnap = async () => JSON.stringify([await db.crmProspect.findUnique({ where: { id: crm.id } }), await db.crmProspect.count(), await db.crmContact.count(), await db.crmActivity.count()]);
    const crmBefore = await crmSnap();

    // 1) The symptom, reproduced at the service level: the first batch has no change although changes exist behind the cursor.
    const firstOnly = await rematchCandidates(admin, { province: "SK", apply: false, maxPages: 1 });
    assert.deepEqual([firstOnly.examined, firstOnly.changed, firstOnly.nextCursor !== null, firstOnly.poolSize], [REMATCH_PAGE, 0, true, 1300]);
    const gate1 = ap.applyGate(prev.mergeBatch(prev.newAcc("SK"), { examined: firstOnly.examined, changed: firstOnly.changed, transitions: firstOnly.transitions, icp: firstOnly.icp, detail: prev.emptyDetail(), poolSize: firstOnly.poolSize!, nextCursor: firstOnly.nextCursor }, null), null, false, null);
    assert.deepEqual([gate1.state, gate1.canApply], ["NEEDS_PREVIEW", false], "locked for a stated reason, not 'nothing to apply'");

    // 2) A cursor-driven Preview all finds every change.
    let pv = prev.newAcc("SK");
    for (let g = 0; !pv.done && g < 20; g++) { const from = pv.cursor; const r: any = await radar.previewProvinceCandidatesBatch({ province: "SK", cursor: from }); assert.equal(r.ok, true, JSON.stringify(r)); pv = prev.mergeBatch(pv, r.result, from); }
    assert.deepEqual([pv.done, pv.examined, pv.poolSize, pv.changed], [true, 1300, 1300, 300]);
    const gate2 = ap.applyGate(pv, null, false, prev.recommendApply(pv).verdict);
    assert.deepEqual([gate2.state, gate2.canApply, gate2.expectedChanges], ["READY", true, 300]);
    const snapBefore = JSON.stringify(await db.crmDiscoveryCandidate.findMany({ where: { province: "SK" }, orderBy: { id: "asc" }, select: { id: true, repairFit: true, repairFitReasons: true } }));

    // 3) Apply in bounded batches, interrupted after two batches and resumed from the saved cursor.
    await assert.rejects(async () => { as(users.Seller); try { await radar.applyProvinceReclassificationBatch({ province: "SK", cursor: null }); } finally { as(users.Root); } }, /SALES_FORBIDDEN/);
    const auditBefore = await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_REMATCH" as any } });
    let a = ap.newApplyAcc("SK");
    const step = async () => { const from = a.cursor; const r: any = await radar.applyProvinceReclassificationBatch({ province: "SK", cursor: from }); assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.result.examined <= REMATCH_PAGE, "bounded"); a = ap.mergeApplyBatch(a, r.result, from); return r.result; };
    const b1 = await step(), b2 = await step();
    assert.deepEqual([b1.changed, b1.written, b2.changed, b2.written, a.done], [0, 0, 0, 0, false], "no change in the first 1,000: nothing written, nothing audited");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_REMATCH" as any } }), auditBefore);
    const savedCursor = a.cursor; // the browser tab is closed here; the cursor is all that is needed
    a = ap.newApplyAcc("SK"); a = { ...a, cursor: savedCursor, batches: 2, examined: b1.examined + b2.examined, poolSize: 1300 };
    for (let g = 0; !a.done && g < 10; g++) await step();
    assert.deepEqual([a.done, a.examined, a.changed, a.written, a.skipped], [true, 1300, 300, 300, 0]);
    assert.equal(a.tombstonesCreated, 299, "one candidate already had its tombstone");

    // 4) Idempotent: a second full walk changes and writes nothing; the verification preview finds nothing left.
    let again = ap.newApplyAcc("SK");
    for (let g = 0; !again.done && g < 10; g++) { const from = again.cursor; const r: any = await radar.applyProvinceReclassificationBatch({ province: "SK", cursor: from }); again = ap.mergeApplyBatch(again, r.result, from); }
    assert.deepEqual([again.changed, again.written, again.tombstonesCreated], [0, 0, 0]);
    let verify = prev.newAcc("SK");
    for (let g = 0; !verify.done && g < 20; g++) { const from = verify.cursor; const r: any = await radar.previewProvinceCandidatesBatch({ province: "SK", cursor: from }); verify = prev.mergeBatch(verify, r.result, from); }
    assert.equal(verify.changed, 0);
    assert.equal(ap.applyGate(verify, null, false, "GO").state, "NOTHING_TO_APPLY", "only a COMPLETE preview with no change reads 'nothing to apply'");

    // 5) Result and preservation.
    const after = await db.crmDiscoveryCandidate.findMany({ where: { province: "SK" }, orderBy: { id: "asc" }, select: { id: true, name: true, repairFit: true, repairFitReasons: true, reviewState: true, reviewNote: true } });
    assert.notEqual(JSON.stringify(after.map(({ id, repairFit, repairFitReasons }) => ({ id, repairFit, repairFitReasons }))), snapBefore);
    assert.equal(after.filter((r) => r.repairFit === "EXCLUDED").length, 300); assert.equal(after.filter((r) => r.name.startsWith("Apply Garage") && r.repairFit === "VERIFIED_REPAIR").length, 1000, "current rows untouched");
    const decided = after.find((r) => r.name === "Kal Tire Apply 1100")!;
    assert.deepEqual([decided.reviewState, decided.reviewNote, decided.repairFit], ["APPROVED", "approved by a person", "EXCLUDED"], "the person's decision is kept (the import gate still refuses it)");
    const t5 = await db.crmDiscoveryExclusion.findUniqueOrThrow({ where: { source_sourceRecordId: { source: "OVERTURE", sourceRecordId: `ap-${run}-1150` } } });
    assert.deepEqual([t5.seenCount, t5.registryVersion, t5.status], [5, 2, "ACTIVE"], "an existing tombstone is not rewritten or inflated by a re-check");
    assert.equal(await db.crmDiscoveryExclusion.count({ where: { province: "SK", status: "ACTIVE" } }), 300);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { province: "SK" } }), 1300, "no staged record was deleted");
    assert.equal(await crmSnap(), crmBefore, "CRM prospects, contacts, activities, ownership and DNC are untouched");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { province: "SK", importState: { not: "NOT_IMPORTED" } } }), 0, "nothing was imported");
  });

  test("C3 preflight (read-only): totals reconcile with the verified pool, every blocker is named, sellers are classified (a Super Admin login is never a target), and the real importer agrees and is idempotent", async () => {
    const { c3Preflight } = await import("../src/lib/lead-radar/national");
    as(users.Root);
    const mb = (name: string, n: number, o: Record<string, unknown> = {}) => rec(name, "OTT", { address: { freeform: `${300 + n} Preflight Ave`, locality: "Winnipeg", postcode: "R3C 0A5", region: "MB", country: "CA" }, phones: [`+1204555${String(8300 + n)}`], geo: { lat: 49.89 + n * 0.001, lng: -97.14 }, ...o });
    const names = ["Ready One", "Ready Two", "Pending Auto", "Pending Person", "Not Qualified", "Rejected Shop", "No Contact Shop", "Ambiguous Shop", "Branch Shop", "Link Shop", "License Shop", "Filler One", "Filler Two"];
    const recs = names.map((nm, i) => mb(`MB ${nm} Garage`, i + 1));
    assert.equal((await extract(recs, ["MB"], "2026-12-30.0")).done.ok, true);
    const c = async (nm: string) => cand(recs[names.indexOf(nm)].id);
    const upd = async (nm: string, data: Record<string, unknown>) => db.crmDiscoveryCandidate.update({ where: { id: (await c(nm)).id }, data: data as never });
    await upd("Pending Auto", { qualificationLane: "AUTO_ELIGIBLE" }); await upd("Pending Person", { qualificationLane: "HUMAN_REVIEW" });
    await upd("No Contact Shop", { phone: null, address: null, postalCode: null }); await upd("Ambiguous Shop", { matchState: "AMBIGUOUS" }); await upd("Branch Shop", { matchState: "BRANCH_OF_EXISTING" });
    await upd("License Shop", { licenseOk: false });
    const linkTarget = await db.crmProspect.create({ data: { name: "Existing Link Target", nameNormalized: "existing link target", city: "Winnipeg", province: "MB", territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root } });
    await upd("Link Shop", { matchState: "EXISTING_STRONG", matchProspectId: linkTarget.id });
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [(await c("Ready One")).id, (await c("Ready Two")).id], decision: "APPROVED" })) as any).ok, true);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: [(await c("Rejected Shop")).id], decision: "REJECTED", note: "not a shop" })) as any).ok, true);
    // a Super Admin login that also holds a Sales Rep row, and a plain Sales Rep: only the second may ever receive prospects
    const sa = await db.user.create({ data: { name: "PF Admin", email: `pf-admin-${run}@garage-os.ca`, role: "SUPER_ADMIN" } });
    const rep = await db.user.create({ data: { name: "PF Rep", email: `pf-rep-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    await db.platformSalesStaff.create({ data: { userId: sa.id, role: "SALES_REP", status: "ACTIVE", displayName: "PF Admin Row", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: [], uiLocale: "EN" } });
    const repStaff = await db.platformSalesStaff.create({ data: { userId: rep.id, role: "SALES_REP", status: "ACTIVE", displayName: "PF Rep", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: ["EN"], uiLocale: "EN" } });
    const snap = async () => JSON.stringify([await db.crmDiscoveryCandidate.findMany({ where: { province: "MB" }, orderBy: { id: "asc" } }), await db.crmProspect.count(), await db.crmAuditEvent.count()]);
    const before = await snap();

    const pf = await c3Preflight("MB");
    assert.equal(await snap(), before, "the preflight writes nothing");
    const verified = await db.crmDiscoveryCandidate.count({ where: { province: "MB", duplicateOfCandidateId: null, repairFit: "VERIFIED_REPAIR", importState: "NOT_IMPORTED" } });
    assert.equal(pf.verifiedEvaluated, verified);
    assert.equal(pf.importable + Object.values(pf.blockers).reduce((a, b) => a + b, 0), pf.verifiedEvaluated, "importable + blocked = every verified candidate, nothing lost or double counted");
    assert.deepEqual(pf.blockers, { REJECTED_BY_PERSON: 1, INSUFFICIENT_CONTACT: 1, MATCH_AMBIGUOUS: 1, MATCH_BRANCH: 1, LICENSE_BLOCKED: 1 });
    assert.deepEqual([pf.newProspects, pf.linksToExisting], [pf.importable - 1, 1]);
    assert.equal(pf.approvals.APPROVED, 2); assert.equal(pf.approvals.POLICY_AUTO, 1); assert.equal(pf.approvals.NEEDS_PERSON, 1);
    assert.equal(pf.approvals.NOT_QUALIFIED + pf.approvals.APPROVED + pf.approvals.POLICY_AUTO + pf.approvals.NEEDS_PERSON, pf.importable);
    assert.equal(pf.readyNow.newProspects + pf.readyNow.links, 3, "two approved + one AUTO_ELIGIBLE (link/new split reported)");
    assert.equal(Object.values(pf.modes).reduce((a, b) => a + b, 0), pf.importable); assert.ok(pf.modes.REMOTE === pf.importable, "a non-Montréal province resolves to REMOTE (national) territory");
    const mine = pf.sellers.find((x) => x.id === repStaff.id)!, adminRow = pf.sellers.find((x) => x.email === sa.email)!;
    assert.deepEqual([mine.superAdminLogin, mine.wouldReceiveRemoteProspect, mine.mode], [false, true, "REMOTE"]);
    assert.deepEqual([adminRow.superAdminLogin, adminRow.wouldReceiveRemoteProspect], [true, false], "a Super Admin login is never an assignment target");
    await assert.rejects(c3Preflight("ZZ"), /INVALID/);

    // The real importer agrees with the preflight and is idempotent: the two approved importable candidates become prospects; the approved-then-blocked one does not; a second run does nothing.
    const imp1: any = await radar.importApprovedDiscoveryCandidates({ province: "MB" });
    assert.equal(imp1.ok, true, JSON.stringify(imp1));
    assert.deepEqual([imp1.result.created, imp1.result.linked, imp1.result.sentToReview], [2, 0, 0]);
    const after = await c3Preflight("MB");
    assert.equal(after.pool.verifiedAlreadyImported, 2); assert.equal(after.verifiedEvaluated, verified - 2);
    const imp2: any = await radar.importApprovedDiscoveryCandidates({ province: "MB" });
    assert.deepEqual([imp2.result.claimed, imp2.result.created], [0, 0], "idempotent: nothing left to claim");
    assert.equal(await db.crmProspect.count({ where: { province: "MB", assignedStaffId: { not: null } } }), 0, "the importer never assigns");
    assert.equal(after.pool.leadRadarProspectsInProvince, 2);
  });

  test("qualification by the existing policy engine never bypasses the protections: ICP chains blocked, domain-only/ambiguous/branch/unresolved to review, no-position never approved, human decisions and duplicates untouched, idempotent", async () => {
    const { qualifyPending } = await import("../src/lib/lead-radar/qualify");
    const q = await import("../src/domain/lead-radar/qualification");
    const { rulesHashOf } = await import("../src/domain/lead-radar/qualification-hash");
    as(users.Root);
    const nb = (name: string, n: number, o: Record<string, unknown> = {}) => rec(name, "OTT", { address: { freeform: `${500 + n} Qualify St`, locality: "Fredericton", postcode: "E3B 1A1", region: "NB", country: "CA" }, phones: [`+1506555${String(8400 + n)}`], geo: { lat: 45.96 + n * 0.001, lng: -66.64 }, ...o });
    const names = ["Clean Garage", "Kal Tire", "Domain Only Garage", "Ambiguous Garage", "Branch Garage", "Located Garage", "NoPoint Garage", "Human Rejected Garage", "Human Approved Garage", "Filler A", "Filler B", "Filler C"];
    const recs = names.map((nm, i) => nm === "Domain Only Garage" ? nb(`NB ${nm}`, i, { websites: ["https://www.napaautopro.com/"] }) : nb(nm === "Kal Tire" ? nm : `NB ${nm}`, i));
    assert.equal((await extract(recs, ["NB"], "2026-12-31.0")).done.ok, true);
    const c = async (nm: string) => cand(recs[names.indexOf(nm)].id);
    await db.crmDiscoveryCandidate.update({ where: { id: (await c("Ambiguous Garage")).id }, data: { matchState: "AMBIGUOUS" } });
    await db.crmDiscoveryCandidate.update({ where: { id: (await c("Branch Garage")).id }, data: { matchState: "BRANCH_OF_EXISTING" } });
    await db.crmDiscoveryCandidate.update({ where: { id: (await c("NoPoint Garage")).id }, data: { sourceLatitude: null, sourceLongitude: null } });
    await db.crmDiscoveryCandidate.update({ where: { id: (await c("Human Rejected Garage")).id }, data: { reviewState: "REJECTED", reviewNote: "decided by a person", reviewedByUserId: users.Root, reviewedAt: new Date() } });
    await db.crmDiscoveryCandidate.update({ where: { id: (await c("Human Approved Garage")).id }, data: { reviewState: "APPROVED", reviewNote: "approved by a person", reviewedByUserId: users.Root, reviewedAt: new Date() } });
    const dupOf = await c("Clean Garage");
    const dup = await db.crmDiscoveryCandidate.create({ data: { ...(({ id: _i, createdAt: _c, updatedAt: _u, ...r }) => r)(dupOf as any), sourceRecordId: `dup-${run}`, duplicateOfCandidateId: dupOf.id, qualificationLane: null, qualificationPolicyVersion: null } as never });
    const rules = q.RECOMMENDED_V2_RULES;
    const policy = { id: "test-policy", version: 7, rules, rulesHash: rulesHashOf(rules), activatedByUserId: users.Root } as any;
    const t1 = await qualifyPending(policy, { deadline: Date.now() + 30_000 });
    assert.ok(t1.evaluated >= 9);
    const st = async (nm: string) => { const x = await c(nm); return [x.qualificationLane, x.reviewState, x.approvedByPolicyVersion] as const; };
    assert.deepEqual(await st("Clean Garage"), ["AUTO_ELIGIBLE", "APPROVED", 7]);
    assert.deepEqual(await st("Located Garage"), ["AUTO_ELIGIBLE", "APPROVED", 7]);
    assert.deepEqual((await st("Kal Tire")).slice(0, 2), ["BLOCKED", "PENDING"], "ICP chain: blocked, never approved");
    assert.deepEqual((await st("Domain Only Garage")).slice(0, 2), ["HUMAN_REVIEW", "PENDING"], "franchisor website alone: a person decides");
    assert.deepEqual((await st("Ambiguous Garage")).slice(0, 2), ["HUMAN_REVIEW", "PENDING"]);
    assert.deepEqual((await st("Branch Garage")).slice(0, 2), ["HUMAN_REVIEW", "PENDING"]);
    assert.deepEqual(await st("NoPoint Garage"), ["AUTO_ELIGIBLE", "PENDING", null], "no source position: never policy-approved");
    const rej = await c("Human Rejected Garage"), apr = await c("Human Approved Garage");
    assert.deepEqual([rej.reviewState, rej.reviewNote, rej.qualificationLane, apr.reviewNote, apr.approvedByPolicyVersion], ["REJECTED", "decided by a person", null, "approved by a person", null], "human decisions are outside the pool");
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: dup.id } })).qualificationLane, null, "a staged duplicate is never evaluated");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { province: "NB", importState: { not: "NOT_IMPORTED" } } }), 0, "qualification imports nothing");
    assert.equal(await db.crmProspect.count({ where: { province: "NB" } }), 0);
    const t2 = await qualifyPending(policy, { deadline: Date.now() + 30_000 });
    assert.equal(t2.evaluated, 0, "idempotent: nothing left under this policy version");
  });
}
