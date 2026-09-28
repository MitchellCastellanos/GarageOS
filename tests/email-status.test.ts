import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { db } from "../src/lib/db";
import { mapResendEventStatus, resendSuppressionReason } from "../src/domain/email.js";
import { shouldApplyStatusUpdate } from "../src/domain/communication-status.js";
import { handleResendStatusEvent } from "../src/lib/communications/email-status";

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

test("event type mapping: delivered/bounced change status, complained only suppresses", () => {
  assert.equal(mapResendEventStatus("email.delivered"), "DELIVERED");
  assert.equal(mapResendEventStatus("email.bounced"), "BOUNCED");
  assert.equal(mapResendEventStatus("email.complained"), null);
  assert.equal(mapResendEventStatus("email.opened"), null);
  assert.equal(resendSuppressionReason("email.bounced"), "BOUNCE");
  assert.equal(resendSuppressionReason("email.complained"), "COMPLAINT");
  assert.equal(resendSuppressionReason("email.delivered"), null);
});

test("BOUNCED is a terminal rank, same as FAILED", () => {
  assert.equal(shouldApplyStatusUpdate("SENT", "BOUNCED"), true);
  assert.equal(shouldApplyStatusUpdate("BOUNCED", "DELIVERED"), false);
  assert.equal(shouldApplyStatusUpdate("DELIVERED", "BOUNCED"), false);
});

function mockMessage(t: TestContext, message: { status: string; to: string[]; purpose?: string }) {
  mockDb(t, "communicationMessage", "findFirst", async () => ({
    id: "msg-1",
    shopId: "shop-A",
    to: message.to,
    status: message.status,
  }));
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

test("a delivered event marks the message DELIVERED", async (t) => {
  const update = mockMessage(t, { status: "SENT", to: ["client@example.com"] });
  const result = await handleResendStatusEvent({ type: "email.delivered", emailId: "re_1" });
  assert.equal(result, "updated");
  assert.equal(argsOf(update).data.status, "DELIVERED");
});

test("a bounced event suppresses the address and marks the message BOUNCED", async (t) => {
  const update = mockMessage(t, { status: "SENT", to: ["client@example.com"] });
  const suppression = mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  const result = await handleResendStatusEvent({ type: "email.bounced", emailId: "re_2", reason: "mailbox full" });
  assert.equal(result, "updated");
  assert.equal(argsOf(update).data.status, "BOUNCED");
  assert.deepEqual(argsOf(suppression).create, {
    shopId: "shop-A",
    channel: "EMAIL",
    address: "client@example.com",
    reason: "BOUNCE",
  });
});

test("a complaint suppresses without touching delivery status", async (t) => {
  const update = mockMessage(t, { status: "DELIVERED", to: ["client@example.com"] });
  const suppression = mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  const result = await handleResendStatusEvent({ type: "email.complained", emailId: "re_3" });
  assert.equal(result, "updated");
  assert.equal(update.mock.callCount(), 0);
  assert.equal(argsOf(suppression).create.reason, "COMPLAINT");
});

test("a stale/duplicate callback that cannot advance the status is ignored", async (t) => {
  const update = mockMessage(t, { status: "DELIVERED", to: ["client@example.com"] });
  const result = await handleResendStatusEvent({ type: "email.delivered", emailId: "re_1" });
  assert.equal(result, "ignored");
  assert.equal(update.mock.callCount(), 0);
});

test("an unknown message id is ignored", async (t) => {
  mockDb(t, "communicationMessage", "findFirst", async () => null);
  const result = await handleResendStatusEvent({ type: "email.delivered", emailId: "unknown" });
  assert.equal(result, "ignored");
});

test("a bounced appointment notice with no phone on file fails closed (no SMS to try)", async (t) => {
  mockMessage(t, { status: "SENT", to: ["client@example.com"], purpose: "APPOINTMENT" });
  mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  mockDb(t, "appointmentEvent", "findFirst", async () => ({
    id: "event-1",
    notice: "confirmation",
    appointment: {
      id: "appt-1",
      title: "Oil change",
      startsAt: new Date(Date.now() + 86_400_000),
      manageToken: "tok",
      client: { id: "client-1", firstName: "Anne", email: "client@example.com", phone: null, language: "EN" },
      shop: { appointmentSmsEnabled: true, appointmentEmailsEnabled: true },
    },
  }));
  const eventUpdate = mockDb(t, "appointmentEvent", "update", async () => ({}));

  await handleResendStatusEvent({ type: "email.bounced", emailId: "re_4" });

  assert.deepEqual(argsOf(eventUpdate), { where: { id: "event-1" }, data: { noticeOutcome: "FAILED" } });
});

test("a bounced appointment notice with a phone on file is retried by SMS end to end (no network)", async (t) => {
  process.env.TWILIO_ACCOUNT_SID = "ACparent";
  process.env.TWILIO_AUTH_TOKEN = "parent-token";
  process.env.TWILIO_FROM_NUMBER = "+15145550000";

  mockMessage(t, { status: "SENT", to: ["client@example.com"], purpose: "APPOINTMENT" });
  mockDb(t, "communicationSuppression", "upsert", async () => ({}));
  mockDb(t, "communicationAuditLog", "create", async () => ({}));
  mockDb(t, "appointmentEvent", "findFirst", async () => ({
    id: "event-1",
    notice: "confirmation",
    appointment: {
      id: "appt-1",
      title: "Oil change",
      startsAt: new Date(Date.now() + 86_400_000),
      manageToken: "tok",
      client: { id: "client-1", firstName: "Anne", email: "client@example.com", phone: "+15145551234", language: "EN" },
      shop: {
        id: "shop-A",
        name: "Garage A",
        appointmentSmsEnabled: true,
        appointmentEmailsEnabled: true,
        timezone: "America/Montreal",
        phone: null,
        slug: null,
      },
    },
  }));
  const eventUpdate = mockDb(t, "appointmentEvent", "update", async () => ({}));

  // Cadena real de sendSms/recordAndSend sin tocar red: no hay número dedicado
  // (cae al compartido), no está suprimido, el cupo alcanza, y el mensaje ya
  // existe con un idempotencyKey terminal (SENT) — reserveMessageId lo
  // deduplica y nunca llama a Twilio. Una misma fila sirve para el lookup por
  // id (handleNotificationDeliveryFailure, ya cubierto por mockMessage) y por
  // idempotencyKey (outbox.ts).
  mockDb(t, "shopSmsNumber", "findUnique", async () => null);
  mockDb(t, "communicationRoute", "findUnique", async () => null);
  mockDb(t, "shop", "findUnique", async () => ({
    communicationsSuspendedAt: null,
    smsMonthlyAllowanceOverride: 999_999,
    organizationId: null,
    subscription: null,
  }));
  const existing = {
    id: "sms-existing",
    status: "SENT",
    providerMessageId: "SMxxx",
    shopId: "shop-A",
    purpose: "APPOINTMENT",
    businessEntityType: "APPOINTMENT",
    businessEntityId: "appt-1",
    createdAt: new Date(),
  };
  mockDb(t, "communicationMessage", "findUnique", async () => existing);
  mockDb(t, "communicationSuppression", "findUnique", async () => null);
  mockDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: 0 } }));
  mockDb(t, "communicationMessage", "count", async () => 0);

  await handleResendStatusEvent({ type: "email.bounced", emailId: "re_4" });

  assert.deepEqual(argsOf(eventUpdate), {
    where: { id: "event-1" },
    data: { smsMessageId: "sms-existing", noticeOutcome: "SENT" },
  });
});
