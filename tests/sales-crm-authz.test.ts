/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Prisma/JWT fixtures */
// Platform Sales authorization: tenant roles never grant sales access, staff status is re-read from the database
// on every call, and record/demo scope is enforced server-side. No database is touched (everything is patched).
import assert from "node:assert/strict";
import test from "node:test";
import { setSession } from "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";

process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
process.env.AUTH_TRUST_HOST = "true";

const access = await import("../src/lib/sales-crm/access");
const salesDemo = await import("../src/lib/sales-demo");
const staffActions = await import("../src/actions/sales-staff");
const prospectActions = await import("../src/actions/sales-prospects");
const pipelineActions = await import("../src/actions/sales-pipeline");
const needsActions = await import("../src/actions/sales-needs");
const importActions = await import("../src/actions/sales-import");
const activityActions = await import("../src/actions/sales-activities");

type U = { id: string; name?: string; role: string; shopId?: string | null; preferredLocale?: string };
function users(t: Parameters<typeof patchDb>[0], rows: U[]) {
  patchDb(t, "user", "findUnique", (async ({ where }: any) => {
    const r = rows.find((u) => u.id === where.id);
    return r ? { name: "N", shopId: null, preferredLocale: "EN", ...r } : null;
  }) as never);
}
type S = { id: string; userId: string; role: "SALES_REP" | "SALES_MANAGER"; status: "INVITED" | "ACTIVE" | "INACTIVE"; uiLocale?: string; managerId?: string | null };
function staff(t: Parameters<typeof patchDb>[0], rows: S[]) {
  patchDb(t, "platformSalesStaff", "findUnique", (async ({ where }: any) => {
    const r = rows.find((s) => (where.userId ? s.userId === where.userId : s.id === where.id));
    return r ? { uiLocale: "EN", ...r } : null;
  }) as never);
  patchDb(t, "platformSalesStaff", "findMany", (async ({ where }: any) => rows.filter((s) => s.managerId === where?.managerId).map((s) => ({ id: s.id, userId: s.userId }))) as never);
}
const as = (id: string, over: Record<string, unknown> = {}) => setSession({ user: { id, role: "VIEWER", shopId: null }, ...over } as never);

