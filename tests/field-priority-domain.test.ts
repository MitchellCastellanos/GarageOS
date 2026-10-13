// Per-prospect FIELD priority + manual FIELD<->REMOTE acquisition — pure domain tests (no database).
import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionState, evaluateAcquisition, NO_ENGAGEMENT, priorityDeadline, requiredMode, type Engagement, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { evaluateAcquisitionChange } from "../src/domain/sales-crm/acquisition";
import { evaluateColdEmail } from "../src/domain/sales-crm/territory";

const DAY = 86_400_000;
const rule = (o: Partial<TerritoryRule>): TerritoryRule => ({ key: "gm", acquisition: "FIELD_PRIORITY", provinces: ["QC"], cities: ["montreal"], postalPrefixes: [], priorityDays: 7, priorityStartedAt: null, active: true, sortOrder: 10, ...o });
const PRIORITY = rule({}), EXCLUSIVE = rule({ acquisition: "FIELD_EXCLUSIVE", priorityDays: null }), NATIONAL = rule({ key: "canada", acquisition: "REMOTE_DEFAULT", cities: [], provinces: [], priorityDays: null });
const T0 = new Date("2026-11-01T15:00:00Z");
const eng = (o: Partial<Engagement> = {}): Engagement => ({ ...NO_ENGAGEMENT, ...o });

test("each prospect has its OWN seven-day window: two prospects started on different days expire on different days", () => {
  const a = { fieldPriorityStartedAt: T0 }, b = { fieldPriorityStartedAt: new Date(T0.getTime() + 3 * DAY) };
  assert.equal(priorityDeadline(PRIORITY, a)!.getTime(), T0.getTime() + 7 * DAY);
  const day8 = new Date(T0.getTime() + 8 * DAY);
  assert.equal(requiredMode(PRIORITY, eng(), day8, a), "REMOTE", "A's window ended");
  assert.equal(requiredMode(PRIORITY, eng(), day8, b), "FIELD", "B (started 3 days later) is still inside its own window");
  assert.equal(requiredMode(PRIORITY, eng(), new Date(T0.getTime() + 7 * DAY - 1), a), "FIELD", "one millisecond before the deadline");
  assert.equal(requiredMode(PRIORITY, eng(), new Date(T0.getTime() + 7 * DAY), a), "REMOTE", "at the deadline");
  assert.equal(acquisitionState(PRIORITY, eng(), T0, a).reason, "WINDOW_OPEN");
});

test("the window length is configurable per territory (the number of days), never a global start date", () => {
  const t = { fieldPriorityStartedAt: T0 };
  assert.equal(requiredMode(rule({ priorityDays: 3 }), eng(), new Date(T0.getTime() + 4 * DAY), t), "REMOTE");
  assert.equal(requiredMode(rule({ priorityDays: 30 }), eng(), new Date(T0.getTime() + 4 * DAY), t), "FIELD");
  // the deprecated territory-wide start date has no effect at all
  assert.equal(requiredMode(rule({ priorityStartedAt: new Date("2000-01-01") }), eng(), new Date(T0.getTime() + 400 * DAY), {}), "FIELD");
  assert.equal(priorityDeadline(rule({ priorityDays: null }), t), null, "no duration configured → no deadline");
});

test("no window started (old prospects) = FIELD, exactly as before; FIELD_EXCLUSIVE ignores windows; REMOTE_DEFAULT is REMOTE", () => {
  assert.deepEqual([acquisitionState(PRIORITY, eng(), T0, {}).mode, acquisitionState(PRIORITY, eng(), T0, {}).reason], ["FIELD", "WINDOW_NOT_STARTED"]);
  assert.equal(requiredMode(EXCLUSIVE, eng(), new Date(T0.getTime() + 999 * DAY), { fieldPriorityStartedAt: T0 }), "FIELD");
  assert.equal(requiredMode(NATIONAL, eng(), T0), "REMOTE");
  assert.equal(requiredMode(null, eng(), T0), "REMOTE");
});

