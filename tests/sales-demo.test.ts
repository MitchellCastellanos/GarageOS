/* eslint-disable @typescript-eslint/no-explicit-any -- inspect mocked Prisma transactions */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { setSession, RedirectError } from "./helpers/action-harness";
import { patchDb, patchTransaction } from "./helpers/db-mock";
import { isDemoAvailable, isDemoSession, prospectSchema } from "../src/domain/sales-demo";
import { normalizeDemoAsset } from "../src/lib/sales-demo-assets";
import { CHATGPT_LOGO_PROMPT, salesDemoCopy } from "../src/lib/admin-locale/sales-demo";
import { db } from "../src/lib/db";
const sales = await import("../src/actions/sales-demo");
const { requireSalesActor } = await import("../src/lib/sales-demo");
const { getEffectiveSubscription, can, canView, requireWriteAccess } = await import("../src/lib/subscription");
const { completeOnboarding } = await import("../src/actions/onboarding");
const billing = await import("../src/actions/billing");
const platform = await import("../src/actions/platform");
const future = new Date(Date.now() + 86400_000);
function demo(over: Record<string, unknown> = {}) {
  return { id: "demo-A", shopId: "shop-A", status: "ACTIVE", currentPlan: "PRO" as const, expiresAt: future, shop: { id: "shop-A", name: "Garage A", onboardingCompletedAt: null }, ...over };
}
function session(over: Record<string, unknown> = {}) {
  return { user: { id: "sales", role: "OWNER", shopId: "shop-A" }, impersonation: {
    salesDemoId: "demo-A", shopId: "shop-A", shopName: "Garage A", startedByUserId: "sales", startedByName: "Sales", expiresAt: future.getTime(), ...over,
  } };
}
const pending = { plan: null, status: "AWAITING_PLAN", stripeCustomerId: null, stripeSubscriptionId: null, billingInterval: null, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

test("domain: closed lifecycle, exact relationships, actor id and expiration", () => {
  assert.ok(isDemoAvailable(demo()));
  for (const status of ["EXPIRED", "CONVERTED"]) assert.equal(isDemoAvailable(demo({ status })), false);
  assert.equal(isDemoAvailable(demo({ expiresAt: new Date(0) })), false);
  assert.ok(isDemoSession(session(), demo()));
  for (const invalid of [{ salesDemoId: "other" }, { shopId: "other" }, { startedByUserId: "owner" }, { expiresAt: 0 }]) assert.equal(isDemoSession(session(invalid), demo()), false);
  assert.equal(isDemoSession(null, demo()), false);
  assert.equal(prospectSchema.safeParse({ name: " ", preferredLanguage: "FR" }).success, false);
  assert.equal(prospectSchema.safeParse({ name: "Garage", email: "invalid" }).success, false);
});

test("Sales boundary rejects every tenant role and missing/removed accounts, despite spoofed platform claims", async (t) => {
  for (const role of ["OWNER", "MECHANIC", "VIEWER", null]) {
    setSession({ user: { id: "owner", role: "SUPER_ADMIN", shopId: "shop-A" } });
    patchDb(t, "user", "findUnique", async () => role ? { id: "owner", role } : null);
    await assert.rejects(requireSalesActor(), /SALES_FORBIDDEN/);
    await assert.rejects(sales.createProspectDemo(new FormData()), /SALES_FORBIDDEN/);
  }
  setSession(null);
  await assert.rejects(requireSalesActor(), /SALES_FORBIDDEN/);
});

test("central entitlements: Core → Pro → Complete exercise actual gates without commercial state", async (t) => {
  setSession(session());
  let tier = "CORE";
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "shop", "findUnique", async () => ({ organizationId: null, subscription: pending, salesDemo: demo({ currentPlan: tier }) }));
  for (const plan of ["CORE", "PRO", "COMPLETE"]) {
    tier = plan;
    const sub = await getEffectiveSubscription("shop-A");
    assert.equal(sub.plan, plan); assert.equal(sub.accessState, "SALES_DEMO"); assert.equal(sub.status, "SALES_DEMO");
    assert.equal(sub.hasStripeSubscription, false); assert.equal(sub.isTrialing, false); assert.equal(sub.trialEligible, false);
    assert.equal(sub.stripeCustomerId, null); assert.equal(sub.subscribedPlan, null); assert.equal(sub.nextCharge, null);
    assert.ok((await requireWriteAccess("shop-A")).canWrite);
    assert.equal(await can("shop-A", "inventory.manage"), plan !== "CORE");
    assert.equal(await canView("shop-A", "dvi.photos"), plan !== "CORE");
    assert.equal(await can("shop-A", "organization.multiLocation"), plan === "COMPLETE");
  }
});

