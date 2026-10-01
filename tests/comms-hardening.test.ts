// Block 11 — comunicaciones: pruebas con proveedores MOCKEADOS (DB en memoria de
// mocks, Stripe/Twilio simulados). No validan nada contra Twilio/Resend/Stripe
// reales — eso es validación externa (ver docs/product-completion-plan.md §11).

import "./helpers/fake-providers-authorized";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { getStripeClient } from "../src/lib/stripe";
import { recordAndSend } from "../src/lib/communications/outbox";
import { retryPendingSmsOverage, settleSmsOverage } from "../src/lib/communications/sms-usage";
import { reconcileStaleSmsStatuses } from "../src/lib/communications/sms-status";
import { handleResendStatusEvent } from "../src/lib/communications/email-status";
import { verifyResendWebhookSignature } from "../src/lib/communications/resend-webhook";
import { computeOverageSegments, countSmsSegments, smsBillingPeriod } from "../src/domain/sms";
import { mapResendEventStatus } from "../src/domain/email";

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_SMS_OVERAGE_METER_EVENT_NAME = "sms_overage";
process.env.TWILIO_ACCOUNT_SID = "ACparent";
process.env.TWILIO_AUTH_TOKEN = "t";
process.env.TWILIO_FROM_NUMBER = "+15145550000";

type AnyFn = (...args: unknown[]) => unknown;

function mockDb<M extends keyof typeof db, K extends keyof (typeof db)[M]>(t: TestContext, model: M, method: K, impl: AnyFn) {
  const original = db[model][method];
  const fn = t.mock.fn(impl);
  db[model][method] = fn as unknown as (typeof db)[M][K];
  t.after(() => {
    db[model][method] = original;
  });
  return fn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const argsOf = (fn: ReturnType<TestContext["mock"]["fn"]>, call = 0) => fn.mock.calls[call].arguments[0] as Record<string, any>;

function mockMeter(t: TestContext, impl: AnyFn) {
  const meterEvents = getStripeClient().billing.meterEvents as unknown as { create: AnyFn };
  const original = meterEvents.create;
  const fn = t.mock.fn(impl);
  meterEvents.create = fn;
  t.after(() => {
    meterEvents.create = original;
  });
  return fn;
}

const activeSub = { subscription: { status: "ACTIVE", plan: "PRO", stripeCustomerId: "cus_1", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 86400000), cancelAtPeriodEnd: false, billingInterval: "MONTHLY", stripeSubscriptionId: "sub_1", shopId: "shop-A" }, organizationId: null };
const lapsedSub = { subscription: { ...activeSub.subscription, status: "CANCELED", currentPeriodEnd: new Date(Date.now() - 86400000) }, organizationId: null };

// ── SMS segments / allowance boundaries ──────────────────────────────────────

test("segments: GSM-7 160/153 boundaries and UCS-2 70/67, accents in French copy stay GSM-7 but « » flips to UCS-2", () => {
  assert.equal(countSmsSegments("a".repeat(160)).segments, 1);
  assert.equal(countSmsSegments("a".repeat(161)).segments, 2);
  assert.equal(countSmsSegments("a".repeat(306)).segments, 2);
  assert.equal(countSmsSegments("a".repeat(307)).segments, 3);
  assert.equal(countSmsSegments("é".repeat(160)).encoding, "GSM7");
  assert.equal(countSmsSegments("« ok »").encoding, "UCS2");
  assert.equal(countSmsSegments("é".repeat(70) + "»").segments, 2);
  assert.equal(countSmsSegments("ok 🙂").encoding, "UCS2");
});

test("overage boundaries: exactly at allowance is free, next segment is billed, straddling splits", () => {
  assert.equal(computeOverageSegments(299, 300, 1), 0);
  assert.equal(computeOverageSegments(300, 300, 1), 1);
  assert.equal(computeOverageSegments(298, 300, 5), 3);
  assert.equal(computeOverageSegments(0, 0, 2), 2);
  assert.equal(computeOverageSegments(1000, 300, 0), 0);
});