test("after the window only meaningful engagement keeps FIELD; a failed visit, no-answer or rejection does not", () => {
  const t = { fieldPriorityStartedAt: T0 }, late = new Date(T0.getTime() + 10 * DAY);
  assert.equal(requiredMode(PRIORITY, eng(), late, t), "REMOTE");
  assert.equal(requiredMode(PRIORITY, eng({ touched: true, visited: true }), late, t), "REMOTE", "visit attempt only");
  assert.equal(requiredMode(PRIORITY, eng({ qualifiedVisit: true }), late, t), "FIELD");
  assert.equal(requiredMode(PRIORITY, eng({ replied: true }), late, t), "FIELD");
  assert.equal(requiredMode(PRIORITY, eng({ activeOpportunity: true }), late, t), "FIELD");
  assert.equal(requiredMode(PRIORITY, eng({ touched: true, otherTouch: true }), late, t), "FIELD");
  assert.equal(acquisitionState(PRIORITY, eng({ qualifiedVisit: true }), late, t).reason, "EXPIRED_ENGAGED");
});

test("manual release overrides the window and exclusive territories; it never depends on the clock", () => {
  const r = { fieldPriorityStartedAt: T0, remoteReleasedAt: new Date(T0.getTime() + DAY) };
  assert.equal(acquisitionState(PRIORITY, eng(), T0, r).reason, "MANUALLY_RELEASED");
  assert.equal(requiredMode(PRIORITY, eng(), T0, r), "REMOTE");
  assert.equal(requiredMode(EXCLUSIVE, eng(), T0, { remoteReleasedAt: T0 }), "REMOTE");
});

test("acquisition: a REMOTE seller can take a prospect only once REMOTE holds it; a FIELD seller always can; coverage still applies", () => {
  const remote = { mode: "REMOTE" as const, coverageKeys: [], isSuperAdmin: false }, field = { mode: "FIELD" as const, coverageKeys: [], isSuperAdmin: false };
  const t = { fieldPriorityStartedAt: T0 };
  assert.equal(evaluateAcquisition(remote, PRIORITY, eng(), T0, false, t).allowed, false);
  assert.equal(evaluateAcquisition(field, PRIORITY, eng(), T0, false, t).allowed, true);
  assert.equal(evaluateAcquisition(remote, PRIORITY, eng(), new Date(T0.getTime() + 8 * DAY), false, t).allowed, true);
  assert.equal(evaluateAcquisition(remote, PRIORITY, eng(), T0, false, { ...t, remoteReleasedAt: T0 }).allowed, true);
  assert.equal(evaluateAcquisition(remote, PRIORITY, eng({ touched: true, otherTouch: true }), new Date(T0.getTime() + 8 * DAY), true, t).allowed, true, "existing owner retained");
  assert.deepEqual(evaluateAcquisition({ ...remote, coverageKeys: ["other"] }, PRIORITY, eng(), new Date(T0.getTime() + 8 * DAY), false, t), { allowed: false, code: "OUTSIDE_COVERAGE" });
});

test("cold-email territory gate follows the per-prospect state and still never treats a failed visit as engagement (CASL is evaluated separately)", () => {
  const t = { fieldPriorityStartedAt: T0 };
  const gate = (e: Engagement, now: Date, timing = t, automated = true) => evaluateColdEmail({ required: requiredMode(PRIORITY, e, now, timing), eng: e, automated, senderMode: "REMOTE" });
  assert.equal(gate(eng(), T0).allowed, false, "inside the window: FIELD-first");
  assert.equal(gate(eng({ touched: true, visited: true }), T0).allowed, false, "a failed visit never unlocks email");
  assert.equal(gate(eng({ qualifiedVisit: true }), T0).allowed, true, "qualifying conversation (territory gate only; basis/DNC/suppression separate)");
  assert.equal(gate(eng(), new Date(T0.getTime() + 8 * DAY)).allowed, true, "window ended and released to REMOTE");
});

