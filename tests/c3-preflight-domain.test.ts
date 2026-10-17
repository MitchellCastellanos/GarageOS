import test from "node:test";
import assert from "node:assert/strict";
import { C3_BLOCKERS, c3Verdict, type C3Row } from "../src/domain/lead-radar/national-readiness";

const ok: C3Row = { liveFit: "VERIFIED_REPAIR", licenseOk: true, tier: "PRIMARY", reviewState: "PENDING", qualificationLane: "AUTO_ELIGIBLE", matchState: "NEW", hasPoint: true, phone: "7805550100", address: "1 Main St", postalCode: "T5J 2Z2", territoryState: "NATIONAL" };

test("C3 verdict: a clean verified candidate is importable as a NEW prospect; the approval still needed is stated, never assumed", () => {
  assert.deepEqual(c3Verdict(ok), { importable: true, kind: "NEW", approval: "POLICY_AUTO" });
  assert.deepEqual(c3Verdict({ ...ok, reviewState: "APPROVED" }), { importable: true, kind: "NEW", approval: "APPROVED" });
  assert.deepEqual(c3Verdict({ ...ok, qualificationLane: null }), { importable: true, kind: "NEW", approval: "NOT_QUALIFIED" });
  assert.deepEqual(c3Verdict({ ...ok, qualificationLane: "HUMAN_REVIEW" }), { importable: true, kind: "NEW", approval: "NEEDS_PERSON" });
  assert.deepEqual(c3Verdict({ ...ok, qualificationLane: "BLOCKED" }), { importable: true, kind: "NEW", approval: "NEEDS_PERSON" });
  assert.deepEqual(c3Verdict({ ...ok, matchState: "EXISTING_STRONG" }), { importable: true, kind: "LINK", approval: "POLICY_AUTO" }, "a strong CRM match only enriches the existing prospect");
  assert.equal(c3Verdict({ ...ok, territoryState: "LOCAL" }).importable, true);
});

test("C3 verdict: every blocker, in a fixed order (the first one wins), and a person's rejection is never overridden", () => {
  const cases: [Partial<C3Row>, (typeof C3_BLOCKERS)[number]][] = [
    [{ liveFit: "HUMAN_REVIEW" }, "FIT_CHANGED"], [{ liveFit: "EXCLUDED" }, "FIT_CHANGED"], [{ licenseOk: false }, "LICENSE_BLOCKED"], [{ tier: "EXCLUDED" }, "TIER_EXCLUDED"], [{ reviewState: "REJECTED" }, "REJECTED_BY_PERSON"],
    [{ phone: null, address: null, postalCode: null }, "INSUFFICIENT_CONTACT"], [{ hasPoint: false }, "NO_COORDINATES"], [{ matchState: "AMBIGUOUS" }, "MATCH_AMBIGUOUS"], [{ matchState: "BRANCH_OF_EXISTING" }, "MATCH_BRANCH"],
    [{ territoryState: "UNRESOLVED" }, "TERRITORY_UNRESOLVED"], [{ territoryState: null }, "TERRITORY_UNRESOLVED"],
  ];
  for (const [over, blocker] of cases) assert.deepEqual(c3Verdict({ ...ok, ...over }), { importable: false, blocker }, JSON.stringify(over));
  assert.deepEqual(c3Verdict({ ...ok, liveFit: "EXCLUDED", licenseOk: false, reviewState: "REJECTED" }), { importable: false, blocker: "FIT_CHANGED" }, "first blocker wins");
  assert.equal(C3_BLOCKERS.length, new Set(C3_BLOCKERS).size);
});
