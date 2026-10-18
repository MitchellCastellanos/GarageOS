// PR-A: contact-level readiness (pure). READY means "could be enrolled today"; seller/sender/capacity conditions never decide it. Nothing here touches a database.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateSendingBasis, evaluateAutomationBasis } from "../src/domain/sales-comms/casl";
import { evaluateOutreachEligibility, readinessOf, type OutreachContactFacts, type OutreachFacts } from "../src/domain/lead-radar/outreach";
import { campaignDefaultFor, resolveEffectiveLanguage, territoryDefaultLanguage } from "../src/domain/sales-crm/language";

const T0 = new Date("2026-03-01T12:00:00Z");
const row = (o: Record<string, unknown> = {}) => ({ kind: "IMPLIED_PUBLISHED_ADDRESS" as const, evidence: "Published on the shop's contact page, no do-not-solicit notice", recordedAt: new Date("2026-02-01"), expiresAt: null, revokedAt: null, reviewStatus: "APPROVED" as const, ...o });
const auto = { active: true, ruleVersion: "casl-auto-v1" };
const approved = evaluateAutomationBasis([row()], T0);
const contact = (o: Partial<OutreachContactFacts> = {}): OutreachContactFacts => ({ id: "c1", email: "info@garage.ca", doNotContact: false, archived: false, isPrimary: true, language: "UNKNOWN", basis: approved, suppression: null, duplicateAddress: false, ...o });
const facts = (o: { prospect?: Partial<OutreachFacts["prospect"]>; contacts?: OutreachContactFacts[]; seller?: OutreachFacts["seller"]; sender?: OutreachFacts["sender"] } = {}): OutreachFacts => ({
  prospect: { archived: false, doNotContact: false, ownerStaffId: null, language: "UNKNOWN", opportunityClosed: false, fieldHeldColdContact: false, repairFit: "VERIFIED_REPAIR", territory: "NATIONAL", defaultLanguage: "EN", ...o.prospect },
  seller: o.seller === undefined ? null : o.seller, sender: o.sender === undefined ? null : o.sender, contacts: o.contacts ?? [contact()],
});
const ready = (f: OutreachFacts) => readinessOf(evaluateOutreachEligibility(f).reasons);

test("READY needs no seller, sender or capacity: an unowned prospect with an approved basis is READY, yet the pilot decision stays NOT_ELIGIBLE", () => {
  const r = evaluateOutreachEligibility(facts());
  assert.equal(r.decision, "NOT_ELIGIBLE");
  assert.ok(r.reasons.includes("NO_OWNER"));
  assert.equal(readinessOf(r.reasons), "READY");
  const owned = evaluateOutreachEligibility(facts({ prospect: { ownerStaffId: "s1" }, seller: { staffActive: true, bookingEnabled: true }, sender: { active: true, domainApproved: true, replyPathVerified: true } }));
  assert.deepEqual([owned.decision, readinessOf(owned.reasons)], ["ELIGIBLE", "READY"]);
  const noSender = evaluateOutreachEligibility(facts({ prospect: { ownerStaffId: "s1" }, seller: { staffActive: true, bookingEnabled: true }, sender: null }));
  assert.deepEqual([noSender.decision, readinessOf(noSender.reasons)], ["NOT_ELIGIBLE", "READY"]);
});

test("only a verified independent repair shop is READY", () => {
  for (const fit of ["HUMAN_REVIEW", "EXCLUDED", null] as const) {
    const f = facts({ prospect: { repairFit: fit } });
    assert.ok(evaluateOutreachEligibility(f).reasons.includes("NOT_VERIFIED_REPAIR"));
    assert.equal(ready(f), "INELIGIBLE");
  }
});

test("territory gate is explicit: LOCAL (FIELD), UNRESOLVED (e.g. Québec with no city/postal) and never-computed are never READY", () => {
  for (const t of ["LOCAL", "UNRESOLVED", null] as const) {
    const f = facts({ prospect: { territory: t } });
    assert.ok(evaluateOutreachEligibility(f).reasons.includes("TERRITORY_NOT_REMOTE"), String(t));
    assert.equal(ready(f), "INELIGIBLE");
  }
  assert.equal(ready(facts({ prospect: { territory: "NATIONAL" } })), "READY");
});

test("one address is one recipient: a duplicate address is INELIGIBLE and an alternative non-duplicate contact is preferred", () => {
  const dup = facts({ contacts: [contact({ duplicateAddress: true })] });
  assert.ok(evaluateOutreachEligibility(dup).reasons.includes("DUPLICATE_ADDRESS"));
  assert.equal(ready(dup), "INELIGIBLE");
  const two = evaluateOutreachEligibility(facts({ contacts: [contact({ id: "a", isPrimary: true, duplicateAddress: true }), contact({ id: "b", email: "x@garage.ca", isPrimary: false })] }));
  assert.deepEqual([two.contactId, two.reasons.includes("DUPLICATE_ADDRESS")], ["b", false]);
});