test("resolvePlatformSalesActor: only SUPER_ADMIN and ACTIVE shopless staff; tenant roles and non-active staff get nothing", async (t) => {
  users(t, [
    { id: "root", role: "SUPER_ADMIN" }, { id: "owner", role: "OWNER", shopId: "shopA" }, { id: "mech", role: "MECHANIC", shopId: "shopA" },
    { id: "viewer", role: "VIEWER" }, { id: "rep", role: "VIEWER" }, { id: "mgr", role: "VIEWER" }, { id: "invited", role: "VIEWER" }, { id: "gone", role: "VIEWER" },
    { id: "tenantStaff", role: "OWNER", shopId: "shopA" }, { id: "report", role: "VIEWER" },
  ]);
  staff(t, [
    { id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE", managerId: "s-mgr" }, { id: "s-mgr", userId: "mgr", role: "SALES_MANAGER", status: "ACTIVE" },
    { id: "s-inv", userId: "invited", role: "SALES_REP", status: "INVITED" }, { id: "s-gone", userId: "gone", role: "SALES_REP", status: "INACTIVE" },
    { id: "s-tenant", userId: "tenantStaff", role: "SALES_MANAGER", status: "ACTIVE" }, { id: "s-report", userId: "report", role: "SALES_REP", status: "ACTIVE", managerId: "s-mgr" },
  ]);
  for (const id of ["owner", "mech", "viewer", "invited", "gone", "tenantStaff", "missing"]) assert.equal(await access.resolvePlatformSalesActor(id), null, id);
  const root = await access.resolvePlatformSalesActor("root");
  assert.equal(root?.kind, "SUPER_ADMIN"); assert.equal(root?.all, true);
  const rep = await access.resolvePlatformSalesActor("rep");
  assert.deepEqual([rep?.kind, rep?.staffId, rep?.scopeStaffIds, rep?.scopeUserIds, rep?.all], ["SALES_REP", "s-rep", ["s-rep"], ["rep"], false]);
  const mgr = await access.resolvePlatformSalesActor("mgr");
  assert.deepEqual([mgr?.kind, mgr?.scopeStaffIds.slice().sort(), mgr?.scopeUserIds.slice().sort()], ["SALES_MANAGER", ["s-mgr", "s-rep", "s-report"].sort(), ["mgr", "rep", "report"].sort()]);
});

test("requireCrmActor: anonymous, tenant users, inactive staff, missing capability and active demo impersonation are all refused", async (t) => {
  users(t, [{ id: "owner", role: "OWNER", shopId: "shopA" }, { id: "rep", role: "VIEWER" }, { id: "gone", role: "VIEWER" }, { id: "root", role: "SUPER_ADMIN" }]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }, { id: "s-gone", userId: "gone", role: "SALES_REP", status: "INACTIVE" }]);
  setSession(null);
  await assert.rejects(access.requireCrmActor("manage_prospects"), /SALES_FORBIDDEN/);
  as("owner", { user: { id: "owner", role: "SUPER_ADMIN", shopId: "shopA" } }); // spoofed session claim, DB says OWNER
  await assert.rejects(access.requireCrmActor("manage_prospects"), /SALES_FORBIDDEN/);
  as("gone");
  await assert.rejects(access.requireCrmActor("manage_prospects"), /SALES_FORBIDDEN/);
  as("rep");
  assert.equal((await access.requireCrmActor("manage_prospects")).kind, "SALES_REP");
  await assert.rejects(access.requireCrmActor("manage_team"), /SALES_FORBIDDEN/);
  await assert.rejects(access.requireCrmActor("reassign_prospects"), /SALES_FORBIDDEN/);
  as("rep", { impersonation: { salesDemoId: "d", shopId: "s", shopName: "S", startedByUserId: "rep", startedByName: "R", expiresAt: Date.now() + 1e6 } });
  await assert.rejects(access.requireCrmActor("manage_prospects"), /EXIT_DEMO_FIRST/);
  as("root");
  assert.equal((await access.requireCrmActor("manage_team")).kind, "SUPER_ADMIN");
});

test("every staff-management action is Super Admin only: reps, managers, tenant owners are rejected before any write", async (t) => {
  users(t, [{ id: "owner", role: "OWNER", shopId: "shopA" }, { id: "rep", role: "VIEWER" }, { id: "mgr", role: "VIEWER" }]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }, { id: "s-mgr", userId: "mgr", role: "SALES_MANAGER", status: "ACTIVE" }]);
  const writes = [patchDb(t, "user", "create", (async () => { throw new Error("WROTE"); }) as never), patchDb(t, "platformSalesStaff", "update", (async () => { throw new Error("WROTE"); }) as never)];
  const calls: (() => Promise<unknown>)[] = [
    () => staffActions.createSalesStaff(new FormData()), () => staffActions.updateSalesStaff("s-rep", new FormData()), () => staffActions.setSalesStaffStatus("s-rep", "INACTIVE"),
    () => staffActions.resendSalesStaffInvite("s-rep"), () => staffActions.reassignStaffWork("s-rep", "s-mgr", { prospects: true, tasks: true }),
    () => needsActions.createNeedDefinition(new FormData()), () => needsActions.updateNeedDefinition("x", new FormData()), () => prospectActions.reinstateProspect("p"),
  ];
  for (const id of ["owner", "rep", "mgr"]) {
    as(id);
    for (const call of calls) await assert.rejects(call(), /SALES_FORBIDDEN/, `${id}`);
  }
  for (const w of writes) assert.equal(w.mock.callCount(), 0);
});

