/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Discovery worker (server side) against a REAL PostgreSQL scratch database: queueing, claim/lease, resume from the last confirmed chunk, retry/backoff/exhaustion,
// stalled recovery, per-province pause, release detection and the OPT-IN schedule, HTTP endpoint authentication. No network (release fetch is injected), no email.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Worker database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.CRON_SECRET = "worker-test-secret-0123456789";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const worker = await import("../src/lib/lead-radar/worker");
  const { POST } = await import("../src/app/api/lead-radar/worker/route");
  const { MAX_ATTEMPTS, LEASE_MS } = await import("../src/domain/lead-radar/worker-policy");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {};
  const R = "2026-09-23.1";
  let seq = 0;
  const WPG = { freeform: "1 Portage Ave", locality: "Winnipeg", postcode: "R3B 2B9", region: "MB", country: "CA" };
  const rec = (n = ++seq): any => ({
    v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Garage Worker ${run} ${n}`,
    taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_repair"], alternates: null },
    address: { freeform: `${n} Rue Worker`, locality: "Toronto", postcode: "M5H 2M9", region: "ON", country: "CA" }, phones: [`+1416555${String(1000 + n).slice(-4)}`], websites: [], emails: [],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], geo: { lat: 43.6532 + n * 0.0001, lng: -79.3832 },
  });
  const nd = (rs: unknown[]) => rs.map((r) => JSON.stringify(r)).join("\n");
  const call = (b: unknown, secret: string | null = process.env.CRON_SECRET!) =>
    POST(new Request("http://x/api/lead-radar/worker", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify(b) }));
  const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });
  const queue = async (provinces = ["ON"]) => {
    as(users.Root);
    const q: any = await radar.queueDiscoveryRunForWorker({ scope: { provinces, groups: ["REPAIR"] }, release: R });
    assert.equal(q.ok, true, JSON.stringify(q));
    return q.runId as string;
  };
  const manifest = async (runId: string, count: number) => ({ extractor: "t", extractorVersion: "1.3.0", planHash: (await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } })).planHash, release: R, recordCount: count, fileSha256: "b".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 2, rowsExamined: 500, rowsEmitted: count } });
  const drain = async () => { for (;;) { const c = await worker.claimRun("drain-" + Math.random()); if (!c) return; await worker.workerFail(c.runId, c.workerId, "DRAIN"); await db.crmDiscoveryRun.update({ where: { id: c.runId }, data: { status: "CANCELLED", cancelRequestedAt: new Date() } }); } };

  test("setup: Super Admin and a seller; live discovery on", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    users.Seller = (await db.user.create({ data: { name: "S", email: `s-${run}@garage-os.ca`, role: "VIEWER", shopId: null } })).id;
    as(users.Root); process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
  });

  test("the endpoint fails closed: no secret, wrong secret and malformed bodies never reach the worker", async () => {
    assert.equal((await call({ action: "peek" }, null)).status, 401);
    assert.equal((await call({ action: "peek" }, "wrong-secret-0123456789abc")).status, 401);
    assert.equal((await call({ action: "nope" })).status, 400);
    assert.equal((await call({ action: "claim" })).status, 400, "workerId is required");
  });

  test("only a Super Admin can queue; nothing is claimable until queued; a manual (uploaded) run is never claimable", async () => {
    assert.deepEqual((await json(await call({ action: "peek" }))).body.pending, false);
    as(users.Seller);
    await assert.rejects(radar.queueDiscoveryRunForWorker({ scope: { provinces: ["ON"] }, release: R }), /SALES_FORBIDDEN/);
    as(users.Root);
    const manual: any = await radar.createDiscoveryRun({ scope: { provinces: ["BC"], groups: ["REPAIR"] }, release: R });
    assert.equal(manual.ok, true);
    assert.equal((await json(await call({ action: "peek" }))).body.pending, false, "an owner-uploaded run is not worker work");
    assert.equal((await json(await call({ action: "claim", workerId: "w1" }))).body.run, null);
    await db.crmDiscoveryRun.update({ where: { id: manual.runId }, data: { status: "CANCELLED" } });
  });

  let runId: string;
  test("claim → attach → chunks → complete: the worker executes a queued province end-to-end under a lease, with the quality gate applied", async () => {
    runId = await queue(["ON"]);
    assert.equal((await json(await call({ action: "peek" }))).body.pending, true);
    const c = (await json(await call({ action: "claim", workerId: "w1" }))).body.run;
    assert.equal(c.runId, runId); assert.equal(c.attempt, 1); assert.equal(c.lastChunkSeq, -1); assert.deepEqual(c.plan.provinces, ["ON"]);
    assert.equal((await json(await call({ action: "claim", workerId: "w2" }))).body.run, null, "a leased run cannot be claimed by a second worker");
    const recs = Array.from({ length: 5 }, () => rec());
    const att = await json(await call({ action: "attach", runId, workerId: "w1", manifest: await manifest(runId, 5) }));
    assert.equal(att.status, 200, JSON.stringify(att.body));
    // A different worker cannot touch it.
    assert.equal((await json(await call({ action: "chunk", runId, workerId: "intruder", seq: 0, ndjson: nd(recs) }))).body.error, "LEASE_LOST");
    const ch = await json(await call({ action: "chunk", runId, workerId: "w1", seq: 0, ndjson: nd(recs) }));
    assert.equal(ch.status, 200, JSON.stringify(ch.body)); assert.equal(ch.body.stagedNew, 5);
    assert.equal((await json(await call({ action: "chunk", runId, workerId: "w1", seq: 0, ndjson: nd(recs) }))).body.duplicate, true, "replay is a no-op");
    assert.equal((await json(await call({ action: "heartbeat", runId, workerId: "w1" }))).status, 200);
    const done = await json(await call({ action: "complete", runId, workerId: "w1" }));
    assert.equal(done.status, 200, JSON.stringify(done.body)); assert.equal(done.body.verdict, "OK"); assert.equal(done.body.blocking, false);
    const row = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: runId } });
    assert.deepEqual([row.status, row.workerId, row.execution], ["COMPLETED", null, "WORKER"]);
    const prov = await db.crmDiscoveryProvince.findUniqueOrThrow({ where: { province: "ON" } });
    assert.deepEqual([prov.lastSuccessRunId, prov.lastSuccessRelease], [runId, R]);
    assert.equal((await json(await call({ action: "peek" }))).body.pending, false);
  });

  test("interruption: a dead worker's lease expires → attempt counted, run reclaimed, resumes after the last confirmed chunk; a late write from the old worker is refused", async () => {
    const id = await queue(["MB"]);
    await call({ action: "claim", workerId: "dead" });
    const mb = () => { const r = rec(); return { ...r, address: { ...WPG, freeform: r.address.freeform }, geo: { lat: 49.9 + seq * 0.0001, lng: -97.14 } }; };
    const recs = Array.from({ length: 4 }, mb);
    await call({ action: "attach", runId: id, workerId: "dead", manifest: await manifest(id, 8) });
    assert.equal((await json(await call({ action: "chunk", runId: id, workerId: "dead", seq: 0, ndjson: nd(recs) }))).status, 200);
    await db.crmDiscoveryRun.update({ where: { id }, data: { workerLeaseUntil: new Date(Date.now() - 1000) } }); // the worker died
    const old = await json(await call({ action: "chunk", runId: id, workerId: "dead", seq: 1, ndjson: nd(recs) }));
    assert.equal(old.body.error, "LEASE_LOST");
    const r = (await json(await call({ action: "claim", workerId: "alive" }))).body.run;
    assert.equal(r, null, "backoff: the retry is not immediate");
    const row = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id } });
    assert.equal(row.attempts, 1); assert.equal(row.lastFailureCode, "WORKER_STALLED"); assert.ok(row.nextAttemptAt! > new Date());
    await db.crmDiscoveryRun.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const again = (await json(await call({ action: "claim", workerId: "alive" }))).body.run;
    assert.equal(again.runId, id); assert.equal(again.attempt, 2); assert.equal(again.lastChunkSeq, 0, "resume after chunk 0"); assert.equal(again.manifestAttached, true);
    const reattach = await json(await call({ action: "attach", runId: id, workerId: "alive", manifest: await manifest(id, 8) }));
    assert.equal(reattach.body.lastChunkSeq, 0); assert.equal(reattach.body.alreadyAttached, true);
    const more = Array.from({ length: 4 }, mb);
    assert.equal((await json(await call({ action: "chunk", runId: id, workerId: "alive", seq: 1, ndjson: nd(more) }))).status, 200);
    assert.equal((await json(await call({ action: "complete", runId: id, workerId: "alive" }))).body.verdict, "OK");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { lastRunId: id } }), 8);
  });

  test("failure reporting: retries with growing backoff, then the run FAILS for good (WORKER_RETRIES_EXHAUSTED) and the province records the failure", async () => {
    await drain();
    const id = await queue(["SK"]);
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await db.crmDiscoveryRun.update({ where: { id }, data: { nextAttemptAt: null } });
      const c = (await json(await call({ action: "claim", workerId: `w${i}` }))).body.run;
      assert.equal(c.attempt, i);
      const f = await json(await call({ action: "fail", runId: id, workerId: `w${i}`, code: "EXTRACTOR_EXIT_1" }));
      assert.equal(f.body.exhausted, i === MAX_ATTEMPTS);
    }
    const row = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([row.status, row.errorCode], ["FAILED", "EXTRACTOR_EXIT_1"]);
    assert.equal((await db.crmDiscoveryProvince.findUniqueOrThrow({ where: { province: "SK" } })).lastFailureCode, "EXTRACTOR_EXIT_1");
    assert.equal((await json(await call({ action: "claim", workerId: "late" }))).body.run, null);
  });

  test("a quality-gate stop through the worker FAILS the run without consuming retry attempts, and nothing from it is qualified", async () => {
    await drain();
    const id = await queue(["NB"]);
    const c = (await json(await call({ action: "claim", workerId: "w" }))).body.run; assert.equal(c.runId, id);
    const bad = Array.from({ length: 3 }, () => ({ ...rec(), geo: null, address: { freeform: "1 Rue", locality: "Moncton", postcode: "E1C 1A1", region: "NB", country: "CA" } }));
    await call({ action: "attach", runId: id, workerId: "w", manifest: await manifest(id, 3) });
    await call({ action: "chunk", runId: id, workerId: "w", seq: 0, ndjson: nd(bad) });
    const done = await json(await call({ action: "complete", runId: id, workerId: "w" }));
    assert.deepEqual([done.body.verdict, done.body.blocking], ["NO_COORDINATES", true]);
    const row = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([row.status, row.attempts], ["FAILED", 0]);
    assert.equal((await db.crmDiscoveryProvince.findUniqueOrThrow({ where: { province: "NB" } })).lastFailureCode, "NO_COORDINATES");
  });

  test("pausing a province stops the worker from claiming its queued run immediately; unpausing releases it", async () => {
    await drain();
    const id = await queue(["PE"]);
    as(users.Root);
    assert.equal(((await radar.saveProvinceSchedule({ province: "PE", autoRefresh: false, paused: true, refreshIntervalDays: 90 })) as any).ok, true);
    assert.equal((await json(await call({ action: "peek" }))).body.pending, false);
    assert.equal((await json(await call({ action: "claim", workerId: "w" }))).body.run, null);
    await radar.saveProvinceSchedule({ province: "PE", autoRefresh: false, paused: false, refreshIntervalDays: 90 });
    assert.equal((await json(await call({ action: "claim", workerId: "w" }))).body.run.runId, id);
    await db.crmDiscoveryRun.update({ where: { id }, data: { status: "CANCELLED", cancelRequestedAt: new Date(), workerId: null, workerLeaseUntil: null } });
  });

  test("a cancelled run is never claimable, and live discovery OFF stops every worker action", async () => {
    await drain();
    const id = await queue(["NS"]);
    as(users.Root); await radar.cancelDiscoveryRun(id);
    assert.equal((await json(await call({ action: "claim", workerId: "w" }))).body.run, null);
    const id2 = await queue(["NS"]);
    await db.crmDiscoverySettings.update({ where: { id: "default" }, data: { enabled: false } });
    assert.equal((await json(await call({ action: "peek" }))).body.pending, false);
    assert.equal((await json(await call({ action: "claim", workerId: "w" }))).status, 409);
    await db.crmDiscoverySettings.update({ where: { id: "default" }, data: { enabled: true } });
    await db.crmDiscoveryRun.update({ where: { id: id2 }, data: { status: "CANCELLED", cancelRequestedAt: new Date() } });
  });

  test("schedule is OPT-IN: a new release creates no work with no opted-in province; an opted-in one gets exactly ONE bounded province run per release; nothing nationwide", async () => {
    await drain();
    const fetchOk = (release: string) => (async () => new Response(JSON.stringify({ latest: release }), { status: 200 })) as unknown as typeof fetch;
    const m1 = await worker.runDiscoveryMaintenance({ fetchImpl: fetchOk("2026-11-18.0") });
    assert.equal(m1.newRelease, true); assert.deepEqual(m1.scheduled, [], "nothing is opted in → nothing is scheduled");
    assert.equal((await worker.runDiscoveryMaintenance({ fetchImpl: fetchOk("2026-11-18.0") })).newRelease, false, "a release is detected once");
    as(users.Root);
    assert.equal(((await radar.saveProvinceSchedule({ province: "ON", autoRefresh: true, paused: false, refreshIntervalDays: 30 })) as any).ok, true);
    await db.crmDiscoveryProvince.update({ where: { province: "ON" }, data: { lastSuccessAt: new Date(Date.now() - 60 * 86_400_000) } });
    await radar.saveProvinceSchedule({ province: "QC", autoRefresh: true, paused: false, refreshIntervalDays: 30 });
    const m2 = await worker.runDiscoveryMaintenance({ fetchImpl: fetchOk("2026-11-18.0") });
    assert.equal(m2.scheduled.length, 1, "one automatic run in flight at a time");
    const created = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: m2.scheduled[0].runId } });
    assert.deepEqual([created.execution, created.scheduled, created.status, created.sourceRelease], ["WORKER", true, "PLANNED", "2026-11-18.0"]);
    assert.equal((created.scope as any).provinces.length, 1);
    assert.equal(created.createdByUserId, users.Root, "attributable to the Super Admin who opted in");
    const m3 = await worker.runDiscoveryMaintenance({ fetchImpl: fetchOk("2026-11-18.0") });
    assert.deepEqual(m3.scheduled, [], "no second automatic run while one is in flight");
    assert.equal(await db.crmDiscoveryRun.count({ where: { scheduled: true } }), 1);
    // The release feed misbehaving never creates work or crashes maintenance.
    const bad = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    assert.equal((await worker.runDiscoveryMaintenance({ fetchImpl: bad })).release, null);
    await db.crmDiscoveryRun.update({ where: { id: created.id }, data: { status: "CANCELLED", cancelRequestedAt: new Date() } });
    void LEASE_MS;
  });

  test("province schedule changes are Super Admin only, validated and audited", async () => {
    as(users.Seller);
    await assert.rejects(radar.saveProvinceSchedule({ province: "ON", autoRefresh: true, paused: false, refreshIntervalDays: 30 }), /SALES_FORBIDDEN/);
    as(users.Root);
    for (const bad of [{ province: "XX", autoRefresh: true, paused: false, refreshIntervalDays: 30 }, { province: "ON", autoRefresh: true, paused: false, refreshIntervalDays: 3 }, { province: "ON", autoRefresh: true, paused: false, refreshIntervalDays: 400 }])
      assert.equal(((await radar.saveProvinceSchedule(bad)) as any).ok, false);
    assert.ok(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_PROVINCE_CHANGED" as any } }) >= 1);
  });

  test("a scheduled check with NOTHING queued is inert: no extraction, no run, no candidate, no import batch, no prospect, no assignment, no audit row; claim answers null", async () => {
    await drain();
    const snap = async () => ({
      runs: await db.crmDiscoveryRun.count(), candidates: await db.crmDiscoveryCandidate.count(), batches: await db.crmImportBatch.count(), prospects: await db.crmProspect.count(),
      assigned: await db.crmProspect.count({ where: { assignedStaffId: { not: null } } }), audits: await db.crmAuditEvent.count(), automationRuns: await db.crmLeadAutomationRun.count(),
      claimedRuns: await db.crmDiscoveryRun.count({ where: { workerId: { not: null } } }),
    });
    const before = await snap();
    for (let i = 0; i < 3; i++) {
      const p = await json(await call({ action: "peek" }));
      assert.deepEqual([p.status, p.body.pending, p.body.reason], [200, false, "NOTHING_QUEUED"]);
      assert.equal((await json(await call({ action: "claim", workerId: `idle-${i}` }))).body.run, null);
    }
    assert.deepEqual(await snap(), before);
  });

  test("worker authentication: a dedicated LEAD_RADAR_WORKER_SECRET works and is least-privilege; the shared CRON_SECRET still works; wrong/empty/'undefined' bearers never do", async () => {
    const dedicated = "dedicated-worker-secret-0123456789";
    assert.equal((await call({ action: "peek" }, dedicated)).status, 401, "not configured yet: a guess is refused");
    process.env.LEAD_RADAR_WORKER_SECRET = dedicated;
    try {
      assert.equal((await call({ action: "peek" }, dedicated)).status, 200);
      assert.equal((await call({ action: "peek" })).status, 200, "the shared secret keeps working");
      assert.equal((await call({ action: "peek" }, "dedicated-worker-secret-0123456780")).status, 401);
      assert.equal((await call({ action: "peek" }, "undefined")).status, 401);
    } finally { delete process.env.LEAD_RADAR_WORKER_SECRET; }
    assert.equal((await call({ action: "peek" }, "Bearer undefined")).status, 401);
    assert.equal((await call({ action: "peek" }, dedicated)).status, 401, "removing the dedicated secret revokes it");
  });
}
