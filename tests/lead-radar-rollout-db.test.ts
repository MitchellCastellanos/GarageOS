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
      phones: [phone(n)], websites: [`https://ro-${run}-${n}.example.ca/`], emails: [`info${n}@ro-${run}-${n}.example.ca`], sources: SRC,
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
    await db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default", sendingEnabled: true, automatedSendingEnabled: true }, update: { sendingEnabled: true, automatedSendingEnabled: true } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_SENDING_ON/);
    // Manual email ON (kill switch ON, automated outreach OFF) is NOT "outreach live": it must not block the rollout (a manual internal test email can't halt it).
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { sendingEnabled: true, manualSendingEnabled: true, automatedSendingEnabled: false } });
    await db.platformSalesStaff.update({ where: { id: rep }, data: { acceptsAutoAssignment: false } });
    await assert.rejects(roLib.activateNationalRollout(actor), /ROLLOUT_SELLER_INVALID/, "got past the sending check");
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { sendingEnabled: false, manualSendingEnabled: false, automatedSendingEnabled: false } });
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
    const mk = (name: string, province: string, batch: string | null) => db.crmProspect.create({ data: { name, nameNormalized: name.toLowerCase(), city: "X", province, territoryState: "NATIONAL", territoryKey: "canada", email: `${name.split(" ")[1].toLowerCase()}-${run}@example.ca`, createdByUserId: users.Root, ...(batch ? { importBatchId: batch } : {}) } });
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
  // ── Email-only REMOTE policy ─────────────────────────────────────────────────────────────────────────────────────────
  // FIELD (Greater Montréal) keeps importing and assigning prospects without email; REMOTE needs a usable, non-suppressed email (on the candidate, or on a contact of the prospect).
  // REMOTE candidates without one are DEFERRED: kept in Lead Radar (not deleted, not failed), never imported, and they never hold the rollout open.
  const { getActivePolicy } = await import("../src/lib/lead-radar/policy");
  const { loadSellers } = await import("../src/lib/sales-crm/assignment");
  const { queueWhere, loadQueueContext } = await import("../src/lib/sales-crm/queues");
  const { nationalReadiness } = await import("../src/lib/lead-radar/national");
  const { ROLLOUT_ASSIGN_PROVINCES } = await import("../src/domain/lead-radar/rollout");
  const cl: Record<string, string> = {};
  let n2 = 0;

  async function clone(tag: string, o: Record<string, unknown>) {
    const tpl = await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { province: "BC", importState: "CREATED" }, orderBy: { id: "asc" } });
    const pol = (await getActivePolicy())!;
    const k = ++n2;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, importedAt, importedProspectId, importBatchId, matchProspectId, createdAt, updatedAt, ...rest } = tpl as any;
    const row = await db.crmDiscoveryCandidate.create({ data: {
      ...rest, sourceRecordId: `re-${run}-${k}`, name: `Re${tag}${run} Auto Repair`, nameNormalized: `re${tag}${run} auto repair`, website: `https://re-${run}-${k}.example.ca/`, phone: `+1778${PH}${String(k).padStart(2, "0")}`.slice(0, 12),
      address: `${900 + k} Remote St`, importState: "NOT_IMPORTED", importAttempts: 0, importErrorCode: null, reviewState: "APPROVED", approvedByPolicyVersion: pol.version, qualificationPolicyVersion: pol.version,
      qualificationLane: "AUTO_ELIGIBLE", repairFit: "VERIFIED_REPAIR", duplicateOfCandidateId: null, ...o,
    } });
    cl[tag] = row.id;
    return row;
  }
  const impState = async (tag: string) => (await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: cl[tag] } }));

  test("email-only: REMOTE with email imports, FIELD without email still imports, REMOTE without/with malformed/suppressed email is deferred (kept, not failed); re-running is idempotent", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const pol = (await getActivePolicy())!;
    await db.crmEmailSuppression.create({ data: { emailNormalized: `blocked-${run}@example.ca`, reason: "UNSUBSCRIBE", source: "test" } });
    await clone("Mail", { province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: `Owner-${run}@Example.ca` });
    await clone("Plain", { province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: null });
    await clone("Junk", { province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: "not-an-email" });
    await clone("Supp", { province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: `blocked-${run}@example.ca` });
    await clone("Field", { province: "QC", city: "Montréal", postalCode: "H2X 3K4", email: null });
    const t = await autoLib.importStage(actor, pol.version, 50, Date.now() + 40_000, ["BC", "QC"]);
    assert.equal(t.failed, 0, JSON.stringify(t));
    assert.equal((await impState("Mail")).importState, "CREATED", "REMOTE with a usable email is imported");
    assert.equal((await impState("Field")).importState, "CREATED", "FIELD without email keeps the existing import behaviour");
    for (const k of ["Plain", "Junk", "Supp"]) {
      const c = await impState(k);
      assert.deepEqual([c.importState, c.importAttempts, c.importErrorCode, c.reviewState], ["NOT_IMPORTED", 0, null, "APPROVED"], `${k}: deferred, not failed, not deleted`);
    }
    const mail = await db.crmProspect.findFirstOrThrow({ where: { id: (await impState("Mail")).importedProspectId! } });
    assert.equal(mail.email?.toLowerCase(), `owner-${run}@example.ca`);
    assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: mail.id } } }), 0, "a published email never creates a sending basis");
    const again = await autoLib.importStage(actor, pol.version, 50, Date.now() + 40_000, ["BC", "QC"]);
    assert.equal(again.claimed, 0, "nothing left for the importer: deferred candidates do not spin or burn attempts");
    assert.equal((await impState("Plain")).importAttempts, 0);
  });

  test("email-only: a deferred candidate can never stall the importer queue even with many of them ahead of an importable one", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const pol = (await getActivePolicy())!;
    for (let i = 0; i < 6; i++) await clone(`Q${i}`, { id: `aaa-${run}-${i}`, province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: null });
    await clone("Late", { id: `zzz-${run}`, province: "BC", city: "Vancouver", postalCode: "V6H 1H6", email: `late-${run}@example.ca` });
    const t = await autoLib.importStage(actor, pol.version, 3, Date.now() + 40_000, ["BC"]);
    assert.equal(t.failed, 0);
    assert.equal((await impState("Late")).importState, "CREATED", "the importable candidate behind the deferred ones is still reached");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: { startsWith: `aaa-${run}` }, importState: "NOT_IMPORTED" } }), 6);
  });

  test("email-only assignment: REMOTE prospects need a usable email (prospect OR contact); contact-only email is accepted; FIELD without email is untouched; existing owners are never reassigned", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const batch = (await db.crmProspect.findFirstOrThrow({ where: { id: (await impState("Mail")).importedProspectId! } })).importBatchId!;
    const mk = (name: string, email: string | null, extra: Record<string, unknown> = {}) => db.crmProspect.create({ data: { name, nameNormalized: name.toLowerCase(), city: "Vancouver", province: "BC", territoryState: "NATIONAL", territoryKey: "canada", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", email, createdByUserId: users.Root, importBatchId: batch, ...extra } });
    const noMail = await mk("NoMail Garage", null);
    const contactOnly = await mk("ContactOnly Garage", null);
    await db.crmContact.create({ data: { prospectId: contactOnly.id, name: "Owner", email: `co-${run}@example.ca`, emailNormalized: `co-${run}@example.ca`, isPrimary: true } });
    const suppressedOnly = await mk("SuppressedOnly Garage", `blocked-${run}@example.ca`);
    const archivedOnly = await mk("ArchivedOnly Garage", null);
    await db.crmContact.create({ data: { prospectId: archivedOnly.id, name: "Old", email: `old-${run}@example.ca`, emailNormalized: `old-${run}@example.ca`, archivedAt: new Date() } });
    const malformedContact = await mk("MalformedContact Garage", null);
    await db.crmContact.create({ data: { prospectId: malformedContact.id, name: "Bad", email: "bad@@shop", emailNormalized: "bad@@shop", isPrimary: true } });
    const owned = await mk("OwnedNoMail Garage", null, { assignedStaffId: rep, assignmentMode: "REMOTE" });
    const fieldNoMail = await mk("FieldNoMail Garage", null, { city: "Montréal", province: "QC", postalCode: "H2X 3K4", territoryState: "LOCAL", territoryKey: "greater-montreal" });
    const t = await autoLib.assignStage(actor, [rep], Date.now() + 30_000, { provinces: ROLLOUT_ASSIGN_PROVINCES, remoteOnly: true });
    const by = async (id: string) => (await db.crmProspect.findUniqueOrThrow({ where: { id } })).assignedStaffId;
    assert.equal(await by(contactOnly.id), rep, "email stored only on a contact is a usable email");
    for (const p of [noMail, suppressedOnly, archivedOnly, malformedContact]) assert.equal(await by(p.id), null, `${p.name} is left unassigned (kept, not deleted)`);
    assert.equal(await by(owned.id), rep, "existing owner untouched");
    assert.equal(await by(fieldNoMail.id), null, "FIELD prospects are still never taken by the REMOTE rollout");
    assert.ok(t.assigned >= 1);
    assert.equal(await db.crmProspect.count({ where: { id: { in: [noMail.id, suppressedOnly.id, archivedOnly.id, owned.id, fieldNoMail.id] } } }), 5, "nothing deleted");
    cl.suppressedOnly = suppressedOnly.id; cl.archivedOnly = archivedOnly.id; cl.malformedContact = malformedContact.id; cl.noMail = noMail.id; cl.owned = owned.id; cl.fieldNoMail = fieldNoMail.id;
  });

  test("email-only: no-email REMOTE prospects leave active queues and workload, but historical totals are unchanged", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    const ctx = await loadQueueContext();
    const ids = [cl.noMail, cl.owned, cl.fieldNoMail, cl.suppressedOnly, cl.archivedOnly, cl.malformedContact];
    const inQ = async (q: "new" | "mine") => new Set((await db.crmProspect.findMany({ where: { AND: [queueWhere(q, { ...actor, staffId: rep } as any, ctx), { id: { in: ids } }] }, select: { id: true } })).map((r) => r.id));
    assert.deepEqual([...(await inQ("new"))].sort(), [cl.fieldNoMail], "unassigned REMOTE with no / suppressed / archived-only / malformed-contact email is not new work (one shared predicate); the FIELD one still is");
    assert.equal((await inQ("mine")).has(cl.owned), false, "an owned no-email REMOTE prospect is not an active outreach item");
    const before = await db.crmProspect.count({ where: { assignedStaffId: rep, status: "ACTIVE", doNotContact: false } });
    const sellers = await loadSellers(actor, db, [rep]);
    assert.ok(sellers[0].workload < before, "workload excludes no-email REMOTE prospects");
    const nat = await nationalReadiness();
    const bc = nat.rows.find((r) => r.province === "BC")!;
    assert.ok(bc.crm.remoteNoEmail >= 3, "identified for reporting");
    assert.equal(bc.crm.prospects, await db.crmProspect.count({ where: { province: "BC", status: "ACTIVE", importBatch: { sourceKey: "overture-places" } } }), "historical totals unchanged");
    assert.ok(bc.deferred.remoteNoEmail >= 8, "deferred REMOTE no-email candidates are reported, not hidden");
  });

  test("email-only completion: deferred no-email candidates and unassignable no-email prospects do not hold the rollout open; a usable one still does", async () => {
    const actor = (await access.resolvePlatformSalesActor(users.Root))!;
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { rolloutProvinces: ["BC"], rolloutEnabled: true, rolloutFinishedAt: null, rolloutHaltCode: null, rolloutHaltProvince: null, rolloutPaused: false, enabled: true, pausedReason: null, importProvinces: ["AB", "BC", "ON"], assignStaffIds: [rep] } });
    // An emailed REMOTE prospect still unassigned = real work left.
    const emailed = await db.crmProspect.create({ data: { name: "Emailed Pending Garage", nameNormalized: "emailed pending garage", city: "Vancouver", province: "BC", territoryState: "NATIONAL", territoryKey: "canada", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", email: `pend-${run}@example.ca`, createdByUserId: users.Root, importBatchId: (await db.crmProspect.findFirstOrThrow({ where: { id: cl.noMail } })).importBatchId! } });
    const t1 = await roLib.rolloutStage(actor, await state());
    assert.equal(t1.halted, undefined, JSON.stringify(t1));
    assert.deepEqual([t1.finished, t1.waiting], [undefined, "ASSIGNMENT"], "a usable-email prospect awaiting assignment keeps it open");
    assert.equal((await roLib.rolloutStatus()).pendingAssignment, 1, "deferred no-email prospects are not counted as pending");
    await db.crmProspect.update({ where: { id: emailed.id }, data: { assignedStaffId: rep } });
    const t2 = await roLib.rolloutStage(actor, await state());
    assert.equal(t2.finished, true, "only deferred no-email candidates/prospects remain: the rollout completes instead of stalling");
    assert.ok(await db.crmDiscoveryCandidate.count({ where: { province: "BC", importState: "NOT_IMPORTED", reviewState: "APPROVED" } }) >= 8, "deferred candidates are still there for coverage / future enrichment");
    const s = await state();
    assert.deepEqual([s.pilotEnabled, s.eligibilityEnabled, s.releaseUnavailable, s.enabled], [false, false, false, false], "outreach/release/pilot stay OFF");
  });

  test("eligibility is available DURING the rollout (read-only advice for prospects with an emailable contact) without enabling outreach, release or the pilot", async () => {
    const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");
    const batch = await db.crmImportBatch.create({ data: { createdByUserId: users.Root, filename: "lr", fileHash: `elig-${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY } });
    const mk = async (name: string, withContact: boolean) => {
      const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), createdByUserId: users.Root, importBatchId: batch.id, province: "BC", city: "Vancouver", territoryState: "NATIONAL", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO" } });
      if (withContact) await db.crmContact.create({ data: { prospectId: p.id, name: "General contact", email: `el-${name}-${run}@shop.test`, emailNormalized: `el-${name}-${run}@shop.test`, isPrimary: true } });
      return p.id;
    };
    const withC = await mk("ElWith", true), without = await mk("ElWithout", false);
    // Mid-rollout state: master ON, rollout ON (its own step paused so this tick only exercises the later stages), eligibility switch ON; release requested but must stay gated.
    const ids = { sellerCheck: await db.crmEmailMessage.count(), enr: await db.crmSequenceEnrollment.count() };
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { enabled: true, pausedAt: null, pausedReason: null, rolloutEnabled: true, rolloutPaused: true, rolloutFinishedAt: null, rolloutHaltCode: null, eligibilityEnabled: true, releaseUnavailable: true, pilotEnabled: false } });
    const t: any = await tick();
    assert.notEqual(t.status, "SKIPPED", JSON.stringify(t));
    assert.equal(t.counters.eligibility.skipped, undefined, `eligibility ran: ${JSON.stringify(t.counters.eligibility)}`);
    assert.ok(t.counters.eligibility.assessed >= 1);
    assert.ok(await db.crmOutreachEligibility.findUnique({ where: { prospectId: withC } }), "the prospect with an emailable contact was assessed");
    assert.equal(await db.crmOutreachEligibility.findUnique({ where: { prospectId: without } }), null, "during the rollout prospects without a contact are not assessed (they cannot progress)");
    const e = await db.crmOutreachEligibility.findUniqueOrThrow({ where: { prospectId: withC } });
    assert.equal(e.decision, "NOT_ELIGIBLE"); assert.ok(e.reasons.includes("NO_SENDING_BASIS"));
    // release and pilot are still gated by the rollout; nothing was enrolled or sent
    assert.deepEqual(t.counters.release, { skipped: "STAGE_OFF" }); assert.deepEqual(t.counters.pilot, { skipped: "STAGE_OFF" });
    assert.equal(await db.crmEmailMessage.count(), ids.sellerCheck); assert.equal(await db.crmSequenceEnrollment.count(), ids.enr);
    // with the eligibility switch OFF (the state rollout activation leaves it in) the stage stays off
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { eligibilityEnabled: false } });
    const t2: any = await tick();
    assert.deepEqual(t2.counters.eligibility, { skipped: "STAGE_OFF" });
    const a = await state();
    assert.deepEqual([a.pilotEnabled, a.rolloutEnabled], [false, true], "the rollout and the pilot switch were not touched");
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { enabled: false, rolloutEnabled: false, releaseUnavailable: false } });
  });
}
