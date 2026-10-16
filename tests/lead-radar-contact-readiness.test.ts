import assert from "node:assert/strict";
import test from "node:test";
import { checkEmailShape, climbLadder, LADDER, type LadderFacts } from "../src/domain/lead-radar/contact-readiness";

const none: LadderFacts = { business: false, discovered: false, sourced: false, validated: false, hasContact: false, languageDecided: false, caslReviewed: false, suppressionClear: false, eligible: false };

test("the ladder is cumulative: a later rung never counts unless every earlier one holds", () => {
  assert.deepEqual([climbLadder(none).reached, climbLadder(none).stuckAt], [null, "QUALIFIED_BUSINESS"]);
  const a = climbLadder({ ...none, business: true });
  assert.deepEqual([a.reached, a.stuckAt], ["QUALIFIED_BUSINESS", "CONTACT_DISCOVERED"]);
  // A published address found, sourced and well-formed, but nobody accepted it as a contact: stuck before language.
  const b = climbLadder({ ...none, business: true, discovered: true, sourced: true, validated: true });
  assert.deepEqual([b.reached, b.stuckAt], ["EMAIL_VALIDATED", "LANGUAGE_DECIDED"]);
  // Eligible without the earlier rungs is impossible to claim.
  const c = climbLadder({ ...none, eligible: true, hasContact: true });
  assert.equal(c.reached, null);
  const d = climbLadder({ business: true, discovered: true, sourced: true, validated: true, hasContact: true, languageDecided: true, caslReviewed: false, suppressionClear: true, eligible: false });
  assert.deepEqual([d.reached, d.stuckAt], ["LANGUAGE_DECIDED", "CASL_REVIEWED"]);
  const ready = climbLadder({ business: true, discovered: true, sourced: true, validated: true, hasContact: true, languageDecided: true, caslReviewed: true, suppressionClear: true, eligible: true });
  assert.deepEqual([ready.reached, ready.stuckAt], ["OUTREACH_READY", null]);
  assert.equal(LADDER.length, 8);
});

test("a missing business rung blocks everything even when a contact is fully eligible (an excluded business is never outreach-ready)", () => {
  const r = climbLadder({ business: false, discovered: true, sourced: true, validated: true, hasContact: true, languageDecided: true, caslReviewed: true, suppressionClear: true, eligible: true });
  assert.equal(r.reached, null); assert.equal(r.rungs.OUTREACH_READY, false);
});

test("email shape: Canadian business addresses are normalised and flagged, never trusted", () => {
  assert.deepEqual(checkEmailShape("  Info@GarageTremblay.CA "), { normalized: "info@garagetremblay.ca", syntaxValid: true, roleBased: true, freeMailbox: false });
  assert.equal(checkEmailShape("marc.tremblay@garagetremblay.ca").roleBased, false);
  assert.equal(checkEmailShape("garage.lavoie@videotron.ca").freeMailbox, true);
  assert.equal(checkEmailShape("rendez-vous@atelier.qc.ca").roleBased, true);
  for (const bad of ["", null, undefined, "no-at-sign", "a@b", "a b@c.ca", "x@y..ca", "a@b.c\nBcc: evil@x.ca", "<script>@x.ca"]) assert.equal(checkEmailShape(bad as string).syntaxValid, false, String(bad));
});
