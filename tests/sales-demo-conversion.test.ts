/* eslint-disable @typescript-eslint/no-explicit-any -- deterministic Prisma/provider fixtures */
import { setSession } from "./helpers/action-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { patchDb, patchTransaction } from "./helpers/db-mock";
import { activationToken, activationHash, canLinkOwner, hasConversionEvidence, activationRequestSchema } from "../src/domain/sales-demo-conversion";
const { activateDemoOwner, activationDetails, claimDemoCheckout, expireSalesDemos } = await import("../src/lib/sales-demo-conversion");
const { finalizeSalesDemo } = await import("../src/lib/sales-demo-finalize");
const { sendSalesDemoActivation } = await import("../src/actions/sales-demo-conversion");
const { db } = await import("../src/lib/db");
const token = activationToken();
const demo = (over: any = {}) => ({ id: "demo-A", shopId: "shop-A", status: "ACTIVATION_SENT", ownerEmail: "owner@example.test", ownerName: "Owner", preferredLanguage: "FR",
  activationTokenHash: activationHash(token), activationExpiresAt: new Date(Date.now() + 86400_000), expiresAt: new Date(Date.now() + 86400_000), shop: { name: "Garage" }, ...over });

test("activation secrets have 256-bit entropy representation, hashes only; invalid token syntax fails closed", () => {
  const secrets = new Set(Array.from({ length: 1000 }, activationToken)); assert.equal(secrets.size, 1000);
  for (const s of secrets) { assert.match(s, /^[a-f0-9]{64}$/); assert.notEqual(activationHash(s), s); }
  for (const s of ["", "foo", "A".repeat(64), "0".repeat(63)]) assert.throws(() => activationHash(s), /ACTIVATION_INVALID/);
});
test("collision policy: only a new account or existing OWNER of the intended Shop; no role promotion/reassignment", () => {
  assert.equal(canLinkOwner(null, "A"), true);
  for (const role of ["OWNER", "VIEWER", "MECHANIC", "SUPER_ADMIN"]) {
    assert.equal(canLinkOwner({ role, shopId: "B" }, "A"), false);
    assert.equal(canLinkOwner({ role, shopId: "A" }, "A"), role === "OWNER");
  }
});
test("conversion evidence excludes redirects, unpaid/incomplete/past-due and UI state", () => {
  const s = { stripeSubscriptionId: "sub_x", stripeCustomerId: "cus_x", plan: "CORE", status: "TRIALING" };
  assert.ok(hasConversionEvidence(s)); assert.ok(hasConversionEvidence({ ...s, status: "ACTIVE" }));
  for (const status of ["AWAITING_PLAN", "PAST_DUE", "UNPAID", "INCOMPLETE", "CANCELED"]) assert.equal(hasConversionEvidence({ ...s, status }), false);
  for (const key of ["stripeCustomerId", "stripeSubscriptionId", "plan"]) assert.equal(hasConversionEvidence({ ...s, [key]: null }), false);
});
test("conversion request validates owner, plan/interval and explicit scenario retention", () => {
  const input = { ownerName: "Owner", ownerEmail: "OWNER@example.test", plan: "PRO", interval: "MONTHLY", retainScenario: "yes" };
  assert.equal(activationRequestSchema.parse(input).ownerEmail, "owner@example.test");
  for (const change of [{ ownerName: "" }, { plan: "FREE" }, { interval: "WEEKLY" }, { retainScenario: "no" }]) assert.equal(activationRequestSchema.safeParse({ ...input, ...change }).success, false);
});
test("invalid/expired/revoked/used/cross-Shop links query the complete persisted binding and never create an owner", async (t) => {
  const lookup = patchDb(t, "salesDemo", "findFirst", (async (q: any) => { assert.equal(q.where.id, "demo-B"); assert.equal(q.where.activationTokenHash, activationHash(token)); assert.equal(q.where.status, "ACTIVATION_SENT"); assert.ok(q.where.expiresAt.gt); assert.ok(q.where.activationExpiresAt.gt); return null; }) as never);
  await assert.rejects(activationDetails("demo-B", token), /ACTIVATION_INVALID/); assert.equal(lookup.mock.callCount(), 1);
});
test("new owner activation consumes token and establishes verified OWNER on SAME Shop; a lost CAS cannot create a user", async (t) => {
  setSession(null); patchDb(t, "salesDemo", "findFirst", async () => demo()); patchDb(t, "user", "findFirst", async () => null);
  let won = true; let created: any;
  const create = t.mock.fn(async ({ data }: any) => { created = data; return { id: "owner-A", ...data }; });
  const update = t.mock.fn(async (args: any) => { assert.ok(args.data); return {}; });
  patchTransaction(t, { salesDemo: { updateMany: async ({ where, data }: any) => { assert.equal(where.shopId, "shop-A"); assert.equal(where.ownerEmail, "owner@example.test"); assert.equal(data.activationTokenHash, null); assert.equal(data.status, "AWAITING_PAYMENT"); return { count: won ? 1 : 0 }; }, update }, user: { findFirst: async () => null, create } });
  const result = await activateDemoOwner("demo-A", token, "owner-password");
  assert.equal(result.email, "owner@example.test"); assert.equal(created.role, "OWNER"); assert.equal(created.shopId, "shop-A"); assert.ok(created.emailVerified); assert.notEqual(created.passwordHash, "owner-password");
  assert.equal(update.mock.calls[0].arguments[0].data.activatedOwnerId, "owner-A");
  won = false; await assert.rejects(activateDemoOwner("demo-A", token, "owner-password"), /ACTIVATION_INVALID/); assert.equal(create.mock.callCount(), 1);
});
test("Sales impersonation and SUPER_ADMIN cannot establish an owner's password", async (t) => {
  patchDb(t, "salesDemo", "findFirst", async () => demo()); patchDb(t, "user", "findFirst", async () => null);
  setSession({ user: { id: "sales", shopId: null, role: "SUPER_ADMIN" } }); await assert.rejects(activateDemoOwner("demo-A", token, "sales-password"), /ACTIVATION_INVALID/);
});
test("existing owner must authenticate as the correct account; activation never resets password", async (t) => {
  const user = { id: "owner-A", shopId: "shop-A", role: "OWNER", email: "owner@example.test", passwordHash: "unchanged" };
  patchDb(t, "salesDemo", "findFirst", async () => demo()); patchDb(t, "user", "findFirst", async () => user);
  const update = t.mock.fn(async ({ data }: any) => { assert.deepEqual(Object.keys(data), ["emailVerified"]); return user; });
  patchTransaction(t, { salesDemo: { updateMany: async () => ({ count: 1 }), update: async () => ({}) }, user: { findFirst: async () => user, update } });
  setSession(null); await assert.rejects(activateDemoOwner("demo-A", token, ""), /ACTIVATION_LOGIN_REQUIRED/);
  setSession({ user: { id: "owner-B", role: "OWNER", shopId: "shop-A" } }); await assert.rejects(activateDemoOwner("demo-A", token, ""), /ACTIVATION_LOGIN_REQUIRED/);
  setSession({ user: { id: "owner-A", role: "OWNER", shopId: "shop-A" } }); assert.equal((await activateDemoOwner("demo-A", token, "")).existing, true); assert.equal(update.mock.callCount(), 1);
});
test("Stripe finalization is terminal, idempotent and preserves all Shop data except onboarding completion", async () => {
  let current: any = demo({ status: "AWAITING_PAYMENT", activatedOwnerId: "owner-A" }); const changes: any[] = [];
  const tx: any = { salesDemo: { findUnique: async () => current, updateMany: async ({ data }: any) => { current = { ...current, ...data }; return { count: 1 }; } },
    user: { findUnique: async () => ({ id: "owner-A", role: "OWNER", shopId: "shop-A", email: "owner@example.test", emailVerified: new Date() }) },
    shop: { update: async (q: any) => { changes.push(q); } } };
  const s = { stripeSubscriptionId: "sub_paid", stripeCustomerId: "cus_paid", plan: "CORE", status: "TRIALING" };
  await finalizeSalesDemo(tx, "shop-A", { ...s, status: "INCOMPLETE" }); assert.equal(changes.length, 0);
  await finalizeSalesDemo(tx, "shop-A", s); await finalizeSalesDemo(tx, "shop-A", s);
  assert.equal(current.status, "CONVERTED"); assert.equal(changes.length, 1); assert.equal(changes[0].where.id, "shop-A"); assert.deepEqual(Object.keys(changes[0].data), ["onboardingCompletedAt"]);
});
test("checkout claim returns one stable persisted attempt and rejects a different owner", async (t) => {
  let current: any = demo({ status: "AWAITING_PAYMENT", activatedOwnerId: "owner-A", checkoutAttemptId: null }); let writes = 0;
  patchTransaction(t, { salesDemo: { updateMany: async ({ where }: any) => ({ count: where.activatedOwnerId === "owner-A" ? 1 : 0 }), findUniqueOrThrow: async () => current,
    update: async ({ data }: any) => { writes++; current = { ...current, ...data }; return current; } } });
  assert.equal((await claimDemoCheckout("demo-A", "owner-A")).checkoutAttemptId, (await claimDemoCheckout("demo-A", "owner-A")).checkoutAttemptId); assert.equal(writes, 1);
  await assert.rejects(claimDemoCheckout("demo-A", "owner-B"), /DEMO_BILLING_DISABLED/);
});
test("expiration never deletes Shop, CONVERTED or an activated owner's payment path", async (t) => {
  const update = patchDb(t, "salesDemo", "updateMany", (async (q: any) => { assert.deepEqual(q.where.status.in, ["PREPARING", "ACTIVE", "ACTIVATION_SENT"]); assert.equal(q.data.status, "EXPIRED"); assert.equal(q.data.activationTokenHash, null); return { count: 1 }; }) as never);
  await expireSalesDemos(); assert.equal(update.mock.callCount(), 1);
});
test("normal OWNER cannot send activation; impersonated Sales cannot target another Shop", async (t) => {
  setSession({ user: { id: "owner", role: "OWNER", shopId: "shop-A" } }); patchDb(t, "user", "findUnique", async () => ({ id: "owner", role: "OWNER" }));
  await assert.rejects(sendSalesDemoActivation("demo-A", new FormData()), /SALES_FORBIDDEN/);
  setSession({ user: { id: "sales", role: "OWNER", shopId: "shop-B" }, impersonation: { shopId: "shop-B", salesDemoId: "demo-B", shopName: "B", startedByName: "Sales", startedByUserId: "sales", expiresAt: Date.now() + 86400_000 } });
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" })); patchDb(t, "salesDemo", "findUnique", async () => demo());
  await assert.rejects(sendSalesDemoActivation("demo-A", new FormData()), /DEMO_UNAVAILABLE/);
});

