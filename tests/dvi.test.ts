import assert from "node:assert/strict";
import test from "node:test";
import { setSession, NotFoundError, RedirectError } from "./helpers/action-harness";
import { allowOwnership, mockSubscription, patchDb } from "./helpers/db-mock";

const insp = await import("../src/actions/inspections");
const tpl = await import("../src/actions/inspection-templates");
const report = (await import("../src/app/(site)/inspection/[token]/page")).default;

const owner = () => setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
const base = { clientId: "c1", vehicleId: "v1", workOrderId: "", mechanicId: "", mileage: null };

function common(t: import("node:test").TestContext) {
  patchDb(t, "user", "findUnique", (async () => ({ preferredLocale: "EN" })) as never);
}

test("Core keeps the standard DVI: default checklist, no template allowed", async (t) => {
  owner();
  allowOwnership(t);
  common(t);
  mockSubscription(t, "CORE");
  const create = patchDb(t, "inspection", "create", async () => ({ id: "i1" }));
  const findTemplate = patchDb(t, "inspectionTemplate", "findFirst", async () => ({ items: ["X"] }));

  await assert.rejects(insp.createInspection(base), (e) => e instanceof RedirectError && e.url.endsWith("/inspections/i1"));
  const items = (create.mock.calls[0].arguments as unknown as [{ data: { items: { create: { category: string }[] } } }])[0].data.items.create;
  assert.equal(items.length, 10);
  assert.equal(items[0].category, "TIRES");

  const res = await insp.createInspection({ ...base, templateId: "t1" });
  assert.match(res.error?.templateId?.[0] ?? "", /PRO/);
  assert.equal(findTemplate.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 1, "no inspection created with a template on Core");
});

test("Pro: template replaces the checklist; templates of other shops are not usable", async (t) => {
  owner();
  allowOwnership(t);
  common(t);
  mockSubscription(t, "PRO");
  const create = patchDb(t, "inspection", "create", async () => ({ id: "i2" }));
  const find = patchDb(t, "inspectionTemplate", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) =>
    where.id === "t1" && where.shopId === "shop-A" ? { items: ["Winter tires", "Battery load test"] } : null) as never);

  await assert.rejects(insp.createInspection({ ...base, templateId: "t1" }), RedirectError);
  const items = (create.mock.calls[0].arguments as unknown as [{ data: { items: { create: { category: string; sortOrder: number }[] } } }])[0].data.items.create;
  assert.deepEqual(items.map((i) => [i.category, i.sortOrder]), [["Winter tires", 0], ["Battery load test", 1]]);

  const foreign = await insp.createInspection({ ...base, templateId: "t-of-shop-B" });
  assert.ok(foreign.error?.templateId);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(find.mock.callCount(), 2);
});