test("demo overrides cannot reach owners, other shops, expired/open sessions, converted shops or jobs", async (t) => {
  let d = demo();
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "shop", "findUnique", async () => ({ organizationId: null, subscription: pending, salesDemo: d }));
  for (const s of [null, { user: { id: "owner", role: "OWNER", shopId: "shop-A" } }, session({ shopId: "shop-B" }), session({ expiresAt: 0 })]) {
    setSession(s); assert.equal((await getEffectiveSubscription("shop-A")).canWrite, false);
  }
  setSession(session());
  for (const over of [{ expiresAt: new Date(0) }, { status: "CONVERTED" }, { status: "EXPIRED" }]) {
    d = demo(over); assert.equal((await getEffectiveSubscription("shop-A")).plan, null);
  }
  d = demo();
  patchDb(t, "user", "findUnique", async () => ({ role: "OWNER" }));
  assert.equal((await getEffectiveSubscription("shop-A")).canWrite, false);
});

test("converted demo falls back to the commercial subscription, never its former tier", async (t) => {
  setSession(session());
  patchDb(t, "shop", "findUnique", async () => ({ organizationId: null, salesDemo: demo({ status: "CONVERTED", currentPlan: "COMPLETE" }), subscription: { ...pending, status: "ACTIVE", plan: "CORE", stripeSubscriptionId: "sub_real" } }));
  const sub = await getEffectiveSubscription("shop-A");
  assert.equal(sub.plan, "CORE"); assert.equal(sub.salesDemoId, undefined); assert.equal(sub.hasStripeSubscription, true);
});

test("normal completeOnboarding still rejects pending shops AND demo entitlements", async (t) => {
  setSession(session());
  let d: ReturnType<typeof demo> | null = demo();
  patchDb(t, "user", "findUnique", async () => ({ role: "SUPER_ADMIN" }));
  patchDb(t, "shop", "findUnique", async () => ({ organizationId: null, subscription: pending, salesDemo: d }));
  const update = patchDb(t, "shop", "update", async () => ({}));
  assert.deepEqual(await completeOnboarding(), { error: "PLAN_REQUIRED" });
  d = null;
  assert.deepEqual(await completeOnboarding(), { error: "PLAN_REQUIRED" });
  assert.equal(update.mock.callCount(), 0);
});

test("tier and completion actions reject OWNER, altered demo id, altered shop and stale expiration", async (t) => {
  patchDb(t, "salesDemo", "findUnique", async () => demo());
  const update = patchDb(t, "salesDemo", "updateMany", async () => ({ count: 1 }));
  patchDb(t, "user", "findUnique", async () => ({ role: "OWNER" }));
  setSession(session());
  await assert.rejects(sales.setSalesDemoPlan("demo-A", "COMPLETE"), /SALES_FORBIDDEN/);
  await assert.rejects(sales.completeSalesDemoOnboarding("demo-A"), /SALES_FORBIDDEN/);
  patchDb(t, "user", "findUnique", async () => ({ role: "SUPER_ADMIN" }));
  for (const claims of [{ salesDemoId: "other" }, { shopId: "shop-B" }, { expiresAt: 0 }]) {
    setSession(session(claims));
    await assert.rejects(sales.setSalesDemoPlan("demo-A", "COMPLETE"), /DEMO_UNAVAILABLE/);
  }
  assert.equal(update.mock.callCount(), 0);
});

