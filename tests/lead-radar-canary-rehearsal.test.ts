/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Canary REHEARSAL (opt-in, never production): replays a real extractor output (manifest.json + records.ndjson of ONE province) through the exact worker protocol
// (queue → claim → attach → 250-record chunks → complete) into a LOCAL scratch PostgreSQL, then measures the quality thresholds of docs/lead-radar/national-rollout-plan.md.
// It proves the pipeline and gives the owner real numbers BEFORE anything is queued in production. Skipped unless both are set:
//   GARAGEOS_CRM_TEST_DB_URL = local scratch database (name contains replay|test|scratch)   CANARY_DIR = folder with manifest.json + records.ndjson   [CANARY_PROVINCE=AB]
// Writes CANARY_DIR/rehearsal-report.json (counts only, plus business names/categories for the audit sample — public listing data, no phones/emails/addresses).
import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL, DIR = process.env.CANARY_DIR, PROVINCE = process.env.CANARY_PROVINCE ?? "AB";
let enabled = false;
try { if (URL_ && DIR) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname) && existsSync(path.join(DIR, "records.ndjson")); } } catch { enabled = false; }

if (!enabled) {
  test("Canary rehearsal (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database and CANARY_DIR to an extractor output folder)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const worker = await import("../src/lib/lead-radar/worker");
  const national = await import("../src/lib/lead-radar/national");
  const manifest = JSON.parse(readFileSync(path.join(DIR!, "manifest.json"), "utf8"));
  const report: Record<string, any> = { province: PROVINCE, release: manifest.release, extractorVersion: manifest.extractorVersion, extractorStats: manifest.stats };

  test(`rehearsal: ${PROVINCE} real extraction replayed through the worker protocol into a scratch database`, async () => {
    const root = await db.user.create({ data: { name: "Root", email: `root-${Date.now()}@garage-os.ca`, role: "SUPER_ADMIN" } });
    setSession({ user: { id: root.id, role: "VIEWER", shopId: null } });
    process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    const q: any = await radar.queueDiscoveryRunForWorker({ scope: { provinces: [PROVINCE], groups: ["REPAIR", "BODY_GLASS"] }, release: manifest.release });
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.equal(q.planHash, manifest.planHash, "the plan the app issues is exactly the plan the extractor ran");
    const claim = await worker.claimRun("rehearsal-worker");
    assert.equal(claim?.runId, q.runId);
    await worker.workerAttach(q.runId, "rehearsal-worker", manifest);
    let buf: string[] = [], seq = 0, sent = 0;
    const flush = async () => { if (!buf.length) return; await worker.workerIngest(q.runId, "rehearsal-worker", seq++, buf.join("\n")); sent++; buf = []; };
    for await (const line of createInterface({ input: createReadStream(path.join(DIR!, "records.ndjson")), crlfDelay: Infinity })) { if (!line.trim()) continue; buf.push(line); if (buf.length === 250) await flush(); }
    await flush();
    const done: any = await worker.workerComplete(q.runId, "rehearsal-worker");
    const run = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: q.runId } });
    report.run = { status: run.status, verdict: run.qualityVerdict, chunks: sent, received: run.receivedRecords, rejected: run.rejectedRecords, withPoint: run.recordsWithPoint, pointsAccepted: run.pointsAccepted, diagnostics: run.diagnostics, quality: run.qualityDetail };
    assert.equal(done.blocking, false, `quality gate stopped the rehearsal: ${done.verdict}`);
    assert.equal(run.status, "COMPLETED");

    const c = await db.crmDiscoveryCandidate.groupBy({ by: ["repairFit"], where: { lastRunId: q.runId, duplicateOfCandidateId: null }, _count: { _all: true } });
    const by = Object.fromEntries(c.map((r) => [r.repairFit ?? "NONE", r._count._all]));
    const staged = await db.crmDiscoveryCandidate.count({ where: { lastRunId: q.runId, duplicateOfCandidateId: null } });
    const dups = await db.crmDiscoveryCandidate.count({ where: { lastRunId: q.runId, duplicateOfCandidateId: { not: null } } });
    const withPoint = await db.crmDiscoveryCandidate.count({ where: { lastRunId: q.runId, duplicateOfCandidateId: null, sourceLatitude: { not: null } } });
    const tiers = await db.crmDiscoveryCandidate.groupBy({ by: ["tier"], where: { lastRunId: q.runId, duplicateOfCandidateId: null }, _count: { _all: true } });
    const flags: Record<string, number> = {};
    for (const r of await db.$queryRaw<{ f: string; n: bigint }[]>`SELECT f, count(*)::bigint n FROM "garageos"."CrmDiscoveryCandidate" c, unnest(c."qualityFlags") f WHERE c."lastRunId" = ${q.runId} GROUP BY f`) flags[r.f] = Number(r.n);
    const sample = async (fit: string, n: number) => (await db.$queryRaw<{ name: string; taxonomyPrimary: string | null; city: string | null; reasons: string[] }[]>`SELECT name, "taxonomyPrimary", city, "repairFitReasons" AS reasons FROM "garageos"."CrmDiscoveryCandidate" WHERE "lastRunId" = ${q.runId} AND "duplicateOfCandidateId" IS NULL AND "repairFit"::text = ${fit} ORDER BY md5(id) LIMIT ${n}`);
    report.candidates = { staged, duplicates: dups, withPoint, byRepairFit: by, byTier: Object.fromEntries(tiers.map((t) => [t.tier, t._count._all])), qualityFlags: flags };
    report.auditSample = { VERIFIED_REPAIR: await sample("VERIFIED_REPAIR", 50), EXCLUDED: await sample("EXCLUDED", 50), HUMAN_REVIEW: await sample("HUMAN_REVIEW", 25) };
    const dash = (await national.nationalReadiness()).rows.find((r) => r.province === PROVINCE)!;
    report.dashboard = { stage: dash.stage, deferred: dash.deferred, raw: dash.raw, actions: dash.actions, rates: dash.rates };

    // Thresholds from docs/lead-radar/national-rollout-plan.md (the extraction-side ones; import-side ones are measured in production after checkpoint C3).
    const diag = (run.diagnostics as any[]) ?? [];
    const t = {
      verdictOK: run.qualityVerdict === "OK",
      positionsValidShare: withPoint / Math.max(1, staged),
      // Rows outside the province/Canada are EXPECTED: extraction prunes by a deliberately generous bounding box that also contains neighbouring provinces/states.
      // The meaningful rejection rate is everything else (schema/format/name failures).
      expectedScopeRejections: (diag.find((d: any) => d.code === "OUT_OF_SCOPE_PROVINCE")?.count ?? 0) + (diag.find((d: any) => d.code === "OUTSIDE_CANADA")?.count ?? 0),
      get unexpectedRejectedShare() { return (run.rejectedRecords - this.expectedScopeRejections) / Math.max(1, run.receivedRecords); },
      duplicateShare: dups / Math.max(1, staged + dups),
      humanReviewShare: (by.HUMAN_REVIEW ?? 0) / Math.max(1, staged),
      unclassified: by.NONE ?? 0,
    };
    report.thresholds = { ...t, unexpectedRejectedShare: t.unexpectedRejectedShare, pass: { verdictOK: t.verdictOK, positionsValid: t.positionsValidShare >= 0.95, unexpectedRejections: t.unexpectedRejectedShare <= 0.02, duplicates: t.duplicateShare <= 0.03, classified: t.unclassified === 0 } };
    writeFileSync(path.join(DIR!, "rehearsal-report.json"), JSON.stringify(report, null, 2));
    assert.ok(Object.values(report.thresholds.pass).every(Boolean), JSON.stringify(report.thresholds));
    assert.equal(dash.stage, "PROCESSING", "extraction finished but qualification/import have not run, so the province is not 'ready'");
    assert.equal(await db.crmProspect.count(), 0, "the rehearsal imported nothing");
  });
}
