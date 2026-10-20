import assert from "node:assert/strict";
import test from "node:test";
import { activeGroupId, isNavItemActive, navFor, type PlatformNav, type PlatformNavContext } from "../src/components/admin/platform-nav";
import { PLATFORM } from "../src/lib/routes";

const hrefs = (n: PlatformNav) => [...n.top, ...n.groups.flatMap((g) => g.items), n.account].map((i) => i.href);
const full = { fieldPlanner: true, leadRadar: true };
const ctx = (kind: PlatformNavContext["kind"], locale: "en" | "fr" = "en", extra: Partial<PlatformNavContext> = full): PlatformNavContext => ({ kind, locale, ...extra });

test("Super Admin reaches every existing destination, each exactly once", () => {
  const all = hrefs(navFor(ctx("SUPER_ADMIN")));
  const expected = [PLATFORM.sales, PLATFORM.salesProspects, PLATFORM.salesPipeline, PLATFORM.salesTasks, PLATFORM.salesField, PLATFORM.salesInbox, PLATFORM.salesOutreach, PLATFORM.salesCalendar, PLATFORM.salesCalling, PLATFORM.salesVoiceSettings, PLATFORM.salesDemos, PLATFORM.salesLeadRadar, PLATFORM.home, PLATFORM.analytics, PLATFORM.messages, PLATFORM.salesTeam, PLATFORM.salesNeeds, PLATFORM.salesComms, PLATFORM.salesTerritories, PLATFORM.salesGeocoding, PLATFORM.salesVideos, PLATFORM.salesAccount];
  assert.deepEqual([...all].sort(), [...expected].sort());
  assert.equal(new Set(all).size, all.length);
});

test("Sales manager sees team but no Super Admin-only tools", () => {
  const all = hrefs(navFor(ctx("SALES_MANAGER")));
  assert.ok(all.includes(PLATFORM.salesTeam) && all.includes(PLATFORM.salesLeadRadar) && all.includes(PLATFORM.salesAccount));
  for (const h of [PLATFORM.home, PLATFORM.analytics, PLATFORM.messages, PLATFORM.salesNeeds, PLATFORM.salesComms, PLATFORM.salesTerritories, PLATFORM.salesGeocoding, PLATFORM.salesVideos]) assert.ok(!all.includes(h), h);
  assert.deepEqual(navFor(ctx("SALES_MANAGER")).groups.map((g) => g.id), ["crm", "admin"]);
});

test("Sales rep gets CRM only; Lead Radar and field planner follow the flags", () => {
  const nav = navFor(ctx("SALES_REP", "en", { fieldPlanner: false, leadRadar: false }));
  assert.deepEqual(nav.groups.map((g) => g.id), ["crm"]);
  const all = hrefs(nav);
  for (const h of [PLATFORM.salesTeam, PLATFORM.salesLeadRadar, PLATFORM.salesField, PLATFORM.home, PLATFORM.salesNeeds]) assert.ok(!all.includes(h), h);
  assert.ok(hrefs(navFor(ctx("SALES_REP", "en", { fieldPlanner: true, leadRadar: false }))).includes(PLATFORM.salesField));
});

test("EN and FR labels are all present and FR differs for the new group labels", () => {
  for (const kind of ["SUPER_ADMIN", "SALES_MANAGER", "SALES_REP"] as const) {
    const en = navFor(ctx(kind)); const fr = navFor(ctx(kind, "fr"));
    for (const n of [en, fr]) for (const i of [...n.top, ...n.groups.flatMap((g) => g.items), n.account, ...n.groups]) assert.ok(i.label && !/undefined/.test(i.label));
    assert.equal(en.groups.length, fr.groups.length);
  }
  assert.equal(navFor(ctx("SUPER_ADMIN", "fr")).groups.at(-1)?.label, "Administration");
  assert.equal(navFor(ctx("SUPER_ADMIN", "fr")).top[0].label, "Tableau de bord");
});

test("current page is highlighted once and its group is the one to auto-expand", () => {
  const nav = navFor(ctx("SUPER_ADMIN"));
  const cases: Array<[string, string, string | null]> = [
    [PLATFORM.sales, PLATFORM.sales, null],
    ["/platform/sales/prospects/abc", PLATFORM.salesProspects, "crm"],
    [PLATFORM.salesNew, PLATFORM.salesDemos, "crm"],
    ["/platform/shops/xyz", PLATFORM.home, "platform"],
    [PLATFORM.messages, PLATFORM.messages, "platform"],
    [PLATFORM.salesGeocoding, PLATFORM.salesGeocoding, "admin"],
    [PLATFORM.salesLeadRadarNational, PLATFORM.salesLeadRadar, null],
  ];
  for (const [path, href, group] of cases) {
    const items = [...nav.top, ...nav.groups.flatMap((g) => g.items), nav.account].filter((i) => isNavItemActive(i, path));
    assert.deepEqual(items.map((i) => i.href), [href], path);
    assert.equal(activeGroupId(nav, path), group, path);
  }
});
