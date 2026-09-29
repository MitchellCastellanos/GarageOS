import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession, RedirectError } from "./helpers/action-harness";
import { mockSubscription, patchDb, patchTransaction } from "./helpers/db-mock";
import { canCheckIn, canCheckOut, canMove, normalizeLocation, normalizeTireSize } from "../src/domain/tire-storage";
import type { TireStorageFormData } from "../src/lib/validations";

const actions = await import("../src/actions/tire-storage");

const FORM: TireStorageFormData = {
  clientId: "c1",
  vehicleId: "v1",
  season: "WINTER",
  brand: "Nokian",
  model: "",
  size: "225 45 r17",
  quantity: 4,
  condition: "GOOD",
  withRims: false,
  storageLocation: "rack a-3",
  notes: "",
};

interface Row { id: string; shopId: string; status: string; storageLocation: string | null; [k: string]: unknown }

/** Almacén en memoria de juegos + eventos, con las consultas que usan las actions. */
function fakeStore(t: TestContext, seed: Row[] = []) {
  const rows = [...seed];
  const events: Record<string, unknown>[] = [];
  const created: Row[] = [];
  const tx = {
    tireStorageSet: {
      create: async ({ data }: { data: Row }) => {
        const r = { ...data, id: `set${rows.length + 1}` } as Row;
        rows.push(r);
        created.push(r);
        return r;
      },
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => (Object.keys(where) as (keyof Row)[]).every((k) => r[k] === where[k]));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      findFirst: async ({ where }: { where: Partial<Row> }) => rows.find((r) => (Object.keys(where) as (keyof Row)[]).every((k) => r[k] === where[k])) ?? null,
    },
    tireStorageEvent: { create: async ({ data }: { data: Record<string, unknown> }) => void events.push(data) },
  };
  patchTransaction(t, tx);
  patchDb(t, "tireStorageSet", "updateMany", tx.tireStorageSet.updateMany as never);
  patchDb(t, "client", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) => (where.id === "c1" && where.shopId === "shop-A" ? { id: "c1" } : null)) as never);
  patchDb(t, "vehicle", "findFirst", (async ({ where }: { where: { id: string; clientId: string; client: { shopId: string } } }) =>
    where.id === "v1" && where.clientId === "c1" && where.client.shopId === "shop-A" ? { id: "v1" } : null) as never);
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
  return { rows, events, created };
}

const asStaff = (shopId = "shop-A") => setSession({ user: { id: "u1", role: "OWNER", shopId } });

test("size normalisation and state rules", () => {
  assert.equal(normalizeTireSize("225 45 r17"), "225/45R17");
  assert.equal(normalizeTireSize("225/45/17"), "225/45R17");
  assert.equal(normalizeTireSize("p225/60r16 97h"), "P225/60R16");
  assert.equal(normalizeTireSize("LT265/70R17"), "LT265/70R17");
  assert.equal(normalizeTireSize("31x10.5r15"), "31X10.5R15");
  assert.equal(normalizeTireSize("winter tires"), null);
  assert.equal(normalizeLocation("  rack  a-3 "), "RACK A-3");
  assert.equal(normalizeLocation("  "), null);
  assert.deepEqual([canCheckOut("STORED"), canCheckOut("CHECKED_OUT"), canCheckIn("CHECKED_OUT"), canCheckIn("STORED"), canMove("CHECKED_OUT")], [true, false, true, false, false]);
});

test("Pro shop checks tires in: normalised size/location, CHECK_IN event, redirect to the set", async (t) => {
  asStaff();
  mockSubscription(t, "PRO");
  const store = fakeStore(t);
  await assert.rejects(actions.createTireSet(FORM), (e) => e instanceof RedirectError && e.url.endsWith("/tire-storage/set1"));
  assert.equal(store.created[0].shopId, "shop-A");
  assert.equal(store.created[0].size, "225/45R17");
  assert.equal(store.created[0].storageLocation, "RACK A-3");
  assert.equal(store.created[0].status, "STORED");
  assert.deepEqual(store.events.map((e) => [e.type, e.location, e.setId]), [["CHECK_IN", "RACK A-3", "set1"]]);
});

