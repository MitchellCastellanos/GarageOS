// Email-only REMOTE policy: pure rules. FIELD (Greater Montréal) is unchanged; REMOTE needs a usable, non-suppressed email; a published address is never consent.
import assert from "node:assert/strict";
import test from "node:test";
import * as mod from "../src/domain/lead-radar/remote-email";
const { isDeferredNoEmail, isRemoteLocation, isUsableEmail } = mod;
import { planRollout, provinceStep, type ProvinceFacts } from "../src/domain/lead-radar/rollout";
import type { TerritoryRule } from "../src/domain/sales-crm/territory";

const rule = (o: Partial<TerritoryRule>): TerritoryRule => ({ key: "k", acquisition: "REMOTE_DEFAULT", provinces: [], cities: [], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 10, ...o });
const RULES = [
  rule({ key: "greater-montreal", acquisition: "FIELD_EXCLUSIVE", provinces: ["QC"], cities: ["Montréal", "Laval", "Longueuil"], postalPrefixes: ["H", "J4"], sortOrder: 1 }),
  rule({ key: "canada", sortOrder: 99 }),
];

test("FIELD territory (Montréal / Laval / Rive-Sud) is never REMOTE, with or without an email", () => {
  for (const loc of [{ province: "QC", city: "Montréal" }, { province: "QC", city: "Laval" }, { province: "QC", city: "Longueuil", postalCode: "J4K 1A1" }, { province: "QC", postalCode: "H2X 3K4" }]) {
    assert.equal(isRemoteLocation(RULES, loc), false, JSON.stringify(loc));
    assert.equal(isDeferredNoEmail({ email: null, rules: RULES, location: loc }), false, "FIELD without email keeps the existing behaviour");
  }
});

test("an unresolvable location (province only, could be Montréal) keeps the existing behaviour instead of being deferred", () => {
  assert.equal(isRemoteLocation(RULES, { province: "QC" }), false);
  assert.equal(isDeferredNoEmail({ email: null, rules: RULES, location: { province: "QC" } }), false);
});

test("REMOTE territory: no email, blank, malformed or suppressed → deferred; usable email → importable", () => {
  const loc = { province: "BC", city: "Vancouver", postalCode: "V6H 1H6" };
  assert.equal(isRemoteLocation(RULES, loc), true);
  assert.equal(isRemoteLocation(RULES, { province: "QC", city: "Québec", postalCode: "G1R 4P5" }), true, "Québec City is outside the FIELD territory");
  for (const email of [null, undefined, "", "   ", "not-an-email", "a@b", "x@y@z.ca"]) assert.equal(isDeferredNoEmail({ email, rules: RULES, location: loc }), true, String(email));
  assert.equal(isDeferredNoEmail({ email: "Owner@Shop.CA", rules: RULES, location: loc }), false);
  assert.equal(isDeferredNoEmail({ email: " Owner@Shop.CA ", rules: RULES, location: loc, suppressed: new Set(["owner@shop.ca"]) }), true, "suppressed address is not usable");
});

test("a publicly listed email is usable for import/assignment only; it is not consent (no sending basis is produced here)", () => {
  assert.equal(isUsableEmail("info@publicly-listed.ca"), true);
  // The module exposes no consent/basis concept at all: sending eligibility stays in the CASL/outreach policy.
  assert.deepEqual(Object.keys(mod).sort(), ["isDeferredNoEmail", "isRemoteLocation", "isUsableEmail"]);
});

const facts = (o: Partial<ProvinceFacts>): ProvinceFacts => ({
  province: "BC", activeRun: false, latestRun: { status: "COMPLETED", verdict: "OK", errorCode: null }, staged: 200, duplicates: 0, unclassified: 0, withPoint: 200, verified: 100, review: 0, excluded: 100,
  importFailed: 0, approvedNotImported: 0, awaitingQualification: 0, inImportScope: true, ...o,
});

test("rollout completion: once deferred no-email candidates are excluded from the pending count, the province is DONE and the rollout finishes", () => {
  // The facts builder subtracts deferred candidates; with nothing else pending the province is DONE (it does not wait forever on them).
  assert.deepEqual(provinceStep(facts({ approvedNotImported: 0 })), { kind: "DONE" });
  assert.deepEqual(provinceStep(facts({ approvedNotImported: 3 })), { kind: "IMPORTING" }, "importable work still keeps it open");
  const plan = planRollout([facts({ province: "BC" }), facts({ province: "ON", existing: true })], 0);
  assert.equal(plan.finished, true);
  assert.equal(planRollout([facts({ province: "BC" })], 2).finished, false, "an emailed prospect still unassigned keeps it open");
});