test("the SMS allowance period resets on the first of the UTC month", () => {
  const dec = smsBillingPeriod(new Date("2026-12-31T23:59:59Z"));
  const jan = smsBillingPeriod(new Date("2027-01-01T00:00:00Z"));
  assert.equal(dec.key, "2026-12");
  assert.equal(jan.key, "2027-01");
  assert.equal(dec.end.getTime(), jan.start.getTime());
});

// ── Overage reporting: idempotency + recovery ────────────────────────────────

const overageRow = {
  id: "msg-1",
  shopId: "shop-A",
  channel: "SMS",
  direction: "OUTBOUND",
  billedOverageSegments: 3,
  overageReportedAt: null as Date | null,
  providerMessageId: "SM1",
  createdAt: new Date(Date.now() - 60 * 60 * 1000),
};

test("settleSmsOverage reports once with a stable identifier and marks the message reported", async (t) => {
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow }));
  mockDb(t, "shop", "findUnique", async () => activeSub);
  const upd = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  const meter = mockMeter(t, async () => ({}));
  assert.equal(await settleSmsOverage("msg-1"), "reported");
  const call = argsOf(meter);
  assert.equal(call.identifier, "sms-overage:msg-1");
  assert.equal(call.payload.value, "3");
  assert.equal(call.payload.stripe_customer_id, "cus_1");
  assert.ok(call.timestamp, "late retries pin the event to the message's own period");
  assert.ok(argsOf(upd).data.overageReportedAt instanceof Date);
});

test("an already-reported message is never reported again (no double billing)", async (t) => {
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow, overageReportedAt: new Date() }));
  const meter = mockMeter(t, async () => ({}));
  assert.equal(await settleSmsOverage("msg-1"), "already_reported");
  assert.equal(meter.mock.callCount(), 0);
});

test("a Stripe failure never throws, stays unreported and counts the attempt", async (t) => {
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow }));
  mockDb(t, "shop", "findUnique", async () => activeSub);
  const upd = mockDb(t, "communicationMessage", "update", async () => ({}));
  const marked = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  mockMeter(t, async () => {
    throw new Error("stripe down");
  });
  t.mock.method(console, "error", () => {});
  assert.equal(await settleSmsOverage("msg-1"), "failed");
  assert.deepEqual(argsOf(upd).data.overageReportAttempts, { increment: 1 });
  assert.equal(marked.mock.callCount(), 0);
});

test("messages that never reached Twilio (no provider id) or are inbound are not billed", async (t) => {
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow, providerMessageId: null }));
  assert.equal(await settleSmsOverage("msg-1"), "not_applicable");
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow, direction: "INBOUND" }));
  assert.equal(await settleSmsOverage("msg-1"), "not_applicable");
});

test("retryPendingSmsOverage recovers failed reports and only scans unreported outbound overage", async (t) => {
  const find = mockDb(t, "communicationMessage", "findMany", async () => [{ id: "msg-1" }, { id: "msg-2" }]);
  mockDb(t, "communicationMessage", "findUnique", async () => ({ ...overageRow }));
  mockDb(t, "shop", "findUnique", async () => activeSub);
  mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  mockMeter(t, async () => ({}));
  const result = await retryPendingSmsOverage(new Date());
  assert.deepEqual(result, { scanned: 2, reported: 2, failed: 0, skipped: 0 });
  const where = argsOf(find).where;
  assert.equal(where.overageReportedAt, null);
  assert.equal(where.direction, "OUTBOUND");
  assert.deepEqual(where.billedOverageSegments, { gt: 0 });
});

// ── Outbox: history failures never block a valid notification ────────────────

const baseSend = (send: () => Promise<{ providerMessageId?: string }>) => ({
  shopId: "shop-A",
  purpose: "APPOINTMENT",
  channel: "EMAIL" as const,
  provider: "resend",
  from: "a@x.com",
  to: ["c@x.com"],
  send,
});

