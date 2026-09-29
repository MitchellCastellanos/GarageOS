import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession } from "./helpers/action-harness";
import { patchDb, patchTransaction } from "./helpers/db-mock";
import {
  ADDITIONAL_LOCATION_BILLING_ENABLED,
  additionalLocationsMonthlyCad,
  countAdditionalLocations,
  resolveLocationScope,
} from "../src/domain/locations";
import { REPORT_KINDS, FINANCIAL_KINDS } from "../src/domain/reports";
import { canView, can } from "../src/lib/subscription";

const locations = await import("../src/actions/locations");
const reports = await import("../src/actions/reports");

const DAY = 86_400_000;

// ── dominio puro ───────────────────────────────────────────

test("location scope: active by default, 'all' = accessible only, foreign ids rejected", () => {
  assert.deepEqual(resolveLocationScope(undefined, "A", ["A", "B"]), { ok: true, shopIds: ["A"], mode: "active" });
  assert.deepEqual(resolveLocationScope("active", "A", ["A", "B"]), { ok: true, shopIds: ["A"], mode: "active" });
  assert.deepEqual(resolveLocationScope("all", "A", ["A", "B"]), { ok: true, shopIds: ["A", "B"], mode: "all" });
  assert.deepEqual(resolveLocationScope("B", "A", ["A", "B"]), { ok: true, shopIds: ["B"], mode: "one" });
  assert.deepEqual(resolveLocationScope("C", "A", ["A", "B"]), { ok: false, error: "NO_LOCATION_ACCESS" });
  assert.deepEqual(resolveLocationScope("B,C", "A", ["A", "B"]), { ok: false, error: "NO_LOCATION_ACCESS" });
});

test("billable locations: counted internally, automatic billing stays OFF until confirmed", () => {
  assert.equal(countAdditionalLocations(1), 0);
  assert.equal(countAdditionalLocations(0), 0);
  assert.equal(countAdditionalLocations(4), 3);
  assert.equal(additionalLocationsMonthlyCad(4), 3 * 199);
  assert.equal(ADDITIONAL_LOCATION_BILLING_ENABLED, false, "the $199/location charge needs a product decision + Stripe Price");
});

test("the location comparison is a Complete-only, financial report", () => {
  assert.ok(REPORT_KINDS.includes("locations"));
  assert.ok(FINANCIAL_KINDS.includes("locations"));
});

// ── mundo simulado ─────────────────────────────────────────

interface FakeShop { id: string; name: string; organizationId: string | null; createdAt: Date; timezone?: string }
interface World {
  shops: Record<string, FakeShop>;
  /** userId → shopIds con UserShopAccess */
  grants: Record<string, string[]>;
  users: Record<string, { id: string; shopId: string; role: string; name?: string; email?: string }>;
  plan: "CORE" | "PRO" | "COMPLETE";
  status?: "ACTIVE" | "CANCELED";
  writes: { userUpdates: unknown[]; grants: { userId: string; shopId: string }[]; revoked: { userId: string; shopId: string }[]; created: unknown[] };
  wheres: { model: string; where: Record<string, unknown> }[];
}

