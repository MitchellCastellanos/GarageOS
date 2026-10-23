// Analytics v2 panels: pure helpers (date range parsing, small-cell folding, labels) and page wiring. No database.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  MAX_RANGE_DAYS,
  MIN_CELL_SIZE,
  NOT_CLASSIFIED_LABEL,
  OTHER_KEY,
  OTHER_LABEL,
  CTA_NAMES,
  displayKey,
  foldFunnel,
  foldSmallCells,
  parseIsoDay,
  parseRange,
  ratePer100,
} from "../src/lib/platform/analytics-panels-core";
import { CTA_IDS } from "../src/lib/analytics/contract";

const NOW = new Date("2026-10-23T15:30:00.000Z");

test("range: default is 30 days ending today (UTC), presets 7/30/90, junk falls back to 30", () => {
  const d = parseRange({}, NOW);
  assert.equal(d.days, 30);
  assert.equal(d.kind, "preset");
  assert.equal(d.toDay, "2026-10-23");
  assert.equal(d.fromDay, "2026-09-24");
  assert.equal(d.to.toISOString(), "2026-10-24T00:00:00.000Z", "end is exclusive");
  assert.equal(parseRange({ days: "7" }, NOW).fromDay, "2026-10-17");
  assert.equal(parseRange({ days: "90" }, NOW).days, 90);
  for (const bad of ["", "8", "-7", "abc", "7.5", undefined, null, {}]) assert.equal(parseRange({ days: bad }, NOW).days, 30, String(bad));
});

