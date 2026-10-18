// Policy v2 alignment — Québec French, per-send policy checks and the call-site guarantees that every send re-checks. Pure/static (the DB flows are in casl-evidence-db.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateSendPolicy, type SendPolicyInput } from "../src/domain/sales-comms/casl";
import { isQuebecRecipient } from "../src/domain/sales-crm/language";
import { BUILTIN_TEMPLATES, COMMERCIAL_TEMPLATE_KEYS } from "../src/domain/sales-comms/templates";

await import("./helpers/action-harness");
const { footerLinesFor } = await import("../src/lib/sales-comms/content");

const base = (o: Partial<SendPolicyInput> = {}): SendPolicyInput => ({
  category: "COMMERCIAL", settingsSendingEnabled: true, origin: "AUTOMATED", originEnabled: true, identityActive: true, staffActive: true, fromDomainApproved: true,
  recipients: [{ email: "info@shop.example", valid: true, suppression: null }], prospect: { doNotContact: false, archived: false }, contact: { doNotContact: false },
  basis: { valid: true, kind: "IMPLIED_PUBLISHED_ADDRESS", expiresAt: null }, languageResolved: true, sentToday: 0, dailyLimit: 10, commercialFooterConfigured: true, ...o,
});

test("QUÉBEC — an automated commercial message to a Québec business must be in French; anything else is refused before it can leave", () => {
  const qc = { quebecRecipient: true };
  assert.deepEqual(evaluateSendPolicy(base({ ...qc, messageLanguage: "EN" })), { allowed: false, code: "QUEBEC_FRENCH_REQUIRED" });
  assert.deepEqual(evaluateSendPolicy(base({ ...qc, messageLanguage: null })), { allowed: false, code: "QUEBEC_FRENCH_REQUIRED" }, "unknown language fails closed");
  assert.deepEqual(evaluateSendPolicy(base({ ...qc })), { allowed: false, code: "QUEBEC_FRENCH_REQUIRED" }, "language not supplied fails closed");
  assert.deepEqual(evaluateSendPolicy(base({ ...qc, messageLanguage: "FR" })), { allowed: true });
  // outside Québec the language is the recipient's/territory's business, not this rule
  assert.deepEqual(evaluateSendPolicy(base({ quebecRecipient: false, messageLanguage: "EN" })), { allowed: true });
  // a person's own manual email, a reply and transactional mail are not constrained by the automated-French rule
  assert.deepEqual(evaluateSendPolicy(base({ ...qc, origin: "MANUAL", messageLanguage: "EN" })), { allowed: true });
  assert.deepEqual(evaluateSendPolicy(base({ ...qc, category: "REPLY", messageLanguage: "EN" })), { allowed: true });
});

test("QUÉBEC — recipient detection: province wins; with no province a Québec postal area (G/H/J) decides; unknown is not Québec (and never enters REMOTE anyway)", () => {
  for (const p of ["QC", "qc", "Quebec", "Québec"]) assert.equal(isQuebecRecipient({ province: p }), true, p);
  assert.equal(isQuebecRecipient({ province: "ON", postalCode: "H2X 3K4" }), false, "province wins over the postal area");
  assert.equal(isQuebecRecipient({ province: null, postalCode: "H2X 3K4" }), true);
  assert.equal(isQuebecRecipient({ province: null, postalCode: "G1A 1A1" }), true);
  assert.equal(isQuebecRecipient({ province: null, postalCode: "M5V 2T6" }), false);
  assert.equal(isQuebecRecipient({}), false);
});

test("QUÉBEC — every built-in COMMERCIAL French template is written in French end to end (no English sentence), and the French footer carries identification + unsubscribe wording", () => {
  const EN_WORDS = /\b(the|and|your|you|please|thank|thanks|shop|shops|hello|hi|schedule|appointment|reminder|unsubscribe|following|follow-up|quote|invoice|invoices|free|demo call|let me know)\b/i;
  const fr = BUILTIN_TEMPLATES.filter((t) => t.language === "FR" && COMMERCIAL_TEMPLATE_KEYS.includes(t.key));
  assert.ok(fr.length >= 7, "all commercial keys have a French version");
  assert.deepEqual([...new Set(fr.map((t) => t.key))].sort(), [...COMMERCIAL_TEMPLATE_KEYS].sort());
  for (const t of fr) {
    const text = `${t.subject}\n${t.body.replace(/\{\{[^}]+\}\}/g, " ")}`;
    // "GarageOS" and other product/brand names are not English sentences; strip them before the check
    const stripped = text.replace(/GarageOS|Calendly|Google|Meet|Zoom/g, " ");
    assert.ok(!EN_WORDS.test(stripped), `${t.key}: English wording leaked into the French template: ${EN_WORDS.exec(stripped)?.[0]}`);
    assert.match(text, /[éèàçêôû]/, `${t.key}: French diacritics present`);
  }
  const s = { legalName: "GarageOS inc.", mailingAddress: "1 Rue Exemple, Montréal QC", contactEmail: "bonjour@garage-os.ca", contactPhone: "514-555-0000", websiteUrl: "https://www.garage-os.ca" };
  const footer = footerLinesFor(s, "FR", true).join("\n");
  assert.match(footer, /GarageOS inc\./); assert.match(footer, /Montréal/); assert.match(footer, /désabonner/);
  assert.ok(!/unsubscribe|You are receiving/i.test(footer), "no English in the French footer");
});

test("PER-SEND RE-CHECK — every path that sends re-evaluates the basis with the ACTUAL recipient and message topic, and the language of the message", () => {
  const dispatcher = readFileSync("src/lib/sales-comms/dispatcher.ts", "utf8");
  const sequences = readFileSync("src/lib/sales-comms/sequences.ts", "utf8");
  const policy = readFileSync("src/lib/sales-comms/policy.ts", "utf8");
  const eligibility = readFileSync("src/lib/lead-radar/eligibility.ts", "utf8");
  assert.match(dispatcher, /evaluateAutomationBasis\(bases, now, await loadAutoCaslPolicy\(\), \{ topic: CAMPAIGN_TOPIC, recipientEmail: e\.contact\.emailNormalized \}\)/);
  assert.match(sequences, /evaluateAutomationBasis\(bases, now, autoPolicy, \{ topic: CAMPAIGN_TOPIC, recipientEmail: email \}\)/);
  assert.match(eligibility, /recipientEmail: c\.emailNormalized/);
  assert.match(policy, /evaluateBasisForOrigin\(t\.origin, bases, now, await loadAutoCaslPolicy\(\), \{ topic:/);
  assert.match(policy, /quebecRecipient: !!prospect && isQuebecRecipient\(prospect\)/);
  assert.match(dispatcher, /origin: sendOriginOf\(msg\), language: msg\.language/);
  assert.match(sequences, /origin: "AUTOMATED", language: tl/);
  // the dispatcher evaluates the policy at the moment of every attempt (not at enqueue time only)
  assert.ok(dispatcher.indexOf("evaluatePolicy({") > dispatcher.indexOf("decideStop({"), "stop rules and the full policy both run per attempt");
});