function world(t: TestContext, plan: World["plan"] = "COMPLETE", status: World["status"] = "ACTIVE"): World {
  const w: World = {
    shops: {
      A: { id: "A", name: "Main", organizationId: "O1", createdAt: new Date("2026-01-01") },
      B: { id: "B", name: "North", organizationId: "O1", createdAt: new Date("2026-02-01") },
      C: { id: "C", name: "Other org", organizationId: "O2", createdAt: new Date("2026-01-01") },
      D: { id: "D", name: "Solo", organizationId: null, createdAt: new Date("2026-01-01") },
    },
    grants: { owner: ["B"], mech: ["B"], childOwner: [], viewer: [] },
    users: {
      owner: { id: "owner", shopId: "A", role: "OWNER", name: "Own", email: "o@x" },
      mech: { id: "mech", shopId: "A", role: "MECHANIC", name: "Mec", email: "m@x" },
      childOwner: { id: "childOwner", shopId: "B", role: "OWNER", name: "Kid", email: "k@x" },
      soloOwner: { id: "soloOwner", shopId: "D", role: "OWNER" },
      otherOwner: { id: "otherOwner", shopId: "C", role: "OWNER" },
    },
    plan,
    status,
    writes: { userUpdates: [], grants: [], revoked: [], created: [] },
    wheres: [],
  };
  const sub = () => ({
    id: "sub", shopId: "A", plan: w.plan, status: w.status ?? "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 20 * DAY), cancelAtPeriodEnd: false, stripeCustomerId: "cus", stripeSubscriptionId: "sub_x", stripePriceId: "p", billingEmail: null,
  });
  const withSub = (s: FakeShop) => ({ ...s, subscription: s.id === "A" || s.id === "D" ? sub() : null });
  patchDb(t, "shop", "findUnique", (async ({ where }: { where: { id: string } }) => {
    const s = w.shops[where.id];
    return s ? withSub(s) : null;
  }) as never);
  patchDb(t, "shop", "findFirst", (async ({ where }: { where: Record<string, unknown> }) => {
    if (where.organizationId) {
      const inOrg = Object.values(w.shops).filter((s) => s.organizationId === where.organizationId).sort((a, b) => +a.createdAt - +b.createdAt);
      const pick = where.subscription ? inOrg.find((s) => s.id === "A") : inOrg[0];
      return pick ? withSub(pick) : null;
    }
    const s = w.shops[where.id as string];
    return s ? { timezone: "America/Toronto" } : null;
  }) as never);
  patchDb(t, "shop", "findMany", (async ({ where }: { where: { id?: { in: string[] }; organizationId?: string } }) => {
    w.wheres.push({ model: "shop.findMany", where });
    return Object.values(w.shops).filter((s) => (where.id?.in ? where.id.in.includes(s.id) : true) && (where.organizationId ? s.organizationId === where.organizationId : true))
      .map((s) => ({ ...s, users: [], userAccess: [] }));
  }) as never);
  patchDb(t, "userShopAccess", "findMany", (async ({ where }: { where: { userId: string } }) =>
    (w.grants[where.userId] ?? []).map((id) => ({ shop: w.shops[id] }))) as never);
  patchDb(t, "userShopAccess", "findFirst", (async ({ where }: { where: { userId: string; shopId: { not: string } } }) => {
    const other = (w.grants[where.userId] ?? []).find((id) => id !== where.shopId.not && w.shops[id]?.organizationId === "O1");
    return other ? { shopId: other } : null;
  }) as never);
  patchDb(t, "userShopAccess", "deleteMany", (async ({ where }: { where: { userId: string; shopId: string } }) => {
    w.writes.revoked.push(where);
    return { count: 1 };
  }) as never);
  patchDb(t, "userShopAccess", "upsert", (async ({ create }: { create: { userId: string; shopId: string } }) => {
    w.writes.grants.push(create);
    return create;
  }) as never);
  patchDb(t, "user", "findUnique", (async ({ where }: { where: { id: string } }) => {
    const u = w.users[where.id];
    if (!u) return null;
    return { ...u, preferredLocale: "en", permissionGrants: [], permissionDenies: [], shop: { organizationId: w.shops[u.shopId]?.organizationId ?? null } };
  }) as never);
  patchDb(t, "user", "update", (async (args: unknown) => {
    w.writes.userUpdates.push(args);
    return {};
  }) as never);
  patchTransaction(t, {
    userShopAccess: {
      upsert: async ({ create }: { create: { userId: string; shopId: string } }) => void w.writes.grants.push(create),
      create: async ({ data }: { data: { userId: string; shopId: string } }) => void w.writes.grants.push(data),
      deleteMany: async ({ where }: { where: { userId: string; shopId: string } }) => void w.writes.revoked.push(where),
    },
    user: { update: async (args: unknown) => void w.writes.userUpdates.push(args) },
    organization: { create: async () => ({ id: "O-new" }) },
    shop: {
      update: async () => ({}),
      create: async ({ data }: { data: { name: string; organizationId: string } }) => {
        w.writes.created.push(data);
        return { id: "NEW", email: null, ...data };
      },
    },
  });
  return w;
}