test("range: custom from/to is inclusive, validated and bounded", () => {
  const r = parseRange({ from: "2026-10-01", to: "2026-10-10" }, NOW);
  assert.equal(r.kind, "custom");
  assert.equal(r.days, 10);
  assert.equal(r.from.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(parseRange({ from: "2026-10-23", to: "2026-10-23" }, NOW).days, 1);
  assert.equal(r.error, undefined);
  const bad = (p: object, why: string) => { const x = parseRange(p, NOW); assert.equal(x.error, why, JSON.stringify(p)); assert.equal(x.days, 30); assert.equal(x.kind, "preset"); };
  bad({ from: "2026-10-10", to: "2026-10-01" }, "order");
  bad({ from: "2026-10-01", to: "2026-10-24" }, "future");
  bad({ from: "2026-13-01", to: "2026-13-02" }, "invalid");
  bad({ from: "2026-02-30", to: "2026-03-01" }, "invalid");
  bad({ from: "2026-10-01" }, "invalid");
  bad({ to: "2026-10-01" }, "invalid");
  bad({ from: "2026-10-01; DROP TABLE", to: "2026-10-02" }, "invalid");
  bad({ from: "2026/10/01", to: "2026/10/02" }, "invalid");
  bad({ from: "2025-01-01", to: "2026-10-23" }, "too_long");
  assert.equal(MAX_RANGE_DAYS, 400);
  assert.equal(parseRange({ from: "2025-09-19", to: "2026-10-23" }, NOW).days, 400, "exactly the cap is allowed");
  assert.equal(parseIsoDay("2024-02-29")?.toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(parseIsoDay("2026-02-29"), null);
  assert.equal(parseIsoDay(20261001), null);
});

test("range: custom wins over days", () => {
  const r = parseRange({ days: "7", from: "2026-10-01", to: "2026-10-03" }, NOW);
  assert.equal(r.kind, "custom");
  assert.equal(r.days, 3);
});

test("cell folding: buckets under 5 collapse into one 'Other' row; 5 itself is kept; nothing is mutated", () => {
  const rows = [{ key: "direct", count: 120 }, { key: "social", count: 5 }, { key: "email", count: 4 }, { key: "referral", count: 1 }, { key: "", count: 3 }];
  const copy = JSON.parse(JSON.stringify(rows));
  const out = foldSmallCells(rows);
  assert.deepEqual(out, [{ key: "direct", count: 120 }, { key: "social", count: 5 }, { key: OTHER_KEY, count: 8 }]);
  assert.deepEqual(rows, copy);
  assert.equal(MIN_CELL_SIZE, 5);
  assert.deepEqual(foldSmallCells([{ key: "a", count: 9 }]), [{ key: "a", count: 9 }], "no 'Other' row when nothing is folded");
  assert.deepEqual(foldSmallCells([]), []);
  assert.deepEqual(foldSmallCells([{ key: "a", count: 0 }]), [], "zero counts vanish");
  assert.deepEqual(foldSmallCells([{ key: "a", count: 2 }]), [{ key: OTHER_KEY, count: 2 }]);
});

test("labels: historical '' is never guessed; the folded bucket and known keys are named", () => {
  assert.equal(displayKey(""), NOT_CLASSIFIED_LABEL);
  assert.match(NOT_CLASSIFIED_LABEL, /2026-10-23/);
  assert.equal(displayKey(OTHER_KEY), OTHER_LABEL);
  assert.match(OTHER_LABEL, /<5/);
  assert.equal(displayKey("organic_search", { organic_search: "Búsqueda" }), "Búsqueda");
  assert.equal(displayKey("unknown_thing"), "unknown_thing");
  for (const id of CTA_IDS) assert.ok(CTA_NAMES[id], `${id} has a display name`);
});

test("funnel: rates, and rows under 5 clicks fold per CTA with the path hidden", () => {
  assert.equal(ratePer100(5, 100), "5.0");
  assert.equal(ratePer100(1, 3), "33.3");
  assert.equal(ratePer100(2, 0), "-");
  const out = foldFunnel([
    { ctaId: "signup_start", path: "/pricing", views: 200, clicks: 20 },
    { ctaId: "signup_start", path: "/fr/tarifs", views: 40, clicks: 4 },
    { ctaId: "signup_start", path: "/blog/x", views: 10, clicks: 1 },
    { ctaId: "pricing_view", path: "/blog/y", views: 30, clicks: 2 },
    { ctaId: "demo_book", path: "/watch/en", views: 50, clicks: 6 },
  ]);
  assert.deepEqual(out.map((r) => [r.ctaId, r.path, r.clicks, r.views]), [
    ["signup_start", "/pricing", 20, 200],
    ["demo_book", "/watch/en", 6, 50],
    ["signup_start", OTHER_KEY, 5, 50],
    ["pricing_view", OTHER_KEY, 2, 30],
  ]);
  assert.ok(!JSON.stringify(out).includes("/fr/tarifs") && !JSON.stringify(out).includes("/blog/"), "small-cell paths are not disclosed");
});

test("page wiring: Super Admin check first, aggregates only", () => {
  const page = fs.readFileSync("src/app/(site)/platform/analytics/page.tsx", "utf8");
  const body = page.slice(page.indexOf("export default async function"));
  assert.ok(body.indexOf("await requireSuperAdmin()") > -1);
  assert.ok(body.indexOf("await requireSuperAdmin()") < body.indexOf("getAnalyticsPanels"), "authorisation precedes any query");
  assert.ok(body.indexOf("await requireSuperAdmin()") < body.indexOf("await searchParams"), "authorisation precedes reading the filters");
  const lib = fs.readFileSync("src/lib/platform/analytics-panels.ts", "utf8");
  assert.ok(!lib.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/COUNT\(DISTINCT "visitorHash"\)/g, "").includes("visitorHash"), "visitorHash is only ever counted, never selected or grouped");
});

test("rendered panels: labels, uniques wording, collection-off note, historical label; no funnel without events", async () => {
  await import("./helpers/action-harness");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { AnalyticsPanels } = await import("../src/components/admin/AnalyticsPanels");
  const range = parseRange({}, NOW);
  const base = { totals: { views: 120, uniques: 80 }, channels: [{ key: "direct", count: 100 }, { key: "", count: 9 }, { key: OTHER_KEY, count: 3 }], pageTypes: [{ key: "commercial", count: 90 }], locales: [{ key: "en", count: 100 }, { key: "fr", count: 20 }], hasAnyEvents: false, ctas: [], funnel: [] };
  const off = renderToStaticMarkup(createElement(AnalyticsPanels, { range, data: base }));
  assert.match(off, /Sin clasificar \(antes del 2026-10-23\)/);
  assert.match(off, /Otros \(&lt;5\)/);
  assert.match(off, /no personas/);
  assert.match(off, /ANALYTICS_CTA_ENABLED/);
  assert.ok(!off.includes("Embudo simple"));
  assert.ok(!/conversi[oó]n a registro[^.]*\d/.test(off));
  const on = renderToStaticMarkup(createElement(AnalyticsPanels, { range, data: { ...base, hasAnyEvents: true, ctas: [{ key: "signup_start", count: 12 }], funnel: [{ ctaId: "signup_start", path: "/pricing", views: 100, clicks: 12 }] } }));
  assert.match(on, /Embudo simple/);
  assert.match(on, /12\.0/);
  assert.match(on, /eventos, no personas/);
  assert.ok(!on.includes("ANALYTICS_CTA_ENABLED"));
  const bad = renderToStaticMarkup(createElement(AnalyticsPanels, { range: parseRange({ from: "x", to: "y" }, NOW), data: base }));
  assert.match(bad, /role="alert"/);
});
