// Block 15 — roles, plan entitlements and restricted state, enforced by the REAL server actions against a
// REAL PostgreSQL database (server-side only: no UI involved). Each case runs the write with a valid payload
// and observes the database: forbidden => the shop's data is byte-identical; allowed => a row appears.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { ENABLED, db, seedTenant, snapshotShop, diffSnapshots, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "run `npm run test:integration` (see docs/integration-testing.md)";

let CORE: Tenant, PRO: Tenant, COMPLETE: Tenant, LAPSED: Tenant, PASTDUE: Tenant;
type Actor = "owner" | "mechanic" | "viewer";
const as = (t: Tenant, actor: Actor) =>
  setSession({ user: { id: actor === "owner" ? t.ownerId : actor === "mechanic" ? t.mechanicId : t.viewerId, role: actor.toUpperCase(), shopId: t.shopId } });
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const attempt = async (fn: () => Promise<unknown>) => {
  try {
    return await fn();
  } catch (e) {
    return e;
  }
};

before(async () => {
  if (!ENABLED) return;
  CORE = await seedTenant({ label: "Core", plan: "CORE" });
  PRO = await seedTenant({ label: "Pro", plan: "PRO" });
  COMPLETE = await seedTenant({ label: "Complete", plan: "COMPLETE" });
  LAPSED = await seedTenant({ label: "Lapsed", plan: "PRO", status: "CANCELED" });
  PASTDUE = await seedTenant({ label: "PastDue", plan: "PRO", status: "PAST_DUE" });
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

const line = { description: "Ok", quantity: 1, unitPrice: 10, itemType: "LABOUR" as const };

function writes(t: Tenant, acts: Record<string, Record<string, (...a: never[]) => unknown>>) {
  const a = acts as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  const invoiceForm = { clientId: t.clientId, vehicles: [{ vehicleId: t.vehicleId, lineItems: [line] }], taxRate: 0.14975, language: "EN", notes: "" };
  return {
    createClient: () => a.clients.createClient({ firstName: "New", lastName: "One", phone: "5145550123", email: "", language: "EN", notifyChannel: "AUTO", address: "", notes: "" }),
    updateClient: () => a.clients.updateClient(t.clientId, { firstName: "Chg", lastName: "", phone: "5145550124", email: "", language: "EN", notifyChannel: "AUTO", address: "", notes: "" }),
    deleteClient: () => a.clients.deleteClient(t.clientId),
    createVehicle: () => a.vehicles.createVehicle(t.clientId, { make: "M", model: "X", year: 2020, licensePlate: "NEW1", vin: "", color: "", mileageUnit: "KM" }),
    createAppointment: () => a.appts.createAppointment({ clientId: t.clientId, vehicleId: t.vehicleId, title: "n", date: "2030-02-01", time: "09:00", durationMinutes: 60, notes: "" }),
    cancelAppointment: () => a.appts.cancelAppointment(t.appointmentId),
    createWorkOrder: () => a.wo.createWorkOrder({ clientId: t.clientId, vehicleId: t.vehicleId, concern: "c", lineItems: [line] }),
    updateWorkOrderStatus: () => a.wo.updateWorkOrderStatus(t.workOrderId, "CANCELLED"),
    createQuote: () => a.quotes.createQuote(invoiceForm),
    createInvoice: () => a.inv.createInvoice(invoiceForm),
    markInvoiceAsPaid: () => a.inv.markInvoiceAsPaid(t.invoiceId, fd({ paymentMode: "CASH", entries: JSON.stringify([{ method: "CASH", amount: 114.98 }]) })),
    cancelInvoice: () => a.inv.cancelInvoice(t.invoiceId),
    createInspection: () => a.insp.createInspection({ clientId: t.clientId, vehicleId: t.vehicleId }),
    createReminder: () => a.rem.createReminder({ vehicleId: t.vehicleId, serviceType: "n" }),
    createCashEntry: () => a.cash.createCashDrawerEntry({ type: "CASH_IN", amount: 5, description: "n", occurredAt: new Date().toISOString() }),
    createInventoryPart: () => a.stock.createInventoryPart({ name: "New part", unitPrice: 5, quantityOnHand: 3 }),
    createTireSet: () => a.tire.createTireSet({ clientId: t.clientId, vehicleId: t.vehicleId, season: "WINTER", size: "225/45R17", quantity: 4, condition: "GOOD", withRims: false, notifyCustomer: false }),
    createCampaign: () => a.camp.createCampaignAction(fd({ name: "n", subject: "s", body: "b", segment: JSON.stringify({ kind: "ALL" }) })),
    createInspectionTemplate: () => a.tpl.createInspectionTemplate({ name: "Tpl", items: ["A", "B"] }),
    createReminderRule: () => a.rules.createReminderRule({ name: "Oil", keyword: "oil", intervalMonths: 6 }),
    createLocation: () => a.loc.createShopLocation({ name: "Second" } as never),
    updateShopSettings: () => a.settings.updateShopTaxLines(fd({ taxLines: JSON.stringify([{ name: "GST", rate: 0.05 }]) })),
    createTeamMember: () => a.users.createTeamMember(fd({ name: "New Mech", email: `m${Date.now()}${Math.random().toString(36).slice(2)}@ex.test`, password: "Password123!", role: "MECHANIC" })),
    setPermissions: () => a.users.setTeamMemberPermissions(t.mechanicId, { grants: ["financial.view"], denies: [] }),
    refund: () => a.inv.refundInvoice(t.paidInvoiceId, { amount: "10.00", method: "CASH", reason: "test" }),
  } as Record<string, () => Promise<unknown>>;
}

async function load() {
  return {
    clients: await import("../../src/actions/clients"),
    vehicles: await import("../../src/actions/vehicles"),
    appts: await import("../../src/actions/appointments"),
    wo: await import("../../src/actions/work-orders"),
    quotes: await import("../../src/actions/quotes"),
    inv: await import("../../src/actions/invoices"),
    insp: await import("../../src/actions/inspections"),
    rem: await import("../../src/actions/reminders"),
    cash: await import("../../src/actions/cash-drawer"),
    stock: await import("../../src/actions/inventory"),
    tire: await import("../../src/actions/tire-storage"),
    camp: await import("../../src/actions/campaigns"),
    tpl: await import("../../src/actions/inspection-templates"),
    rules: await import("../../src/actions/reminder-rules"),
    loc: await import("../../src/actions/locations"),
    settings: await import("../../src/actions/settings"),
    users: await import("../../src/actions/users"),
    reports: await import("../../src/actions/reports"),
    acct: await import("../../src/actions/accounting"),
  };
}

/** Runs every named write; returns those that CHANGED the shop's data. */
async function whichWritesLand(t: Tenant, actor: Actor, names: string[], acts: Awaited<ReturnType<typeof load>>) {
  const w = writes(t, acts as never);
  const landed: string[] = [];
  for (const n of names) {
    as(t, actor);
    const before = await snapshotShop(t.shopId);
    await attempt(w[n]);
    if (diffSnapshots(before, await snapshotShop(t.shopId)).length) landed.push(n);
  }
  return landed;
}

const ALL_WRITES = [
  "createClient", "updateClient", "createVehicle", "createAppointment", "cancelAppointment", "createWorkOrder", "updateWorkOrderStatus", "createQuote",
  "createInvoice", "markInvoiceAsPaid", "cancelInvoice", "createInspection", "createReminder", "createCashEntry", "createInventoryPart", "createTireSet",
  "createCampaign", "createInspectionTemplate", "createReminderRule", "createLocation", "updateShopSettings", "createTeamMember", "setPermissions", "refund",
];

test("VIEWER: no server-side write of any kind lands (Complete plan, so plan gates are not the reason)", { skip }, async () => {
  const acts = await load();
  const landed = await whichWritesLand(COMPLETE, "viewer", [...ALL_WRITES, "deleteClient"], acts);
  assert.deepEqual(landed, []);
});

test("MECHANIC: operates the job flow, but no refunds, settings, team, campaigns or money tools", { skip }, async () => {
  const acts = await load();
  const forbidden = ["refund", "updateShopSettings", "createTeamMember", "setPermissions", "createLocation", "createCampaign", "createCashEntry", "createReminderRule"];
  assert.deepEqual(await whichWritesLand(COMPLETE, "mechanic", forbidden, acts), [], "forbidden for a mechanic");
  const allowed = ["markInvoiceAsPaid", "createClient", "createVehicle", "createAppointment", "createWorkOrder", "createQuote", "createInvoice", "createInspection", "createReminder", "createInventoryPart", "createTireSet"];
  const landed = await whichWritesLand(COMPLETE, "mechanic", allowed, acts);
  assert.deepEqual(landed.sort(), [...allowed].sort(), "the operational chain works for a mechanic");
});

test("MECHANIC / VIEWER cannot read financial reports, accounting or the cash drawer (server-side)", { skip }, async () => {
  const acts = await load();
  for (const actor of ["mechanic", "viewer"] as const) {
    as(COMPLETE, actor);
    const sales = await attempt(() => acts.reports.getReport({ kind: "sales", preset: "last30" }));
    assert.ok(!(sales as { data?: unknown }).data, `${actor}: no sales data`);
    const ov = (await attempt(() => acts.reports.getReport({ kind: "overview", preset: "thisMonth" }))) as { data?: { revenue?: unknown; paidRevenue?: unknown } } | Error;
    if (!(ov instanceof Error) && (ov as { data?: unknown }).data) {
      // Overview may be returned to report viewers, but without money for those lacking financial.view.
      assert.equal(JSON.stringify(ov).includes(COMPLETE.marker), false);
    }
    const acc = await attempt(() => acts.acct.getAccountingSummaryAction({ preset: "last30" } as never));
    assert.ok(!(acc as { summary?: unknown }).summary, `${actor}: no accounting summary`);
    const drawer = await attempt(() => acts.cash.getCashDrawerEntries());
    assert.ok(drawer instanceof Error || !(drawer as { entries?: unknown[] }).entries?.length, `${actor}: no cash drawer`);
  }
  as(COMPLETE, "owner");
  const own = (await acts.acct.getAccountingSummaryAction({ preset: "last30" } as never)) as { summary?: unknown; error?: string };
  assert.ok(own.summary || own.error === undefined, "owner control: accounting is reachable");
});

test("CORE plan: every Pro/Complete capability is refused server-side even when called directly", { skip }, async () => {
  const acts = await load();
  const proOnly = ["createInventoryPart", "createTireSet", "createCampaign", "createInspectionTemplate", "createReminderRule", "createLocation", "setPermissions"];
  assert.deepEqual(await whichWritesLand(CORE, "owner", proOnly, acts), []);
  as(CORE, "owner");
  const sales = (await acts.reports.getReport({ kind: "sales", preset: "last30" })) as { error?: string; data?: unknown };
  assert.equal(sales.error, "UPGRADE_REQUIRED");
  const acc = (await acts.acct.getAccountingSummaryAction({ preset: "last30" } as never)) as { error?: string };
  assert.equal(acc.error, "UPGRADE_REQUIRED");
  // Core keeps the core workflow
  const core = ["createClient", "createAppointment", "createWorkOrder", "createInvoice", "createInspection", "createReminder"];
  assert.deepEqual((await whichWritesLand(CORE, "owner", core, acts)).sort(), [...core].sort());
});

test("PRO plan: Pro capabilities work, Complete-only (Multi-Shop) is refused", { skip }, async () => {
  const acts = await load();
  const pro = ["createInventoryPart", "createTireSet", "createCampaign", "createInspectionTemplate", "createReminderRule", "setPermissions"];
  assert.deepEqual((await whichWritesLand(PRO, "owner", pro, acts)).sort(), [...pro].sort());
  assert.deepEqual(await whichWritesLand(PRO, "owner", ["createLocation"], acts), [], "Multi-Shop is Complete only");
  as(PRO, "owner");
  assert.ok(((await acts.reports.getReport({ kind: "sales", preset: "last30" })) as { data?: unknown }).data, "Pro gets advanced reports");
  const multi = (await acts.reports.getReport({ kind: "sales", preset: "last30", location: "all" })) as { error?: string };
  assert.equal(multi.error, "MULTI_LOCATION_REQUIRED");
});

test("COMPLETE plan: Multi-Shop location creation works for the organization owner", { skip }, async () => {
  const acts = await load();
  const before = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "garageos"."Shop" WHERE "organizationId" IS NOT NULL`))[0].n);
  as(COMPLETE, "owner");
  await attempt(() => acts.loc.createShopLocation({ name: "Second Location", address: "1 Main", phone: "5145550000", email: "loc@ex.test" } as never));
  const after = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "garageos"."Shop" WHERE "organizationId" IS NOT NULL`))[0].n);
  assert.ok(after > before, "Complete can add a location");
});