function mockOutboxBasics(t: TestContext) {
  mockDb(t, "shop", "findUnique", async () => ({ communicationsSuspendedAt: null }));
  mockDb(t, "communicationMessage", "count", async () => 0);
  mockDb(t, "communicationRoute", "findUnique", async () => null);
  t.mock.method(console, "error", () => {});
}

test("if the history write fails, the customer notification is still sent", async (t) => {
  mockOutboxBasics(t);
  mockDb(t, "communicationMessage", "create", async () => {
    throw new Error("db down");
  });
  const send = t.mock.fn(async () => ({ providerMessageId: "re_1" }));
  const result = await recordAndSend(baseSend(send));
  assert.equal(send.mock.callCount(), 1);
  assert.equal(result.messageId, null);
  assert.equal(result.providerMessageId, "re_1");
});

test("if the provider accepted the message but the SENT write fails, it is not reported as a failure", async (t) => {
  mockOutboxBasics(t);
  mockDb(t, "communicationMessage", "create", async () => ({ id: "m1" }));
  mockDb(t, "communicationMessage", "update", async () => {
    throw new Error("db down");
  });
  const result = await recordAndSend(baseSend(async () => ({ providerMessageId: "re_1" })));
  assert.equal(result.messageId, "m1");
  assert.equal(result.deduped, false);
});

test("a provider failure marks FAILED and rethrows the original error", async (t) => {
  mockOutboxBasics(t);
  mockDb(t, "communicationMessage", "create", async () => ({ id: "m1" }));
  const upd = mockDb(t, "communicationMessage", "update", async () => ({}));
  await assert.rejects(
    recordAndSend(baseSend(async () => {
      throw new Error("provider 500");
    })),
    /provider 500/
  );
  assert.equal(argsOf(upd).data.status, "FAILED");
});

test("an idempotent retry of an already-sent message is deduped without calling the provider", async (t) => {
  mockOutboxBasics(t);
  mockDb(t, "communicationMessage", "findUnique", async () => ({ id: "m1", shopId: "shop-A", status: "SENT", providerMessageId: "re_1" }));
  const send = t.mock.fn(async () => ({ providerMessageId: "re_2" }));
  const result = await recordAndSend({ ...baseSend(send), idempotencyKey: "k1" });
  assert.equal(result.deduped, true);
  assert.equal(send.mock.callCount(), 0);
});

test("restricted shops cannot send campaigns or automated reminders, but transactional mail is unaffected", async (t) => {
  mockOutboxBasics(t);
  mockDb(t, "shop", "findUnique", async () => ({ communicationsSuspendedAt: null, ...lapsedSub }));
  mockDb(t, "communicationMessage", "create", async () => ({ id: "m1" }));
  mockDb(t, "communicationMessage", "update", async () => ({}));
  const send = t.mock.fn(async () => ({ providerMessageId: "x" }));
  await assert.rejects(recordAndSend({ ...baseSend(send), messageType: "CAMPAIGN" }), /not active/);
  await assert.rejects(recordAndSend({ ...baseSend(send), purpose: "REMINDER" }), /not active/);
  assert.equal(send.mock.callCount(), 0);
  await recordAndSend(baseSend(send));
  assert.equal(send.mock.callCount(), 1);
});

test("platform-suspended shops cannot send anything", async (t) => {
  mockDb(t, "shop", "findUnique", async () => ({ communicationsSuspendedAt: new Date() }));
  await assert.rejects(recordAndSend(baseSend(async () => ({}))), /suspended/);
});

// ── Twilio status reconciliation (lost/early callbacks) ──────────────────────