const as = (id: keyof ReturnType<typeof usersOf>, shopId?: string) => {
  const map = usersOf();
  setSession({ user: { id, role: map[id].role, shopId: shopId ?? map[id].shopId } });
};
const usersOf = () => ({
  owner: { role: "OWNER", shopId: "A" },
  mech: { role: "MECHANIC", shopId: "A" },
  childOwner: { role: "OWNER", shopId: "B" },
  soloOwner: { role: "OWNER", shopId: "D" },
  otherOwner: { role: "OWNER", shopId: "C" },
});

// ── acceso y cambio de ubicación ────────────────────────────

test("accessible locations = active + grants of the SAME organization only", async (t) => {
  const w = world(t);
  w.grants.owner = ["B", "C"]; // un grant a otra organización (dato corrupto) nunca abre acceso
  as("owner");
  const shops = await locations.getAccessibleShops();
  assert.deepEqual(shops.map((s) => s.id).sort(), ["A", "B"]);
});

test("switching: allowed for an accessible location, keeps access to the location you leave", async (t) => {
  const w = world(t);
  as("owner");
  assert.deepEqual(await locations.switchActiveShop("B"), { success: true });
  assert.deepEqual(w.writes.grants, [{ userId: "owner", shopId: "A" }], "previous active location becomes an explicit grant");
  assert.equal(w.writes.userUpdates.length, 1);
  assert.deepEqual((w.writes.userUpdates[0] as { data: unknown }).data, { shopId: "B" });
});

test("cross-location denial: switching to a foreign/unknown location by ID is refused without any write", async (t) => {
  const w = world(t);
  for (const target of ["C", "D", "does-not-exist"]) {
    as("owner");
    const res = await locations.switchActiveShop(target);
    assert.ok("error" in res && res.error, target);
  }
  as("childOwner"); // dueño de B: no tiene acceso a A
  assert.ok("error" in (await locations.switchActiveShop("A")));
  as("mech"); // mecánico con acceso solo a A (home) y B
  assert.ok("error" in (await locations.switchActiveShop("C")));
  assert.equal(w.writes.userUpdates.length, 0);
  assert.equal(w.writes.grants.length, 0);
});

// ── entitlement Complete + administración ───────────────────

test("non-Complete plans cannot create locations (server-side)", async (t) => {
  for (const plan of ["CORE", "PRO"] as const) {
    const w = world(t, plan);
    as("owner");
    const res = await locations.createShopLocation({ name: "New" });
    assert.ok("error" in res && res.error, plan);
    assert.equal(w.writes.created.length, 0);
  }
});

test("Complete organization admin creates a location: same organization, access granted, no own subscription", async (t) => {
  const w = world(t);
  as("owner");
  const res = await locations.createShopLocation({ name: "South Shop" });
  assert.ok("success" in res && res.success);
  assert.equal((w.writes.created[0] as { organizationId: string }).organizationId, "O1");
  assert.deepEqual(w.writes.grants, [{ userId: "owner", shopId: "NEW" }]);
});

test("a location-only OWNER (no access to the root) is not an organization admin", async (t) => {
  const w = world(t);
  as("childOwner");
  assert.ok("error" in (await locations.createShopLocation({ name: "Sneaky" })));
  assert.ok("error" in (await locations.grantLocationAccess("childOwner", "A")), "cannot self-grant the root location");
  assert.ok("error" in (await locations.revokeLocationAccess("owner", "B")));
  assert.deepEqual(await locations.getOrganizationUsers(), []);
  assert.equal((await locations.getOrganizationLocations()).organizationId, null);
  assert.equal(await locations.getOrganizationOverview(), null);
  assert.equal(w.writes.grants.length + w.writes.created.length, 0);
});

test("grant/revoke: organization admin only, same-organization users and locations only", async (t) => {
  const w = world(t);
  as("owner");
  assert.ok("success" in (await locations.grantLocationAccess("mech", "B")));
  assert.ok("error" in (await locations.grantLocationAccess("mech", "C")), "foreign location");
  assert.ok("error" in (await locations.grantLocationAccess("otherOwner", "B")), "user from another organization");
  assert.ok("error" in (await locations.grantLocationAccess("mech", "D")), "unrelated shop");
  as("otherOwner");
  assert.ok("error" in (await locations.grantLocationAccess("mech", "B")), "other organization's owner has no authority here");
  assert.equal(w.writes.grants.length, 1);
  as("mech");
  await assert.rejects(() => locations.grantLocationAccess("mech", "B"), /owner/i);
});