test("Core shop is refused server-side (Pro+ feature); restricted shops cannot write at all", async (t) => {
  asStaff();
  const sub = mockSubscription(t, "CORE");
  const store = fakeStore(t);
  const res = await actions.createTireSet(FORM);
  assert.match(res.error?._form?.[0] ?? "", /PRO/);
  assert.equal(store.created.length, 0);

  sub.mock.mockImplementation(async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "UNPAID", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } }) as never);
  await assert.rejects(actions.createTireSet(FORM), (e) => e instanceof RedirectError && e.url.includes("restricted=1"));
  assert.equal(store.created.length, 0);
});

test("validation: bad size, foreign client and mismatched vehicle are rejected", async (t) => {
  asStaff();
  mockSubscription(t, "PRO");
  const store = fakeStore(t);
  assert.deepEqual((await actions.createTireSet({ ...FORM, size: "big" })).error, { size: ["INVALID_SIZE"] });
  assert.deepEqual((await actions.createTireSet({ ...FORM, clientId: "other-shop-client" })).error, { _form: ["CLIENT_NOT_FOUND"] });
  assert.deepEqual((await actions.createTireSet({ ...FORM, vehicleId: "v-of-someone-else" })).error, { _form: ["VEHICLE_MISMATCH"] });
  assert.equal(store.created.length, 0);
});

test("check-out → re-check-in → move: state machine, history, and no double check-out", async (t) => {
  asStaff();
  mockSubscription(t, "PRO");
  const store = fakeStore(t, [{ id: "s1", shopId: "shop-A", status: "STORED", storageLocation: "RACK A-3" }]);

  assert.deepEqual(await actions.checkOutTireSet("s1", "picked up by owner"), { ok: true });
  assert.equal(store.rows[0].status, "CHECKED_OUT");
  assert.ok(store.rows[0].checkedOutAt instanceof Date);
  assert.deepEqual(await actions.checkOutTireSet("s1"), { ok: false, error: "INVALID_STATE" }, "second check-out is refused");
  assert.deepEqual(await actions.moveTireSet("s1", "B-1"), { ok: false, error: "INVALID_STATE" }, "can't move tires that are out");

  assert.deepEqual(await actions.checkInTireSet("s1", "shelf 9"), { ok: true });
  assert.equal(store.rows[0].status, "STORED");
  assert.equal(store.rows[0].storageLocation, "SHELF 9");
  assert.equal(store.rows[0].checkedOutAt, null);
  assert.deepEqual(await actions.checkInTireSet("s1"), { ok: false, error: "INVALID_STATE" });

  assert.deepEqual(await actions.moveTireSet("s1", "c-2"), { ok: true });
  assert.equal(store.rows[0].storageLocation, "C-2");
  assert.deepEqual(store.events.map((e) => e.type), ["CHECK_OUT", "CHECK_IN", "MOVED"]);
  assert.equal(store.events[0].note, "picked up by owner");
});

test("tenant isolation: another shop's tire set cannot be checked out or moved", async (t) => {
  asStaff("shop-A");
  mockSubscription(t, "PRO");
  const store = fakeStore(t, [{ id: "sB", shopId: "shop-B", status: "STORED", storageLocation: "X1" }]);
  assert.deepEqual(await actions.checkOutTireSet("sB"), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await actions.moveTireSet("sB", "Y"), { ok: false, error: "NOT_FOUND" });
  assert.equal(store.rows[0].status, "STORED");
  assert.equal(store.events.length, 0);
});

test("reads: locked (empty) for Core, scoped to the shop for Pro", async (t) => {
  asStaff();
  const sub = mockSubscription(t, "CORE");
  const find = patchDb(t, "tireStorageSet", "findMany", async () => []);
  assert.deepEqual(await actions.getTireStorageSets({}), []);
  assert.equal(find.mock.callCount(), 0, "Core never touches the table");
  assert.equal(await actions.getTireSetsForClient("c1"), null);

  sub.mock.mockImplementation(async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } }) as never);
  await actions.getTireStorageSets({ q: "ford", status: "STORED", season: "WINTER" });
  const where = (find.mock.calls[0].arguments as unknown as [{ where: { shopId: string; status: string; season: string } }])[0].where;
  assert.deepEqual([where.shopId, where.status, where.season], ["shop-A", "STORED", "WINTER"]);
});
