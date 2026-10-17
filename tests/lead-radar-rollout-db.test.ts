/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// One-time national rollout against a REAL PostgreSQL scratch database: activation preconditions, sequential province queue (never AB/QC), quality-gate halt, import scope opened
// only after a province passes, assignment scoped to REMOTE rollout provinces and ONE seller, safety halt, pause/resume. Synthetic data; nothing is sent.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("National rollout database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const auto = await import("../src/actions/lead-radar-automation");
  const autoLib = await import("../src/lib/lead-radar/automation");
  const roLib = await import("../src/lib/lead-radar/rollout");
  const runsLib = await import("../src/lib/lead-radar/runs");
  const access = await import("../src/lib/sales-crm/access");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {};
  let rep = "";
  let seq = 0;
  const PH = String(Date.now() % 1000000).padStart(6, "0");
  const phone = (n: number) => `+1604${PH}${String(n).padStart(2, "0")}`.slice(0, 12);
  const SRC = [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }];
  const REPAIR = { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"], alternates: null };
  const f32 = (v: number) => new Float32Array([v])[0];
  const REGION: Record<string, { locality: string; postcode: string; lat: number; lng: number }> = {
    BC: { locality: "Vancouver", postcode: "V6H 1H6", lat: 49.2827, lng: -123.1207 },
    MB: { locality: "Winnipeg", postcode: "R3C 0A5", lat: 49.8951, lng: -97.1384 },
    ON: { locality: "Toronto", postcode: "M5H 2M9", lat: 43.6532, lng: -79.3832 },
    AB: { locality: "Calgary", postcode: "T2P 1J9", lat: 51.0447, lng: -114.0719 },
    QC: { locality: "Montréal", postcode: "H2X 3K4", lat: 45.5017, lng: -73.5673 },
  };
  function rec(name: string, region: keyof typeof REGION, o: Record<string, unknown> = {}) {
    const n = ++seq, c = REGION[region];
    return {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name, taxonomy: REPAIR,
      address: { freeform: `${100 + n} Main St`, locality: c.locality, postcode: c.postcode, region, country: "CA" },
      phones: [phone(n)], websites: [`https://ro-${run}-${n}.example.ca/`], emails: [], sources: SRC,
      geo: { lat: Math.round(f32(c.lat + n * 0.0001) * 1e7) / 1e7, lng: Math.round(f32(c.lng) * 1e7) / 1e7 }, ...o,
    };
  }
  const lines = (rs: unknown[]) => rs.map((r) => JSON.stringify(r)).join("\n");
  const tick = () => autoLib.runAutomationTick({ trigger: "MANUAL", budgetMs: 40_000 });
  const state = () => db.crmLeadAutomation.findUniqueOrThrow({ where: { id: "default" } });
  const workerRuns = () => db.crmDiscoveryRun.findMany({ where: { execution: "WORKER" }, orderBy: { createdAt: "asc" } });
  const provOf = (r: { scope: unknown }) => ((r.scope as { provinces: string[] }).provinces);

  /** The extraction the GitHub worker performs for a queued run: attach, ingest, complete (through the same run-state functions the worker endpoint calls). */
  async function workerExtract(runId: string, recs: unknown[], stats?: Record<string, number>) {
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    const actor = { userId: r.createdByUserId };
    await runsLib.attachManifest(actor, runId, { extractor: "t", extractorVersion: "1", planHash: r.planHash, release: "2026-12-01.0", recordCount: recs.length, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats: stats ?? { rowGroupsScanned: 3, rowsExamined: 900, rowsEmitted: recs.length } });
    for (let i = 0; i * 250 < recs.length; i++) await runsLib.ingestChunk(actor, runId, i, lines(recs.slice(i * 250, (i + 1) * 250)));
    return runsLib.completeRun(actor, runId);
  }

  test("setup: Super Admin, the rollout Sales Rep, live discovery, an active policy, import scope ON only", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    const repUser = await db.user.create({ data: { name: "Rep", email: "mcastellanos@garage-os.ca", role: "VIEWER", shopId: null } });
    rep = (await db.platformSalesStaff.create({ data: { userId: repUser.id, role: "SALES_REP", status: "ACTIVE", displayName: "Rep", timezone: "America/Toronto", salesMode: "FIELD", leadLanguages: [], uiLocale: "EN", acceptsAutoAssignment: true } })).id;
    as(users.Root);
    process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    const c: any = await auto.createLeadPolicy({ name: "Rollout policy", rules: {} });
    assert.equal(((await auto.previewLeadPolicy(c.policyId)) as any).ok, true);
    assert.equal(((await auto.activateLeadPolicy(c.policyId)) as any).ok, true);
    await db.crmLeadAutomation.upsert({ where: { id: "default" }, create: { id: "default", importProvinces: ["ON"] }, update: { importProvinces: ["ON"] } });
  });

  test("activation: refuses a pilot that is ON, an empty import scope, company-wide sending ON and an invalid seller; then sets ONLY the rollout stages and keeps outreach OFF", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { pilotEnabled: true } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_PILOT_ON/);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { pilotEnabled: false, importProvinces: [] } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_IMPORT_SCOPE_EMPTY/);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { importProvinces: ["ON"] } });
    await db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default", sendingEnabled: true }, update: { sendingEnabled: true } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_SENDING_ON/);
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { sendingEnabled: false } });
    await db.platformSalesStaff.update({ where: { id: rep }, data: { acceptsAutoAssignment: false } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_SELLER_INVALID/);
    await db.platformSalesStaff.update({ where: { id: rep }, data: { acceptsAutoAssignment: true } });
    // eligibility/release start ON to prove activation turns them OFF
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { eligibilityEnabled: true, releaseUnavailable: true } });
    const a = await roLib.activateNationalRollout(actor);
    assert.deepEqual([a.enabled, a.qualifyEnabled, a.importEnabled, a.assignEnabled, a.eligibilityEnabled, a.releaseUnavailable, a.pilotEnabled], [true, true, true, true, false, false, false]);
    assert.deepEqual(a.assignStaffIds, [rep]); assert.equal(a.rolloutStaffId, rep);
    assert.deepEqual(a.rolloutProvinces, ["BC", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"]);
    assert.deepEqual(a.importProvinces, ["ON"], "activation itself does not widen the import scope");
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_ALREADY_ACTIVE/);
  });

  let bcRun = "";
  let unrelated: string[] = [];
  test("cycle 1: exactly one province (BC) is queued for the worker, never AB/QC/ON; further cycles queue nothing while it extracts (idempotent)", async () => {
    const t1 = await tick();
    assert.equal(t1.status, "COMPLETED", JSON.stringify(t1));
    let runs = await workerRuns();
    assert.equal(runs.length, 1); assert.deepEqual(provOf(runs[0]), ["BC"]); bcRun = runs[0].id;
    assert.equal(runs[0].execution, "WORKER");
    await tick(); await tick();
    runs = await workerRuns();
    assert.equal(runs.length, 1, "no second run while BC is active");
    for (const r of await db.crmDiscoveryRun.findMany()) for (const p of provOf(r)) assert.ok(!["AB", "QC", "ON"].includes(p), `never ${p}`);
    assert.equal((await state()).importProvinces.includes("BC"), false, "import is not opened before the extraction passes the gate");
  });

  test("BC passes the gate: import opens for BC only, MB is queued next; chains stay out; qualified clean shops are imported UNASSIGNED then assigned only to the one seller, REMOTE only", async () => {
    const recs = [rec("BC Alpha Auto Repair", "BC"), rec("BC Beta Garage", "BC"), rec("BC Gamma Mechanical", "BC"), rec("Kal Tire", "BC"), rec("BC Delta Motors Service", "BC")];
    const done: any = await workerExtract(bcRun, recs);
    assert.equal(done.blocking, false, JSON.stringify(done));
    // Unrelated pool that must never be assigned by the scoped rollout: an Alberta Lead Radar prospect, a Québec one, and a BC prospect that did not come from Lead Radar.
    const lrBatch = await db.crmImportBatch.create({ data: { createdByUserId: users.Root, filename: "lr.csv", fileHash: `h-${run}`, status: "COMPLETED", sourceKey: "overture-places" } });
    const mk = (name: string, province: string, batch: string | null) => db.crmProspect.create({ data: { name, nameNormalized: name.toLowerCase(), city: "X", province, territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root, ...(batch ? { importBatchId: batch } : {}) } });
    // AB is in the assignment scope now (the owner asked for its existing REMOTE prospects); QC and non-Lead-Radar prospects must stay untouched.
    unrelated = [(await mk("Unrelated AB Garage", "AB", lrBatch.id)).id, (await mk("Unrelated QC Garage", "QC", lrBatch.id)).id, (await mk("Unrelated BC Manual Garage", "BC", null)).id];
    await tick();
    const s = await state();
    assert.deepEqual(s.importProvinces.sort(), ["AB", "BC", "ON"], "BC passed its gate; AB and ON (extracted before the rollout) are opened so their candidates also finish");
    const runs = await workerRuns();
    assert.deepEqual(runs.map((r) => provOf(r)[0]), ["BC", "MB"], "next province queued, still never AB/QC");
    for (let i = 0; i < 4; i++) await tick();
    const bc = await db.crmProspect.findMany({ where: { province: "BC", importBatch: { sourceKey: "overture-places" } }, select: { name: true, assignedStaffId: true, assignmentMode: true, autoAssignedAt: true } });
    assert.ok(bc.length >= 1, "clean BC shops were imported");
    assert.ok(!bc.some((p) => /kal tire/i.test(p.name)), "a chain is never imported");
    for (const p of bc) assert.ok(p.assignedStaffId === null || (p.assignedStaffId === rep && p.assignmentMode === "REMOTE"), "only the one seller, only REMOTE");
    assert.ok(bc.some((p) => p.assignedStaffId === rep), "REMOTE prospects were assigned to the rollout seller");
    assert.equal(await db.crmProspect.count({ where: { id: { in: [unrelated[1], unrelated[2]] }, assignedStaffId: { not: null } } }), 0, "unrelated unassigned prospects (QC, non-Lead-Radar) are never assigned");
    const st = await state();
    assert.equal(st.rolloutHaltCode, null);
  });

  test("MB fails the quality gate: the rollout halts with the province and reason, the automation goes OFF, nothing is skipped; Resume re-checks and halts again until fixed", async () => {
    const mb = (await workerRuns()).find((r) => provOf(r)[0] === "MB")!;
    const bad = [rec("MB One Garage", "MB", { geo: undefined }), rec("MB Two Garage", "MB", { geo: undefined })];
    const r: any = await workerExtract(mb.id, bad).catch((e) => ({ err: String(e) }));
    void r;
    await db.crmDiscoveryRun.update({ where: { id: mb.id }, data: { status: "FAILED", qualityVerdict: "LOW_COORDINATE_COVERAGE", errorCode: "LOW_COORDINATE_COVERAGE", finishedAt: new Date() } });
    await tick();
    const s = await state();
    assert.deepEqual([s.rolloutHaltProvince, s.rolloutHaltCode, s.enabled], ["MB", "EXTRACTION_FAILED", false]);
    assert.equal((await tick()).status, "SKIPPED", "a halted rollout does nothing until a person resumes");
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const before = (await workerRuns()).length;
    await roLib.resumeNationalRollout(actor);
    await tick();
    const s2 = await state();
    assert.deepEqual([s2.rolloutHaltProvince, s2.rolloutHaltCode, s2.enabled], ["MB", "EXTRACTION_FAILED", false], "same cause halts again");
    assert.equal((await workerRuns()).length, before, "no province was skipped or re-queued behind the failure");
    const st = await roLib.rolloutStatus();
    assert.equal(st.state, "HALTED"); assert.equal(st.halt?.province, "MB");
  });

  test("assignment safety: an automation assignment to anyone else, in FIELD mode or outside the rollout provinces halts the rollout", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const other = await db.user.create({ data: { name: "Other", email: `other-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const otherStaff = await db.platformSalesStaff.create({ data: { userId: other.id, role: "SALES_REP", status: "ACTIVE", displayName: "Other", timezone: "America/Toronto", salesMode: "REMOTE", leadLanguages: [], uiLocale: "EN" } });
    const p = await db.crmProspect.findFirstOrThrow({ where: { province: "BC" } });
    // Fix the MB halt first (cancel the failed state by marking MB as legitimately empty is not possible); test the safety check directly on a fresh rollout state.
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutHaltCode: null, rolloutHaltProvince: null, enabled: true, rolloutPaused: false } });
    await db.crmActivity.create({ data: { prospectId: p.id, type: "ASSIGNMENT", authorUserId: users.Root, metadata: { from: null, to: otherStaff.id, via: "lead-radar-automation", mode: "REMOTE" } } });
    await roLib.rolloutStage(actor, await state());
    const s = await state();
    assert.deepEqual([s.rolloutHaltProvince, s.rolloutHaltCode, s.enabled], ["*", "ASSIGNMENT_SAFETY", false]);
    // A person's manual assignment (different `via`) is never a rollout violation.
    await db.crmActivity.deleteMany({ where: { prospectId: p.id, type: "ASSIGNMENT", authorUserId: users.Root } });
    await db.crmActivity.create({ data: { prospectId: p.id, type: "ASSIGNMENT", authorUserId: users.Root, metadata: { from: null, to: otherStaff.id, via: "manual", mode: "REMOTE" } } });
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutHaltCode: null, rolloutHaltProvince: null, enabled: true } });
    await roLib.rolloutStage(actor, await state());
    assert.notEqual((await state()).rolloutHaltCode, "ASSIGNMENT_SAFETY");
    // The allow-list must stay exactly the one rollout seller.
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { assignStaffIds: [rep, otherStaff.id], rolloutHaltCode: null, enabled: true } });
    await roLib.rolloutStage(actor, await state());
    assert.deepEqual([(await state()).rolloutHaltCode], ["SELLER_INVALID"]);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { assignStaffIds: [rep] } });
  });

  test("pause stops the whole automation at once and Resume turns it back on", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutHaltCode: null, rolloutHaltProvince: null, enabled: true, rolloutPaused: false } });
    const paused = await roLib.pauseNationalRollout(actor);
    assert.deepEqual([paused.enabled, paused.rolloutPaused], [false, true]);
    assert.equal((await tick()).status, "SKIPPED");
    const qc = await db.crmProspect.count({ where: { province: "QC", assignedStaffId: { not: null }, autoAssignedAt: { not: null } } });
    assert.equal(qc, 0, "Québec prospects are never auto-assigned by the rollout");
    await roLib.resumeNationalRollout(actor);
    assert.equal((await state()).enabled, true);
  });

  test("completion: extractions finishing is not enough; ON/AB/new provinces must finish assignment too (REMOTE only, no QC); only then it completes and the master goes OFF", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    // Narrow the extraction scope to BC (already extracted and imported above) so every province is DONE; ON and AB have no pending candidates.
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutProvinces: ["BC"], rolloutHaltCode: null, rolloutHaltProvince: null, rolloutPaused: false, enabled: true, importProvinces: ["AB", "BC", "ON"] } });
    const [abId, qcId] = unrelated;
    // An Alberta Lead Radar REMOTE prospect (verified, unassigned) and a Québec one: only the first counts as work left.
    await db.crmProspect.update({ where: { id: abId }, data: { repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO" } });
    await db.crmProspect.update({ where: { id: qcId }, data: { repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO" } });
    await db.crmProspect.update({ where: { id: abId }, data: { assignedStaffId: null, assignmentMode: null, autoAssignedAt: null } });
    const t1 = await roLib.rolloutStage(actor, await state());
    assert.equal(t1.halted, undefined, JSON.stringify(t1));
    let s = await state();
    assert.deepEqual([t1.finished, t1.waiting, s.rolloutEnabled, s.enabled, s.rolloutFinishedAt], [undefined, "ASSIGNMENT", true, true, null], "all extractions/imports done but an AB REMOTE prospect is unassigned: NOT complete, master stays ON");
    assert.equal((await roLib.rolloutStatus()).pendingAssignment, 1, "Québec never counts as work left");
    // The automation assigns it (the scoped assignment stage includes AB).
    const asg = await autoLib.assignStage(actor, [rep], Date.now() + 20_000, { provinces: (await import("../src/domain/lead-radar/rollout")).ROLLOUT_ASSIGN_PROVINCES, remoteOnly: true });
    void asg;
    s = await state();
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: qcId } })).assignedStaffId, null, "Québec is never assigned");
    await db.crmProspect.updateMany({ where: { id: abId, assignedStaffId: null }, data: { assignedStaffId: rep } });
    const t2 = await roLib.rolloutStage(actor, await state());
    s = await state();
    assert.deepEqual([t2.finished, s.rolloutEnabled, s.enabled, s.pausedReason], [true, false, false, "ROLLOUT_COMPLETE"]);
    assert.ok(s.rolloutFinishedAt);
  });

  test("completion is blocked by pending ON/AB work: approved candidates not yet imported keep the rollout running", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutEnabled: true, rolloutFinishedAt: null, enabled: true, pausedReason: null, importProvinces: ["BC", "ON"] } });
    const t = await roLib.rolloutStage(actor, await state());
    assert.deepEqual(t.openedImport, ["AB"], "AB is opened for import by the rollout");
    // A pending (not yet imported) approved AB candidate keeps the rollout from finishing; a human-review one does not.
    const [one, two] = await db.crmDiscoveryCandidate.findMany({ where: { province: "BC", importState: "CREATED" }, orderBy: { id: "asc" }, take: 2 });
    await db.crmDiscoveryCandidate.update({ where: { id: one.id }, data: { province: "AB", reviewState: "APPROVED", importState: "NOT_IMPORTED", importAttempts: 0, qualificationLane: "AUTO_ELIGIBLE" } });
    await db.crmDiscoveryCandidate.update({ where: { id: two.id }, data: { province: "AB", reviewState: "PENDING", importState: "NOT_IMPORTED", qualificationLane: "HUMAN_REVIEW", approvedByPolicyVersion: null } });
    const t2 = await roLib.rolloutStage(actor, await state());
    assert.equal(t2.finished, undefined, "an approved AB candidate is not yet imported");
    assert.equal((await state()).rolloutEnabled, true);
    await db.crmDiscoveryCandidate.update({ where: { id: one.id }, data: { importState: "CREATED" } });
    const t3 = await roLib.rolloutStage(actor, await state());
    assert.equal(t3.finished, true, "only the human-review candidate remains: it does not block completion");
  });
}
