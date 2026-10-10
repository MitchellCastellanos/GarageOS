// P0 safety: a FIELD visit is not engagement unless its structured outcome is a genuine conversation, and never consent.
import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD_VISIT_OUTCOMES, NEGATING_OUTCOMES, OUTCOME_RULES, QUALIFYING_OUTCOMES, ROUTE_VISIT_OUTCOMES, hasQualifiedVisit, isQualifyingOutcome, planFollowUp, visitResultSchema,
} from "../src/domain/sales-crm/field-visit";
import { NO_ENGAGEMENT, evaluateColdEmail, requiredMode, type Engagement, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { evaluateSendPolicy, evaluateSendingBasis } from "../src/domain/sales-comms/casl";

const montreal: TerritoryRule = { key: "mtl", acquisition: "FIELD_EXCLUSIVE", provinces: ["QC"], cities: ["montreal"], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 1 };
const T0 = new Date("2026-10-01T12:00:00Z");
const v = (outcome: string, minutes = 0) => ({ outcome, at: new Date(T0.getTime() + minutes * 60_000) });
const engOf = (visits: ReturnType<typeof v>[]): Engagement => ({ ...NO_ENGAGEMENT, touched: visits.length > 0, visited: visits.length > 0, qualifiedVisit: hasQualifiedVisit(visits) });
const cold = (eng: Engagement, automated = true) => evaluateColdEmail({ required: requiredMode(montreal, eng, T0), eng, automated, senderMode: "REMOTE" });

test("the outcome vocabulary matches the schema enum and classifies every value", () => {
  assert.equal(new Set(FIELD_VISIT_OUTCOMES).size, FIELD_VISIT_OUTCOMES.length);
  for (const o of FIELD_VISIT_OUTCOMES) assert.ok(OUTCOME_RULES[o], `${o} has a rule`);
  assert.ok(!ROUTE_VISIT_OUTCOMES.includes("NOTE_ONLY"));
  for (const q of QUALIFYING_OUTCOMES) assert.ok(!NEGATING_OUTCOMES.includes(q), "no outcome is both");
});

test("only genuine conversations qualify; every unsuccessful/negative outcome is rejected by the gate", () => {
  for (const o of ["DECISION_MAKER_CONTACTED", "INTERESTED", "DEMO_DISCUSSED", "DEMO_SCHEDULED"]) {
    assert.equal(isQualifyingOutcome(o as never), true, o);
    assert.deepEqual(cold(engOf([v(o)])), { allowed: true }, `${o} satisfies the separate territory condition`);
  }
  for (const o of ["DECISION_MAKER_UNAVAILABLE", "NO_ANSWER", "BUSINESS_CLOSED", "INVALID_LOCATION", "NOT_INTERESTED", "CONTACT_REJECTED", "DO_NOT_CONTACT", "NOTE_ONLY", "FOLLOW_UP_REQUIRED"]) {
    assert.equal(isQualifyingOutcome(o as never), false, o);
    assert.deepEqual(cold(engOf([v(o)])), { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" }, `${o} must NOT unlock automated first contact`);
    assert.deepEqual(cold(engOf([v(o)]), false), { allowed: false, code: "TERRITORY_FIELD_ONLY" }, `${o} must NOT unlock a REMOTE manual first contact`);
  }
});

test("a visit with no structured outcome (legacy row) is never engagement", () => {
  // loadEngagement only feeds rows with a non-null outcome, so a legacy visit contributes `visited` but never `qualifiedVisit`.
  const legacy: Engagement = { ...NO_ENGAGEMENT, touched: true, visited: true };
  assert.equal(cold(legacy).allowed, false);
});

test("a later refusal, closure, invalid location or DNC revokes an earlier qualifying visit; a later conversation restores it", () => {
  for (const neg of NEGATING_OUTCOMES) assert.equal(hasQualifiedVisit([v("INTERESTED", 0), v(neg, 5)]), false, `${neg} after INTERESTED`);
  assert.equal(hasQualifiedVisit([v("NOT_INTERESTED", 0), v("INTERESTED", 5)]), true);
  assert.equal(hasQualifiedVisit([v("INTERESTED", 0), v("NO_ANSWER", 5)]), true, "an unsuccessful later attempt does not erase a real conversation");
  assert.equal(hasQualifiedVisit([v("INTERESTED", 5), v("DO_NOT_CONTACT", 5)]), false, "ties are resolved conservatively");
});

test("qualifying engagement never replaces the CASL sending basis: the send policy still blocks without consent", () => {
  const eng = engOf([v("DEMO_DISCUSSED")]);
  assert.equal(cold(eng).allowed, true);
  const basis = evaluateSendingBasis([], T0);
  const decision = evaluateSendPolicy({
    category: "COMMERCIAL", settingsSendingEnabled: true, identityActive: true, staffActive: true, fromDomainApproved: true,
    recipients: [{ email: "owner@shop.test", valid: true, suppression: null }], prospect: { doNotContact: false, archived: false }, contact: { doNotContact: false },
    basis, languageResolved: true, sentToday: 0, dailyLimit: 50, commercialFooterConfigured: true,
  });
  assert.equal(decision.allowed, false, "territory engagement does not create a sending basis");
});

test("outcome rules: closing outcomes forbid follow-up tasks, demo scheduling needs a date, defaults are applied", () => {
  for (const o of ["BUSINESS_CLOSED", "INVALID_LOCATION", "NOT_INTERESTED", "CONTACT_REJECTED", "DO_NOT_CONTACT"] as const) {
    assert.deepEqual(planFollowUp(o, undefined, undefined), { ok: true, task: null });
    assert.deepEqual(planFollowUp(o, "CALL", "2026-10-20"), { ok: false, error: "TASK_NOT_ALLOWED" });
  }
  assert.deepEqual(planFollowUp("DEMO_SCHEDULED", undefined, undefined), { ok: false, error: "FOLLOW_UP_DATE_REQUIRED" });
  const demo = planFollowUp("DEMO_SCHEDULED", undefined, "2026-10-20");
  assert.ok(demo.ok && demo.task?.type === "DEMO_PREP" && demo.task.dueDate === "2026-10-20");
  const unavailable = planFollowUp("DECISION_MAKER_UNAVAILABLE", undefined, undefined);
  assert.ok(unavailable.ok && unavailable.task?.type === "FOLLOW_UP" && unavailable.task.daysAhead === 3);
  assert.deepEqual(planFollowUp("NO_ANSWER", undefined, undefined), { ok: true, task: null });
  assert.equal(planFollowUp("INTERESTED", "EMAIL", undefined).ok, true);
});

test("visit result input validation", () => {
  const ok = visitResultSchema.parse({ outcome: "INTERESTED", submissionId: "abcd1234-efgh", note: "  hi\u0000  ", followUpDate: "" });
  assert.equal(ok.note, "hi");
  assert.equal(ok.followUpDate, undefined);
  assert.throws(() => visitResultSchema.parse({ outcome: "NOTE_ONLY", submissionId: "abcd1234" }), "NOTE_ONLY is not selectable from a route");
  assert.throws(() => visitResultSchema.parse({ outcome: "INTERESTED", submissionId: "short" }));
  assert.throws(() => visitResultSchema.parse({ outcome: "INTERESTED", submissionId: "abcd1234", followUpDate: "tomorrow" }));
});
