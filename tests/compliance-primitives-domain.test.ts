// PR-1 compliance primitives — pure rules (no database). Product controls, not legal advice.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AUTOMATION_BASIS_KINDS, evaluateAutomationBasis, evaluateBasisForOrigin, evaluateSendingBasis, type BasisRow } from "../src/domain/sales-comms/casl";
import { ALLOW_SUPER_ADMIN_SELF_REVIEW, APPROVAL_REQUIRED_KINDS, BASIS_KINDS, reviewAuthority } from "../src/domain/sales-crm/casl-evidence";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { greetingFor } from "../src/domain/sales-comms/templates";

await import("./helpers/action-harness"); // lets lib modules that import `server-only` load under node:test (dynamic import: the hook must exist before they are linked)
const { firstNameOf, isPlaceholderContactName, baseVars } = await import("../src/lib/sales-comms/templates");

const NOW = new Date("2026-10-19T15:00:00Z");
const row = (kind: BasisRow["kind"], reviewStatus: BasisRow["reviewStatus"], o: Partial<BasisRow> = {}): BasisRow => ({ kind, evidence: "Structured evidence on file", recordedAt: new Date("2026-10-01T00:00:00Z"), expiresAt: null, revokedAt: null, reviewStatus, ...o });

test("automation reading: only an allowed kind that an independent reviewer APPROVED can authorise a system-originated send", () => {
  for (const kind of AUTOMATION_BASIS_KINDS) assert.equal(evaluateAutomationBasis([row(kind, "APPROVED")], NOW).valid, true, `${kind} approved`);
  assert.deepEqual([...AUTOMATION_BASIS_KINDS].sort(), ["EXPRESS_CONSENT", "IMPLIED_DISCLOSED_ADDRESS", "IMPLIED_PUBLISHED_ADDRESS"]);
  // never for these kinds, even approved
  for (const kind of ["EXEMPT", "IMPLIED_EXISTING_RELATIONSHIP"] as const) assert.deepEqual(evaluateAutomationBasis([row(kind, "APPROVED")], NOW), { valid: false, reason: "KIND_NOT_ALLOWED" }, kind);
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

test("every kind a person can record now requires structured evidence and review; the Super Admin self-review exception is closed", () => {
  assert.deepEqual([...APPROVAL_REQUIRED_KINDS].sort(), [...BASIS_KINDS].sort());
  assert.equal(ALLOW_SUPER_ADMIN_SELF_REVIEW, false);
  const actor = (kind: "SUPER_ADMIN" | "SALES_MANAGER", userId: string, scope: string[] = []) => ({ userId, capabilities: capabilitiesFor(kind), all: kind === "SUPER_ADMIN", scopeStaffIds: scope });
  const pending = { reviewStatus: "PENDING_REVIEW", recordedByUserId: "rita" };
  assert.equal(reviewAuthority(actor("SUPER_ADMIN", "root"), pending, "s1").allowed, true);
  assert.deepEqual(reviewAuthority(actor("SUPER_ADMIN", "rita"), pending, "s1"), { allowed: false, code: "SELF_APPROVAL" });
  assert.deepEqual(reviewAuthority(actor("SUPER_ADMIN", "root"), pending, "s1", { recorderIsSamePerson: true }), { allowed: false, code: "SELF_APPROVAL" });
  assert.deepEqual(reviewAuthority(actor("SALES_MANAGER", "mgr", ["s1"]), pending, "s1", { recorderIsSamePerson: true }), { allowed: false, code: "SELF_APPROVAL" });
  assert.equal(reviewAuthority(actor("SALES_MANAGER", "mgr", ["s1"]), pending, "s1", { recorderIsSamePerson: false }).allowed, true);
  // a machine recorder is not any reviewer's "same person"; and a non-human principal has no review capability to begin with
  assert.equal(reviewAuthority(actor("SUPER_ADMIN", "root"), { reviewStatus: "PENDING_REVIEW", recordedByUserId: "system" }, "s1").allowed, true);
  assert.equal(reviewAuthority({ userId: "system", capabilities: new Set(), all: false, scopeStaffIds: [] }, pending, "s1").allowed, false);
});

test("nothing in the application writes an APPROVED evidence status except the human approval action (tripwire: a new writer must be reviewed here)", () => {
  const hits: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && /reviewStatus:\s*"APPROVED"/.test(readFileSync(p, "utf8"))) hits.push(p.replace(/\\/g, "/")); } };
  walk("src");
  assert.deepEqual(hits.sort(), ["src/actions/sales-casl.ts", "src/lib/sales-crm/queues.ts"], "writer: the approve action (human, capability-gated); reader: the queue pre-check");
  const act = readFileSync("src/actions/sales-casl.ts", "utf8");
  assert.match(act, /requireCrmActor\("approve_casl_evidence"\)/);
  assert.ok(!/system/.test(act.split("export async function approveSendingBasis")[1].split("export async function rejectSendingBasis")[0]), "no system/automation path inside the approve action");
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
