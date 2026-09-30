// Block 15 / I-2 — Tire Storage customer communication lifecycle.
// Sends are injected fakes (no Twilio/Resend); DB access is patched in-process.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession } from "./helpers/action-harness";
import { mockSubscription, patchDb, patchTransaction } from "./helpers/db-mock";
import {
  calendarDaysBetween, customerStorageReference, duePickupReminder, parsePickupDate,
} from "../src/domain/tire-storage";
import { tireNoticeEmail, tireNoticeSms, type TireNoticeData } from "../src/lib/tire-storage-copy";

const notify = await import("../src/lib/tire-storage-notify");

// ── pure rules ──────────────────────────────────────────────────────────────
test("calendar-day math is DST-safe (Quebec spring-forward / fall-back)", () => {
  assert.equal(calendarDaysBetween("2027-03-13", "2027-03-15"), 2); // DST starts 2027-03-14
  assert.equal(calendarDaysBetween("2026-10-30", "2026-11-03"), 4); // DST ends 2026-11-01
  assert.equal(calendarDaysBetween("2026-12-31", "2027-01-02"), 2);
  assert.equal(calendarDaysBetween("2026-05-01", "2026-05-01"), 0);
});

test("parsePickupDate accepts real calendar dates only", () => {
  assert.deepEqual(parsePickupDate(""), { ymd: null, invalid: false });
  assert.deepEqual(parsePickupDate("2026-11-15"), { ymd: "2026-11-15", invalid: false });
  for (const bad of ["2026-02-30", "15/11/2026", "2026-13-01", "tomorrow"]) assert.equal(parsePickupDate(bad).invalid, true, bad);
});

const NOW = new Date("2026-11-01T12:00:00Z");
const base = { status: "STORED" as const, checkedInAt: new Date("2026-06-01T12:00:00Z"), now: NOW, earlySent: false, finalSent: false };

test("reminder windows: 14 days, 3 days, never repeated, never after the date, never when not stored", () => {
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-01", expectedPickupYmd: "2026-11-20" }), null, "19 days out: too early");
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-01", expectedPickupYmd: "2026-11-15" }), "PICKUP_REMINDER_14");
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-01", expectedPickupYmd: "2026-11-15", earlySent: true }), null, "already sent");
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-12", expectedPickupYmd: "2026-11-15", earlySent: true }), "PICKUP_REMINDER_3");
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-12", expectedPickupYmd: "2026-11-15", earlySent: true, finalSent: true }), null);
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-15", expectedPickupYmd: "2026-11-15" }), "PICKUP_REMINDER_3", "on the day");
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-16", expectedPickupYmd: "2026-11-15" }), null, "date passed");
  assert.equal(duePickupReminder({ ...base, status: "CHECKED_OUT", todayYmd: "2026-11-12", expectedPickupYmd: "2026-11-15" }), null);
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-12", expectedPickupYmd: null }), null);
  // cron outage across the 14-day window: falls through to the 3-day reminder, not both
  assert.equal(duePickupReminder({ ...base, todayYmd: "2026-11-13", expectedPickupYmd: "2026-11-15" }), "PICKUP_REMINDER_3");
});

test("no reminder right after check-in (customer just got the confirmation)", () => {
  const fresh = { ...base, checkedInAt: new Date("2026-10-30T12:00:00Z") }; // 2 days old
  assert.equal(duePickupReminder({ ...fresh, todayYmd: "2026-11-01", expectedPickupYmd: "2026-11-10" }), null, "14d window skipped");
  assert.equal(duePickupReminder({ ...fresh, todayYmd: "2026-11-08", expectedPickupYmd: "2026-11-10" }), "PICKUP_REMINDER_3");
  const hours = { ...base, checkedInAt: new Date("2026-11-01T02:00:00Z") };
  assert.equal(duePickupReminder({ ...hours, todayYmd: "2026-11-01", expectedPickupYmd: "2026-11-02" }), null, "3d window skipped when < 1 day old");
});