test("tier update only touches SalesDemo; invalid plan and lifecycle race fail closed", async (t) => {
  setSession(session());
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "salesDemo", "findUnique", async () => demo());
  const mutation = patchDb(t, "subscription", "update", async () => { throw new Error("commercial mutation"); });
  let count = 1;
  const update = patchDb(t, "salesDemo", "updateMany", async () => ({ count }));
  assert.deepEqual(await sales.setSalesDemoPlan("demo-A", "free"), { error: "invalid" });
  assert.equal(update.mock.callCount(), 0);
  assert.deepEqual(await sales.setSalesDemoPlan("demo-A", "CORE"), { success: true });
  const args = update.mock.calls[0].arguments[0] as any;
  assert.deepEqual(args.data, { currentPlan: "CORE" }); assert.equal(args.where.shopId, "shop-A");
  assert.ok(args.where.expiresAt.gt instanceof Date);
  count = 0;
  await assert.rejects(sales.setSalesDemoPlan("demo-A", "PRO"), /DEMO_UNAVAILABLE/);
  assert.equal(mutation.mock.callCount(), 0);
});

test("explicit demo completion locks lifecycle and updates only the bound real Shop", async (t) => {
  setSession(session());
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "salesDemo", "findUnique", async () => demo());
  const updates: any[] = [];
  let count = 1;
  patchTransaction(t, {
    salesDemo: { updateMany: async (a: any) => { assert.equal(a.where.id, "demo-A"); assert.equal(a.where.status, "ACTIVE"); return { count }; } },
    shop: { update: async (a: any) => updates.push(a) },
  });
  assert.deepEqual(await sales.completeSalesDemoOnboarding("demo-A"), { success: true });
  assert.equal(updates[0].where.id, "shop-A"); assert.ok(updates[0].data.onboardingCompletedAt instanceof Date);
  count = 0;
  await assert.rejects(sales.completeSalesDemoOnboarding("demo-A"), /DEMO_UNAVAILABLE/);
  assert.equal(updates.length, 1);
});

test("creation atomically provisions pending subscription and prospect, without a login/account", async (t) => {
  setSession({ user: { id: "sales", role: "SUPER_ADMIN", shopId: null } });
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "shopSmsNumber", "findFirst", async () => null);
  patchDb(t, "user", "findFirst", async () => null);
  const created: any[] = [];
  patchTransaction(t, {
    shop: { create: async (a: any) => { created.push(a); return { id: "shop-A", name: a.data.name }; } },
    subscription: { create: async (a: any) => created.push(a) },
    salesDemo: { create: async (a: any) => { created.push(a); return { id: "demo-A", shop: { id: "shop-A", name: "Garage" } }; } },
  });
  const form = new FormData(); form.set("name", " Garage "); form.set("contactEmail", "prospect@example.test");
  assert.deepEqual(await sales.createProspectDemo(form), { demoId: "demo-A" });
  assert.equal(created[0].data.name, "Garage"); assert.ok(created[0].data.communicationsSuspendedAt instanceof Date);
  assert.deepEqual(created[1].data, { shopId: "shop-A", plan: null, status: "AWAITING_PLAN" });
  assert.equal(created[2].data.createdByUserId, "sales"); assert.equal(created[2].data.shopId, "shop-A");
});

test("resume rejects targeting another demo during impersonation and navigates only to trusted routes", async (t) => {
  setSession(session({ salesDemoId: "other" }));
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "salesDemo", "findUnique", async () => demo());
  patchDb(t, "salesDemo", "updateMany", async () => ({ count: 1 }));
  await assert.rejects(sales.startSalesDemo("demo-A"), /DEMO_UNAVAILABLE/);
  setSession({ user: { id: "sales", role: "SUPER_ADMIN", shopId: null } });
  await assert.rejects(sales.startSalesDemo("demo-A"), (e: unknown) => e instanceof RedirectError && e.url === "/admin/onboarding");
});

