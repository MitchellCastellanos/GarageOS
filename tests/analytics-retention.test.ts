// Analytics retention engine: pure logic against an in-memory store (no database, no network).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  ANALYTICS_RETENTION_MONTHS,
  MIN_RETENTION_MONTHS,
  retentionCutoff,
  runRetention,
  runRetentionForTables,
  type RetentionStore,
} from "../src/lib/privacy/retention";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function memoryStore(dates: string[]): RetentionStore & { rows: Date[]; deleteCalls: number } {
  const store = {
    rows: dates.map((d) => new Date(d)),
    deleteCalls: 0,
    async countOlderThan(cutoff: Date) { return store.rows.filter((r) => r < cutoff).length; },
    async oldestCreatedAt() { return store.rows.length ? new Date(Math.min(...store.rows.map((r) => +r))) : null; },
    async deleteOldestBatch(cutoff: Date, limit: number) {
      store.deleteCalls += 1;
      const victims = store.rows.filter((r) => r < cutoff).sort((a, b) => +a - +b).slice(0, limit);
      const set = new Set(victims);
      store.rows = store.rows.filter((r) => !set.has(r));
      return victims.length;
    },
  };
  return store;
}

test("cutoff is 13 calendar months back in UTC and clamps short months", () => {
  assert.equal(ANALYTICS_RETENTION_MONTHS, 13);
  assert.equal(retentionCutoff(NOW).toISOString(), "2025-09-22T12:00:00.000Z");
  assert.equal(retentionCutoff(new Date("2026-03-31T00:00:00.000Z"), 13).toISOString(), "2025-02-28T00:00:00.000Z");
  assert.equal(retentionCutoff(new Date("2024-03-31T00:00:00.000Z"), 13).toISOString(), "2023-02-28T00:00:00.000Z");
  assert.equal(retentionCutoff(new Date("2026-01-15T00:00:00.000Z"), 13).toISOString(), "2024-12-15T00:00:00.000Z");
});

test("retention can never be configured below the floor", () => {
  assert.throws(() => retentionCutoff(NOW, MIN_RETENTION_MONTHS - 1));
  assert.throws(() => retentionCutoff(NOW, 0));
  assert.throws(() => retentionCutoff(NOW, 13.5));
  assert.doesNotThrow(() => retentionCutoff(NOW, MIN_RETENTION_MONTHS));
});

test("dry run counts but deletes nothing", async () => {
  const store = memoryStore(["2025-01-01T00:00:00Z", "2025-09-21T00:00:00Z", "2025-09-23T00:00:00Z", "2026-10-21T00:00:00Z"]);
  const r = await runRetention({ store, now: NOW, dryRun: true });
  assert.equal(r.candidates, 2);
  assert.equal(r.deleted, 0);
  assert.equal(r.remainingOverdue, 2);
  assert.equal(r.complete, false);
  assert.equal(store.deleteCalls, 0);
  assert.equal(store.rows.length, 4);
});

test("apply deletes only rows older than the cutoff and keeps newer ones, including the boundary", async () => {
  const store = memoryStore([
    "2025-01-01T00:00:00Z", "2025-09-22T11:59:59.999Z", // overdue
    "2025-09-22T12:00:00.000Z", "2025-09-22T12:00:00.001Z", "2026-10-21T00:00:00Z", // kept (the cutoff instant itself is kept)
  ]);
  const r = await runRetention({ store, now: NOW, dryRun: false });
  assert.equal(r.deleted, 2);
  assert.equal(r.complete, true);
  assert.equal(r.remainingOverdue, 0);
  assert.equal(store.rows.length, 3);
  assert.ok(new Date(r.oldestRemaining!) >= new Date(r.cutoff), "invariant: oldest remaining is not older than the cutoff");
});