// ── copy: customer-safe ─────────────────────────────────────────────────────
const noticeBase: TireNoticeData = {
  kind: "CHECK_IN", lang: "EN", clientName: "Ana Tremblay", shopName: "Garage Test", shopPhone: "514-555-0100", bookingUrl: null,
  vehicle: "2020 Honda Civic", quantity: 4, size: "225/45R17", season: "WINTER", reference: "TS-ABC123",
  checkedInDate: "October 20, 2026", expectedPickupDate: "April 15, 2027",
};

test("copy exposes shop, vehicle, size, dates and a reference — never the internal rack", () => {
  for (const kind of ["CHECK_IN", "CHECK_OUT", "PICKUP_REMINDER_14", "PICKUP_REMINDER_3", "MANUAL"] as const) {
    for (const lang of ["EN", "FR"] as const) {
      const d = { ...noticeBase, kind, lang };
      const sms = tireNoticeSms(d);
      const mail = tireNoticeEmail(d);
      assert.ok(sms.includes("Garage Test"), `${kind}/${lang} sms names the shop`);
      assert.ok(sms.includes("225/45R17"));
      assert.doesNotMatch(sms + mail.body, /rack|bin|emplacement|RACK/i);
    }
  }
  const s = tireNoticeSms(noticeBase);
  assert.match(s, /2020 Honda Civic/);
  assert.match(s, /TS-ABC123/);
  assert.match(tireNoticeSms({ ...noticeBase, lang: "FR" }), /pneus d'hiver/);
  assert.match(tireNoticeSms({ ...noticeBase, kind: "PICKUP_REMINDER_3", bookingUrl: "https://app.test/book/g" }), /Book online: https:\/\/app\.test\/book\/g/);
  assert.equal(customerStorageReference("cmabcdefghijk123456"), "TS-123456");
});

// ── orchestrator: channels, preferences, idempotency ────────────────────────
interface Sent { channel: "SMS" | "EMAIL"; key: string; body: string; purpose?: string }
function fakes(opts: { smsFails?: boolean; emailFails?: boolean } = {}) {
  const sent: Sent[] = [];
  const seen = new Set<string>();
  return {
    sent,
    deps: {
      sendSms: async (d: { idempotencyKey: string; body: string; purpose: string }) => {
        if (opts.smsFails) throw new Error("opted out");
        if (seen.has(d.idempotencyKey)) return { deduped: true, providerMessageId: null, messageId: "m" };
        seen.add(d.idempotencyKey);
        sent.push({ channel: "SMS", key: d.idempotencyKey, body: d.body, purpose: d.purpose });
        return { deduped: false, providerMessageId: "SM1", messageId: "m" };
      },
      sendEmail: async (d: { idempotencyKey: string; body: string; channel: string }) => {
        if (opts.emailFails) throw new Error("bounced");
        if (seen.has(d.idempotencyKey)) return { deduped: true, providerMessageId: null, messageId: "m" };
        seen.add(d.idempotencyKey);
        sent.push({ channel: "EMAIL", key: d.idempotencyKey, body: d.body, purpose: d.channel });
        return { deduped: false, providerMessageId: "re1", messageId: "m" };
      },
    } as never,
  };
}

function setRow(over: Record<string, unknown> = {}, clientOver: Record<string, unknown> = {}) {
  return {
    id: "set1", shopId: "shop-A", clientId: "c1", vehicleId: "v1", season: "WINTER", size: "225/45R17", quantity: 4, storageLocation: "RACK A-3",
    status: "STORED", checkedInAt: new Date("2026-10-20T15:00:00Z"), checkedOutAt: null, expectedPickupDate: new Date("2027-04-15T00:00:00Z"),
    checkInNotifiedAt: null, pickupReminder14SentAt: null, pickupReminder3SentAt: null,
    client: { id: "c1", firstName: "Ana", lastName: "T", phone: "+15145550101", email: "ana@example.test", language: "FR", notifyChannel: "AUTO", ...clientOver },
    vehicle: { year: 2020, make: "Honda", model: "Civic" },
    shop: { id: "shop-A", name: "Garage Test", phone: "514-555-0100", slug: "g", bookingEnabled: true, timezone: "America/Montreal", email: "s@x.test" },
    ...over,
  };
}

function db_(t: TestContext, row: ReturnType<typeof setRow> | null) {
  patchDb(t, "tireStorageSet", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) =>
    row && where.id === row.id && where.shopId === row.shopId ? row : null) as never);
  const updates: unknown[] = [];
  patchDb(t, "tireStorageSet", "updateMany", (async (a: unknown) => { updates.push(a); return { count: 1 }; }) as never);
  const events: { data: Record<string, unknown> }[] = [];
  patchDb(t, "tireStorageEvent", "create", (async (a: { data: Record<string, unknown> }) => { events.push(a); return {}; }) as never);
  return { updates, events };
}