test("CASL: only an independently APPROVED allow-listed basis reaches READY; pending/unreviewed/expired/missing never do", () => {
  const st = (rows: ReturnType<typeof row>[]) => ready(facts({ contacts: [contact({ basis: evaluateAutomationBasis(rows, T0) })] }));
  assert.equal(st([]), "PENDING_EVIDENCE");
  assert.equal(st([row({ expiresAt: new Date("2026-02-15") })]), "PENDING_EVIDENCE");
  assert.equal(st([row({ evidence: "short" })]), "PENDING_EVIDENCE");
  assert.equal(st([row({ reviewStatus: "PENDING_REVIEW" })]), "PENDING_EVIDENCE", "there is no review lane: a never-approved row waits for automated evidence");
  assert.equal(st([row({ reviewStatus: "LEGACY_UNREVIEWED" })]), "PENDING_EVIDENCE");
  assert.equal(st([row({ reviewStatus: "REJECTED" })]), "INELIGIBLE");
  assert.equal(st([row({ revokedAt: new Date("2026-02-20") })]), "INELIGIBLE");
  assert.equal(st([row({ kind: "EXEMPT" })]), "INELIGIBLE");
  assert.equal(st([row({ kind: "EXISTING_RELATIONSHIP" })]), "INELIGIBLE");
  for (const kind of ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXPRESS_CONSENT"] as const) assert.equal(st([row({ kind })]), "READY", kind);
  // Automated evidence: classified EVIDENCE_SUPPORTED while the owner has not activated the policy, READY only once it is — never before.
  const supported = [row({ reviewStatus: "AUTO_SUPPORTED", ruleVersion: "casl-auto-v1" })];
  assert.equal(ready(facts({ contacts: [contact({ basis: evaluateAutomationBasis(supported, T0) })] })), "EVIDENCE_SUPPORTED");
  assert.equal(ready(facts({ contacts: [contact({ basis: evaluateAutomationBasis(supported, T0, auto) })] })), "READY");
  assert.equal(ready(facts({ contacts: [contact({ basis: evaluateAutomationBasis(supported, T0, { active: true, ruleVersion: "casl-auto-v0" }) })] })), "EVIDENCE_SUPPORTED", "another version's activation does not carry over");
  // supported evidence never overrides a structural or suppression disqualifier
  assert.equal(ready(facts({ prospect: { territory: "LOCAL" }, contacts: [contact({ basis: evaluateAutomationBasis(supported, T0) })] })), "INELIGIBLE");
  assert.equal(ready(facts({ contacts: [contact({ suppression: "UNSUBSCRIBE", basis: evaluateAutomationBasis(supported, T0, auto) })] })), "SUPPRESSED");
  const none = evaluateOutreachEligibility(facts({ contacts: [contact({ basis: evaluateAutomationBasis(supported, T0) })] }));
  assert.deepEqual(none.reasons, ["NO_OWNER", "AUTO_POLICY_NOT_ACTIVATED"]);
  assert.equal(none.decision, "NOT_ELIGIBLE", "evidence-supported is never pilot-eligible while the policy is off");
  // The long-standing evaluator is untouched (it still honours the legacy kinds); the automation gate is what excludes them.
  assert.equal(evaluateSendingBasis([row({ kind: "EXEMPT", reviewStatus: "NOT_REQUIRED" })], T0).valid, true);
});

test("a BLOCKED automated assessment makes the address INELIGIBLE and cannot be outvoted by any other evidence", () => {
  const blocked = evaluateOutreachEligibility(facts({ contacts: [contact({ evidenceBlocked: true })] }));
  assert.ok(blocked.reasons.includes("CASL_EVIDENCE_BLOCKED"));
  assert.equal(readinessOf(blocked.reasons), "INELIGIBLE");
  assert.equal(ready(facts({ contacts: [contact({ evidenceBlocked: true, basis: evaluateAutomationBasis([row({ reviewStatus: "AUTO_SUPPORTED", ruleVersion: "casl-auto-v1" })], T0, auto) })] })), "INELIGIBLE");
  assert.equal(ready(facts({ contacts: [contact({ evidenceBlocked: true, suppression: "UNSUBSCRIBE" })] })), "SUPPRESSED", "a suppression still shows as the stronger state");
});

test("suppression always shows as SUPPRESSED, ahead of every other state", () => {
  for (const s of ["UNSUBSCRIBE", "HARD_BOUNCE", "COMPLAINT", "MANUAL", "REPLY_OPT_OUT"] as const) assert.equal(ready(facts({ contacts: [contact({ suppression: s })] })), "SUPPRESSED", s);
  assert.equal(ready(facts({ contacts: [contact({ doNotContact: true })] })), "SUPPRESSED");
  assert.equal(ready(facts({ prospect: { doNotContact: true } })), "SUPPRESSED");
  assert.equal(ready(facts({ prospect: { territory: "LOCAL", doNotContact: true } })), "SUPPRESSED");
  assert.equal(ready(facts({ contacts: [contact({ suppression: "UNSUBSCRIBE", basis: evaluateAutomationBasis([], T0) })] })), "SUPPRESSED");
});

test("no contact yet: INELIGIBLE, or PENDING_EVIDENCE while a discovered address is waiting", () => {
  const r = evaluateOutreachEligibility(facts({ contacts: [] })).reasons;
  assert.equal(readinessOf(r), "INELIGIBLE");
  assert.equal(readinessOf(r, { pendingDiscovery: true }), "PENDING_EVIDENCE");
  assert.equal(readinessOf(evaluateOutreachEligibility(facts({ contacts: [], prospect: { territory: "LOCAL" } })).reasons, { pendingDiscovery: true }), "INELIGIBLE");
  assert.equal(readinessOf(["ARCHIVED" as never]), "PENDING_EVIDENCE", "an unknown reason is never silently READY");
});

test("campaign language is a deterministic territory default: Québec → FR, rest of Canada → EN, explicit choices win, no detection", () => {
  assert.equal(territoryDefaultLanguage({ province: "QC" }), "FR");
  assert.equal(territoryDefaultLanguage({ province: "Québec" }), "FR");
  assert.equal(territoryDefaultLanguage({ province: "ON" }), "EN");
  assert.equal(territoryDefaultLanguage({ province: "BC", postalCode: "H2X 1Y4" }), "EN", "province wins over postal letter");
  assert.equal(territoryDefaultLanguage({ province: null, postalCode: "G1R 5T8" }), "FR");
  assert.equal(territoryDefaultLanguage({ province: null, postalCode: "T2P 1J9" }), "EN");
  assert.equal(territoryDefaultLanguage({}), "UNKNOWN");
  assert.equal(campaignDefaultFor({ territoryState: "LOCAL", province: "QC" }), null);
  assert.equal(campaignDefaultFor({ territoryState: "UNRESOLVED", province: "QC" }), null);
  assert.equal(campaignDefaultFor({ territoryState: null, province: "QC" }), null);
  assert.equal(campaignDefaultFor({ territoryState: "NATIONAL", province: "QC" }), "FR");
  // resolver precedence
  const r = (o: Parameters<typeof resolveEffectiveLanguage>[0]) => resolveEffectiveLanguage(o);
  assert.deepEqual([r({ prospect: "UNKNOWN", territoryDefault: "FR" }).language, r({ prospect: "UNKNOWN", territoryDefault: "FR" }).source], ["FR", "territory"]);
  assert.equal(r({ prospect: "EN", territoryDefault: "FR" }).language, "EN");
  assert.equal(r({ contact: "FR", prospect: "EN", territoryDefault: "EN" }).language, "FR");
  assert.equal(r({ prospect: "UNKNOWN" }).needsHumanDecision, true, "without a default it still asks a human");
  // eligibility uses the default only when nothing explicit exists
  assert.equal(evaluateOutreachEligibility(facts({ prospect: { defaultLanguage: "UNKNOWN" } })).reasons.includes("LANGUAGE_UNRESOLVED"), true);
  assert.equal(evaluateOutreachEligibility(facts({ prospect: { defaultLanguage: "FR" } })).reasons.includes("LANGUAGE_UNRESOLVED"), false);
});

test("deterministic: the same facts always give the same decision and state", () => {
  const f = facts({ contacts: [contact({ id: "z" }), contact({ id: "a", email: "b@garage.ca", isPrimary: false })] });
  const a = evaluateOutreachEligibility(f), b = evaluateOutreachEligibility(structuredClone(f));
  assert.deepEqual(a, b);
  assert.equal(readinessOf(a.reasons), readinessOf(b.reasons));
});

test("the production readiness SQL is one read-only SELECT with aggregate output only", () => {
  const raw = readFileSync(new URL("../docs/operations/ready-pool-readiness.sql", import.meta.url), "utf8");
  const code = raw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(code.trim(), /^BEGIN READ ONLY;/);
  assert.match(code.trim(), /ROLLBACK;$/);
  assert.equal((code.match(/;/g) ?? []).length, 3, "BEGIN; one statement; ROLLBACK;");
  assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REINDEX|LOCK|SET|NOTIFY)\b/i);
  assert.doesNotMatch(code, /\bFOR\s+(UPDATE|SHARE)\b/i);
  // The final output is metric / k / n only: no address column is ever selected as a key.
  assert.doesNotMatch(code, /SELECT\s+'[a-z_]+'\s*,\s*"?(emailNormalized|email|phone|name)"?\s*,/i);
  assert.doesNotMatch(raw, /postgres(ql)?:\/\//i, "no connection string in the file");
});
