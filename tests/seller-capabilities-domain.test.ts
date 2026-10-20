// Field sales / Remote sales capability model — pure rules. FIELD = Field + Remote, REMOTE = Remote only; no schema change, no territory-engine change.
import assert from "node:assert/strict";
import test from "node:test";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { capabilityFlagsOf, resolveSalesMode } from "../src/domain/sales-crm/capabilities";
import { evaluateAcquisition, NO_ENGAGEMENT, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { suggestedLanguage } from "../src/lib/sales-crm/calling-queue";

const NOW = new Date("2026-10-21T15:00:00Z");
const rule = (o: Partial<TerritoryRule>): TerritoryRule => ({ key: "k", acquisition: "REMOTE_DEFAULT", provinces: [], cities: [], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 100, ...o } as TerritoryRule);
const MTL = rule({ key: "greater-montreal", acquisition: "FIELD_EXCLUSIVE", provinces: ["QC"], cities: ["montreal"], postalPrefixes: ["H"], sortOrder: 10 });
const CANADA = rule({ key: "canada", sortOrder: 99 });

test("flags: FIELD = Field sales + Remote sales; REMOTE = Remote sales only; Remote sales is never off for a seller", () => {
  assert.deepEqual(capabilityFlagsOf("FIELD"), { fieldSales: true, remoteSales: true });
  assert.deepEqual(capabilityFlagsOf("REMOTE"), { fieldSales: false, remoteSales: true });
});

test("form resolution: checkboxes decide the mode; Remote sales cannot be unchecked; legacy salesMode still works; an absent checkbox is only trusted with the marker", () => {
  assert.deepEqual(resolveSalesMode({ capabilitiesSubmitted: "1", fieldSales: "on", remoteSales: "on" }), { ok: true, mode: "FIELD", flags: { fieldSales: true, remoteSales: true } });
  assert.deepEqual(resolveSalesMode({ capabilitiesSubmitted: "1", remoteSales: "on" }), { ok: true, mode: "REMOTE", flags: { fieldSales: false, remoteSales: true } });
  assert.deepEqual(resolveSalesMode({ capabilitiesSubmitted: "1", fieldSales: "on" }), { ok: false, code: "REMOTE_SALES_REQUIRED" });
  assert.deepEqual(resolveSalesMode({ capabilitiesSubmitted: "1" }), { ok: false, code: "REMOTE_SALES_REQUIRED" });
  assert.equal((resolveSalesMode({ salesMode: "FIELD" }) as { mode: string }).mode, "FIELD");
  assert.equal((resolveSalesMode({ salesMode: "REMOTE" }) as { mode: string }).mode, "REMOTE");
  assert.equal((resolveSalesMode({ salesMode: "garbage" }) as { mode: string }).mode, "REMOTE", "anything unknown is the least privileged mode");
  assert.equal((resolveSalesMode({ fieldSales: "on", remoteSales: "on" }) as { mode: string }).mode, "REMOTE", "checkbox values without the marker are ignored");
});

test("authorization: both modes get Remote sales (calls); only FIELD gets Field sales (routes, visits); no mode grants management or geocoding", () => {
  for (const kind of ["SALES_REP", "SALES_MANAGER"] as const) {
    const field = capabilitiesFor(kind, "FIELD"), remote = capabilitiesFor(kind, "REMOTE");
    assert.equal(field.has("place_sales_calls"), true, `${kind} FIELD + REMOTE can call`);
    assert.equal(remote.has("place_sales_calls"), true, `${kind} REMOTE-only can call`);
    assert.equal(field.has("plan_field_routes") && field.has("log_field_visits"), true);
    assert.equal(remote.has("plan_field_routes") || remote.has("log_field_visits"), false, `${kind} REMOTE-only never gets field privileges`);
    for (const c of ["manage_team", "manage_geocoding", "manage_lead_radar"] as const) assert.equal(field.has(c) || remote.has(c), false, c);
  }
  assert.equal(capabilitiesFor("SALES_MANAGER", "REMOTE").has("manage_team"), false, "a manager can never edit sellers' capabilities");
  assert.equal(capabilitiesFor("SALES_REP", "FIELD").has("manage_team"), false);
});

test("territory engine unchanged: a FIELD seller may take FIELD-held AND REMOTE prospects; a REMOTE-only seller never takes FIELD-held; coverage still binds both", () => {
  const rules = [MTL, CANADA];
  const mtl = MTL, ottawa = CANADA;
  const f = { mode: "FIELD" as const, coverageKeys: [] as string[], isSuperAdmin: false }, r = { mode: "REMOTE" as const, coverageKeys: [] as string[], isSuperAdmin: false };
  assert.equal(evaluateAcquisition(f, mtl, NO_ENGAGEMENT, NOW).allowed, true);
  assert.equal(evaluateAcquisition(f, ottawa, NO_ENGAGEMENT, NOW).allowed, true, "FIELD + REMOTE seller works REMOTE prospects");
  assert.deepEqual(evaluateAcquisition(r, mtl, NO_ENGAGEMENT, NOW), { allowed: false, code: "FIELD_MODE_REQUIRED" });
  assert.equal(evaluateAcquisition(r, ottawa, NO_ENGAGEMENT, NOW).allowed, true);
  // Turning Field sales off (FIELD → REMOTE) grants nothing: the same FIELD-held prospect becomes unavailable to acquire.
  assert.equal(evaluateAcquisition({ ...f, mode: "REMOTE" }, mtl, NO_ENGAGEMENT, NOW).allowed, false);
  // Coverage: remote work outside the seller's covered territories is still refused, even for FIELD + REMOTE.
  assert.deepEqual(evaluateAcquisition({ ...f, coverageKeys: ["greater-montreal"] }, ottawa, NO_ENGAGEMENT, NOW), { allowed: false, code: "OUTSIDE_COVERAGE" });
  assert.equal(evaluateAcquisition({ ...f, coverageKeys: ["canada"] }, ottawa, NO_ENGAGEMENT, NOW).allowed, true);
  assert.equal(rules.length, 2);
});

test("queue language hint: Québec → FR, elsewhere EN, unknown province → UNKNOWN (display only)", () => {
  assert.equal(suggestedLanguage("QC"), "FR");
  assert.equal(suggestedLanguage("ON"), "EN");
  assert.equal(suggestedLanguage(null), "UNKNOWN");
});