test("check-in confirmation: SMS first, in the customer's language, internal rack not disclosed, history event + flag", async (t) => {
  const { events, updates } = db_(t, setRow());
  const f = fakes();
  const res = await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps);
  assert.deepEqual(res, { delivered: true, channels: ["SMS"] });
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].channel, "SMS");
  assert.match(f.sent[0].body, /pneus d'hiver/);
  assert.doesNotMatch(f.sent[0].body, /RACK/i);
  assert.equal(f.sent[0].purpose, "TIRE_STORAGE");
  assert.equal(events[0].data.type, "NOTIFIED");
  assert.ok(JSON.stringify(updates).includes("checkInNotifiedAt"));
});

test("same event twice sends once (retry / double click / duplicate cron)", async (t) => {
  db_(t, setRow());
  const f = fakes();
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps);
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps);
  assert.equal(f.sent.length, 1, "check-in key is stable per check-in");
  const a = new Date("2026-11-01T10:00:00Z");
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "MANUAL", now: a }, f.deps);
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "MANUAL", now: new Date(a.getTime() + 60_000) }, f.deps);
  assert.equal(f.sent.length, 2, "manual double click within 5 min = one message");
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "MANUAL", now: new Date(a.getTime() + 10 * 60_000) }, f.deps);
  assert.equal(f.sent.length, 3, "a deliberate later re-send is allowed");
});

test("preferences and fallback: EMAIL preference, SMS opt-out falls back to email, BOTH sends both, nothing on file", async (t) => {
  db_(t, setRow({}, { notifyChannel: "EMAIL" }));
  let f = fakes();
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps), { delivered: true, channels: ["EMAIL"] });
  assert.equal(f.sent.length, 1);

  db_(t, setRow());
  f = fakes({ smsFails: true });
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps), { delivered: true, channels: ["EMAIL"] });

  db_(t, setRow({}, { notifyChannel: "BOTH" }));
  f = fakes();
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps), { delivered: true, channels: ["SMS", "EMAIL"] });
  assert.notEqual(f.sent[0].key, f.sent[1].key, "per-channel idempotency keys");

  f = fakes({ smsFails: true, emailFails: true });
  db_(t, setRow());
  t.mock.method(console, "error", () => {});
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps), { delivered: false, reason: "FAILED" });

  db_(t, setRow({}, { phone: null, email: null }));
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "CHECK_IN" }, f.deps), { delivered: false, reason: "NO_CONTACT" });
});

test("tenant isolation: another shop cannot trigger a notification for this set", async (t) => {
  db_(t, setRow());
  const f = fakes();
  assert.deepEqual(await notify.notifyTireStorageCustomer({ shopId: "shop-B", setId: "set1", kind: "MANUAL" }, f.deps), { delivered: false, reason: "NOT_FOUND" });
  assert.equal(f.sent.length, 0);
});

test("reminders use the REMINDER purpose/channel (restricted shops are refused by the outbox)", async (t) => {
  db_(t, setRow());
  const f = fakes({}); 
  await notify.notifyTireStorageCustomer({ shopId: "shop-A", setId: "set1", kind: "PICKUP_REMINDER_14" }, f.deps);
  assert.equal(f.sent[0].purpose, "REMINDER");
  assert.match(f.sent[0].key, /PICKUP_REMINDER_14:2027-04-15:sms$/, "keyed to the expected date: a new date is a new reminder");
});