test("photos: Core is refused server-side, Pro passes the entitlement gate", async (t) => {
  owner();
  common(t);
  const sub = mockSubscription(t, "CORE");
  patchDb(t, "inspectionItem", "findFirst", async () => ({ id: "it1", inspectionId: "i1" }));
  const photoCreate = patchDb(t, "inspectionPhoto", "create", async () => ({ id: "p1" }));
  const fd = () => {
    const f = new FormData();
    f.set("file", new File(["x"], "a.jpg", { type: "image/jpeg" }));
    return f;
  };

  const denied = await insp.uploadInspectionPhoto("it1", fd());
  assert.match(String(denied.error), /PRO/);
  assert.equal(photoCreate.mock.callCount(), 0);

  sub.mock.mockImplementation((async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  const passed = await insp.uploadInspectionPhoto("it1", fd());
  assert.doesNotMatch(String(passed.error ?? ""), /PRO/, "Pro is past the gate (storage isn't configured in tests, so it fails later)");
});

test("capabilities reflect the plan; restricted Pro keeps view of photos but cannot use advanced features", async (t) => {
  owner();
  const sub = mockSubscription(t, "CORE");
  assert.deepEqual(await insp.getInspectionCapabilities(), { photosView: false, photos: false, templates: false, report: false });
  sub.mock.mockImplementation((async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "UNPAID", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  assert.deepEqual(await insp.getInspectionCapabilities(), { photosView: true, photos: false, templates: false, report: false });
});

test("templates: Core cannot create; Pro creates de-duplicated items; list is empty for Core", async (t) => {
  owner();
  common(t);
  const sub = mockSubscription(t, "CORE");
  const create = patchDb(t, "inspectionTemplate", "create", async () => ({}));
  const list = patchDb(t, "inspectionTemplate", "findMany", async () => []);
  patchDb(t, "inspectionTemplate", "deleteMany", async () => ({ count: 0 }));

  assert.match(String((await tpl.createInspectionTemplate({ name: "Winter", items: ["Tires"] })).error), /PRO/);
  assert.deepEqual(await tpl.getInspectionTemplates(), []);
  assert.equal(list.mock.callCount(), 0);

  sub.mock.mockImplementation((async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  assert.deepEqual(await tpl.createInspectionTemplate({ name: "Winter", items: ["Tires", "tires", "Battery"] }), { success: true });
  assert.deepEqual((create.mock.calls[0].arguments as unknown as [{ data: unknown }])[0].data, { shopId: "shop-A", name: "Winter", items: ["Tires", "Battery"] });
  assert.ok((await tpl.createInspectionTemplate({ name: "", items: [] })).error);
});

test("customer report link: Pro-only to create, token reused, unshare is shop-scoped", async (t) => {
  owner();
  common(t);
  const sub = mockSubscription(t, "CORE");
  const updateMany = patchDb(t, "inspection", "updateMany", async () => ({ count: 1 }));
  let stored: string | null = null;
  patchDb(t, "inspection", "findFirst", async () => ({ id: "i1", shareToken: stored }));

  assert.match(String((await insp.shareInspectionReport("i1")).error), /PRO/);
  assert.equal(updateMany.mock.callCount(), 0);

  sub.mock.mockImplementation((async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "PRO", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  const first = await insp.shareInspectionReport("i1");
  assert.ok(first.path?.startsWith("/inspection/") && first.path.length > 30);
  const data = (updateMany.mock.calls[0].arguments as unknown as [{ where: unknown; data: { shareToken: string } }])[0];
  assert.deepEqual(data.where, { id: "i1", shopId: "shop-A", shareToken: null });
  stored = data.data.shareToken;
  const again = await insp.shareInspectionReport("i1");
  assert.equal(again.path, `/inspection/${stored}`);
  assert.equal(updateMany.mock.callCount(), 1, "existing token is reused");

  await insp.unshareInspectionReport("i1");
  assert.deepEqual((updateMany.mock.calls[1].arguments as unknown as [{ where: unknown }])[0].where, { id: "i1", shopId: "shop-A" });
});

test("public report: unknown token → 404; Core/lapsed shop → 404; Pro shop renders", async (t) => {
  const sub = mockSubscription(t, "PRO");
  const row = {
    shop: { id: "shop-A", name: "Garage Roy" },
    client: { firstName: "Ann", lastName: "Lee", language: "EN" },
    vehicle: { year: 2018, make: "Ford", model: "F150", licensePlate: "ABC123" },
    createdAt: new Date(),
    items: [{ id: "a", category: "BRAKES", condition: "SERVICE_REQUIRED", notes: "Pads at 2mm", photos: [] }],
  };
  let found: unknown = null;
  patchDb(t, "inspection", "findUnique", async () => found);
  const params = (token: string) => ({ params: Promise.resolve({ token }) });

  await assert.rejects(report(params("short")), NotFoundError);
  await assert.rejects(report(params("a".repeat(32))), NotFoundError);
  found = row;
  const el = await report(params("a".repeat(32)));
  assert.ok(el);

  sub.mock.mockImplementation((async () => ({ organizationId: null, subscription: { id: "s", shopId: "shop-A", plan: "CORE", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 1e9), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  await assert.rejects(report(params("a".repeat(32))), NotFoundError);
});
