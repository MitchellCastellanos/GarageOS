import assert from "node:assert/strict";
import test from "node:test";
import { setSession, RedirectError } from "./helpers/action-harness";
import { patchDb, mockSubscription } from "./helpers/db-mock";
import {
  DELEGABLE_PERMISSIONS,
  PERMISSIONS,
  defaultPermissions,
  resolvePermissions,
  sanitizeOverrides,
} from "../src/domain/permissions";

const { PermissionDeniedError, requirePagePermission } = await import("../src/lib/access");
const clients = await import("../src/actions/clients");
const invoices = await import("../src/actions/invoices");
const campaigns = await import("../src/actions/campaigns");
const settings = await import("../src/actions/settings");
const users = await import("../src/actions/users");
const tires = await import("../src/actions/tire-storage");
const exportRoute = await import("../src/app/api/invoices/export/route");

const as = (role: string, shopId = "shop-A") => setSession({ user: { id: `u-${role}`, role, shopId } });

function planRow(plan: "CORE" | "PRO", status = "ACTIVE") {
  return (async () => ({
    organizationId: null,
    subscription: { id: "s", shopId: "shop-A", plan, status, billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null },
  })) as never;
}

const denied = (permission: string) => (e: unknown) => e instanceof PermissionDeniedError && e.permission === permission;

test("role defaults: owner everything; mechanic operates but no finance/config; viewer read-only", () => {
  assert.equal(defaultPermissions("OWNER").size, PERMISSIONS.length);
  const m = defaultPermissions("MECHANIC");
  for (const p of ["ops.write", "customers.write", "invoices.write", "payments.write", "inventory.write", "dvi.write"] as const) assert.ok(m.has(p), p);
  for (const p of ["financial.view", "reports.view", "campaigns.manage", "import.run", "settings.manage"] as const) assert.ok(!m.has(p), p);
  const v = defaultPermissions("VIEWER");
  assert.deepEqual([...v].sort(), ["customers.view", "invoices.view"]);
  assert.equal(resolvePermissions("HACKER", null, true).size, 0, "unknown roles get nothing");
});

test("overrides: only with advanced plan, only delegable, deny beats grant, owner untouchable", () => {
  const o = { grants: ["financial.view", "settings.manage", "nonsense"], denies: ["payments.write"] };
  const pro = resolvePermissions("MECHANIC", o, true);
  assert.ok(pro.has("financial.view") && !pro.has("payments.write") && !pro.has("settings.manage"));
  const core = resolvePermissions("MECHANIC", o, false);
  assert.ok(!core.has("financial.view") && core.has("payments.write"), "Core ignores overrides");
  assert.ok(resolvePermissions("OWNER", { grants: [], denies: ["ops.write", "financial.view"] }, true).has("financial.view"));
  assert.ok(resolvePermissions("MECHANIC", { grants: ["reports.view"], denies: ["reports.view"] }, true).has("reports.view") === false);
  assert.ok(!(DELEGABLE_PERMISSIONS as readonly string[]).includes("settings.manage"));
  // sanitize: sin residuos (concede lo que ya tiene = nada; revoca lo que no tiene = nada)
  assert.deepEqual(sanitizeOverrides({ grants: ["payments.write", "reports.view", "settings.manage"], denies: ["payments.write", "financial.view"] }, "MECHANIC"), { grants: ["reports.view"], denies: ["payments.write"] });
});

test("VIEWER can't write anything server-side (baseline ops.write), but keeps read access", async (t) => {
  as("VIEWER");
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  mockSubscription(t, "PRO");
  const create = patchDb(t, "client", "create", async () => ({ id: "c1" }));
  const tireCreate = patchDb(t, "tireStorageSet", "create", async () => ({}));
  await assert.rejects(clients.createClient({ firstName: "A", phone: "5145550100", language: "EN", notifyChannel: "AUTO" } as never), denied("ops.write"));
  await assert.rejects(tires.createTireSet({} as never), denied("ops.write"));
  assert.equal(create.mock.callCount() + tireCreate.mock.callCount(), 0);

  patchDb(t, "client", "findMany", async () => []);
  assert.deepEqual(await clients.getClients(), [], "viewer still lists customers");
});

