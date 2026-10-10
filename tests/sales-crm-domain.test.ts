import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedScopeWhere, canAccessAssignedStaff, canAccessDemoCreator, canAssignToStaff, capabilitiesFor, can, type PlatformSalesActor,
} from "../src/domain/sales-crm/access";
import { validateStageChange } from "../src/domain/sales-crm/pipeline";
import { resolveEffectiveLanguage } from "../src/domain/sales-crm/language";
import { computeFitScore, computeIntentScore, effectiveScore, recommendDemoFeatures, combineFactors } from "../src/domain/sales-crm/scoring";
import { cleanPhone, neutralizeFormula, parseCsv, toCsv, csvCell } from "../src/domain/sales-crm/csv";
import { normalizeBusinessName, phoneDigits, websiteDomain, normalizeWebsite } from "../src/domain/sales-crm/normalize";
import { fingerprintOf, parseProspectCsv, planImport, recordKeyOf } from "../src/domain/sales-crm/import";
import { activityInputSchema, contactInputSchema, needInputSchema, prospectInputSchema, scoreOverrideSchema, staffInputSchema, taskInputSchema } from "../src/domain/sales-crm/validation";
import { crmCopy } from "../src/lib/admin-locale/sales-crm";

function actor(over: Partial<PlatformSalesActor> & { kind: PlatformSalesActor["kind"] }): PlatformSalesActor {
  return {
    userId: "u", name: "N", staffId: "s1", capabilities: capabilitiesFor(over.kind), uiLocale: "en",
    scopeStaffIds: ["s1"], scopeUserIds: ["u"], all: over.kind === "SUPER_ADMIN", ...over,
  };
}
const rep = actor({ kind: "SALES_REP" });
const manager = actor({ kind: "SALES_MANAGER", staffId: "m1", scopeStaffIds: ["m1", "s1", "s2"], scopeUserIds: ["um", "u", "u2"] });
const admin = actor({ kind: "SUPER_ADMIN", staffId: null });

test("capabilities: reps cannot manage the team or see other books; Super Admin has everything; Agent 2/3 caps are declared, not granted to reps beyond send", () => {
  assert.ok(can(rep, "manage_prospects") && can(rep, "prepare_demo") && can(rep, "import_prospects"));
  for (const c of ["manage_team", "reassign_prospects", "read_team_prospects", "read_all_prospects", "manage_needs_taxonomy", "manage_sender_identities", "manage_playbooks", "manage_sequences"] as const) assert.equal(can(rep, c), false, c);
  assert.ok(can(manager, "reassign_prospects") && can(manager, "read_team_prospects") && can(manager, "view_team_reporting"));
  assert.equal(can(manager, "manage_team"), false);
  assert.equal(can(manager, "manage_needs_taxonomy"), false);
  assert.ok(can(admin, "manage_team") && can(admin, "manage_playbooks") && can(admin, "view_all_reporting"));
});

test("record scope: rep sees only own; manager sees team + unassigned pool; Super Admin sees all; unknown ids are out of scope", () => {
  assert.equal(canAccessAssignedStaff(rep, "s1"), true);
  assert.equal(canAccessAssignedStaff(rep, "s2"), false);
  assert.equal(canAccessAssignedStaff(rep, null), false, "reps never see the unassigned pool");
  assert.equal(canAccessAssignedStaff(manager, "s2"), true);
  assert.equal(canAccessAssignedStaff(manager, "s9"), false);
  assert.equal(canAccessAssignedStaff(manager, null), true);
  assert.equal(canAccessAssignedStaff(admin, "anything"), true);
  assert.deepEqual(assignedScopeWhere(admin), {});
  assert.deepEqual(assignedScopeWhere(rep), { OR: [{ assignedStaffId: { in: ["s1"] } }] });
  assert.deepEqual(assignedScopeWhere(manager), { OR: [{ assignedStaffId: { in: ["m1", "s1", "s2"] } }, { assignedStaffId: null }] });
  // A rep without a staff id (impossible in practice) matches nothing instead of everything.
  assert.deepEqual(assignedScopeWhere(actor({ kind: "SALES_REP", staffId: null, scopeStaffIds: [] })), { OR: [{ assignedStaffId: { in: [] } }] });
});

