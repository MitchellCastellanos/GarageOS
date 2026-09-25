import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import twilio from "twilio";
import { db } from "../src/lib/db";
import { validateTwilioWebhook, twilioWebhookUrl, TWILIO_INBOUND_PATH } from "../src/lib/communications/twilio";
import { handleInboundSms } from "../src/lib/communications/sms-inbound";
import { handleSmsStatusCallback } from "../src/lib/communications/sms-status";

process.env.TWILIO_ACCOUNT_SID = "ACparent";
process.env.TWILIO_AUTH_TOKEN = "parent-token";
process.env.TWILIO_FROM_NUMBER = "+15145550000";
process.env.TWILIO_WEBHOOK_BASE_URL = "https://app.example.com";

type AnyFn = (...args: unknown[]) => unknown;

function mockDb<M extends keyof typeof db, K extends keyof (typeof db)[M]>(
  t: TestContext,
  model: M,
  method: K,
  impl: AnyFn
) {
  const original = db[model][method];
  const fn = t.mock.fn(impl);
  db[model][method] = fn as unknown as (typeof db)[M][K];
  t.after(() => {
    db[model][method] = original;
  });
  return fn;
}

function argsOf(fn: ReturnType<TestContext["mock"]["fn"]>, call = 0) {
  return fn.mock.calls[call].arguments[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Firma ────────────────────────────────────────────────────────────────────

test("a webhook signed with the parent token validates against the configured URL", async () => {
  const body = { AccountSid: "ACparent", MessageSid: "SM1", From: "+15145551234", To: "+15145550000", Body: "hi" };
  const signature = twilio.getExpectedTwilioSignature("parent-token", twilioWebhookUrl(TWILIO_INBOUND_PATH), body);
  assert.equal(await validateTwilioWebhook({ path: TWILIO_INBOUND_PATH, signature, body }), true);
  assert.equal(await validateTwilioWebhook({ path: TWILIO_INBOUND_PATH, signature: "forged", body }), false);
  assert.equal(await validateTwilioWebhook({ path: TWILIO_INBOUND_PATH, signature: null, body }), false);
});

test("an AccountSid that is not ours or a known shop subaccount never validates", async (t) => {
  const lookup = mockDb(t, "shopSmsNumber", "findUnique", async () => null);
  const body = { AccountSid: "ACstranger", MessageSid: "SM1" };
  const signature = twilio.getExpectedTwilioSignature("whatever", twilioWebhookUrl(TWILIO_INBOUND_PATH), body);
  assert.equal(await validateTwilioWebhook({ path: TWILIO_INBOUND_PATH, signature, body }), false);
  assert.deepEqual(argsOf(lookup).where, { subaccountSid: "ACstranger" });
});

// ── SMS entrante ─────────────────────────────────────────────────────────────

function mockInboundBasics(t: TestContext, opts: { dedicatedShopId: string | null; existingMessage?: boolean }) {
  mockDb(t, "communicationMessage", "findUnique", async () => (opts.existingMessage ? { id: "m-existing" } : null));
  const numberLookup = mockDb(t, "shopSmsNumber", "findFirst", async () =>
    opts.dedicatedShopId ? { shopId: opts.dedicatedShopId } : null
  );
  mockDb(t, "client", "findMany", async () => [{ id: "client-1", phone: "(514) 555-1234", updatedAt: new Date() }]);
  mockDb(t, "communicationThread", "findFirst", async () => null);
  const threadCreate = mockDb(t, "communicationThread", "create", async () => ({ id: "thread-1" }));
  const threadUpdate = mockDb(t, "communicationThread", "update", async () => ({}));
  const messageCreate = mockDb(t, "communicationMessage", "create", async () => ({ id: "m-new" }));
  return { numberLookup, threadCreate, threadUpdate, messageCreate };
}

test("an inbound SMS to a dedicated number lands in that shop's Inbox as an unread SMS thread", async (t) => {
  const m = mockInboundBasics(t, { dedicatedShopId: "shop-A" });
  const result = await handleInboundSms({
    messageSid: "SM100",
    accountSid: "ACsubA",
    from: "5145551234",
    to: "+1 514 555 9999",
    body: "Is my car ready?",
  });

  assert.deepEqual(result, { status: "recorded", shopId: "shop-A", threadId: "thread-1", keyword: null });
  // El taller se resuelve por número + subcuenta, nunca por el contenido.
  assert.deepEqual(argsOf(m.numberLookup).where.phoneNumber, "+15145559999");
  assert.equal(argsOf(m.numberLookup).where.subaccountSid, "ACsubA");
  assert.equal(argsOf(m.threadCreate).data.channel, "SMS");
  assert.equal(argsOf(m.threadCreate).data.contactAddress, "+15145551234");
  assert.equal(argsOf(m.threadCreate).data.clientId, "client-1");
  const message = argsOf(m.messageCreate).data;
  assert.equal(message.direction, "INBOUND");
  assert.equal(message.idempotencyKey, "twilio-inbound:SM100");
  assert.equal(message.shopId, "shop-A");
  assert.ok(argsOf(m.threadUpdate).data.lastInboundAt instanceof Date);
});

test("a retried inbound webhook is ignored", async (t) => {
  const m = mockInboundBasics(t, { dedicatedShopId: "shop-A", existingMessage: true });
  const result = await handleInboundSms({ messageSid: "SM100", accountSid: "ACsubA", from: "+15145551234", to: "+15145559999", body: "hi" });
  assert.deepEqual(result, { status: "deduped" });
  assert.equal(m.messageCreate.mock.callCount(), 0);
});

test("STOP suppresses the phone for the shop and flags the client", async (t) => {
  mockInboundBasics(t, { dedicatedShopId: "shop-A" });
  const suppression = mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  const clientUpdate = mockDb(t, "client", "updateMany", async () => ({ count: 1 }));

  const result = await handleInboundSms({ messageSid: "SM101", accountSid: "ACsubA", from: "+15145551234", to: "+15145559999", body: "Stop" });

  assert.equal(result.status, "recorded");
  assert.equal((result as { keyword: string }).keyword, "STOP");
  assert.deepEqual(argsOf(suppression).create, { shopId: "shop-A", channel: "SMS", address: "+15145551234", reason: "UNSUBSCRIBE" });
  const update = argsOf(clientUpdate);
  assert.deepEqual(update.where, { id: { in: ["client-1"] }, shopId: "shop-A" });
  assert.ok(update.data.smsOptOutAt instanceof Date);
  assert.equal(update.data.marketingSmsConsent, false);
});

test("START only lifts a STOP suppression, never a manual block", async (t) => {
  mockInboundBasics(t, { dedicatedShopId: "shop-A" });
  const removal = mockDb(t, "communicationSuppression", "deleteMany", async () => ({ count: 1 }));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  mockDb(t, "client", "updateMany", async () => ({ count: 1 }));

  await handleInboundSms({ messageSid: "SM102", accountSid: "ACsubA", from: "+15145551234", to: "+15145559999", body: "START" });
  assert.deepEqual(argsOf(removal).where.reason, { in: ["UNSUBSCRIBE"] });
});

test("a reply to the shared number goes to the last shop that texted that phone in 30 days", async (t) => {
  const m = mockInboundBasics(t, { dedicatedShopId: null });
  const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  mockDb(t, "communicationMessage", "findMany", async () => [
    { shopId: "shop-B", createdAt: new Date() },
    { shopId: "shop-C", createdAt: old },
  ]);

  const result = await handleInboundSms({ messageSid: "SM103", accountSid: "ACparent", from: "+15145551234", to: "+15145550000", body: "ok thanks" });
  assert.equal(result.status, "recorded");
  assert.equal((result as { shopId: string }).shopId, "shop-B");
  assert.equal(argsOf(m.messageCreate).data.shopId, "shop-B");
});

test("an inbound SMS to a number no shop owns is dropped", async (t) => {
  const m = mockInboundBasics(t, { dedicatedShopId: null });
  const result = await handleInboundSms({ messageSid: "SM104", accountSid: "ACsubX", from: "+15145551234", to: "+15145557777", body: "hello" });
  assert.deepEqual(result, { status: "unroutable", reason: "no_shop_for_number" });
  assert.equal(m.messageCreate.mock.callCount(), 0);
});

// ── Estado de entrega ────────────────────────────────────────────────────────

function mockStatusBasics(
  t: TestContext,
  message: { status: string; from: string; purpose?: string },
  number: { subaccountSid: string; phoneNumber: string | null; releasedPhoneNumber: string | null } | null
) {
  mockDb(t, "communicationMessage", "findFirst", async () => ({
    id: "msg-1",
    shopId: "shop-A",
    from: message.from,
    to: ["+15145551234"],
    status: message.status,
  }));
  mockDb(t, "shopSmsNumber", "findUnique", async () => number);
  const update = mockDb(t, "communicationMessage", "updateMany", async () => ({ count: 1 }));
  mockDb(t, "communicationMessage", "findUnique", async () => ({
    shopId: "shop-A",
    purpose: message.purpose ?? "INVOICE",
    businessEntityType: null,
    businessEntityId: null,
    createdAt: new Date(),
  }));
  return update;
}

const DEDICATED = { subaccountSid: "ACsubA", phoneNumber: "+15145559999", releasedPhoneNumber: null };

test("delivered callbacks advance the message; stale ones are ignored", async (t) => {
  const update = mockStatusBasics(t, { status: "SENT", from: "+15145559999" }, DEDICATED);
  assert.equal(await handleSmsStatusCallback({ messageSid: "SM1", accountSid: "ACsubA", status: "delivered" }), "updated");
  assert.equal(argsOf(update).data.status, "DELIVERED");
  assert.deepEqual(argsOf(update).where, { id: "msg-1", status: "SENT" });
});

test("a callback cannot move a delivered message back", async (t) => {
  const update = mockStatusBasics(t, { status: "DELIVERED", from: "+15145559999" }, DEDICATED);
  assert.equal(await handleSmsStatusCallback({ messageSid: "SM1", accountSid: "ACsubA", status: "sent" }), "ignored");
  assert.equal(update.mock.callCount(), 0);
});

test("a callback from another Twilio account cannot touch the shop's message", async (t) => {
  const update = mockStatusBasics(t, { status: "SENT", from: "+15145559999" }, DEDICATED);
  assert.equal(await handleSmsStatusCallback({ messageSid: "SM1", accountSid: "ACsubOther", status: "failed" }), "ignored");
  assert.equal(update.mock.callCount(), 0);
});

test("error 21610 on failure records the STOP as a suppression", async (t) => {
  mockStatusBasics(t, { status: "SENT", from: "+15145550000" }, null);
  const suppression = mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  const result = await handleSmsStatusCallback({ messageSid: "SM1", accountSid: "ACparent", status: "undelivered", errorCode: "21610" });
  assert.equal(result, "updated");
  assert.equal(argsOf(suppression).create.address, "+15145551234");
});

test("an undelivered appointment SMS is re-sent by email and linked to its history event", async (t) => {
  mockStatusBasics(t, { status: "SENT", from: "+15145559999", purpose: "APPOINTMENT" }, DEDICATED);
  mockDb(t, "appointmentEvent", "findFirst", async () => ({
    id: "event-1",
    notice: "update",
    appointment: {
      id: "appt-1",
      title: "Oil change",
      startsAt: new Date(Date.now() + 86_400_000),
      manageToken: "tok",
      client: { id: "client-1", firstName: "Anne", email: null, phone: "+15145551234", language: "FR" },
      shop: { appointmentEmailsEnabled: true },
    },
  }));
  const eventUpdate = mockDb(t, "appointmentEvent", "update", async () => ({}));

  // Sin email en la ficha: el respaldo no puede salir y el historial lo dice.
  await handleSmsStatusCallback({ messageSid: "SM1", accountSid: "ACsubA", status: "failed", errorCode: "30006" });
  assert.deepEqual(argsOf(eventUpdate), { where: { id: "event-1" }, data: { noticeOutcome: "FAILED" } });
});