test("apply is idempotent", async () => {
  const store = memoryStore(["2024-01-01T00:00:00Z", "2026-10-01T00:00:00Z"]);
  await runRetention({ store, now: NOW, dryRun: false });
  const again = await runRetention({ store, now: NOW, dryRun: false });
  assert.equal(again.deleted, 0);
  assert.equal(again.candidates, 0);
  assert.equal(again.complete, true);
  assert.equal(store.rows.length, 1);
});

test("batches are bounded; an unfinished run reports incomplete and resumes", async () => {
  const old = Array.from({ length: 25 }, (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`);
  const store = memoryStore([...old, "2026-10-01T00:00:00Z"]);
  const first = await runRetention({ store, now: NOW, dryRun: false, batchSize: 10, maxBatches: 2 });
  assert.equal(first.deleted, 20);
  assert.equal(first.batches, 2);
  assert.equal(first.complete, false);
  assert.equal(first.remainingOverdue, 5);
  const second = await runRetention({ store, now: NOW, dryRun: false, batchSize: 10, maxBatches: 2 });
  assert.equal(second.deleted, 5);
  assert.equal(second.complete, true);
  assert.equal(store.rows.length, 1);
});

test("the time budget stops the loop", async () => {
  const store = memoryStore(Array.from({ length: 30 }, () => "2024-01-01T00:00:00Z"));
  let t = 0;
  const r = await runRetention({ store, now: NOW, dryRun: false, batchSize: 10, timeBudgetMs: 50, clock: () => (t += 30) });
  assert.ok(r.batches < 3, "stopped before draining everything");
  assert.equal(r.complete, false);
});

test("batch size is clamped", async () => {
  const store = memoryStore(["2024-01-01T00:00:00Z"]);
  const seen: number[] = [];
  const spy: RetentionStore = { ...store, deleteOldestBatch: async (c, l) => { seen.push(l); return store.deleteOldestBatch(c, l); } };
  await runRetention({ store: spy, now: NOW, dryRun: false, batchSize: 10_000_000 });
  assert.equal(seen[0], 10_000);
});

test("production wiring: apply is opt-in, the cron route is authenticated, and the SQL deletes only older rows", () => {
  const mod = fs.readFileSync("src/lib/platform/analytics-retention.ts", "utf8");
  assert.match(mod, /ANALYTICS_RETENTION_APPLY === "true"/);
  assert.match(mod, /"createdAt" < \$\{cutoff\}[\s\S]*LIMIT \$\{limit\}/);
  const route = fs.readFileSync("src/app/api/webhooks/cron/analytics-retention/route.ts", "utf8");
  assert.match(route, /isAuthorizedCronRequest\(request\)/);
  assert.ok(JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons.some((c: { path: string }) => c.path === "/api/webhooks/cron/analytics-retention"));
});

// ---- multi-table (PageView + AnalyticsEvent) ----

test("one run covers several tables with separate counts; dry run deletes nothing in any", async () => {
  const pv = memoryStore(["2024-01-01T00:00:00Z", "2026-10-01T00:00:00Z"]);
  const ev = memoryStore(["2024-02-01T00:00:00Z", "2024-03-01T00:00:00Z", "2026-10-01T00:00:00Z"]);
  const dry = await runRetentionForTables({ stores: { PageView: pv, AnalyticsEvent: ev }, now: NOW, dryRun: true });
  assert.ok(dry.PageView.ok && dry.AnalyticsEvent.ok);
  if (dry.PageView.ok && dry.AnalyticsEvent.ok) {
    assert.equal(dry.PageView.result.candidates, 1);
    assert.equal(dry.AnalyticsEvent.result.candidates, 2);
    assert.equal(dry.PageView.result.deleted + dry.AnalyticsEvent.result.deleted, 0);
  }
  assert.equal(pv.rows.length, 2);
  assert.equal(ev.rows.length, 3);
  const applied = await runRetentionForTables({ stores: { PageView: pv, AnalyticsEvent: ev }, now: NOW, dryRun: false });
  assert.ok(applied.PageView.ok && applied.AnalyticsEvent.ok);
  if (applied.PageView.ok && applied.AnalyticsEvent.ok) {
    assert.equal(applied.PageView.result.deleted, 1);
    assert.equal(applied.AnalyticsEvent.result.deleted, 2);
    assert.ok(applied.PageView.result.complete && applied.AnalyticsEvent.result.complete);
  }
  assert.equal(pv.rows.length, 1);
  assert.equal(ev.rows.length, 1);
  const again = await runRetentionForTables({ stores: { PageView: pv, AnalyticsEvent: ev }, now: NOW, dryRun: false });
  assert.ok(again.PageView.ok && again.PageView.result.deleted === 0 && again.AnalyticsEvent.ok && again.AnalyticsEvent.result.deleted === 0);
});

test("the 12-month floor applies to every table", async () => {
  const pv = memoryStore(["2024-01-01T00:00:00Z"]);
  const ev = memoryStore(["2024-01-01T00:00:00Z"]);
  const r = await runRetentionForTables({ stores: { PageView: pv, AnalyticsEvent: ev }, now: NOW, months: 6, dryRun: false });
  assert.ok(!r.PageView.ok && !r.AnalyticsEvent.ok);
  assert.equal(pv.rows.length, 1);
  assert.equal(ev.rows.length, 1);
});

test("the shared time budget is split fairly: a busy first table cannot starve the second", async () => {
  const big = memoryStore(Array.from({ length: 500 }, () => "2024-01-01T00:00:00Z"));
  const small = memoryStore(Array.from({ length: 5 }, () => "2024-01-01T00:00:00Z"));
  let t = 0;
  const clock = () => t;
  // every delete batch "costs" 10 ms; budget 100 ms over 2 tables -> 50 ms each, so the first table gets about 5 batches
  const slow: RetentionStore = { ...big, deleteOldestBatch: async (c, l) => { t += 10; return big.deleteOldestBatch(c, l); } };
  const r = await runRetentionForTables({ stores: { A: slow, B: small }, now: NOW, dryRun: false, batchSize: 10, timeBudgetMs: 100, clock });
  assert.ok(r.A.ok && r.B.ok);
  if (r.A.ok && r.B.ok) {
    assert.equal(r.A.result.complete, false, "first table is bounded by its share");
    assert.ok(r.A.result.batches <= 5);
    assert.equal(r.B.result.deleted, 5, "second table still got its turn");
    assert.equal(r.B.result.complete, true);
  }
});

test("a failing table is reported and does not stop the others", async () => {
  const broken: RetentionStore = { ...memoryStore([]), countOlderThan: async () => { throw new Error("boom with secret payload"); } };
  const ev = memoryStore(["2024-01-01T00:00:00Z"]);
  const r = await runRetentionForTables({ stores: { PageView: broken, AnalyticsEvent: ev }, now: NOW, dryRun: false });
  assert.equal(r.PageView.ok, false);
  assert.ok(r.AnalyticsEvent.ok);
  assert.equal(ev.rows.length, 0);
  assert.ok(!JSON.stringify(r).includes("secret payload"), "only the error class name is kept, never its message");
});

test("production wiring covers both tables, one audit entry per table, and the cron route reports per-table counts", () => {
  const mod = fs.readFileSync("src/lib/platform/analytics-retention.ts", "utf8");
  assert.match(mod, /DELETE FROM "garageos"."AnalyticsEvent"[\s\S]*"createdAt" < \$\{cutoff\}[\s\S]*LIMIT \$\{limit\}/);
  assert.match(mod, /RETENTION_TABLES = \["PageView", "AnalyticsEvent"\]/);
  assert.match(mod, /targetType: table/);
  const route = fs.readFileSync("src/app/api/webhooks/cron/analytics-retention/route.ts", "utf8");
  assert.match(route, /runAnalyticsRetention/);
  assert.match(route, /isAuthorizedCronRequest\(request\)/);
});