test("revoking a user's ACTIVE location moves them to another one, or refuses to strand them", async (t) => {
  const w = world(t);
  as("owner");
  // mech's active shop is A and it has a grant to B → revoking A moves mech to B.
  assert.ok("success" in (await locations.revokeLocationAccess("mech", "A")));
  assert.deepEqual((w.writes.userUpdates[0] as { data: unknown }).data, { shopId: "B" });
  // a user with no other location can't be stranded
  w.users.mech.shopId = "A";
  w.grants.mech = [];
  const res = await locations.revokeLocationAccess("mech", "A");
  assert.ok("error" in res);
});

test("organization overview: only accessible locations, active flag, no money, billing inactive", async (t) => {
  world(t);
  patchDb(t, "organization", "findUnique", (async () => ({ name: "Acme" })) as never);
  const rows = (key: string) => async ({ where }: { where: { shopId: { in: string[] } } }) => {
    assert.deepEqual(where.shopId.in.sort(), ["A", "B"], `${key} must be scoped to accessible locations`);
    return where.shopId.in.map((shopId) => ({ shopId, _count: { _all: shopId === "A" ? 3 : 1 } }));
  };
  patchDb(t, "workOrder", "groupBy", rows("wo") as never);
  patchDb(t, "client", "groupBy", rows("client") as never);
  patchDb(t, "user", "groupBy", rows("user") as never);
  patchDb(t, "shop", "count", (async () => 2) as never);
  as("owner");
  const o = await locations.getOrganizationOverview();
  assert.ok(o);
  assert.deepEqual(o.locations.map((l) => [l.id, l.isActive, l.isRoot]), [["A", true, true], ["B", false, false]]);
  assert.equal(o.additionalLocations, 1);
  assert.deepEqual(o.additionalLocationBilling, { active: false, monthlyCad: 0 });
  assert.ok(!JSON.stringify(o).includes("revenue"));
});

// ── entitlements de suscripción ─────────────────────────────

test("Multi-Shop entitlements are Complete-only and resolve through the organization's subscription", async (t) => {
  world(t, "PRO");
  assert.equal(await can("B", "reports.multiLocation"), false);
  assert.equal(await can("B", "organization.multiLocation"), false);
  world(t, "COMPLETE");
  assert.equal(await can("B", "reports.multiLocation"), true, "child location shares the org subscription");
  assert.equal(await canView("A", "organization.multiLocation"), true);
  world(t, "COMPLETE", "CANCELED");
  assert.equal(await can("A", "organization.multiLocation"), false, "restricted org can't manage locations");
  assert.equal(await canView("A", "reports.multiLocation"), true, "but keeps read-only view of what it had");
});

// ── reportes consolidados ───────────────────────────────────

function reportFakes(t: TestContext, w: World) {
  const rec = (model: string, result: unknown) => async (args: { where: Record<string, unknown> }) => {
    w.wheres.push({ model, where: args.where });
    return result;
  };
  patchDb(t, "invoice", "groupBy", (async (args: { where: { status: unknown } }) => {
    w.wheres.push({ model: "invoice.groupBy", where: args.where as never });
    return typeof args.where.status === "string"
      ? [{ shopId: "A", _sum: { total: "300.00" }, _count: { _all: 3 } }, { shopId: "B", _sum: { total: "100.00" }, _count: { _all: 1 } }]
      : [{ shopId: "B", _sum: { total: "50.00" } }];
  }) as never);
  patchDb(t, "invoiceRefund", "groupBy", rec("refund.groupBy", [{ shopId: "A", _sum: { amount: "20.00" } }]) as never);
  patchDb(t, "workOrder", "groupBy", rec("wo.groupBy", [{ shopId: "A", _count: { _all: 5 } }]) as never);
  patchDb(t, "client", "groupBy", rec("client.groupBy", [{ shopId: "B", _count: { _all: 2 } }]) as never);
  patchDb(t, "invoice", "findMany", (async (args: { where: Record<string, unknown> }) => {
    w.wheres.push({ model: "invoice.findMany", where: args.where });
    return [];
  }) as never);
  patchDb(t, "invoiceRefund", "aggregate", rec("refund.agg", { _sum: { amount: null, taxAmount: null }, _count: { _all: 0 } }) as never);
}

