/* eslint-disable @typescript-eslint/no-explicit-any -- inspect isolated Prisma/provider mocks */
import "./helpers/fake-providers-authorized";
import { setSession } from "./helpers/action-harness";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import https from "node:https";
import http from "node:http";
import RequestClient from "twilio/lib/base/RequestClient";
import { patchDb, patchTransaction } from "./helpers/db-mock";
import { db } from "../src/lib/db";
const actions = await import("../src/actions/sales-demo-experience");
const { recordAndSend } = await import("../src/lib/communications/outbox");
const { settleSmsOverage, retryPendingSmsOverage, getSmsSegmentsUsed } = await import("../src/lib/communications/sms-usage");
const { withCommunicationOrigin } = await import("../src/lib/communications/demo-origin");
const { getStripeClient, reportSmsOverageUsage } = await import("../src/lib/stripe");
const { sendSms } = await import("../src/lib/sms");
const { sendQuoteEmail } = await import("../src/lib/email");
const { getShopBySlug } = await import("../src/lib/booking-slots");
const { can } = await import("../src/lib/subscription");
const { resolveEffectiveDesign } = await import("../src/lib/booking-page");
const { handleSmsStatusCallback, reconcileStaleSmsStatuses } = await import("../src/lib/communications/sms-status");
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_SMS_OVERAGE_METER_EVENT_NAME = "sms_overage";
process.env.TWILIO_ACCOUNT_SID = "ACparent";
process.env.TWILIO_AUTH_TOKEN = "fake";
process.env.TWILIO_FROM_NUMBER = "+15145550000";
const originalHttps = https.request, originalHttp = http.request;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Fetch forbidden in Wave 2 deterministic tests"); };
https.request = (() => { throw new Error("Network forbidden in Wave 2 deterministic tests"); }) as typeof https.request;
http.request = (() => { throw new Error("Network forbidden in Wave 2 deterministic tests"); }) as typeof http.request;
const demo = (over: Record<string, unknown> = {}) => ({ id: "demo-A", shopId: "shop-A", status: "ACTIVE", currentPlan: "PRO", communicationsEnabled: true,
  preferredLanguage: "FR", scenarioBatchId: null, expiresAt: new Date(Date.now() + 86400_000), shop: { name: "Garage", taxId: "Tax ID", taxLines: [] }, ...over });
const session = () => ({ user: { id: "sales", role: "OWNER", shopId: "shop-A" }, impersonation: { salesDemoId: "demo-A", shopId: "shop-A", shopName: "Garage", startedByUserId: "sales", startedByName: "Sales", expiresAt: Date.now() + 3600_000 } });
const commercial = { organizationId: null, subscription: { plan: "PRO", status: "ACTIVE", stripeCustomerId: "cus_paid", stripeSubscriptionId: "sub_paid", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false } };
function authorize(t: TestContext, d = demo()) {
  setSession(session());
  patchDb(t, "user", "findUnique", async () => ({ id: "sales", role: "SUPER_ADMIN" }));
  patchDb(t, "salesDemo", "findUnique", async () => d);
}
function outbox(t: TestContext, d: any = demo()) {
  authorize(t, d);
  patchDb(t, "shop", "findUnique", async () => ({ ...commercial, salesDemo: d, communicationsSuspendedAt: null, smsMonthlyAllowanceOverride: 0 }));
  patchDb(t, "communicationRoute", "findUnique", async () => null);
  patchDb(t, "communicationMessage", "count", async () => 0);
  patchDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: 50 } }));
  patchDb(t, "communicationMessage", "update", async () => ({}));
}
const params = (send: () => Promise<any>, channel: "SMS" | "EMAIL" = "SMS") => ({ shopId: "shop-A", purpose: "QUOTE", channel, provider: channel === "SMS" ? "twilio" : "resend",
  from: "sender", to: ["recipient@example.test"], billedOverageSegments: 9, send });