test("RESTRICTED (canceled) shop: authentication and reads work, every operational write is refused", { skip }, async () => {
  const acts = await load();
  // Owner-level configuration (shop settings incl. tax lines) is deliberately NOT gated by Block 1 so a lapsed
  // owner can still fix their profile; it changes no operational data and only affects future documents.
  const landed = await whichWritesLand(LAPSED, "owner", ALL_WRITES.filter((n) => n !== "updateShopSettings"), acts);
  assert.deepEqual(landed, [], "a lapsed subscription writes nothing operational");
  as(LAPSED, "owner");
  const client = await attempt(() => acts.clients.getClientById(LAPSED.clientId));
  assert.ok(client && !(client instanceof Error), "existing data is still readable");
});

test("PAST_DUE keeps access during Stripe retries (grace)", { skip }, async () => {
  const acts = await load();
  const landed = await whichWritesLand(PASTDUE, "owner", ["createClient", "createInvoice", "createTireSet"], acts);
  assert.equal(landed.length, 3);
});

test("a shop whose Subscription row is missing is a recovery state, never free service", { skip }, async () => {
  const acts = await load();
  const ghost = await seedTenant({ label: "Ghost", plan: "PRO" });
  await db.subscription.delete({ where: { shopId: ghost.shopId } });
  assert.deepEqual(await whichWritesLand(ghost, "owner", ["createClient", "createInvoice", "createAppointment"], acts), []);
});

test("a downgraded shop (Pro -> Core) loses paid writes immediately but keeps its data", { skip }, async () => {
  const acts = await load();
  const t = await seedTenant({ label: "Down", plan: "PRO" });
  assert.equal((await whichWritesLand(t, "owner", ["createInventoryPart"], acts)).length, 1);
  await db.subscription.update({ where: { shopId: t.shopId }, data: { plan: "CORE" } });
  assert.deepEqual(await whichWritesLand(t, "owner", ["createInventoryPart", "createTireSet"], acts), []);
  assert.ok(await db.inventoryPart.count({ where: { shopId: t.shopId } }), "existing inventory rows are kept");
});

test("controls: the owner-only payloads are valid (so the mechanic/viewer refusals are authorization refusals)", { skip }, async () => {
  const acts = await load();
  const owner = ["createCashEntry", "createTeamMember", "updateShopSettings", "refund"];
  assert.deepEqual((await whichWritesLand(COMPLETE, "owner", owner, acts)).sort(), [...owner].sort());
});