test("reconcile fetches Twilio for stale messages within the owning subaccount and applies the final status", async (t) => {
  mockDb(t, "communicationMessage", "findMany", async () => [
    { id: "m1", shopId: "shop-A", from: "+15145559999", providerMessageId: "SM1" },
  ]);
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({ subaccountSid: "ACsubA" }));
  mockDb(t, "communicationMessage", "findFirst", async () => ({ id: "m1", shopId: "shop-A", from: "+15145559999", to: ["+15145551234"], status: "SENT" }));
  const upd = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  const seen: unknown[] = [];
  const result = await reconcileStaleSmsStatuses(new Date(), {
    fetchMessage: async (sub, sid) => {
      seen.push([sub, sid]);
      return { status: "delivered", accountSid: "ACsubA" };
    },
  });
  assert.deepEqual(seen, [["ACsubA", "SM1"]]);
  assert.deepEqual(result, { scanned: 1, updated: 1 });
  assert.equal(argsOf(upd).data.status, "DELIVERED");
});

test("reconcile ignores a Twilio answer from a different account (tenant isolation)", async (t) => {
  mockDb(t, "communicationMessage", "findMany", async () => [
    { id: "m1", shopId: "shop-A", from: "+15145559999", providerMessageId: "SM1" },
  ]);
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({ subaccountSid: "ACsubA" }));
  mockDb(t, "communicationMessage", "findFirst", async () => ({ id: "m1", shopId: "shop-A", from: "+15145559999", to: ["+1"], status: "SENT" }));
  const upd = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  const result = await reconcileStaleSmsStatuses(new Date(), {
    fetchMessage: async () => ({ status: "delivered", accountSid: "ACother" }),
  });
  assert.equal(result.updated, 0);
  assert.equal(upd.mock.callCount(), 0);
});

// ── Resend ───────────────────────────────────────────────────────────────────

test("email.failed maps to a terminal FAILED status and is recorded", async (t) => {
  assert.equal(mapResendEventStatus("email.failed"), "FAILED");
  mockDb(t, "communicationMessage", "findFirst", async () => ({ id: "m1", shopId: "shop-A", to: ["c@x.com"], status: "SENT" }));
  const upd = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  mockDb(t, "appointmentEvent", "findFirst", async () => null);
  mockDb(t, "workOrder", "findFirst", async () => null);
  t.mock.method(console, "error", () => {});
  assert.equal(await handleResendStatusEvent({ type: "email.failed", emailId: "re_1", reason: "boom" }), "updated");
  assert.equal(argsOf(upd).data.status, "FAILED");
  assert.equal(argsOf(upd).data.errorMessage, "boom");
});

test("a Resend status event for another shop's address never crosses tenants (lookup is by provider id only, suppression scoped to the message's shop)", async (t) => {
  mockDb(t, "communicationMessage", "findFirst", async () => ({ id: "m1", shopId: "shop-A", to: ["c@x.com"], status: "SENT" }));
  mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  const sup = mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  mockDb(t, "appointmentEvent", "findFirst", async () => null);
  mockDb(t, "workOrder", "findFirst", async () => null);
  t.mock.method(console, "error", () => {});
  await handleResendStatusEvent({ type: "email.bounced", emailId: "re_1", to: ["victim@other-shop.com"] });
  const args = JSON.stringify(sup.mock.calls[0]?.arguments ?? []);
  assert.ok(args.includes("shop-A"));
  assert.ok(!args.includes("victim@other-shop.com"));
});

test("Svix signatures: valid passes; wrong secret, tampered body, missing headers and stale timestamps fail", () => {
  const secretBytes = crypto.randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = '{"type":"email.delivered"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sign = (id: string, t: string, b: string) =>
    "v1," + crypto.createHmac("sha256", secretBytes).update(`${id}.${t}.${b}`).digest("base64");
  const good = { svixId: "msg_1", svixTimestamp: ts, svixSignature: sign("msg_1", ts, body) };
  assert.equal(verifyResendWebhookSignature(secret, body, good), true);
  assert.equal(verifyResendWebhookSignature(secret, body + " ", good), false);
  assert.equal(verifyResendWebhookSignature(`whsec_${crypto.randomBytes(24).toString("base64")}`, body, good), false);
  assert.equal(verifyResendWebhookSignature(secret, body, { ...good, svixSignature: null }), false);
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verifyResendWebhookSignature(secret, body, { svixId: "msg_1", svixTimestamp: old, svixSignature: sign("msg_1", old, body) }), false);
});