test("MECHANIC: works customers/invoices, blocked from finance, campaigns and shop configuration", async (t) => {
  as("MECHANIC");
  const user = patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  const sub = mockSubscription(t, "CORE");
  patchDb(t, "client", "findMany", async () => []);
  patchDb(t, "invoice", "findMany", async () => []);
  patchDb(t, "campaign", "findMany", async () => []);

  assert.deepEqual(await clients.getClients(), []);
  assert.deepEqual(await invoices.getInvoices(), []);
  await assert.rejects(campaigns.listCampaigns(), denied("campaigns.manage"));
  await assert.rejects(settings.updateShopTaxLines(new FormData()), denied("settings.manage"));
  await assert.rejects(settings.updateShopSlug(new FormData()), denied("settings.manage"));
  await assert.rejects(settings.updateShopSettings(new FormData()), denied("settings.manage"));

  // Core: los overrides guardados no cuentan aunque existan (p. ej. tras bajar de plan).
  user.mock.mockImplementation((async () => ({ permissionGrants: ["campaigns.manage"], permissionDenies: ["invoices.view"] })) as never);
  await assert.rejects(campaigns.listCampaigns(), denied("campaigns.manage"));
  assert.deepEqual(await invoices.getInvoices(), []);

  // Pro: sí cuentan — pero settings.manage nunca es delegable.
  sub.mock.mockImplementation(planRow("PRO"));
  assert.deepEqual(await campaigns.listCampaigns(), []);
  await assert.rejects(invoices.getInvoices(), denied("invoices.view"));
  user.mock.mockImplementation((async () => ({ permissionGrants: ["settings.manage"], permissionDenies: [] })) as never);
  await assert.rejects(settings.updateShopTaxLines(new FormData()), denied("settings.manage"));
});

test("payments need payments.write: Pro can revoke it from a mechanic; owner keeps it", async (t) => {
  as("MECHANIC");
  const user = patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: ["payments.write"] })) as never);
  mockSubscription(t, "PRO");
  await assert.rejects(invoices.markInvoiceAsPaid("inv1", new FormData()), denied("payments.write"));
  await assert.rejects(invoices.revertInvoiceToPending("inv1"), denied("payments.write"));
  user.mock.mockImplementation((async () => ({ permissionGrants: [], permissionDenies: ["invoices.write"] })) as never);
  await assert.rejects(invoices.createInvoice({} as never), denied("invoices.write"));
});

test("financial API export and pages are permission-gated", async (t) => {
  as("MECHANIC");
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  mockSubscription(t, "PRO");
  const res = await exportRoute.GET(new Request("https://x.test/api/invoices/export?from=2026-01-01&to=2026-01-31") as never);
  assert.equal(res.status, 403);
  await assert.rejects(requirePagePermission("financial.view"), (e) => e instanceof RedirectError && e.url === "/admin/dashboard");
  await assert.doesNotReject(requirePagePermission("customers.view"));
});

test("team permissions: owner-only, Pro+, tenant-scoped, never on owners, sanitized", async (t) => {
  const sub = mockSubscription(t, "CORE");
  const target = { id: "m1", role: "MECHANIC" };
  const find = patchDb(t, "user", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) => (where.shopId === "shop-A" && where.id === "m1" ? target : where.shopId === "shop-A" && where.id === "o1" ? { id: "o1", role: "OWNER" } : null)) as never);
  const update = patchDb(t, "user", "updateMany", async () => ({ count: 1 }));

  as("MECHANIC");
  await assert.rejects(users.setTeamMemberPermissions("m1", { grants: ["financial.view"], denies: [] }), /owner/i);

  as("OWNER");
  assert.match(String((await users.setTeamMemberPermissions("m1", { grants: ["financial.view"], denies: [] })).error), /PRO/);
  assert.equal(update.mock.callCount(), 0);

  sub.mock.mockImplementation(planRow("PRO"));
  assert.deepEqual(await users.setTeamMemberPermissions("m1", { grants: ["financial.view", "settings.manage", "ops.write"], denies: ["payments.write", "bogus"] }), { success: true });
  assert.deepEqual((update.mock.calls[0].arguments as unknown as [{ where: unknown; data: unknown }])[0], {
    where: { id: "m1", shopId: "shop-A" },
    data: { permissionGrants: ["financial.view"], permissionDenies: ["payments.write"] },
  });
  assert.deepEqual(await users.setTeamMemberPermissions("o1", { grants: [], denies: ["ops.write"] }), { error: "Owner permissions can't be restricted" });
  assert.deepEqual(await users.setTeamMemberPermissions("other-shop-user", { grants: [], denies: [] }), { error: "User not found" });
  assert.deepEqual((find.mock.calls.at(-1)!.arguments as unknown as [{ where: unknown }])[0].where, { id: "other-shop-user", shopId: "shop-A" });
  assert.equal(update.mock.callCount(), 1);
});
