// Analytics retention (PageView + AnalyticsEvent) against a REAL scratch PostgreSQL (gate: see docs/testing.md).
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Analytics retention database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  await import("./helpers/action-harness"); // resolves `server-only` to a stub
  const { db } = await import("../src/lib/db");
  const { runAnalyticsRetention, pageViewRetentionStore, analyticsEventRetentionStore } = await import("../src/lib/platform/analytics-retention");
  const { retentionCutoff } = await import("../src/lib/privacy/retention");

  const NOW = new Date();
  const cutoff = retentionCutoff(NOW);
  const ms = (n: number) => new Date(cutoff.getTime() + n);
  const DAY = 86_400_000;
  const run = `ret-${Date.now().toString(36)}`;

  // Offsets from the cutoff. Overdue: far past, a day and an hour before it. Kept: an hour after it and newer. (The exact boundary instant
  // is pinned by the in-memory suite: the engine computes its own cutoff a few ms after this one, so a sub-second offset would be flaky.)
  const HOUR = 3_600_000;
  const ages = [-400 * DAY, -DAY, -HOUR, HOUR, 30 * DAY, 300 * DAY];
  const OVERDUE = 3;

  async function seed(count = 1) {
    for (let k = 0; k < count; k++) {
      await db.pageView.createMany({ data: ages.map((a, i) => ({ path: `/${run}/${k}/${i}`, visitorHash: `${run}-${i}`, createdAt: ms(a) })) });
      await db.analyticsEvent.createMany({ data: ages.map((a, i) => ({ type: "CTA_CLICK" as const, ctaId: "demo_book", path: `/${run}/${k}/${i}`, visitorHash: `${run}-${i}`, createdAt: ms(a) })) });
    }
  }
  const mine = { path: { startsWith: `/${run}/` } };

  test("setup: clean slate for this suite's own rows", async () => {
    await db.pageView.deleteMany({ where: mine });
    await db.analyticsEvent.deleteMany({ where: mine });
  });

  test("dry run counts both tables separately and deletes nothing", async () => {
    await seed();
    const out = await runAnalyticsRetention({ apply: false, audit: false });
    assert.ok(out.PageView.ok && out.AnalyticsEvent.ok);
    if (out.PageView.ok && out.AnalyticsEvent.ok) {
      assert.ok(out.PageView.result.candidates >= OVERDUE);
      assert.ok(out.AnalyticsEvent.result.candidates >= OVERDUE);
      assert.equal(out.PageView.result.deleted, 0);
      assert.equal(out.AnalyticsEvent.result.deleted, 0);
      assert.equal(out.PageView.result.dryRun, true);
    }
    assert.equal(await db.pageView.count({ where: mine }), ages.length);
    assert.equal(await db.analyticsEvent.count({ where: mine }), ages.length);
  });

  test("apply deletes only rows strictly older than the cutoff in both tables, keeps boundary and newer, and is idempotent", async () => {
    const out = await runAnalyticsRetention({ apply: true, audit: false });
    assert.ok(out.PageView.ok && out.AnalyticsEvent.ok);
    if (out.PageView.ok && out.AnalyticsEvent.ok) {
      assert.ok(out.PageView.result.complete && out.AnalyticsEvent.result.complete);
      assert.equal(out.PageView.result.remainingOverdue, 0);
      assert.equal(out.AnalyticsEvent.result.remainingOverdue, 0);
      assert.ok(new Date(out.PageView.result.oldestRemaining!) >= new Date(out.PageView.result.cutoff));
      assert.ok(new Date(out.AnalyticsEvent.result.oldestRemaining!) >= new Date(out.AnalyticsEvent.result.cutoff));
    }
    for (const rows of [await db.pageView.findMany({ where: mine }), await db.analyticsEvent.findMany({ where: mine })]) {
      assert.equal(rows.length, ages.length - OVERDUE);
      assert.ok(rows.every((r) => r.createdAt >= cutoff), "no overdue row left");
    }
    const again = await runAnalyticsRetention({ apply: true, audit: false });
    assert.ok(again.PageView.ok && again.AnalyticsEvent.ok);
    if (again.PageView.ok && again.AnalyticsEvent.ok) {
      assert.equal(again.PageView.result.deleted, 0);
      assert.equal(again.AnalyticsEvent.result.deleted, 0);
    }
    assert.equal(await db.pageView.count({ where: mine }), ages.length - OVERDUE);
  });

  test("deletion is bounded per batch and an unfinished run resumes", async () => {
    await db.pageView.deleteMany({ where: mine });
    await db.analyticsEvent.deleteMany({ where: mine });
    await seed(10); // 10 x 3 = 30 overdue rows per table
    const { runRetention } = await import("../src/lib/privacy/retention");
    const before = await pageViewRetentionStore.countOlderThan(cutoff);
    const first = await runRetention({ store: analyticsEventRetentionStore, dryRun: false, batchSize: 4, maxBatches: 2 });
    assert.equal(first.deleted, 8, "2 batches x 4 rows");
    assert.equal(first.complete, false);
    assert.equal(await pageViewRetentionStore.countOlderThan(cutoff), before, "the other table is untouched");
    // resume to completion
    for (let i = 0; i < 20 && !(await runRetention({ store: analyticsEventRetentionStore, dryRun: false, batchSize: 4, maxBatches: 2 })).complete; i++);
    assert.equal(await analyticsEventRetentionStore.countOlderThan(cutoff), 0);
    assert.equal(await db.analyticsEvent.count({ where: mine }), 10 * (ages.length - OVERDUE));
  });

  test("the audit trail has one entry per table with counts and dates only", async () => {
    await runAnalyticsRetention({ apply: false });
    const logs = await db.platformAuditLog.findMany({ where: { action: "ANALYTICS_RETENTION_RUN" }, orderBy: { createdAt: "desc" }, take: 2 });
    assert.deepEqual(logs.map((l) => l.targetType).sort(), ["AnalyticsEvent", "PageView"]);
    for (const l of logs) {
      const keys = Object.keys(l.metadata as Record<string, unknown>).sort();
      assert.deepEqual(keys, ["batches", "candidates", "complete", "cutoff", "deleted", "dryRun", "durationMs", "months", "oldestRemaining", "remainingOverdue"]);
    }
  });

  test("cleanup", async () => {
    await db.pageView.deleteMany({ where: mine });
    await db.analyticsEvent.deleteMany({ where: mine });
    await db.$disconnect();
  });
}