// ── cron ────────────────────────────────────────────────────────────────────
test("cron: sends only the due reminder, honours restricted shops and plan, stamps the flag", async (t) => {
  const now = new Date("2027-04-01T12:00:00Z"); // 14 days before 2027-04-15 in Montreal
  const candidate = { ...setRow(), shop: { id: "shop-A", timezone: "America/Montreal" } };
  patchDb(t, "tireStorageSet", "findMany", (async () => [candidate]) as never);
  const rowForNotify = setRow();
  patchDb(t, "tireStorageSet", "findFirst", (async () => rowForNotify) as never);
  const updates: unknown[] = [];
  patchDb(t, "tireStorageSet", "updateMany", (async (a: unknown) => { updates.push(a); return { count: 1 }; }) as never);
  patchDb(t, "tireStorageEvent", "create", (async () => ({})) as never);
  mockSubscription(t, "PRO");

  let f = fakes();
  const ran = await notify.deliverDueTirePickupReminders(now, async () => true, f.deps);
  assert.deepEqual(ran, { sent: 1, skipped: 0, errors: 0 });
  assert.ok(JSON.stringify(updates).includes("pickupReminder14SentAt"));

  f = fakes();
  assert.deepEqual(await notify.deliverDueTirePickupReminders(now, async () => false, f.deps), { sent: 0, skipped: 1, errors: 0 }, "restricted shop");
  assert.equal(f.sent.length, 0);

  mockSubscription(t, "CORE");
  f = fakes();
  assert.deepEqual(await notify.deliverDueTirePickupReminders(now, async () => true, f.deps), { sent: 0, skipped: 1, errors: 0 }, "Core has no Tire Storage");
  assert.equal(f.sent.length, 0);

  // already sent -> nothing
  mockSubscription(t, "PRO");
  candidate.pickupReminder14SentAt = new Date("2027-04-01T00:00:00Z") as never;
  f = fakes();
  assert.deepEqual(await notify.deliverDueTirePickupReminders(now, async () => true, f.deps), { sent: 0, skipped: 0, errors: 0 });
});

test("cron: the shop-local calendar day decides (late evening UTC is still yesterday in Montreal)", async (t) => {
  // 2027-04-02T02:30Z is still 2027-04-01 22:30 in Montreal (EDT) -> 14 days before Apr 15, not 13.
  const candidate = { ...setRow({ expectedPickupDate: new Date("2027-04-15T00:00:00Z") }), shop: { id: "shop-A", timezone: "America/Montreal" } };
  patchDb(t, "tireStorageSet", "findMany", (async () => [candidate]) as never);
  patchDb(t, "tireStorageSet", "findFirst", (async () => setRow()) as never);
  patchDb(t, "tireStorageSet", "updateMany", (async () => ({ count: 1 })) as never);
  patchDb(t, "tireStorageEvent", "create", (async () => ({})) as never);
  mockSubscription(t, "COMPLETE");
  const f = fakes();
  const res = await notify.deliverDueTirePickupReminders(new Date("2027-04-02T02:30:00Z"), async () => true, f.deps);
  assert.equal(res.sent, 1);
});

// ── actions: workflow never depends on messaging; Core refused ──────────────
const actions = await import("../src/actions/tire-storage");

test("manual notify action: Pro only, stored sets only, tenant scoped", async (t) => {
  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  mockSubscription(t, "CORE");
  assert.deepEqual(await actions.notifyTireSetCustomer("set1"), { ok: false, error: "INVALID_STATE" }, "Core refused server-side");

  mockSubscription(t, "PRO");
  patchDb(t, "tireStorageSet", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) =>
    where.shopId === "shop-A" && where.id === "set1" ? { status: "CHECKED_OUT" } : null) as never);
  assert.deepEqual(await actions.notifyTireSetCustomer("set1"), { ok: false, error: "INVALID_STATE" }, "not in storage");
  assert.deepEqual(await actions.notifyTireSetCustomer("other"), { ok: false, error: "NOT_FOUND" });
  void patchTransaction;
});
