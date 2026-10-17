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

test("C3 preflight card: the province selector drives the button, URL and seller label (no hardcoded Alberta)", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/app/(site)/platform/sales/lead-radar/national/page.tsx", "utf8");
  const locale = readFileSync("src/lib/admin-locale/lead-radar-national.ts", "utf8");
  assert.ok(!/preflight=AB/.test(page), "no hardcoded ?preflight=AB link");
  assert.ok(!/province: "AB"/.test(page), "button label is not pinned to AB");
  assert.match(page, /<select name="preflight" defaultValue=\{selected\}/);
  assert.match(page, /PROVINCE_CODES\.map/, "every province is offered");
  assert.match(page, /const selected = pfProvince \?\? "AB"/, "defaults to AB, otherwise the URL province");
  assert.match(page, /fill\(c3\.run, \{ province: selected \}\)/);
  assert.match(page, /fill\(c3\.sellerCols\.receives, \{ province: selected \}\)/);
  assert.ok(!/Alberta|l’Alberta/.test(locale.slice(locale.indexOf("c3:"), locale.indexOf("sections:"))), "no Alberta wording left in the EN preflight labels");
  assert.equal((locale.match(/receives: "[^"]*\{province\}/g) ?? []).length, 2, "EN and FR seller labels take the province");
});