test("live Sales sends SMS/email through the same outbox, persist origin and zero billed overage", async (t) => {
  outbox(t);
  const created: any[] = [];
  patchDb(t, "communicationMessage", "create", (async (a: any) => { created.push(a.data); return { id: "message", ...a.data }; }) as never);
  const provider = t.mock.fn(async () => ({ providerMessageId: "fake", segments: 3 }));
  for (const channel of ["SMS", "EMAIL"] as const) {
    const result = await recordAndSend(params(provider, channel));
    assert.equal(result.salesDemoOriginId, "demo-A");
  }
  assert.equal(provider.mock.callCount(), 2);
  for (const row of created) { assert.equal(row.salesDemoOriginId, "demo-A"); assert.equal(row.billedOverageSegments, 0); }
});
test("demo sends fail closed for OWNER, expired/disabled demo, wrong Shop, no session and global provider gate", async (t) => {
  outbox(t);
  const provider = t.mock.fn(async () => ({}));
  setSession({ user: { id: "owner", role: "OWNER", shopId: "shop-A" } });
  await assert.rejects(recordAndSend(params(provider)), /DEMO_COMMUNICATION_FORBIDDEN/);
  setSession(null);
  await assert.rejects(recordAndSend(params(provider)), /DEMO_COMMUNICATION_FORBIDDEN/);
  setSession(session());
  for (const d of [demo({ expiresAt: new Date(0) }), demo({ communicationsEnabled: false }), demo({ shopId: "other" }), demo({ status: "EXPIRED" })]) {
    patchDb(t, "shop", "findUnique", async () => ({ salesDemo: d }));
    await assert.rejects(recordAndSend(params(provider)), /DEMO_COMMUNICATION_FORBIDDEN/);
  }
  const old = process.env.PROVIDER_SIDE_EFFECTS; process.env.PROVIDER_SIDE_EFFECTS = "disabled";
  try { await assert.rejects(recordAndSend(params(provider)), /external provider actions are disabled/); } finally { process.env.PROVIDER_SIDE_EFFECTS = old; }
  assert.equal(provider.mock.callCount(), 0);
});
test("demo history write failure cannot produce an untracked send", async (t) => {
  outbox(t);
  patchDb(t, "communicationMessage", "create", async () => { throw new Error("history down"); });
  const provider = t.mock.fn(async () => ({}));
  await assert.rejects(recordAndSend(params(provider)), /history down/);
  assert.equal(provider.mock.callCount(), 0);
});
test("expiration between reserving the demo message and provider dispatch fails closed", async (t) => {
  outbox(t);
  patchDb(t, "communicationMessage", "create", async () => ({ id: "message", salesDemoOriginId: "demo-A" }));
  patchDb(t, "salesDemo", "findUnique", async () => demo({ expiresAt: new Date(0) }));
  const provider = t.mock.fn(async () => ({}));
  await assert.rejects(recordAndSend(params(provider)), /DEMO_COMMUNICATION_FORBIDDEN/);
  assert.equal(provider.mock.callCount(), 0);
});
test("real quote email uses normal localized renderer, sender route, Resend SDK and outbox with demo provenance", async (t) => {
  outbox(t);
  process.env.RESEND_API_KEY = "re_fake_local_only";
  patchDb(t, "communicationRoute", "findUnique", async () => ({ senderIdentity: { id: "sender", shopId: "shop-A", channel: "EMAIL", status: "ACTIVE", address: "sender@example.test", replyTo: "reply@example.test" } }));
  patchDb(t, "communicationMessage", "findUnique", async () => null);
  const rows: any[] = [];
  patchDb(t, "communicationMessage", "create", (async (a: any) => { rows.push(a.data); return { id: "email", ...a.data }; }) as never);
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "re_fake" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await sendQuoteEmail({ shop: { id: "shop-A", name: "Garage" }, to: "prospect@example.test", clientName: "Prospect", shopName: "Garage", quoteNumber: "DEMO-1",
    totalFormatted: "$120.00", vehicleDescription: "Toyota Corolla", language: "FR", pdfBuffer: Buffer.from("fake PDF"), pdfFilename: "quote.pdf", quoteId: "quote-A", sendAttempt: 1 });
  assert.equal(requests.length, 1); assert.match(requests[0].subject, /Devis/);
  assert.equal(requests[0].reply_to, "reply@example.test"); assert.match(requests[0].html, /Garage/);
  assert.equal(rows[0].salesDemoOriginId, "demo-A"); assert.equal(rows[0].idempotencyKey, "quote-email:quote-A:1");
});
test("converted retry preserves original provenance and conditional lease prevents duplicate sends", async (t) => {
  outbox(t, demo({ status: "CONVERTED" }));
  patchDb(t, "communicationMessage", "findUnique", async () => ({ id: "message", shopId: "shop-A", salesDemoOriginId: "demo-A", status: "FAILED", sendAttemptedAt: null, createdAt: new Date(0) }));
  const updates: any[] = []; let claimed = false;
  patchDb(t, "communicationMessage", "updateMany", (async (a: any) => { updates.push(a); if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; }) as never);
  const provider = t.mock.fn(async () => ({ providerMessageId: "fake" }));
  const result = await Promise.all([1, 2].map(() => recordAndSend({ ...params(provider), idempotencyKey: "same" })));
  assert.equal(provider.mock.callCount(), 1); assert.equal(result.filter((r) => r.deduped).length, 1);
  assert.equal(updates[0].data.salesDemoOriginId, "demo-A"); assert.equal(updates[0].data.billedOverageSegments, 0);
});
test("cross-shop idempotency key cannot dedupe or overwrite a foreign communication", async (t) => {
  outbox(t);
  patchDb(t, "communicationMessage", "findUnique", async () => ({ id: "foreign", shopId: "other", status: "SENT" }));
  const provider = t.mock.fn(async () => ({}));
  await assert.rejects(recordAndSend({ ...params(provider), idempotencyKey: "foreign" }), /TENANT_MISMATCH/);
  assert.equal(provider.mock.callCount(), 0);
});
test("demo origin survives delayed fallback after conversion via internal persisted-message context", async (t) => {
  outbox(t, demo({ status: "CONVERTED" }));
  const create = patchDb(t, "communicationMessage", "create", (async (a: any) => ({ id: "fallback", ...a.data })) as never);
  await withCommunicationOrigin("demo-A", () => recordAndSend(params(async () => ({ providerMessageId: "fake" }))));
  assert.equal((create.mock.calls[0].arguments[0] as any).data.salesDemoOriginId, "demo-A");
});
test("settlement/retry/lowest Stripe boundary never meter a demo message, even after conversion", async (t) => {
  const row = { id: "message", shopId: "shop-A", salesDemoOriginId: "demo-A", channel: "SMS", direction: "OUTBOUND", billedOverageSegments: 999, providerMessageId: "fake", createdAt: new Date() };
  patchDb(t, "communicationMessage", "findUnique", async () => row);
  patchDb(t, "shop", "findUnique", async () => commercial);
  const find = patchDb(t, "communicationMessage", "findMany", async () => [{ id: "message" }]);
  const meter = t.mock.method(getStripeClient().billing.meterEvents, "create", async () => ({} as never));
  assert.equal(await settleSmsOverage("message"), "not_applicable");
  assert.equal(await reportSmsOverageUsage({ messageId: "message", stripeCustomerId: "cus_paid", segments: 999 }), false);
  assert.equal((await retryPendingSmsOverage()).reported, 0);
  assert.equal((find.mock.calls[0].arguments[0] as any).where.salesDemoOriginId, null);
  assert.equal(meter.mock.callCount(), 0);
});
test("commercial SMS still meters original segment count and stable identifier", async (t) => {
  patchDb(t, "communicationMessage", "findUnique", async () => ({ id: "paid", shopId: "shop-A", salesDemoOriginId: null, channel: "SMS", direction: "OUTBOUND",
    billedOverageSegments: 3, providerMessageId: "SMfake", createdAt: new Date() }));
  patchDb(t, "shop", "findUnique", async () => commercial);
  patchDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  const meter = t.mock.method(getStripeClient().billing.meterEvents, "create", async () => ({} as never));
  assert.equal(await settleSmsOverage("paid"), "reported");
  const event = meter.mock.calls[0].arguments[0] as any;
  assert.equal(event.identifier, "sms-overage:paid"); assert.equal(event.payload.value, "3");
});
test("provider callbacks and stale reconciliation update delivery only; demo SMS remains non-meterable", async (t) => {
  let row: any = { id: "message", shopId: "shop-A", from: process.env.TWILIO_FROM_NUMBER, to: ["+15145550123"], status: "SENT",
    salesDemoOriginId: "demo-A", providerMessageId: "SMfake", billedOverageSegments: 77, channel: "SMS", direction: "OUTBOUND", createdAt: new Date(Date.now() - 3600_000) };
  patchDb(t, "communicationMessage", "findFirst", async () => row);
  patchDb(t, "communicationMessage", "findUnique", async () => row);
  patchDb(t, "communicationMessage", "findMany", async () => [row]);
  patchDb(t, "communicationMessage", "updateMany", (async (a: any) => { assert.equal(a.data.salesDemoOriginId, undefined); row = { ...row, ...a.data }; return { count: 1 }; }) as never);
  const meter = t.mock.method(getStripeClient().billing.meterEvents, "create", async () => ({} as never));
  assert.equal(await handleSmsStatusCallback({ messageSid: "SMfake", accountSid: "ACparent", status: "delivered" }), "updated");
  assert.equal(row.salesDemoOriginId, "demo-A"); assert.equal(await settleSmsOverage("message"), "not_applicable");
  row.status = "SENT";
  assert.equal((await reconcileStaleSmsStatuses(new Date(), { fetchMessage: async () => ({ status: "delivered", accountSid: "ACparent" }) })).updated, 1);
  assert.equal(await settleSmsOverage("message"), "not_applicable"); assert.equal(meter.mock.callCount(), 0);
});
test("demo usage does not consume a later commercial allowance", async (t) => {
  const aggregate = patchDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: 7 } }));
  patchDb(t, "communicationMessage", "count", async () => 0);
  assert.equal(await getSmsSegmentsUsed("shop-A"), 7);
  assert.equal((aggregate.mock.calls[0].arguments[0] as any).where.salesDemoOriginId, null);
});
test("real sendSms retains STOP and real segment correction while demo never calls Stripe", async (t) => {
  outbox(t);
  patchDb(t, "shopSmsNumber", "findUnique", async () => null);
  patchDb(t, "communicationSuppression", "findUnique", async () => ({ id: "stop" }));
  await assert.rejects(sendSms({ shopId: "shop-A", purpose: "QUOTE", to: "+15145550123", body: "hello" }), /opted out/);
  patchDb(t, "communicationSuppression", "findUnique", async () => null);
  patchDb(t, "communicationMessage", "create", (async (a: any) => ({ id: "message", ...a.data })) as never);
  const provider = t.mock.method(RequestClient.prototype, "request", async () => ({ statusCode: 200, body: JSON.stringify({ sid: "SMfake", num_segments: "5" }), headers: {} }));
  const meter = t.mock.method(getStripeClient().billing.meterEvents, "create", async () => ({} as never));
  const update = patchDb(t, "communicationMessage", "update", async () => ({}));
  assert.equal((await sendSms({ shopId: "shop-A", purpose: "QUOTE", to: "+15145550123", body: "hello" })).segments, 5);
  assert.equal(provider.mock.callCount(), 1); assert.equal(meter.mock.callCount(), 0);
  assert.equal((update.mock.calls[1].arguments[0] as any).data.billedOverageSegments, 0);
});
test("all Wave 2 actions require live Sales session, reject OWNER/cross-shop/expired", async (t) => {
  authorize(t);
  for (const state of [null, { user: { id: "owner", role: "OWNER", shopId: "shop-A" } }, { ...session(), impersonation: { ...session().impersonation, shopId: "other" } }]) {
    setSession(state);
    for (const call of [() => actions.loadSalesDemoScenario("demo-A"), () => actions.restartSalesDemo("demo-A", true, true), () => actions.enableSalesDemoCommunications("demo-A", true)]) await assert.rejects(call);
  }
  setSession(session()); patchDb(t, "salesDemo", "findUnique", async () => demo({ expiresAt: new Date(0) }));
  await assert.rejects(actions.loadSalesDemoScenario("demo-A"), /DEMO_UNAVAILABLE/);
});
test("enable is explicit/idempotent and cannot clear a later platform suspension", async (t) => {
  authorize(t); let enabled = false; const shops: any[] = [];
  patchTransaction(t, { salesDemo: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ communicationsEnabled: enabled }), update: async () => { enabled = true; } },
    shop: { update: async (a: any) => shops.push(a) } });
  assert.equal((await actions.enableSalesDemoCommunications("demo-A", false)).error, "confirmation");
  await actions.enableSalesDemoCommunications("demo-A", true); await actions.enableSalesDemoCommunications("demo-A", true);
  assert.equal(shops.length, 1); assert.equal(shops[0].where.id, "shop-A");
});
test("scenario is explicit, atomic, idempotent, tagged, coherent and has no recipients/sends", async (t) => {
  authorize(t); let batch: string | null = null; const rows: any[] = [];
  const tx: any = { salesDemo: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ scenarioBatchId: batch }), update: async (a: any) => { batch = a.data.scenarioBatchId; } } };
  for (const model of ["client", "vehicle", "appointment", "quote", "invoice", "workOrder"]) tx[model] = { create: async (a: any) => { rows.push({ modelName: model, ...a.data }); return { id: model }; } };
  patchTransaction(t, tx);
  await actions.loadSalesDemoScenario("demo-A"); await actions.loadSalesDemoScenario("demo-A");
  assert.equal(rows.length, 6); assert.ok(batch);
  for (const row of rows) { assert.equal(row.demoSeedBatchId, batch); if (row.modelName !== "vehicle") assert.equal(row.shopId, "shop-A"); }
  assert.equal(rows[0].email, undefined); assert.equal(rows[0].phone, undefined); assert.equal(rows[4].status, undefined);
});
test("restart keeps same Shop/preparation/live records, and only clears tagged batch when explicitly requested", async (t) => {
  authorize(t); const deletes: any[] = [], shops: any[] = [];
  const tx: any = { salesDemo: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ scenarioBatchId: "batch" }), update: async () => ({}) },
    shop: { update: async (a: any) => shops.push(a) } };
  for (const model of ["client", "vehicle", "appointment", "quote", "invoice", "workOrder"]) tx[model] = { findMany: async () => [], count: async () => 0, deleteMany: async (a: any) => deletes.push({ model, ...a }) };
  tx.tireStorageSet = tx.customerPortalAccess = { count: async () => 0 };
  patchTransaction(t, tx);
  assert.equal((await actions.restartSalesDemo("demo-A", true, false)).error, "confirmation");
  await actions.restartSalesDemo("demo-A", false, true); assert.equal(deletes.length, 0);
  await actions.restartSalesDemo("demo-A", true, true); assert.equal(deletes.length, 6);
  for (const row of deletes) { assert.equal(row.where.demoSeedBatchId, "batch"); assert.equal(row.model === "vehicle" ? row.where.client.shopId : row.where.shopId, "shop-A"); }
  for (const row of shops) { assert.deepEqual(row, { where: { id: "shop-A" }, data: { onboardingCompletedAt: null } }); }
});
test("restart refuses financial/live links before deleting anything", async (t) => {
  authorize(t);
  const deleted = t.mock.fn();
  patchTransaction(t, { salesDemo: { updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ scenarioBatchId: "batch" }) },
    invoice: { findMany: async () => [{ status: "PAID", _count: {} }] }, workOrder: { findMany: async () => [] }, quote: { findMany: async () => [] }, vehicle: { count: async () => 0 },
    appointment: { count: async () => 0 }, tireStorageSet: { count: async () => 0 }, customerPortalAccess: { count: async () => 0 }, shop: { update: deleted } });
  assert.deepEqual(await actions.restartSalesDemo("demo-A", true, true), { error: "liveLinks" });
  assert.equal(deleted.mock.callCount(), 0);
});
test("lifecycle races fail closed before scenario/reset/suspension changes", async (t) => {
  authorize(t);
  patchTransaction(t, { salesDemo: { updateMany: async () => ({ count: 0 }) } });
  await assert.rejects(actions.loadSalesDemoScenario("demo-A"), /DEMO_UNAVAILABLE/);
  await assert.rejects(actions.restartSalesDemo("demo-A", true, true), /DEMO_UNAVAILABLE/);
  await assert.rejects(actions.enableSalesDemoCommunications("demo-A", true), /DEMO_UNAVAILABLE/);
});
test("real Booking Page lookup and real gates use selected demo tier; public/owner/expired cannot gain demo writes", async (t) => {
  authorize(t); let current: any = demo();
  patchDb(t, "shop", "findUnique", async () => ({ id: "shop-A", name: "Prepared Garage", bookingEnabled: true, logoUrl: "persisted.png", organizationId: null, subscription: { plan: null, status: "AWAITING_PLAN" }, salesDemo: current }));
  assert.equal((await getShopBySlug("prepared"))?.logoUrl, "persisted.png");
  for (const plan of ["CORE", "PRO", "COMPLETE"]) {
    current = demo({ currentPlan: plan });
    assert.equal((await getShopBySlug("prepared"))?.bookingEnabled, true);
    const effective = resolveEffectiveDesign({ template: "MODERN", typography: "PREMIUM" }, await can("shop-A", "bookingPage.advancedDesign"));
    assert.equal(effective.template, plan === "CORE" ? "CLASSIC" : "MODERN");
  }
  setSession(null); assert.equal((await getShopBySlug("prepared"))?.bookingEnabled, false);
  setSession(session()); current = demo({ expiresAt: new Date(0) }); assert.equal((await getShopBySlug("prepared"))?.bookingEnabled, false);
});
test.after(async () => { setSession(null); https.request = originalHttps; http.request = originalHttp; globalThis.fetch = originalFetch; await db.$disconnect(); });
