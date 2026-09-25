import assert from "node:assert/strict";
import test from "node:test";
import {
  groupEmailBatchByLanguage,
  planStaffAlertRecipients,
  type StaffAlertOwner,
} from "../src/domain/staff-notify.js";

const DEFAULT = { inApp: true, email: true };

const owner = (over: Partial<StaffAlertOwner> = {}): StaffAlertOwner => ({
  userId: "owner-1",
  email: "owner@example.com",
  emailVerified: true,
  language: "EN",
  ...over,
});

test("with no saved preference, an owner gets both channels (the default)", () => {
  const plan = planStaffAlertRecipients([owner()], new Map(), DEFAULT);
  assert.deepEqual(plan, [{ userId: "owner-1", language: "EN", createInApp: true, includeInEmailBatch: true }]);
});

test("in-app off for this event: no StaffNotification row, email untouched", () => {
  const plan = planStaffAlertRecipients([owner()], new Map([["owner-1", { inApp: false, email: true }]]), DEFAULT);
  assert.equal(plan[0].createInApp, false);
  assert.equal(plan[0].includeInEmailBatch, true);
});

test("email off for this event: still gets the in-app notification", () => {
  const plan = planStaffAlertRecipients([owner()], new Map([["owner-1", { inApp: true, email: false }]]), DEFAULT);
  assert.equal(plan[0].createInApp, true);
  assert.equal(plan[0].includeInEmailBatch, false);
});

test("an unverified email is excluded from the batch even if the preference wants email", () => {
  const plan = planStaffAlertRecipients(
    [owner({ emailVerified: false })],
    new Map([["owner-1", { inApp: true, email: true }]]),
    DEFAULT
  );
  assert.equal(plan[0].createInApp, true);
  assert.equal(plan[0].includeInEmailBatch, false);
});

test("email batch groups verified, opted-in owners by language, one send per language", () => {
  const owners = [
    owner({ userId: "en-1", email: "en1@example.com", language: "EN" }),
    owner({ userId: "en-2", email: "en2@example.com", language: "EN" }),
    owner({ userId: "fr-1", email: "fr1@example.com", language: "FR" }),
    owner({ userId: "off-1", email: "off@example.com", language: "EN" }),
    owner({ userId: "unverified-1", email: "unverified@example.com", language: "EN", emailVerified: false }),
  ];
  const preferences = new Map([["off-1", { inApp: true, email: false }]]);
  const plan = planStaffAlertRecipients(owners, preferences, DEFAULT);
  const batch = groupEmailBatchByLanguage(owners, plan);

  assert.deepEqual(batch.EN.sort(), ["en1@example.com", "en2@example.com"]);
  assert.deepEqual(batch.FR, ["fr1@example.com"]);
});

test("several owners each plan independently — one owner's off switch does not affect another", () => {
  const owners = [owner({ userId: "a" }), owner({ userId: "b", email: "b@example.com" })];
  const preferences = new Map([["a", { inApp: false, email: false }]]);
  const plan = planStaffAlertRecipients(owners, preferences, DEFAULT);
  assert.deepEqual(
    plan.map((p) => ({ userId: p.userId, createInApp: p.createInApp, includeInEmailBatch: p.includeInEmailBatch })),
    [
      { userId: "a", createInApp: false, includeInEmailBatch: false },
      { userId: "b", createInApp: true, includeInEmailBatch: true },
    ]
  );
});