test("Complete: 'all' consolidates ONLY the user's accessible locations; comparison has one row per location", async (t) => {
  const w = world(t);
  reportFakes(t, w);
  as("owner");
  const res = await reports.getReport({ kind: "locations", preset: "thisMonth" });
  assert.ok(!("error" in res));
  const d = res.data as import("../src/lib/reports-service").LocationComparisonReport;
  assert.deepEqual(d.rows.map((r) => [r.shopId, r.revenue, r.refunds, r.net, r.outstanding]), [["A", 300, 20, 280, 0], ["B", 100, 0, 100, 50]]);
  assert.equal(d.totals.net, 380);
  assert.equal(d.totals.paidInvoices, 4);
  assert.equal(d.totals.average, 100);
  const scoped = w.wheres.filter((x) => x.where.shopId);
  assert.ok(scoped.length > 5);
  assert.ok(scoped.every((x) => JSON.stringify(x.where.shopId) === JSON.stringify({ in: ["A", "B"] })), "never a shop outside the accessible set");
});

test("Complete: location filter — one accessible location, or an inaccessible ID is denied", async (t) => {
  const w = world(t);
  reportFakes(t, w);
  as("owner");
  const one = await reports.getReport({ kind: "sales", preset: "thisMonth", location: "B" });
  assert.ok(!("error" in one));
  assert.equal(one.scopeMode, "one");
  assert.ok(w.wheres.filter((x) => x.where.shopId).every((x) => JSON.stringify(x.where.shopId) === JSON.stringify({ in: ["B"] })));
  w.wheres.length = 0;
  for (const bad of ["C", "D", "A,C", "nope"]) {
    assert.deepEqual(await reports.getReport({ kind: "overview", location: bad }), { error: "NO_LOCATION_ACCESS" }, bad);
  }
  assert.equal(w.wheres.length, 0, "denied before any data query");
});

test("Pro/Core: consolidated reports, comparison and other-location filters are blocked server-side", async (t) => {
  for (const plan of ["CORE", "PRO"] as const) {
    const w = world(t, plan);
    reportFakes(t, w);
    as("owner");
    for (const input of [{ kind: "locations" }, { kind: "sales", location: "all" }, { kind: "overview", location: "B" }]) {
      assert.deepEqual(await reports.getReport(input), { error: "MULTI_LOCATION_REQUIRED" }, `${plan} ${JSON.stringify(input)}`);
    }
    assert.deepEqual(await reports.exportReportCsv({ kind: "locations" }), { error: "MULTI_LOCATION_REQUIRED" });
    assert.equal(w.wheres.length, 0);
    assert.equal((await reports.getReportLocationOptions()).enabled, false);
  }
});

test("reports permissions: comparison needs reports.view + financial.view; mechanics are refused", async (t) => {
  const w = world(t);
  reportFakes(t, w);
  as("mech");
  await assert.rejects(() => reports.getReport({ kind: "locations" }), /reports\.view/);
  await assert.rejects(() => reports.getReport({ kind: "overview", location: "all" }), /reports\.view/);
  assert.equal(w.wheres.length, 0);
});

test("a location-only user sees only their own location in the filter and can't consolidate beyond it", async (t) => {
  const w = world(t);
  reportFakes(t, w);
  as("childOwner"); // B only
  const opts = await reports.getReportLocationOptions();
  assert.equal(opts.enabled, false, "a single accessible location offers no filter");
  const res = await reports.getReport({ kind: "locations" });
  assert.ok(!("error" in res));
  assert.ok(w.wheres.filter((x) => x.where.shopId).every((x) => JSON.stringify(x.where.shopId) === JSON.stringify({ in: ["B"] })));
  assert.deepEqual(await reports.getReport({ kind: "sales", location: "A" }), { error: "NO_LOCATION_ACCESS" });
});

test("CSV export of the comparison includes a total row and stays formula-safe", async (t) => {
  const w = world(t);
  reportFakes(t, w);
  as("owner");
  const res = await reports.exportReportCsv({ kind: "locations", preset: "thisMonth" });
  assert.ok(!("error" in res));
  assert.match(res.csv, /Location,Paid invoices,Revenue/);
  assert.match(res.csv, /Main,3,300/);
  assert.match(res.csv, /Total,4,400/);
});
