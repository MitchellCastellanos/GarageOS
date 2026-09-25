import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import {
  provisionShopSmsNumber,
  releaseShopSmsNumber,
  resolveShopSmsSender,
  SmsNumberError,
} from "../src/lib/communications/sms-numbers";
import { sendSms, SmsOptedOutError } from "../src/lib/sms";
import { checkSmsUsageAlerts } from "../src/lib/communications/sms-usage";

process.env.TWILIO_ACCOUNT_SID = "ACparent";
process.env.TWILIO_AUTH_TOKEN = "parent-token";
process.env.TWILIO_FROM_NUMBER = "+15145550000";

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

// ── Remitente ────────────────────────────────────────────────────────────────

test("a live dedicated number is the sender; otherwise the shared number", async (t) => {
  const lookup = mockDb(t, "shopSmsNumber", "findUnique", async () => ({
    status: "RELEASE_SCHEDULED",
    phoneNumber: "+15145559999",
    subaccountSid: "ACsubA",
  }));
  assert.deepEqual(await resolveShopSmsSender("shop-A"), { from: "+15145559999", subaccountSid: "ACsubA", dedicated: true });

  lookup.mock.mockImplementation(async () => ({ status: "RELEASED", phoneNumber: null, subaccountSid: "ACsubA" }));
  assert.deepEqual(await resolveShopSmsSender("shop-A"), { from: "+15145550000", subaccountSid: null, dedicated: false });
});

// ── Aprovisionamiento sin duplicados ─────────────────────────────────────────

test("a shop that already has a live number cannot be provisioned again (no Twilio call)", async (t) => {
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A", name: "Garage A" }));
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({ shopId: "shop-A", status: "ACTIVE" }));
  await assert.rejects(provisionShopSmsNumber({ shopId: "shop-A", actorUserId: "u1" }), /already has a dedicated number/);
});

test("two simultaneous first provisionings: the loser is rejected by the unique shopId", async (t) => {
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A", name: "Garage A" }));
  mockDb(t, "shopSmsNumber", "findUnique", async () => null);
  mockDb(t, "shopSmsNumber", "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
  });
  await assert.rejects(provisionShopSmsNumber({ shopId: "shop-A", actorUserId: "u1" }), (err: unknown) => {
    assert.ok(err instanceof SmsNumberError);
    assert.match((err as Error).message, /already being provisioned/);
    return true;
  });
});

test("a provisioning in progress blocks a second one unless it is stale", async (t) => {
  mockDb(t, "shop", "findUnique", async () => ({ id: "shop-A", name: "Garage A" }));
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({ shopId: "shop-A", status: "PROVISIONING" }));
  const claim = mockDb(t, "shopSmsNumber", "updateMany", async () => ({ count: 0 }));
  await assert.rejects(provisionShopSmsNumber({ shopId: "shop-A", actorUserId: "u1" }), /already being provisioned/);
  const where = (claim.mock.calls[0].arguments[0] as { where: { OR: unknown[] } }).where;
  assert.deepEqual((where.OR[1] as { status: string }).status, "PROVISIONING");
});

test("invalid country or area codes are rejected before touching the DB or Twilio", async () => {
  await assert.rejects(provisionShopSmsNumber({ shopId: "x", actorUserId: "u", countryCode: "CAN" }), /Invalid country/);
  await assert.rejects(provisionShopSmsNumber({ shopId: "x", actorUserId: "u", areaCode: "51" }), /3 digits/);
});

// ── Liberación ───────────────────────────────────────────────────────────────

test("if another run already claimed the release, this one does nothing (no double release)", async (t) => {
  const updatedAt = new Date();
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({
    shopId: "shop-A",
    status: "ACTIVE",
    updatedAt,
    phoneNumber: "+15145559999",
    phoneNumberSid: "PN1",
    subaccountSid: "ACsubA",
    senderIdentityId: "si-1",
  }));
  const claim = mockDb(t, "shopSmsNumber", "updateMany", async () => ({ count: 0 }));
  const identity = mockDb(t, "senderIdentity", "updateMany", async () => ({ count: 1 }));

  await releaseShopSmsNumber({ shopId: "shop-A", reason: "test" });
  const where = (claim.mock.calls[0].arguments[0] as { where: unknown }).where;
  assert.deepEqual(where, { shopId: "shop-A", status: "ACTIVE", updatedAt });
  assert.equal(identity.mock.callCount(), 0);
});

test("releasing a shop without a live number fails clearly", async (t) => {
  mockDb(t, "shopSmsNumber", "findUnique", async () => ({ shopId: "shop-A", status: "RELEASED", phoneNumberSid: null }));
  await assert.rejects(releaseShopSmsNumber({ shopId: "shop-A", reason: "x" }), /no active dedicated number/);
});

// ── Envío: STOP y cupo se revisan antes de Twilio ───────────────────────────

function mockSendBasics(t: TestContext, opts: { suppressed: boolean; used: number; allowance: number }) {
  mockDb(t, "shopSmsNumber", "findUnique", async () => null);
  mockDb(t, "communicationSuppression", "findUnique", async () => (opts.suppressed ? { id: "sup" } : null));
  mockDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: opts.used } }));
  mockDb(t, "communicationMessage", "count", async () => 0);
  // Mismo mock atiende tanto a getSmsAllowance (smsMonthlyAllowanceOverride) como a
  // getEffectiveSubscription (organizationId/subscription, para el reporte de excedente).
  mockDb(t, "shop", "findUnique", async () => ({
    smsMonthlyAllowanceOverride: opts.allowance,
    organizationId: null,
    subscription: null,
  }));
  return mockDb(t, "communicationMessage", "create", async () => ({ id: "m" }));
}

test("an SMS to a phone that replied STOP is refused so the caller falls back to email", async (t) => {
  const create = mockSendBasics(t, { suppressed: true, used: 0, allowance: 100 });
  await assert.rejects(
    sendSms({ shopId: "shop-A", to: "5145551234", body: "hi", purpose: "APPOINTMENT" }),
    (err: unknown) => err instanceof SmsOptedOutError
  );
  assert.equal(create.mock.callCount(), 0);
});

test("two-way SMS from the Inbox requires a dedicated number", async (t) => {
  mockSendBasics(t, { suppressed: false, used: 0, allowance: 100 });
  await assert.rejects(
    sendSms({ shopId: "shop-A", to: "5145551234", body: "hi", purpose: "INBOX", requireDedicatedNumber: true }),
    /dedicated number/
  );
});

// ── Alertas de uso ───────────────────────────────────────────────────────────

test("the 80% alert fires once; a concurrent send that lost the marker race does not repeat it", async (t) => {
  mockDb(t, "shop", "findUnique", async () => ({ smsUsageAlertMarker: null, smsMonthlyAllowanceOverride: 100 }));
  mockDb(t, "communicationMessage", "aggregate", async () => ({ _sum: { segments: 85 } }));
  mockDb(t, "communicationMessage", "count", async () => 0);
  const claim = mockDb(t, "shop", "updateMany", async () => ({ count: 1 }));
  const notified: number[] = [];

  await checkSmsUsageAlerts("shop-A", async ({ level }) => {
    notified.push(level);
  });
  assert.deepEqual(notified, [80]);
  assert.match((claim.mock.calls[0].arguments[0] as { data: { smsUsageAlertMarker: string } }).data.smsUsageAlertMarker, /^\d{4}-\d{2}:80$/);

  claim.mock.mockImplementation(async () => ({ count: 0 }));
  await checkSmsUsageAlerts("shop-A", async ({ level }) => {
    notified.push(level);
  });
  assert.deepEqual(notified, [80]);
});
