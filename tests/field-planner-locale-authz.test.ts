import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fieldCopy } from "../src/lib/admin-locale/sales-field";
import { FIELD_VISIT_OUTCOMES, ROUTE_VISIT_OUTCOMES } from "../src/domain/sales-crm/field-visit";
import { capabilitiesFor, type PlatformSalesActor } from "../src/domain/sales-crm/access";
import { canExecuteVisits, canMutateRoute, canPlanRoutes, canTransitionRoute, canViewRoutes, parsePlannedDate, routeScopeWhere, stopBlock } from "../src/domain/sales-crm/field-route";
import "./helpers/action-harness";

const { geocodingStatus } = await import("../src/lib/sales-crm/geocoder");

const shape = (v: unknown): unknown => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, shape(x)])) : typeof v);

test("EN/FR copy has the same keys everywhere and every outcome is labelled in both languages", () => {
  assert.deepEqual(shape(fieldCopy("en")), shape(fieldCopy("fr")));
  for (const loc of ["en", "fr"] as const) {
    const c = fieldCopy(loc);
    for (const o of FIELD_VISIT_OUTCOMES) { assert.ok(c.outcomes[o], `${loc} label ${o}`); assert.ok(o in c.outcomeHints, `${loc} hint ${o}`); }
    for (const o of ROUTE_VISIT_OUTCOMES) assert.ok(c.outcomes[o].length > 2);
    for (const s of ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) assert.ok(c.status[s]);
    for (const s of ["PENDING", "VISITED", "SKIPPED", "UNAVAILABLE"]) assert.ok(c.stopStatus[s]);
  }
});

const actor = (kind: PlatformSalesActor["kind"], mode: "FIELD" | "REMOTE", staffId: string | null, scope: string[] = []): PlatformSalesActor => ({
  userId: `u-${staffId}`, name: "n", kind, staffId, capabilities: capabilitiesFor(kind, mode), uiLocale: "en", scopeStaffIds: scope.length ? scope : staffId ? [staffId] : [], scopeUserIds: [], all: kind === "SUPER_ADMIN",
});
test("route permissions: FIELD plans/executes own routes; REMOTE never; managers (any mode) read their team; Super Admin reads all but owns nothing without a profile", () => {
  const field = actor("SALES_REP", "FIELD", "s1"), remote = actor("SALES_REP", "REMOTE", "s2");
  const remoteMgr = actor("SALES_MANAGER", "REMOTE", "m1", ["m1", "s1"]), fieldMgr = actor("SALES_MANAGER", "FIELD", "m2", ["m2", "s2"]), root = actor("SUPER_ADMIN", "FIELD", null);
  assert.deepEqual([canPlanRoutes(field), canExecuteVisits(field), canViewRoutes(field)], [true, true, true]);
  assert.deepEqual([canPlanRoutes(remote), canExecuteVisits(remote), canViewRoutes(remote)], [false, false, false]);
  assert.deepEqual([canPlanRoutes(remoteMgr), canExecuteVisits(remoteMgr), canViewRoutes(remoteMgr)], [false, false, true], "REMOTE manager: read-only");
  assert.deepEqual([canPlanRoutes(fieldMgr), canViewRoutes(fieldMgr)], [true, true]);
  assert.deepEqual([canPlanRoutes(root), canViewRoutes(root)], [false, true], "Super Admin without a staff profile cannot own routes");
  assert.deepEqual(routeScopeWhere(field), { ownerStaffId: "s1" });
  assert.deepEqual(routeScopeWhere(remoteMgr), { ownerStaffId: { in: ["m1", "s1"] } });
  assert.deepEqual(routeScopeWhere(root), {});
  assert.deepEqual(routeScopeWhere(remote), { id: "__none__" });
  assert.equal(canMutateRoute(field, { ownerStaffId: "s1" }), true);
  assert.equal(canMutateRoute(field, { ownerStaffId: "s9" }), false);
  assert.equal(canMutateRoute(fieldMgr, { ownerStaffId: "s2" }), false, "a manager does not mutate a report's route");
  assert.equal(canMutateRoute(remoteMgr, { ownerStaffId: "m1" }), false);
});

test("route lifecycle, stop eligibility and dates", () => {
  assert.equal(canTransitionRoute("DRAFT", "IN_PROGRESS"), true); assert.equal(canTransitionRoute("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(canTransitionRoute("COMPLETED", "IN_PROGRESS"), false); assert.equal(canTransitionRoute("CANCELLED", "DRAFT"), false); assert.equal(canTransitionRoute("DRAFT", "COMPLETED"), false);
  const ok = { status: "ACTIVE", archivedAt: null, mergedIntoId: null, doNotContact: false, assignedStaffId: "s1" };
  assert.equal(stopBlock(ok, "s1"), null);
  assert.equal(stopBlock({ ...ok, doNotContact: true }, "s1"), "ALREADY_DO_NOT_CONTACT");
  assert.equal(stopBlock({ ...ok, mergedIntoId: "x" }, "s1"), "PROSPECT_MERGED");
  assert.equal(stopBlock({ ...ok, status: "ARCHIVED" }, "s1"), "PROSPECT_ARCHIVED");
  assert.equal(stopBlock({ ...ok, assignedStaffId: null }, "s1"), "NOT_ASSIGNED_TO_OWNER");
  assert.equal(stopBlock(ok, "s1", false), "OUTSIDE_COVERAGE");
  const today = new Date("2026-10-10T15:00:00Z");
  assert.ok(parsePlannedDate("2026-10-10", today) && parsePlannedDate("2027-01-01", today));
  for (const bad of ["2026-02-30", "2026-10-1", "2020-01-01", "2030-01-01", "x"]) assert.equal(parsePlannedDate(bad, today), null, bad);
});

test("geocoding is OFF by default, synthetic is test-only, and any named live provider stays pending", () => {
  assert.deepEqual(geocodingStatus({} as never, false), { mode: "DISABLED", live: false, reason: "NO_PROVIDER_CONFIGURED" });
  assert.equal(geocodingStatus({ GEOCODING_PROVIDER: "synthetic" } as never, false).mode, "SYNTHETIC");
  assert.deepEqual(geocodingStatus({ GEOCODING_PROVIDER: "synthetic" } as never, true), { mode: "DISABLED", live: false, reason: "SYNTHETIC_FORBIDDEN_IN_PRODUCTION" });
  for (const p of ["google", "mapbox", "nominatim"]) assert.deepEqual(geocodingStatus({ GEOCODING_PROVIDER: p } as never, true), { mode: "PENDING_CONFIGURATION", live: false, reason: "PROVIDER_NOT_IMPLEMENTED" });
});

test("every exported field server action resolves the actor through requireCrmActor with a capability (no unguarded entry point)", () => {
  const src = readFileSync(new URL("../src/actions/sales-field.ts", import.meta.url), "utf8");
  const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n\s*const actor = await requireCrmActor\("(\w+)"\)/g)].map((m) => [m[1], m[2]]);
  const all = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(fns.map((f) => f[0]).sort(), all.sort());
  for (const [, cap] of fns) assert.ok(["plan_field_routes", "log_field_visits"].includes(cap));
});