test("activation email uses gated platform mail, EN/FR, controlled duplicates and resend revokes old hash", async (t) => {
  const previous = { key: process.env.RESEND_API_KEY, gate: process.env.PROVIDER_SIDE_EFFECTS, from: process.env.EMAIL_FROM_PLATFORM };
  process.env.RESEND_API_KEY = "re_local_fake"; process.env.PROVIDER_SIDE_EFFECTS = "enabled"; process.env.EMAIL_FROM_PLATFORM = "GarageOS <platform@example.test>";
  t.after(() => { process.env.RESEND_API_KEY = previous.key; process.env.PROVIDER_SIDE_EFFECTS = previous.gate; process.env.EMAIL_FROM_PLATFORM = previous.from; });
  let current: any = demo({ status: "ACTIVE", activationTokenHash: null, activationSentAt: null, shop: { name: "Garage très long", onboardingCompletedAt: new Date() }, activatedOwnerId: null });
  setSession({ user: { id: "sales", role: "SUPER_ADMIN", shopId: null } });
  patchDb(t, "user", "findUnique", (async ({ where }: any) => where.id ? { id: "sales", role: "SUPER_ADMIN" } : null) as never);
  patchDb(t, "user", "findFirst", async () => null);
  patchDb(t, "salesDemo", "findUnique", async () => current);
  const tx = { salesDemo: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => current, update: async ({ data }: any) => { current = { ...current, ...data }; return current; } } };
  patchTransaction(t, tx);
  let deliveryFails = false;
  patchDb(t, "salesDemo", "updateMany", (async ({ where, data }: any) => { assert.equal(where.activationTokenHash, current.activationTokenHash); current = { ...current, ...data }; return { count: 1 }; }) as never);
  const emails: any[] = [];
  const fetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, options: any) => { emails.push(JSON.parse(options.body)); return new Response(JSON.stringify(deliveryFails ? { name: "validation_error", message: "mock delivery failure" } : { id: "email-local" }), { status: deliveryFails ? 400 : 200, headers: { "content-type": "application/json" } }); }) as any;
  t.after(() => { globalThis.fetch = fetch; });
  const form = new FormData(); for (const [k, v] of Object.entries({ ownerName: "Owner", ownerEmail: "owner@example.test", plan: "PRO", interval: "MONTHLY", retainScenario: "yes" })) form.set(k, v);
  assert.ok((await sendSalesDemoActivation("demo-A", form)).success); const first = current.activationTokenHash;
  assert.equal(emails.length, 1); assert.equal(emails[0].subject, "Votre GarageOS est prêt"); assert.match(emails[0].html, /Activer mon compte/); assert.equal(emails[0].from, "GarageOS <platform@example.test>");
  assert.ok((await sendSalesDemoActivation("demo-A", form)).success); assert.equal((await sendSalesDemoActivation("demo-A", form, true)).error, "cooldown"); assert.equal(emails.length, 1); assert.equal(current.activationTokenHash, first);
  current.activationSentAt = new Date(Date.now() - 61_000); current.preferredLanguage = "EN";
  assert.ok((await sendSalesDemoActivation("demo-A", form, true)).success); assert.equal(emails.length, 2); assert.notEqual(current.activationTokenHash, first); assert.equal(emails[1].subject, "Your GarageOS is ready");
  assert.match(emails[1].html, /Activate my GarageOS account/); assert.match(emails[1].html, /#token=[a-f0-9]{64}/); assert.doesNotMatch(emails[1].html, /[?&](?:amp;)?token=/); assert.equal(current.status, "ACTIVATION_SENT");
  current.activationSentAt = new Date(Date.now() - 61_000); deliveryFails = true;
  assert.equal((await sendSalesDemoActivation("demo-A", form, true)).error, "delivery"); assert.equal(current.status, "ACTIVE"); assert.equal(current.activationTokenHash, null); assert.equal(current.activationSentAt, null);
});

test.after(async () => { await db.$disconnect(); });
