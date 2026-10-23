// Analytics v2 panel aggregations against a REAL scratch PostgreSQL (gate: see docs/testing.md).
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Analytics panels database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  await import("./helpers/action-harness"); // resolves `server-only` to a stub
  const { db } = await import("../src/lib/db");
  const panels = await import("../src/lib/platform/analytics-panels");
  const core = await import("../src/lib/platform/analytics-panels-core");
  const { getDailySeriesBetween, getRangeBreakdown } = await import("../src/lib/platform/analytics");

  // An isolated window far from "now" so other suites' rows can never fall inside it: 2031-03-01..2031-03-10 (UTC).
  const range = core.parseRange({ from: "2031-03-01", to: "2031-03-10" }, new Date("2031-03-20T12:00:00Z"));
  const at = (day: number, hour = 12) => new Date(Date.UTC(2031, 2, day, hour));
  const run = `pnl-${Date.now().toString(36)}`;
  const P = (path: string) => `/${run}${path}`;

  type V = { path: string; channel: string; pageType: string; locale: string; hash: string; when: Date };
  const views: V[] = [];
  const add = (n: number, v: Omit<V, "when" | "hash"> & { hash?: (i: number) => string; day?: number }) => {
    for (let i = 0; i < n; i++) views.push({ path: v.path, channel: v.channel, pageType: v.pageType, locale: v.locale, hash: v.hash ? v.hash(i) : `${run}-h${views.length}`, when: at(v.day ?? 2 + (i % 5)) });
  };

  test("setup: seed page views and events inside and outside the window", async () => {
    await db.analyticsEvent.deleteMany({ where: { path: { startsWith: `/${run}` } } });
    await db.pageView.deleteMany({ where: { path: { startsWith: `/${run}` } } });
    add(30, { path: P("/pricing"), channel: "direct", pageType: "commercial", locale: "en" });
    add(12, { path: P("/fr/tarifs"), channel: "organic_search", pageType: "commercial", locale: "fr" });
    add(6, { path: P("/blog/a"), channel: "social", pageType: "blog", locale: "en" });
    add(3, { path: P("/blog/b"), channel: "email", pageType: "blog", locale: "en" });   // < 5 -> folded
    add(2, { path: P("/help/c"), channel: "referral", pageType: "help", locale: "fr" }); // < 5 -> folded
    add(7, { path: P("/old"), channel: "", pageType: "", locale: "en" });                // historical, before classification
    add(2, { path: P("/old2"), channel: "", pageType: "", locale: "en" });               // historical (folded together with others if < 5 alone? 7+2 = 9 >= 5)
    // one visitor seen on two different days counts twice as a "unique" (daily hashes)
    views.push({ path: P("/twice"), channel: "direct", pageType: "other", locale: "en", hash: `${run}-same`, when: at(3) });
    views.push({ path: P("/twice"), channel: "direct", pageType: "other", locale: "en", hash: `${run}-same`, when: at(4) });
    // outside the window (before and after) and exactly on the exclusive end boundary
    views.push({ path: P("/outside"), channel: "direct", pageType: "home", locale: "en", hash: `${run}-out1`, when: new Date(Date.UTC(2031, 1, 28, 23, 59, 59)) });
    views.push({ path: P("/outside"), channel: "direct", pageType: "home", locale: "en", hash: `${run}-out2`, when: new Date(Date.UTC(2031, 2, 11, 0, 0, 0)) });
    views.push({ path: P("/first-ms"), channel: "direct", pageType: "home", locale: "en", hash: `${run}-in1`, when: new Date(Date.UTC(2031, 2, 1, 0, 0, 0)) });
    views.push({ path: P("/last-ms"), channel: "direct", pageType: "home", locale: "en", hash: `${run}-in2`, when: new Date(Date.UTC(2031, 2, 10, 23, 59, 59, 999)) });
    await db.pageView.createMany({ data: views.map((v) => ({ path: v.path, channel: v.channel, pageType: v.pageType, locale: v.locale, visitorHash: v.hash, createdAt: v.when })) });
    assert.equal(await db.pageView.count({ where: { path: { startsWith: `/${run}` } } }), views.length);
  });

  const mineViews = (rows: { key: string; count: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r.count]));

  test("totals: window is [from, to) in UTC; unique = distinct DAILY hashes (a visitor on two days counts twice)", async () => {
    const t = await panels.getRangeTotals(range);
    const inWindow = views.filter((v) => v.when >= range.from && v.when < range.to);
    assert.equal(inWindow.length, views.length - 2, "two seeded rows are outside the window");
    // other suites' rows cannot be in 2031, so the totals are exactly ours
    assert.equal(t.views, inWindow.length);
    // "same" was seen on two days with the same hash string here (hash equality), so distinct hashes counts it once;
    // in production the hash differs per day, which is exactly what makes it count twice. Pin the SQL semantics:
    assert.equal(t.uniques, new Set(inWindow.map((v) => v.hash)).size);
  });

  test("channel / pageType: counts, small cells folded, historical rows kept as '' (never guessed)", async () => {
    const ch = mineViews(await panels.getChannelBreakdown(range));
    assert.equal(ch.direct, 30 + 2 + 2, "pricing + twice(2) + first/last boundary rows");
    assert.equal(ch.organic_search, 12);
    assert.equal(ch.social, 6);
    assert.equal(ch[""], 9, "historical rows: channel ''");
    assert.equal(ch[core.OTHER_KEY], 3 + 2, "email(3) + referral(2) folded");
    assert.ok(!("email" in ch) && !("referral" in ch));
    const pt = mineViews(await panels.getPageTypeBreakdown(range));
    assert.equal(pt.commercial, 42);
    assert.equal(pt.blog, 9);
    assert.equal(pt[""], 9);
    assert.equal(pt[core.OTHER_KEY], 2 + 2 + 2, "help(2) + other(2) + home(2) folded");
    assert.ok(!("help" in pt) && !("home" in pt) && !("other" in pt));
    for (const rows of [await panels.getChannelBreakdown(range), await panels.getPageTypeBreakdown(range)]) {
      for (const r of rows) assert.ok(r.key === core.OTHER_KEY || r.count >= core.MIN_CELL_SIZE, `${r.key} >= 5 or folded`);
    }
  });

  test("locale split: EN/FR", async () => {
    const lo = mineViews(await panels.getLocaleSplit(range));
    assert.equal(lo.fr, 12 + 2);
    assert.equal(lo.en, views.filter((v) => v.locale === "en" && v.when >= range.from && v.when < range.to).length);
  });

  test("events: with no AnalyticsEvent rows the CTA sections are empty (collection off)", async () => {
    // other suites' tables are isolated per database in CI; locally we only assert on OUR window.
    assert.deepEqual(await panels.getCtaBreakdown(range), []);
    assert.deepEqual(await panels.getCtaFunnel(range), []);
  });

  test("CTA events by ctaId with folding, and the page-view -> click funnel", async () => {
    const ev = (ctaId: string, path: string, day: number, i: number) => ({ type: "CTA_CLICK" as const, ctaId, path, locale: "en", pageType: "commercial", visitorHash: `${run}-e${ctaId}${path}${i}`, createdAt: at(day) });
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ev("signup_start", P("/pricing"), 2 + (i % 5), i)),
      ...Array.from({ length: 5 }, (_, i) => ev("plan_select_pro", P("/pricing"), 3, i)),
      ...Array.from({ length: 3 }, (_, i) => ev("pricing_view", P("/blog/a"), 4, i)),   // < 5 -> folded
      ...Array.from({ length: 2 }, (_, i) => ev("demo_book", P("/blog/b"), 4, i)),      // < 5 -> folded
      ev("signup_start", P("/pricing"), 20, 99),                                          // outside the window
    ];
    await db.analyticsEvent.createMany({ data: rows });
    assert.equal(await panels.hasAnyAnalyticsEvents(), true);
    const cta = mineViews(await panels.getCtaBreakdown(range));
    assert.equal(cta.signup_start, 8);
    assert.equal(cta.plan_select_pro, 5);
    assert.equal(cta[core.OTHER_KEY], 5, "pricing_view(3) + demo_book(2)");
    assert.ok(!("pricing_view" in cta) && !("demo_book" in cta));
    const funnel = await panels.getCtaFunnel(range);
    const row = (id: string, p: string) => funnel.find((f) => f.ctaId === id && f.path === p);
    assert.deepEqual({ ...row("signup_start", P("/pricing")) }, { ctaId: "signup_start", path: P("/pricing"), clicks: 8, views: 30 });
    assert.equal(row("plan_select_pro", P("/pricing"))?.views, 30);
    assert.equal(row("pricing_view", P("/blog/a")), undefined, "small cell: path hidden");
    assert.deepEqual({ ...row("pricing_view", core.OTHER_KEY) }, { ctaId: "pricing_view", path: core.OTHER_KEY, clicks: 3, views: 6 });
    assert.equal(core.ratePer100(8, 30), "26.7");
  });

  test("aggregates expose no visitor-level fields", async () => {
    const data = await panels.getAnalyticsPanels(range);
    const dump = JSON.stringify(data);
    assert.ok(!dump.includes(run + "-h") && !dump.includes("visitorHash"));
    assert.deepEqual(Object.keys(data).sort(), ["channels", "ctas", "funnel", "hasAnyEvents", "locales", "pageTypes", "totals"]);
  });

  test("existing panels accept a custom window: daily series and breakdown honour [from, to)", async () => {
    const series = await getDailySeriesBetween(range.from, range.to);
    assert.equal(series.length, 10);
    assert.equal(series[0].date, "2031-03-01");
    assert.equal(series[9].date, "2031-03-10");
    const inWindow = views.filter((v) => v.when >= range.from && v.when < range.to);
    assert.equal(series.reduce((a, p) => a + p.views, 0), inWindow.length);
    assert.equal(series[0].views >= 1, true, "first-instant row lands on day 1");
    assert.equal(series[9].views >= 1, true, "last-millisecond row lands on day 10");
    const bd = await getRangeBreakdown({ from: range.from, to: range.to });
    assert.equal(bd.totals.views, inWindow.length);
    // the numeric (rolling) form still works
    const rolling = await getRangeBreakdown(30);
    assert.equal(typeof rolling.totals.views, "number");
  });

  test("cleanup", async () => {
    await db.analyticsEvent.deleteMany({ where: { path: { startsWith: `/${run}` } } });
    await db.pageView.deleteMany({ where: { path: { startsWith: `/${run}` } } });
    await db.$disconnect();
  });
}