test("demo scope and assignment rules", () => {
  assert.equal(canAccessDemoCreator(rep, "u"), true);
  assert.equal(canAccessDemoCreator(rep, "u2"), false);
  assert.equal(canAccessDemoCreator(manager, "u2"), true);
  assert.equal(canAccessDemoCreator(admin, "whoever"), true);
  assert.equal(canAssignToStaff(rep, "s1"), true);
  assert.equal(canAssignToStaff(rep, "s2"), false);
  assert.equal(canAssignToStaff(rep, null), false);
  assert.equal(canAssignToStaff(manager, "s2"), true);
  assert.equal(canAssignToStaff(manager, "s9"), false);
  assert.equal(canAssignToStaff(manager, null), true);
  assert.equal(canAssignToStaff(admin, "s9"), true);
});

test("stage guardrails: WON is reserved, terminal is final, qualification needs contact + need, LOST needs a reason", () => {
  const base = { contactCount: 1, assessedNeedCount: 1 };
  const ok = (from: string, to: string, extra = {}) => validateStageChange({ from: from as never, to: to as never, ...base, ...extra });
  assert.deepEqual(ok("NEW", "CONTACTED"), { ok: true });
  assert.deepEqual(ok("NEW", "NEW"), { ok: false, error: "SAME_STAGE" });
  assert.deepEqual(ok("DECISION", "WON"), { ok: false, error: "WON_RESERVED" });
  assert.deepEqual(ok("NEW", "WON"), { ok: false, error: "WON_RESERVED" });
  for (const from of ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"]) assert.deepEqual(ok(from, "NEW"), { ok: false, error: "TERMINAL_LOCKED" });
  assert.deepEqual(ok("ENGAGED", "LOST"), { ok: false, error: "LOSS_REASON_REQUIRED" });
  assert.deepEqual(ok("ENGAGED", "LOST", { lossReason: "PRICE" }), { ok: true });
  assert.deepEqual(ok("ENGAGED", "UNQUALIFIED"), { ok: false, error: "NOTE_REQUIRED" });
  assert.deepEqual(ok("ENGAGED", "DO_NOT_CONTACT", { note: "  " }), { ok: false, error: "NOTE_REQUIRED" });
  assert.deepEqual(ok("ENGAGED", "DO_NOT_CONTACT", { note: "asked to stop" }), { ok: true });
  assert.deepEqual(validateStageChange({ from: "ENGAGED", to: "QUALIFIED", contactCount: 0, assessedNeedCount: 1 }), { ok: false, error: "QUALIFICATION_REQUIRES_CONTACT" });
  assert.deepEqual(validateStageChange({ from: "ENGAGED", to: "DEMO_SCHEDULED", contactCount: 1, assessedNeedCount: 0 }), { ok: false, error: "QUALIFICATION_REQUIRES_NEED" });
  assert.deepEqual(validateStageChange({ from: "QUALIFIED", to: "CONTACTED", contactCount: 0, assessedNeedCount: 0 }), { ok: true }, "moving backwards is not gated");
});

test("language resolution: override > contact > prospect > UNKNOWN, never silently French", () => {
  assert.deepEqual(resolveEffectiveLanguage({ override: "EN", contact: "FR", prospect: "FR" }), { language: "EN", source: "override", needsHumanDecision: false });
  assert.deepEqual(resolveEffectiveLanguage({ contact: "EN", prospect: "FR" }), { language: "EN", source: "contact", needsHumanDecision: false });
  assert.deepEqual(resolveEffectiveLanguage({ contact: null, prospect: "FR" }), { language: "FR", source: "prospect", needsHumanDecision: false });
  assert.deepEqual(resolveEffectiveLanguage({ contact: "UNKNOWN", prospect: "EN" }).language, "EN");
  assert.deepEqual(resolveEffectiveLanguage({ prospect: "UNKNOWN" }), { language: "UNKNOWN", source: "unknown", needsHumanDecision: true });
});

test("fit score: missing data is excluded and lowers confidence; no data → no score (never a fabricated number)", () => {
  const empty = computeFitScore({ shopSize: null, industry: null, currentSoftware: null, preferredLanguage: "UNKNOWN", activeContactCount: 0, hasDecisionMaker: false, activeNeedWeights: [10, 10], needs: [] });
  assert.equal(empty.score, null, "only the (known-zero) decision-maker factor exists → below minimum confidence");
  const some = computeFitScore({ shopSize: "SMALL", industry: "GENERAL_REPAIR", currentSoftware: "paper", preferredLanguage: "FR", activeContactCount: 1, hasDecisionMaker: true, activeNeedWeights: [14, 12], needs: [] });
  assert.equal(some.score, 100, "all known factors are perfect; the unknown 'needs' factor is excluded, not zeroed");
  assert.ok(some.confidence < 1 && some.confidence > 0.5);
  assert.equal(some.factors.find((f) => f.key === "needs")?.value, null);
  const withNeeds = computeFitScore({ shopSize: "SMALL", industry: "GENERAL_REPAIR", currentSoftware: "Mitchell", preferredLanguage: "EN", activeContactCount: 1, hasDecisionMaker: false, activeNeedWeights: [14, 12],
    needs: [{ key: "booking_online", feature: "booking", weight: 14, severity: "HIGH", priority: "HIGH", basis: "CONFIRMED" }] });
  assert.ok(withNeeds.score !== null && withNeeds.score > 60 && withNeeds.score < 100);
  assert.equal(withNeeds.confidence, 1);
});

test("confirmed evidence outweighs inferred; severity NONE contributes nothing; recommendations are ranked from recorded needs only", () => {
  const confirmed = { key: "a", feature: "booking", weight: 10, severity: "HIGH" as const, priority: "HIGH" as const, basis: "CONFIRMED" as const };
  const inferred = { ...confirmed, key: "b", feature: "invoices", basis: "INFERRED" as const };
  const none = { ...confirmed, key: "c", feature: "dvi", severity: "NONE" as const };
  const rec = recommendDemoFeatures([inferred, none, confirmed]);
  assert.deepEqual(rec.map((r) => r.feature), ["booking", "invoices"]);
  assert.ok(rec[0].score > rec[1].score);
  assert.deepEqual(recommendDemoFeatures([]), []);
});

test("buying intent is independent of fit: stage + engagement + urgency + freshness, explainable factors", () => {
  const hot = computeIntentScore({ stage: "DEMO_COMPLETED", urgency: "HIGH", meaningfulTouches30d: 3, linkedDemoCount: 1, daysSinceLastActivity: 2 });
  const cold = computeIntentScore({ stage: "NEW", urgency: null, meaningfulTouches30d: 0, linkedDemoCount: 0, daysSinceLastActivity: null });
  assert.ok((hot.score ?? 0) > 80 && (cold.score ?? 100) < 20);
  assert.ok(hot.factors.every((f) => typeof f.weight === "number"));
  assert.equal(cold.factors.find((f) => f.key === "urgency")?.value, null);
  assert.deepEqual(effectiveScore(55, null), { value: 55, overridden: false });
  assert.deepEqual(effectiveScore(55, 10), { value: 10, overridden: true });
  assert.deepEqual(effectiveScore(null, 0), { value: 0, overridden: true }, "an override of 0 is a real override");
  assert.equal(combineFactors([]).score, null);
});

test("CSV reader: quotes, escaped quotes, CRLF, BOM, semicolon delimiter (Excel FR), unterminated quote rejected", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
  assert.deepEqual(parseCsv("nom;ville\nGarage A;Montréal\n"), [["nom", "ville"], ["Garage A", "Montréal"]]);
  assert.deepEqual(parseCsv("a,b\n\n\n1,2\n"), [["a", "b"], ["1", "2"]], "blank lines ignored");
  assert.throws(() => parseCsv('a,b\n"oops,2\n'), /CSV_UNTERMINATED_QUOTE/);
});