test("CRM actions need a live platform session; reassignment actions need reassign capability (reps lack it)", async (t) => {
  users(t, [{ id: "owner", role: "OWNER", shopId: "shopA" }, { id: "rep", role: "VIEWER" }]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }]);
  as("owner");
  const fd = new FormData();
  for (const call of [
    () => prospectActions.createProspect(fd), () => prospectActions.archiveProspect("p"), () => prospectActions.markDoNotContact("p", "x"), () => prospectActions.addContact("p", fd),
    () => pipelineActions.changeOpportunityStage("o", "CONTACTED"), () => pipelineActions.startNewOpportunity("p"), () => needsActions.assessNeed("p", fd),
    () => activityActions.logActivity("p", fd), () => activityActions.createTask("p", fd), () => activityActions.completeTask("t"), () => importActions.previewProspectImport(fd), () => importActions.confirmProspectImport("b"),
  ]) await assert.rejects(call(), /SALES_FORBIDDEN/);
  as("rep");
  await assert.rejects(pipelineActions.assignProspect("p", "s-rep"), /SALES_FORBIDDEN/);
  await assert.rejects(activityActions.reassignTask("t", "s-rep"), /SALES_FORBIDDEN/);
});

test("a rep opening a prospect outside their scope gets NOT_FOUND-equivalent (no existence leak) and nothing is written", async (t) => {
  users(t, [{ id: "rep", role: "VIEWER" }]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }]);
  let seenWhere: any = null;
  patchDb(t, "crmProspect", "findFirst", (async ({ where }: any) => { seenWhere = where; return null; }) as never);
  const update = patchDb(t, "crmProspect", "update", (async () => { throw new Error("WROTE"); }) as never);
  as("rep");
  const fd = new FormData(); fd.set("name", "X");
  assert.deepEqual(await prospectActions.updateProspect("someone-elses", fd), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await prospectActions.archiveProspect("someone-elses"), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(seenWhere, { id: "someone-elses", OR: [{ assignedStaffId: { in: ["s-rep"] } }] }, "the query itself is scoped to the rep's staff id");
  assert.equal(update.mock.callCount(), 0);
});

test("requireSalesActor (existing demo flow): Super Admin and ACTIVE staff pass; tenant roles, inactive staff and anonymous do not", async (t) => {
  users(t, [{ id: "root", role: "SUPER_ADMIN" }, { id: "rep", role: "VIEWER" }, { id: "gone", role: "VIEWER" }, ...["OWNER", "MECHANIC", "VIEWER"].map((role) => ({ id: `t-${role}`, role, shopId: "shopA" }))]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }, { id: "s-gone", userId: "gone", role: "SALES_REP", status: "INACTIVE" }]);
  setSession(null);
  await assert.rejects(salesDemo.requireSalesActor(), /SALES_FORBIDDEN/);
  for (const id of ["t-OWNER", "t-MECHANIC", "t-VIEWER", "gone", "missing"]) { as(id); await assert.rejects(salesDemo.requireSalesActor(), /SALES_FORBIDDEN/, id); }
  as("rep"); assert.equal((await salesDemo.requireSalesActor()).actor.role, "SALES_REP");
  as("root"); assert.equal((await salesDemo.requireSalesActor()).actor.role, "SUPER_ADMIN");
});