test("all commercial billing actions refuse unresolved demos before contacting Stripe", async (t) => {
  setSession(session());
  patchDb(t, "shop", "findUnique", async () => ({ salesDemo: { status: "ACTIVE" } }));
  for (const action of [() => billing.startCheckoutAction(new FormData()), () => billing.confirmCheckoutAction("cs_forged"),
    () => billing.openBillingPortalAction(), () => billing.cancelSubscriptionAction(), () => billing.resumeSubscriptionAction()]) {
    await assert.rejects(action(), /DEMO_BILLING_DISABLED/);
  }
});

test("uploads reject unauthorized actors/relationships before accessing storage", async (t) => {
  setSession(session());
  patchDb(t, "user", "findUnique", async () => ({ role: "OWNER" }));
  await assert.rejects(sales.uploadSalesDemoAsset("demo-A", new FormData()), /SALES_FORBIDDEN/);
  patchDb(t, "user", "findUnique", async () => ({ role: "SUPER_ADMIN" }));
  patchDb(t, "salesDemo", "findUnique", async () => demo({ shopId: "other" }));
  await assert.rejects(sales.uploadSalesDemoAsset("demo-A", new FormData()), /DEMO_UNAVAILABLE/);
});

test("platform commercial plan/contact/cancel controls cannot turn a demo into a paid shop", async (t) => {
  setSession({ user: { id: "sales", role: "SUPER_ADMIN", shopId: null } });
  patchDb(t, "shop", "findUnique", async () => ({ subscription: pending, salesDemo: demo() }));
  const mutation = patchDb(t, "subscription", "update", async () => { throw new Error("commercial mutation"); });
  assert.deepEqual(await platform.changeShopPlan("shop-A", "COMPLETE", "A sufficiently detailed reason"), { error: "DEMO_BILLING_DISABLED" });
  assert.deepEqual(await platform.updateBillingContact("shop-A", "billing@example.test"), { error: "DEMO_BILLING_DISABLED" });
  assert.deepEqual(await platform.cancelShopSubscription("shop-A", "A sufficiently detailed reason"), { error: "DEMO_BILLING_DISABLED" });
  assert.equal(mutation.mock.callCount(), 0);
});

test("image bytes: transparent PNG, bounded WebP, EXIF orientation and forged types", async () => {
  const png = await sharp({ create: { width: 2200, height: 1000, channels: 4, background: { r: 40, g: 80, b: 160, alpha: 0 } } }).png().toBuffer();
  const file = new File([new Uint8Array(png)], "logo.png", { type: "image/png" });
  const logo = await normalizeDemoAsset(file, "logo"); const lm = await sharp(logo).metadata();
  assert.equal(lm.format, "png"); assert.equal(lm.width, 2000); assert.equal(lm.hasAlpha, true); assert.equal(lm.exif, undefined);
  const photo = await normalizeDemoAsset(file, "cover"); const pm = await sharp(photo).metadata();
  assert.equal(pm.format, "webp"); assert.equal(pm.width, 1920);
  const jpeg = await sharp({ create: { width: 300, height: 100, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const oriented = await sharp(await normalizeDemoAsset(new File([new Uint8Array(jpeg)], "camera.jpg", { type: "image/jpeg" }), "shop")).metadata();
  assert.equal(oriented.width, 100); assert.equal(oriented.height, 300); assert.equal(oriented.exif, undefined);
  await assert.rejects(normalizeDemoAsset(new File(["<svg></svg>"], "fake.png", { type: "image/png" }), "logo"));
  await assert.rejects(normalizeDemoAsset(new File([new Uint8Array(png)], "logo.svg", { type: "image/svg+xml" }), "logo"));
  await assert.rejects(normalizeDemoAsset(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), "logo"));
});

test("copy-only helper and EN/FR copy remain available without AI dependencies", () => {
  assert.match(CHATGPT_LOGO_PROMPT, /Preserve the logo's original design exactly/);
  assert.match(CHATGPT_LOGO_PROMPT, /Return only the prepared logo image/);
  assert.ok(salesDemoCopy("fr").original && salesDemoCopy("en").instructions);
});

test.after(async () => { setSession(null); await db.$disconnect(); });
