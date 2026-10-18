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
  // automated evidence: supported but inert until the owner activates the policy for this exact version; re-checked against the actual recipient and message at EVERY send
  const auto = { active: true, ruleVersion: "casl-auto-v3" };
  const msg = { topic: "SHOP_MANAGEMENT_SOFTWARE", recipientEmail: "info@shop.example" };
  const sup = (kind: BasisRow["kind"], o: Partial<BasisRow> = {}) => row(kind, "AUTO_SUPPORTED", { ruleVersion: "casl-auto-v3", caslAssessmentId: "assess-1", capturedAt: new Date("2026-10-10T00:00:00Z"), assessedEmail: "info@shop.example", relevanceTopics: ["SHOP_MANAGEMENT_SOFTWARE"], ...o });
  for (const kind of AUTOMATION_BASIS_KINDS) {
    const r = sup(kind);
    assert.deepEqual(evaluateAutomationBasis([r], NOW, undefined, msg), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: policy off`);
    assert.equal(evaluateAutomationBasis([r], NOW, auto, msg).valid, true, `${kind}: policy on`);
    assert.deepEqual(evaluateAutomationBasis([r], NOW, { active: true, ruleVersion: "casl-auto-v1" }, msg), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: other version`);
    assert.deepEqual(evaluateAutomationBasis([sup(kind, { ruleVersion: null })], NOW, auto, msg), { valid: false, reason: "POLICY_NOT_ACTIVATED" }, `${kind}: no stored version`);
  }
  // per-send re-check: freshness (30 days from the observation), the exact address, the message subject — each fails closed
  const day = 86_400_000;
  assert.equal(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { capturedAt: new Date(NOW.getTime() - 29 * day) })], NOW, auto, msg).valid, true);
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { capturedAt: new Date(NOW.getTime() - 31 * day) })], NOW, auto, msg), { valid: false, reason: "EVIDENCE_STALE" }, "older than 30 days: stale even if expiresAt is null/far");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { capturedAt: null })], NOW, auto, msg), { valid: false, reason: "EVIDENCE_STALE" }, "no observation time: fails closed");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { capturedAt: new Date(NOW.getTime() + 2 * day) })], NOW, auto, msg), { valid: false, reason: "EVIDENCE_STALE" }, "an observation from the future is not evidence");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto, { ...msg, recipientEmail: "other@shop.example" }), { valid: false, reason: "RECIPIENT_CHANGED" }, "the contact's address was edited after the assessment");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { assessedEmail: null })], NOW, auto, msg), { valid: false, reason: "RECIPIENT_CHANGED" });
  assert.equal(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto, { ...msg, recipientEmail: "INFO@Shop.Example " }).valid, true, "address comparison ignores case and whitespace");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto, { ...msg, topic: "SOMETHING_ELSE" }), { valid: false, reason: "MESSAGE_NOT_COVERED" });
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto, { ...msg, topic: null }), { valid: false, reason: "MESSAGE_NOT_COVERED" }, "an undeclared message subject is not covered");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto), { valid: false, reason: "RECIPIENT_CHANGED" }, "no message facts at all: fails closed");
  assert.deepEqual(evaluateAutomationBasis([sup("IMPLIED_PUBLISHED_ADDRESS", { relevanceTopics: [] })], NOW, auto, msg), { valid: false, reason: "MESSAGE_NOT_COVERED" });
  // a basis a PERSON recorded with complete structured evidence (no engine assessment) keeps the activation/version gate only — the engine's per-send checks do not apply to it
  const human = row("EXPRESS_CONSENT", "AUTO_SUPPORTED", { ruleVersion: "casl-auto-v3" });
  assert.equal(evaluateAutomationBasis([human], NOW, auto).valid, true);
  assert.deepEqual(evaluateAutomationBasis([human], NOW), { valid: false, reason: "POLICY_NOT_ACTIVATED" });
  // historic human decisions are not subject to the automated re-checks (history is honoured, never rewritten)
  assert.equal(evaluateAutomationBasis([row("IMPLIED_PUBLISHED_ADDRESS", "APPROVED")], NOW, auto).valid, true);
  for (const kind of ["EXEMPT", "IMPLIED_EXISTING_RELATIONSHIP"] as const) assert.deepEqual(evaluateAutomationBasis([sup(kind)], NOW, auto, msg), { valid: false, reason: "KIND_NOT_ALLOWED" }, `${kind} never enters automation`);
  assert.equal(evaluateBasisForOrigin("MANUAL", [sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, undefined, msg).valid, false, "manual sends obey the same activation gate");
  assert.equal(evaluateBasisForOrigin("MANUAL", [sup("IMPLIED_PUBLISHED_ADDRESS")], NOW, auto).valid, false, "a person's own message declares no subject, so an automated basis does not cover it");
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