test("demo ownership: a rep reaches only their own demos, a manager their team's, Super Admin all — others look 'unavailable'", async (t) => {
  users(t, [{ id: "root", role: "SUPER_ADMIN" }, { id: "rep", role: "VIEWER" }, { id: "rep2", role: "VIEWER" }, { id: "mgr", role: "VIEWER" }]);
  staff(t, [
    { id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE", managerId: "s-mgr" }, { id: "s-rep2", userId: "rep2", role: "SALES_REP", status: "ACTIVE" },
    { id: "s-mgr", userId: "mgr", role: "SALES_MANAGER", status: "ACTIVE" },
  ]);
  const future = new Date(Date.now() + 864e5);
  const demos: Record<string, any> = {
    mine: { id: "mine", shopId: "shopM", status: "ACTIVE", currentPlan: "PRO", expiresAt: future, createdByUserId: "rep", shop: { id: "shopM" } },
    theirs: { id: "theirs", shopId: "shopT", status: "ACTIVE", currentPlan: "PRO", expiresAt: future, createdByUserId: "rep2", shop: { id: "shopT" } },
  };
  patchDb(t, "salesDemo", "findUnique", (async ({ where }: any) => demos[where.id] ?? null) as never);
  as("rep");
  assert.equal((await salesDemo.requirePreparedDemo("mine")).demo.id, "mine");
  await assert.rejects(salesDemo.requirePreparedDemo("theirs"), /DEMO_UNAVAILABLE/);
  as("mgr");
  assert.equal((await salesDemo.requirePreparedDemo("mine")).demo.id, "mine", "manager reaches a direct report's demo");
  await assert.rejects(salesDemo.requirePreparedDemo("theirs"), /DEMO_UNAVAILABLE/, "…but not another team's");
  as("root");
  assert.equal((await salesDemo.requirePreparedDemo("theirs")).demo.id, "theirs");
});

test("demo impersonation override survives only while the staff account is ACTIVE", async (t) => {
  const future = Date.now() + 864e5;
  const demo = { id: "d", shopId: "shopM", status: "ACTIVE", currentPlan: "PRO", expiresAt: new Date(future) };
  const session = { user: { id: "rep", role: "OWNER", shopId: "shopM" }, impersonation: { salesDemoId: "d", shopId: "shopM", shopName: "M", startedByUserId: "rep", startedByName: "R", expiresAt: future } };
  setSession(session as never);
  users(t, [{ id: "rep", role: "VIEWER" }]);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "ACTIVE" }]);
  assert.equal(await salesDemo.authorizedDemoSession(demo as never), true);
  staff(t, [{ id: "s-rep", userId: "rep", role: "SALES_REP", status: "INACTIVE" }]);
  assert.equal(await salesDemo.authorizedDemoSession(demo as never), false, "deactivated seller loses the demo override");
  users(t, [{ id: "rep", role: "OWNER", shopId: "shopM" }]);
  staff(t, []);
  assert.equal(await salesDemo.authorizedDemoSession(demo as never), false, "a real tenant OWNER never gets it");
});

test("JWT: deactivated or not-yet-activated staff lose the session; active staff may start a demo impersonation, tenant owners may not", async (t) => {
  const { authConfig } = await import("../src/lib/auth");
  const jwt = authConfig.callbacks!.jwt! as (p: any) => Promise<any>;
  const FUTURE = Date.now() + 3_600_000;
  const imp = { salesDemoId: "d", shopId: "shopM", shopName: "M", startedByUserId: "rep", startedByName: "R", expiresAt: FUTURE };
  patchDb(t, "salesDemo", "findUnique", (async () => ({ id: "d", shopId: "shopM", status: "ACTIVE", currentPlan: "PRO", expiresAt: new Date(FUTURE) })) as never);
  const run = async (dbUser: any, staffRow: any, extra: any = {}) => {
    patchDb(t, "user", "findUnique", (async () => dbUser) as never);
    patchDb(t, "platformSalesStaff", "findUnique", (async () => staffRow) as never);
    return jwt({ token: { userId: dbUser.id, name: "N", email: "n@x.test" }, ...extra });
  };
  const shopless = { id: "rep", shopId: null, role: "VIEWER" };
  assert.equal(await run(shopless, { status: "INACTIVE" }), null);
  assert.equal(await run(shopless, { status: "INVITED" }), null);
  const live = await run(shopless, { status: "ACTIVE" });
  assert.deepEqual([live.userId, live.role, live.shopId], ["rep", "VIEWER", undefined]);
  const started = await run(shopless, { status: "ACTIVE" }, { trigger: "update", session: { impersonation: imp } });
  assert.equal(started.impersonation?.salesDemoId, "d");
  const tenant = { id: "rep", shopId: "shopA", role: "OWNER" };
  const denied = await run(tenant, null, { trigger: "update", session: { impersonation: imp } });
  assert.equal(denied.impersonation, undefined, "a tenant OWNER can never start an impersonation");
  // An impersonation claim carried by an old token is dropped when the real user is neither Super Admin nor ACTIVE staff.
  const claimOnly = await run(tenant, null, { token: { userId: "rep", impersonation: imp } });
  assert.equal(claimOnly.impersonation, undefined);
});