test("CSV injection: leading = + - @ TAB CR are neutralized on import and on export; phones keep their +", () => {
  for (const v of ["=HYPERLINK(\"http://x\")", "+cmd", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) assert.ok(neutralizeFormula(v).startsWith("'"), v);
  assert.equal(neutralizeFormula("Garage =A"), "Garage =A");
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(toCsv([["a", "=b"]]), "a,'=b\r\n");
  assert.equal(cleanPhone("+1 (514) 555-0100"), "+1 (514) 555-0100");
  assert.equal(cleanPhone("=cmd|' /C calc'!A0"), null);
});

test("normalization used for deduplication", () => {
  assert.equal(normalizeBusinessName("Garage Léo & Fils inc."), normalizeBusinessName("garage leo and fils"));
  assert.equal(phoneDigits("+1 (514) 555-0100"), "5145550100");
  assert.equal(phoneDigits("555-0100"), null);
  assert.equal(websiteDomain("https://www.Garage-Leo.ca/contact?x=1"), "garage-leo.ca");
  assert.equal(websiteDomain("javascript:alert(1)"), null);
  assert.equal(websiteDomain("not a url"), null);
  assert.equal(normalizeWebsite("garage.ca/a"), "https://garage.ca/a");
  assert.equal(normalizeWebsite("ftp://garage.ca"), null);
});

const HEADER = "name,city,phone,website,email,language,shop size,software,contact name,contact email,decision maker,do not contact";
test("import parser: bilingual headers, language/size mapping, unknown language stays UNKNOWN, contact + opt-out columns", () => {
  const csv = [HEADER,
    'Garage Leo,Laval,514-555-0100,garage-leo.ca,info@leo.ca,français,3,paper,Léo Tremblay,leo@leo.ca,oui,',
    "Atelier Nord,Québec,,,,martian,,,,,,yes",
    ",NoName,,,,,,,,,,",
  ].join("\n");
  const r = parseProspectCsv(csv);
  assert.equal(r.headerError, null);
  assert.equal(r.totalRows, 3);
  assert.equal(r.candidates.length, 2);
  const [a, b] = r.candidates;
  assert.equal(a.prospect.preferredLanguage, "FR");
  assert.equal(a.prospect.shopSize, "SMALL");
  assert.equal(a.contact?.isDecisionMaker, true);
  assert.equal(a.contact?.isPrimary, true);
  assert.equal(a.keys.websiteDomain, "garage-leo.ca");
  assert.equal(b.prospect.preferredLanguage, "UNKNOWN", "unrecognised language is never guessed");
  assert.equal(b.doNotContact, true, "opt-outs are imported as do-not-contact so they persist");
  assert.ok(r.issues.some((i) => i.code === "LANGUAGE_UNRECOGNIZED" && i.row === 3 && i.severity === "warning"));
  assert.ok(r.issues.some((i) => i.code === "MISSING_NAME" && i.row === 4 && i.severity === "error"));
});

test("import parser: header errors and formula neutralization inside imported cells", () => {
  assert.equal(parseProspectCsv("city\nLaval\n").headerError, "NO_NAME_COLUMN");
  assert.equal(parseProspectCsv("name\n").headerError, "EMPTY");
  const r = parseProspectCsv('nom,notes,phone,website\n"=cmd|calc",@evil,"=1+1",javascript:alert(1)\n');
  assert.equal(r.candidates.length, 0, "invalid phone and website are row errors");
  assert.deepEqual(r.issues.map((i) => i.code).sort(), ["INVALID_PHONE", "INVALID_WEBSITE"].sort());
  const ok = parseProspectCsv('nom,notes\n"=cmd|calc",@evil\n');
  assert.equal(ok.candidates[0].prospect.name, "'=cmd|calc");
  assert.equal(ok.candidates[0].prospect.notes, "@evil", "multi-line notes keep their text; formula defence applies on export");
});

test("import: 1,500 rows parse and plan quickly; branches survive, in-file strong duplicates are linked, name+city without address goes to review", () => {
  const lines = [HEADER];
  for (let i = 0; i < 1500; i++) lines.push(`Garage ${i},Ville${i % 10},${String(5140000000 + i)},site${i}.ca,,,,,,,,`);
  lines.push("Garage 5,Ville5,,,,,,,,,,"); // same name+city as row 5, no address on either side → ambiguous
  lines.push("Autre,Ailleurs,5140000007,,,,,,,,,"); // same phone as Garage 7 but another city → a different place
  lines.push("Autre2,Ville9,,https://www.site9.ca,,,,,,,,"); // same domain as Garage 9, same city, no address → ambiguous
  const started = Date.now();
  const parsed = parseProspectCsv(lines.join("\n"));
  const rk = new Map(parsed.candidates.map((c) => [c.rowNumber, recordKeyOf(c, "h")])), fp = new Map(parsed.candidates.map((c) => [c.rowNumber, fingerprintOf(c)]));
  const plans = planImport(parsed.candidates, rk, fp, [], new Map());
  assert.ok(Date.now() - started < 3000);
  assert.equal(parsed.candidates.length, 1503);
  assert.equal(plans.filter((p) => p.action === "CREATE").length, 1501, "the other-city row is a separate location");
  assert.equal(plans.filter((p) => p.action === "REVIEW").length, 2);
});

test("input schemas: contacts need a method; confirmed needs need evidence; overrides need a reason; language override cannot be UNKNOWN", () => {
  assert.equal(contactInputSchema.safeParse({ name: "A" }).success, false);
  assert.equal(contactInputSchema.safeParse({ name: "A", email: "a@b.co" }).success, true);
  assert.equal(contactInputSchema.safeParse({ name: "A", email: "a@b.co", preferredLanguage: "UNKNOWN" }).success, false);
  assert.equal(contactInputSchema.parse({ name: "A", phone: "514-555-0100", preferredLanguage: "" }).preferredLanguage, null);
  assert.equal(needInputSchema.safeParse({ definitionId: "d", severity: "HIGH", basis: "CONFIRMED" }).success, false);
  assert.equal(needInputSchema.safeParse({ definitionId: "d", severity: "HIGH", basis: "CONFIRMED", evidence: "owner said so" }).success, true);
  assert.equal(needInputSchema.safeParse({ definitionId: "d", severity: "LOW", basis: "INFERRED" }).success, true);
  assert.equal(scoreOverrideSchema.safeParse({ kind: "fit", value: "50", reason: "" }).success, false);
  assert.equal(scoreOverrideSchema.safeParse({ kind: "fit", value: "", reason: "" }).success, true);
  assert.equal(scoreOverrideSchema.safeParse({ kind: "fit", value: "101", reason: "x" }).success, false);
  assert.equal(taskInputSchema.safeParse({ title: "Call", dueDate: "2026-13-01x" }).success, false);
  assert.equal(taskInputSchema.parse({ title: "Call", dueDate: "2026-10-12" }).dueTime, "09:00");
  assert.equal(activityInputSchema.safeParse({ type: "NOTE" }).success, false);
  assert.equal(activityInputSchema.safeParse({ type: "NOTE", body: "x", occurredAt: new Date(Date.now() + 3600_000).toISOString() }).success, false, "no future-dated activity");
  assert.equal(staffInputSchema.safeParse({ name: "A", email: "a@b.co", role: "SALES_REP", timezone: "Mars/Base" }).success, false);
  assert.equal(staffInputSchema.safeParse({ name: "A", email: "a@b.co", role: "SUPER_ADMIN" }).success, false, "no SUPER_ADMIN via staff creation");
  assert.equal(staffInputSchema.safeParse({ name: "A", email: "a@b.co", role: "SALES_REP", uiLocale: "ES" }).success, false);
  const p = prospectInputSchema.parse({ name: "  Garage   Test ", website: "garage.ca", tags: "a, b, a", locationCount: "3" });
  assert.deepEqual([p.name, p.website, p.tags, p.locationCount, p.preferredLanguage], ["Garage Test", "https://garage.ca", ["a", "b"], 3, "UNKNOWN"]);
});

test("EN and FR dictionaries cover the same keys, have no empty strings and every pipeline stage/error code is localized", () => {
  const en = crmCopy("en"), fr = crmCopy("fr");
  const flat = (o: unknown, prefix = ""): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => typeof v === "object" && v ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
  assert.deepEqual(flat(fr).sort(), flat(en).sort());
  for (const dict of [en, fr]) {
    const walk = (o: unknown): void => { for (const v of Object.values(o as Record<string, unknown>)) { if (typeof v === "string") assert.ok(v.trim().length > 0); else if (v && typeof v === "object") walk(v); } };
    walk(dict);
  }
  for (const stage of ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION", "WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"]) {
    assert.ok(en.stages[stage] && fr.stages[stage]);
  }
  for (const code of ["QUALIFICATION_REQUIRES_CONTACT", "QUALIFICATION_REQUIRES_NEED", "WON_RESERVED", "LOSS_REASON_REQUIRED", "TERMINAL_LOCKED", "SAME_STAGE", "NOTE_REQUIRED"]) assert.ok(en.errors[code] && fr.errors[code], code);
  assert.notEqual(en.states.deniedTitle, fr.states.deniedTitle);
});
