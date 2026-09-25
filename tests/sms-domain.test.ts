import assert from "node:assert/strict";
import test from "node:test";
import {
  canSpendSmsSegments,
  countSmsSegments,
  decideSmsNumberLifecycle,
  isSubscriptionInGoodStanding,
  mapTwilioMessageStatus,
  nextUsageAlert,
  parseSmsKeyword,
  shouldApplyStatusUpdate,
  smsBillingPeriod,
  smsUsageAlertLevel,
  SUBSCRIPTION_LAPSED_REASON,
} from "../src/domain/sms.js";

test("plain GSM-7 text fits 160 chars per segment, 153 when concatenated", () => {
  assert.deepEqual(countSmsSegments("a".repeat(160)), { encoding: "GSM7", units: 160, segments: 1 });
  assert.equal(countSmsSegments("a".repeat(161)).segments, 2);
  assert.equal(countSmsSegments("a".repeat(306)).segments, 2);
  assert.equal(countSmsSegments("a".repeat(307)).segments, 3);
});

test("GSM-7 extended characters count double", () => {
  assert.equal(countSmsSegments("€".repeat(80)).units, 160);
  assert.equal(countSmsSegments("€".repeat(81)).segments, 2);
});

test("é and à stay GSM-7 but ê, ç and « » switch the whole message to UCS-2", () => {
  assert.equal(countSmsSegments("Rendez-vous confirmé à 9h").encoding, "GSM7");
  assert.equal(countSmsSegments("Votre véhicule est prêt").encoding, "UCS2");
  assert.equal(countSmsSegments("« Vidange »").encoding, "UCS2");
  assert.equal(countSmsSegments("ç".repeat(70)).segments, 1);
  assert.equal(countSmsSegments("ç".repeat(71)).segments, 2);
  assert.equal(countSmsSegments("ç".repeat(135)).segments, 3);
});

test("keywords match only when the message is the keyword, in EN and FR", () => {
  assert.equal(parseSmsKeyword("STOP"), "STOP");
  assert.equal(parseSmsKeyword("  stop. "), "STOP");
  assert.equal(parseSmsKeyword("Arrêt"), "STOP");
  assert.equal(parseSmsKeyword("unsubscribe"), "STOP");
  assert.equal(parseSmsKeyword("START"), "START");
  assert.equal(parseSmsKeyword("aide"), "HELP");
  assert.equal(parseSmsKeyword("Please stop the work, I'll call"), null);
  assert.equal(parseSmsKeyword(""), null);
});

test("Twilio statuses map to CommStatus", () => {
  assert.equal(mapTwilioMessageStatus("queued"), "QUEUED");
  assert.equal(mapTwilioMessageStatus("sent"), "SENT");
  assert.equal(mapTwilioMessageStatus("delivered"), "DELIVERED");
  assert.equal(mapTwilioMessageStatus("undelivered"), "FAILED");
  assert.equal(mapTwilioMessageStatus("failed"), "FAILED");
  assert.equal(mapTwilioMessageStatus("weird"), null);
});

test("status updates only move forward and never overwrite a terminal state", () => {
  assert.equal(shouldApplyStatusUpdate("SENT", "DELIVERED"), true);
  assert.equal(shouldApplyStatusUpdate("QUEUED", "FAILED"), true);
  assert.equal(shouldApplyStatusUpdate("DELIVERED", "SENT"), false);
  assert.equal(shouldApplyStatusUpdate("DELIVERED", "FAILED"), false);
  assert.equal(shouldApplyStatusUpdate("SENT", "SENT"), false);
  assert.equal(shouldApplyStatusUpdate("RECEIVED", "DELIVERED"), false);
});

test("billing period is the UTC calendar month", () => {
  const p = smsBillingPeriod(new Date("2026-09-30T23:59:00.000Z"));
  assert.equal(p.key, "2026-09");
  assert.equal(p.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(p.end.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(smsBillingPeriod(new Date("2026-12-15T00:00:00.000Z")).end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("allowance blocks a send that would exceed the monthly cap", () => {
  assert.equal(canSpendSmsSegments(298, 300, 2), true);
  assert.equal(canSpendSmsSegments(299, 300, 2), false);
  assert.equal(canSpendSmsSegments(0, 0, 1), false);
});

test("usage alerts fire once per threshold per month", () => {
  assert.equal(smsUsageAlertLevel(79, 100), 0);
  assert.equal(smsUsageAlertLevel(80, 100), 80);
  assert.equal(smsUsageAlertLevel(100, 100), 100);
  assert.equal(nextUsageAlert(80, "2026-09", null), 80);
  assert.equal(nextUsageAlert(80, "2026-09", "2026-09:80"), null);
  assert.equal(nextUsageAlert(100, "2026-09", "2026-09:80"), 100);
  assert.equal(nextUsageAlert(80, "2026-10", "2026-09:100"), 80);
  assert.equal(nextUsageAlert(0, "2026-10", null), null);
});

test("good standing: active, trialing, past-due grace; not canceled/unpaid/expired trial", () => {
  assert.equal(isSubscriptionInGoodStanding({ status: "ACTIVE", isTrialExpired: false }), true);
  assert.equal(isSubscriptionInGoodStanding({ status: "PAST_DUE", isTrialExpired: false }), true);
  assert.equal(isSubscriptionInGoodStanding({ status: "TRIALING", isTrialExpired: true }), false);
  assert.equal(isSubscriptionInGoodStanding({ status: "CANCELED", isTrialExpired: false }), false);
  assert.equal(isSubscriptionInGoodStanding({ status: "UNPAID", isTrialExpired: false }), false);
});

test("number lifecycle: schedule on lapse, cancel on recovery, release after the grace period", () => {
  const now = new Date("2026-10-01T08:00:00.000Z");
  const later = new Date("2026-10-20T08:00:00.000Z");
  const past = new Date("2026-09-30T08:00:00.000Z");

  assert.equal(
    decideSmsNumberLifecycle({ status: "ACTIVE", releaseScheduledAt: null, releaseReason: null, inGoodStanding: false, now }),
    "SCHEDULE_RELEASE"
  );
  assert.equal(
    decideSmsNumberLifecycle({ status: "ACTIVE", releaseScheduledAt: null, releaseReason: null, inGoodStanding: true, now }),
    "NONE"
  );
  assert.equal(
    decideSmsNumberLifecycle({
      status: "RELEASE_SCHEDULED",
      releaseScheduledAt: later,
      releaseReason: SUBSCRIPTION_LAPSED_REASON,
      inGoodStanding: true,
      now,
    }),
    "CANCEL_RELEASE"
  );
  // Una liberación manual de GarageOS no se revierte sola aunque el taller esté al día.
  assert.equal(
    decideSmsNumberLifecycle({ status: "RELEASE_SCHEDULED", releaseScheduledAt: later, releaseReason: "manual", inGoodStanding: true, now }),
    "NONE"
  );
  assert.equal(
    decideSmsNumberLifecycle({
      status: "RELEASE_SCHEDULED",
      releaseScheduledAt: past,
      releaseReason: SUBSCRIPTION_LAPSED_REASON,
      inGoodStanding: true,
      now,
    }),
    "RELEASE"
  );
});
