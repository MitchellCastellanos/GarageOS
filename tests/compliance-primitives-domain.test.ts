// PR-1 compliance primitives — pure rules (no database). Product controls, not legal advice.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AUTOMATION_BASIS_KINDS, evaluateAutomationBasis, evaluateBasisForOrigin, evaluateSendingBasis, type BasisRow } from "../src/domain/sales-comms/casl";
import * as evidenceRules from "../src/domain/sales-crm/casl-evidence";
import { BASIS_KINDS, requiresStructuredEvidence } from "../src/domain/sales-crm/casl-evidence";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { greetingFor } from "../src/domain/sales-comms/templates";

await import("./helpers/action-harness"); // lets lib modules that import `server-only` load under node:test (dynamic import: the hook must exist before they are linked)
const { firstNameOf, isPlaceholderContactName, baseVars } = await import("../src/lib/sales-comms/templates");

const NOW = new Date("2026-10-19T15:00:00Z");
const row = (kind: BasisRow["kind"], reviewStatus: BasisRow["reviewStatus"], o: Partial<BasisRow> = {}): BasisRow => ({ kind, evidence: "Structured evidence on file", recordedAt: new Date("2026-10-01T00:00:00Z"), expiresAt: null, revokedAt: null, reviewStatus, ...o });