// ── manual release / return eligibility ────────────────────────────────────────────────────────────────────────
const f = (o: Record<string, unknown> = {}) => ({ status: "ACTIVE" as const, doNotContact: false, rule: PRIORITY, eng: eng(), now: new Date(T0.getTime() + DAY), timing: { fieldPriorityStartedAt: T0 }, ...o });

test("RELEASE_TO_REMOTE: eligible only for FIELD-held, untouched prospects with no active opportunity; clear conflict codes otherwise", () => {
  assert.deepEqual(evaluateAcquisitionChange("RELEASE_TO_REMOTE", f()).conflicts, []);
  assert.equal(evaluateAcquisitionChange("RELEASE_TO_REMOTE", f({ rule: EXCLUSIVE, timing: {} })).eligible, true, "also works in today's FIELD_EXCLUSIVE production territory");
  const c = (o: Record<string, unknown>) => evaluateAcquisitionChange("RELEASE_TO_REMOTE", f(o)).conflicts;
  assert.deepEqual(c({ status: "ARCHIVED" }), ["ARCHIVED"]);
  assert.deepEqual(c({ doNotContact: true }), ["DNC"]);
  assert.deepEqual(c({ rule: NATIONAL }), ["NOT_FIELD_HELD"]);
  assert.deepEqual(c({ rule: null }), ["NOT_FIELD_HELD"]);
  assert.deepEqual(c({ timing: { fieldPriorityStartedAt: T0, remoteReleasedAt: T0 } }), ["ALREADY_RELEASED"]);
  assert.deepEqual(c({ now: new Date(T0.getTime() + 9 * DAY) }), ["ALREADY_REMOTE"]);
  assert.deepEqual(c({ eng: eng({ activeOpportunity: true }) }), ["ACTIVE_OPPORTUNITY"]);
  assert.deepEqual(c({ eng: eng({ qualifiedVisit: true }) }), ["MEANINGFUL_ENGAGEMENT"]);
  assert.deepEqual(c({ eng: eng({ replied: true }) }), ["MEANINGFUL_ENGAGEMENT"]);
  assert.deepEqual(c({ eng: eng({ touched: true, visited: true }) }), [], "a failed visit attempt does not block release");
});

test("RETURN_TO_FIELD: for released or expired prospects, and to START a window where none exists; never for engaged prospects or active opportunities", () => {
  const c = (o: Record<string, unknown>) => evaluateAcquisitionChange("RETURN_TO_FIELD", f(o)).conflicts;
  assert.deepEqual(c({}), ["NOTHING_TO_RETURN"], "inside its window and not released: already FIELD");
  assert.deepEqual(c({ timing: { fieldPriorityStartedAt: T0, remoteReleasedAt: T0 } }), []);
  assert.deepEqual(c({ now: new Date(T0.getTime() + 9 * DAY) }), [], "expired → can be returned (starts a new window)");
  assert.deepEqual(c({ timing: {} }), [], "FIELD_PRIORITY with no window yet: 'return' starts one");
  assert.deepEqual(c({ rule: EXCLUSIVE, timing: {} }), ["NOTHING_TO_RETURN"]);
  assert.deepEqual(c({ rule: EXCLUSIVE, timing: { remoteReleasedAt: T0 } }), []);
  assert.deepEqual(c({ timing: { remoteReleasedAt: T0 }, eng: eng({ activeOpportunity: true }) }), ["ACTIVE_OPPORTUNITY"]);
  assert.deepEqual(c({ timing: { remoteReleasedAt: T0 }, eng: eng({ qualifiedVisit: true }) }), ["MEANINGFUL_ENGAGEMENT"]);
  assert.deepEqual(c({ rule: NATIONAL }), ["NOT_FIELD_HELD"]);
  assert.deepEqual(c({ doNotContact: true, status: "ARCHIVED" }).sort(), ["ARCHIVED", "DNC", "NOTHING_TO_RETURN"].sort());
});