test("automation reading: only an allowed kind with a decided basis (a historic APPROVED row, or AUTO_SUPPORTED under the activated policy) can authorise a system-originated send", () => {
  for (const kind of AUTOMATION_BASIS_KINDS) assert.equal(evaluateAutomationBasis([row(kind, "APPROVED")], NOW).valid, true, `${kind} approved`);
  assert.deepEqual([...AUTOMATION_BASIS_KINDS].sort(), ["EXPRESS_CONSENT", "IMPLIED_DISCLOSED_ADDRESS", "IMPLIED_PUBLISHED_ADDRESS"]);
  // never for these kinds, even approved
  for (const kind of ["EXEMPT", "IMPLIED_EXISTING_RELATIONSHIP"] as const) assert.deepEqual(evaluateAutomationBasis([row(kind, "APPROVED")], NOW), { valid: false, reason: "KIND_NOT_ALLOWED" }, kind);
  // automated evidence: supported but inert until the owner activates the policy for this exact version
  const auto = { active: true, ruleVersion: "casl-auto-v1" };
  for (const kind of AUTOMATION_BASIS_KINDS) {
    const r = row(kind, "AUTO_SUPPORTED", { ruleVersion: "casl-auto-v1" });
    assert.deepEqual(evaluateAutomationBasis([r], NOW), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: policy off`);
    assert.equal(evaluateAutomationBasis([r], NOW, auto).valid, true, `${kind}: policy on`);
    assert.deepEqual(evaluateAutomationBasis([r], NOW, { active: true, ruleVersion: "casl-auto-v2" }), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: other version`);
    assert.deepEqual(evaluateAutomationBasis([row(kind, "AUTO_SUPPORTED")], NOW, auto), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: no stored version`);
  }
  for (const kind of ["EXEMPT", "IMPLIED_EXISTING_RELATIONSHIP"] as const) assert.deepEqual(evaluateAutomationBasis([row(kind, "AUTO_SUPPORTED", { ruleVersion: "casl-auto-v1" })], NOW, auto), { valid: false, reason: "KIND_NOT_ALLOWED" }, `${kind} never enters automation`);
  assert.equal(evaluateBasisForOrigin("MANUAL", [row("IMPLIED_PUBLISHED_ADDRESS", "AUTO_SUPPORTED", { ruleVersion: "casl-auto-v1" })], NOW).valid, false, "manual sends obey the same activation gate");
  // unreviewed shapes never: legacy (null), NOT_REQUIRED, LEGACY_UNREVIEWED, pending, rejected
  for (const rs of [null, "NOT_REQUIRED", "LEGACY_UNREVIEWED"] as const) assert.deepEqual(evaluateAutomationBasis([row("EXPRESS_CONSENT", rs)], NOW), { valid: false, reason: "UNREVIEWED" }, String(rs));
  assert.deepEqual(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "PENDING_REVIEW")], NOW), { valid: false, reason: "PENDING_REVIEW" });
  assert.deepEqual(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "REJECTED")], NOW), { valid: false, reason: "REJECTED_EVIDENCE" });
  // the stricter reading never overrides the base rules: expiry, revocation, thin evidence, none
  assert.equal(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "APPROVED", { expiresAt: new Date("2026-10-18T00:00:00Z") })], NOW).valid, false);
  assert.equal(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "APPROVED", { revokedAt: new Date("2026-10-10T00:00:00Z") })], NOW).valid, false);
  assert.equal(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "APPROVED", { evidence: "short" })], NOW).valid, false);
  assert.deepEqual(evaluateAutomationBasis([], NOW), { valid: false, reason: "NONE" });
  // newest row decides: a newer unreviewed row shadows an older approved one
  assert.equal(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "APPROVED"), row("EXPRESS_CONSENT", "NOT_REQUIRED", { recordedAt: new Date("2026-10-05T00:00:00Z") })], NOW).valid, false);
});

test("history is preserved: legacy and NOT_REQUIRED rows keep working for a person's own manual email, exactly as before", () => {
  for (const [kind, rs] of [["EXPRESS_CONSENT", "NOT_REQUIRED"], ["IMPLIED_PUBLISHED_ADDRESS", null], ["EXEMPT", "NOT_REQUIRED"], ["IMPLIED_EXISTING_RELATIONSHIP", "NOT_REQUIRED"]] as const) {
    assert.equal(evaluateSendingBasis([row(kind, rs)], NOW).valid, true, `${kind}/${rs} manual`);
    assert.equal(evaluateBasisForOrigin("MANUAL", [row(kind, rs)], NOW).valid, true);
    assert.equal(evaluateBasisForOrigin("TRANSACTIONAL", [row(kind, rs)], NOW).valid, true);
    assert.equal(evaluateBasisForOrigin("AUTOMATED", [row(kind, rs)], NOW).valid, false, `${kind}/${rs} automated`);
  }
  // an unreviewed legacy-unreviewed address row is still invalid for everyone (unchanged)
  assert.equal(evaluateSendingBasis([row("IMPLIED_PUBLISHED_ADDRESS", "LEGACY_UNREVIEWED")], NOW).valid, false);
});

test("every kind a person can record requires structured evidence, decided by rule; there is no reviewer, no self-review rule and no same-person rule", () => {
  for (const k of BASIS_KINDS) assert.equal(requiresStructuredEvidence(k), true, k);
  for (const gone of ["APPROVAL_REQUIRED_KINDS", "ALLOW_SUPER_ADMIN_SELF_REVIEW", "reviewAuthority", "canApproveEvidence", "canRejectEvidence", "requiresApproval"]) assert.equal(Object.keys(evidenceRules).includes(gone), false, gone);
  for (const kind of ["SUPER_ADMIN", "SALES_MANAGER", "SALES_REP"] as const) assert.equal((capabilitiesFor(kind) as ReadonlySet<string>).has("approve_casl_evidence"), false, kind);
});

test("tripwire: no application code writes an APPROVED evidence status any more; AUTO_SUPPORTED is written only by the evidence engine and by rule-checked manual recording", () => {
  const writers = (re: RegExp) => { const hits: string[] = []; const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && re.test(readFileSync(p, "utf8"))) hits.push(p.replace(/\\/g, "/")); } }; walk("src"); return hits.sort(); };
  assert.deepEqual(writers(/reviewStatus:\s*"APPROVED"/), ["src/lib/sales-crm/queues.ts"], "the queue pre-check only READS it: nothing writes APPROVED");
  assert.deepEqual(writers(/reviewStatus:\s*"AUTO_SUPPORTED"/), ["src/actions/sales-inbox.ts", "src/lib/lead-radar/casl-evidence.ts"]);
  assert.equal(existsSync("src/actions/sales-casl.ts"), false);
  assert.equal(existsSync("src/actions/sales-person.ts"), false);
  assert.equal(existsSync("src/lib/sales-crm/person.ts"), false);
});

test("greeting: a stand-in contact name never becomes 'Hi Business,' / 'Bonjour General,'", () => {
  for (const n of ["Business contact", "General contact", "general  contact", "Contact général", "Info", "Reception", "Équipe", "Owner"]) {
    assert.equal(isPlaceholderContactName(n), true, n);
    assert.equal(firstNameOf(n), null, n);
  }
  assert.equal(baseVars({ language: "EN", contactName: "General contact", prospectName: "X", sellerName: "S", sellerTitle: null, bookingUrl: null }).greeting, "Hello,");
  assert.equal(baseVars({ language: "FR", contactName: "General contact", prospectName: "X", sellerName: "S", sellerTitle: null, bookingUrl: null }).greeting, "Bonjour,");
  assert.equal(baseVars({ language: "FR", contactName: "Business contact", prospectName: "X", sellerName: "S", sellerTitle: null, bookingUrl: null }).greeting, "Bonjour,");
  // real names are untouched, including a person whose first name happens to be a placeholder word
  assert.equal(firstNameOf("Marie Tremblay"), "Marie"); assert.equal(greetingFor("EN", firstNameOf("Marie Tremblay")), "Hi Marie,");
  assert.equal(firstNameOf("General Tso"), "General"); assert.equal(isPlaceholderContactName("General Tso"), false);
  assert.equal(firstNameOf(null), null); assert.equal(firstNameOf("  "), null);
});
