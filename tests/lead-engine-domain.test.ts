// Lead Engine — pure domain tests: address canonicalisation, branch-aware matching, import planning, territory classification,
// assignment distribution, CASL evidence authority and EN/FR copy parity. No database.
import assert from "node:assert/strict";
import test from "node:test";
import { canonicalAddress, isRoutableAddress, normalizePostal, normalizeStreet } from "../src/domain/sales-crm/address";
import { classifyAgainstPool, type MatchKey, type PoolEntry } from "../src/domain/sales-crm/dedupe";
import { ALIAS_FIELDS, IMPORT_FIELDS, fingerprintOf, inspectCsv, parseProspectCsv, planImport, recordKeyOf, sanitizeMapping, snapshotOf, suggestMapping } from "../src/domain/sales-crm/import";
import { classifyTerritory, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { planAssignments, type AssignableProspect, type AssignableSeller } from "../src/domain/sales-crm/assignment";
import { canReviewEvidence, evidenceGaps, requiresApproval } from "../src/domain/sales-crm/casl-evidence";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { leadEn, leadFr } from "../src/lib/admin-locale/sales-lead-engine";

// ── addresses ────────────────────────────────────────────────────────────────────────────────────────────────
test("postal codes: valid Canadian formats normalise, invalid letters/shapes are rejected", () => {
  assert.equal(normalizePostal("h2x1y4"), "H2X 1Y4");
  assert.equal(normalizePostal(" H2X-1Y4 "), "H2X 1Y4");
  assert.equal(normalizePostal("D2X 1Y4"), null, "D is never used");
  assert.equal(normalizePostal("12345"), null);
  assert.equal(normalizePostal(null), null);
});

test("streets: spelling variants of the same address share a key; units are ignored; Saint is not Street", () => {
  const k = (s: string) => normalizeStreet(s)?.key;
  assert.equal(k("123 Boul. Saint-Laurent"), k("123, boulevard St-Laurent, Suite 4"));
  assert.equal(k("45 Main Street"), k("45 main st."));
  assert.equal(k("45 Main St"), "45 main st");
  assert.notEqual(k("45 Main St"), k("46 Main St"));
  assert.equal(k("1000 rue Ste-Catherine O"), k("1000 Rue Sainte Catherine Ouest"));
  assert.equal(normalizeStreet("   "), null);
  assert.equal(normalizeStreet("12345"), null, "digits only is not a street");
});

test("address quality and fingerprint: honest about missing parts; fingerprint changes iff the physical address changes", () => {
  const full = canonicalAddress({ address: "123 rue Principale", city: "Laval", province: "Québec", postalCode: "h7a 1b2" });
  assert.equal(full.quality, "COMPLETE"); assert.equal(full.province, "QC"); assert.equal(full.postalCode, "H7A 1B2"); assert.equal(full.postalKey, "H7A1B2");
  assert.ok(isRoutableAddress(full.quality));
  assert.equal(canonicalAddress({ address: "123 Rue  principale", city: "LAVAL", province: "QC", postalCode: "H7A1B2" }).fingerprint, full.fingerprint);
  assert.notEqual(canonicalAddress({ address: "124 rue Principale", city: "Laval", province: "QC", postalCode: "H7A 1B2" }).fingerprint, full.fingerprint);
  assert.equal(canonicalAddress({ address: "123 rue Principale", city: "Laval" }).quality, "PARTIAL");
  assert.equal(canonicalAddress({ address: "rue Principale", city: "Laval", province: "QC" }).quality, "INCOMPLETE", "no civic number");
  assert.equal(canonicalAddress({ city: "Laval" }).quality, "INCOMPLETE");
  assert.equal(canonicalAddress({}).quality, "UNKNOWN");
  assert.equal(canonicalAddress({ city: "Laval" }).fingerprint, null);
  assert.equal(isRoutableAddress("INCOMPLETE"), false);
});

// ── branch-aware matching ────────────────────────────────────────────────────────────────────────────────────
const key = (o: Partial<MatchKey> = {}): MatchKey => ({ nameNormalized: "speedy auto", cityKey: "laval", websiteDomain: "speedy.ca", phoneDigits: "5145550100", addressKey: null, postalKey: null, ...o });
const pe = (id: string, o: Partial<MatchKey> = {}): PoolEntry => ({ id, doNotContact: false, ...key(o) });

test("dedupe: same chain name/domain/phone at a DIFFERENT address is a separate branch, never merged or silently skipped", () => {
  const pool = [pe("a", { addressKey: "10 rue a", postalKey: "H7A1A1" })];
  const r = classifyAgainstPool(key({ addressKey: "99 rue b", postalKey: "H7B2B2" }), pool);
  assert.equal(r.outcome, "NEW"); assert.deepEqual(r.branchOf, ["a"]);
  // different postal alone (addresses unknown) also separates; different city separates
  assert.equal(classifyAgainstPool(key({ postalKey: "H7B2B2" }), [pe("a", { postalKey: "H7A1A1" })]).outcome, "NEW");
  assert.equal(classifyAgainstPool(key({ cityKey: "longueuil" }), [pe("a")]).outcome, "NEW");
});

test("dedupe: same name at the same address (or postal) is a strong match; spelling-only differences do not matter", () => {
  const r = classifyAgainstPool(key({ addressKey: "10 rue a", postalKey: "H7A1A1" }), [pe("a", { addressKey: "10 rue a", postalKey: "H7A1A1" })]);
  assert.equal(r.outcome, "STRONG"); assert.equal(r.strong?.id, "a"); assert.deepEqual(r.strong?.reasons, ["NAME_ADDRESS"]);
  assert.equal(classifyAgainstPool(key({ postalKey: "H7A1A1" }), [pe("a", { postalKey: "H7A1A1" })]).strong?.reasons[0], "NAME_POSTAL");
});

test("dedupe: missing address data is cautious — ambiguous goes to review, a unique phone+name+city is strong, a shared (franchise-like) phone is not", () => {
  assert.equal(classifyAgainstPool(key(), [pe("a")]).outcome, "STRONG");
  assert.equal(classifyAgainstPool(key(), [pe("a"), pe("b")]).outcome, "AMBIGUOUS", "two existing look identical: never pick one");
  const franchise = classifyAgainstPool(key({ nameNormalized: "speedy auto laval nord", phoneDigits: "5145550100" }), [pe("a"), pe("b", { nameNormalized: "other" })]);
  assert.equal(franchise.outcome, "AMBIGUOUS");
  assert.equal(classifyAgainstPool(key({ nameNormalized: "totally different", phoneDigits: "5145559999", websiteDomain: null }), [pe("a")]).outcome, "NEW");
  assert.equal(classifyAgainstPool(key({ phoneDigits: null, websiteDomain: null, nameNormalized: "speedy auto" }), [pe("a", { phoneDigits: null, websiteDomain: null })]).outcome, "AMBIGUOUS", "name+city only, no address");
  assert.equal(classifyAgainstPool(key({ cityKey: "", phoneDigits: null, websiteDomain: null }), [pe("a", { cityKey: "", phoneDigits: null, websiteDomain: null })]).outcome, "AMBIGUOUS", "same name and no location at all on either side");
  assert.equal(classifyAgainstPool(key({ cityKey: "", phoneDigits: null, websiteDomain: null }), [pe("a", { phoneDigits: null, websiteDomain: null })]).outcome, "NEW", "city known on one side only and nothing else shared");
});

test("dedupe: another business in the same building is not a duplicate; same address + same phone but a new name is reviewed", () => {
  const same = { addressKey: "10 rue a", postalKey: "H7A1A1" };
  assert.equal(classifyAgainstPool(key({ ...same, nameNormalized: "pizza", phoneDigits: "5140000000", websiteDomain: "pizza.ca" }), [pe("a", same)]).outcome, "NEW");
  const r = classifyAgainstPool(key({ ...same, nameNormalized: "speedy renamed" }), [pe("a", same)]);
  assert.equal(r.outcome, "AMBIGUOUS"); assert.ok(r.ambiguous[0].reasons.includes("SAME_ADDRESS_OTHER_NAME"));
});

// ── import planning ──────────────────────────────────────────────────────────────────────────────────────────
const H = "id,name,address,city,province,postal code,phone,website,email,contact name,contact email";
function plan(csv: string, pool: PoolEntry[] = [], sources = new Map<string, { fingerprint: string; prospectId: string | null }[]>(), hash = "h1") {
  const parsed = parseProspectCsv(csv);
  const rk = new Map(parsed.candidates.map((c) => [c.rowNumber, recordKeyOf(c, hash)])), fp = new Map(parsed.candidates.map((c) => [c.rowNumber, fingerprintOf(c)]));
  return { parsed, rk, fp, plans: planImport(parsed.candidates, rk, fp, pool, sources) };
}

test("import plan: franchise rows with different addresses all import; the exact same address in one file is linked; no address + same name/city is reviewed", () => {
  const { plans } = plan([H,
    ",Speedy,10 rue A,Laval,QC,H7A 1A1,514-555-0100,speedy.ca,,,",
    ",Speedy,99 rue B,Laval,QC,H7B 2B2,514-555-0100,speedy.ca,,,",
    ",Speedy,10 Rue A.,Laval,QC,H7A1A1,514-555-0100,speedy.ca,,,",
    ",Speedy,,Laval,,,,,,,",
  ].join("\n"));
  assert.deepEqual(plans.map((p) => p.action), ["CREATE", "CREATE", "LINK_IN_FILE", "REVIEW"]);
  assert.equal((plans[1] as { branchOf: string[] }).branchOf.length, 1);
  assert.equal((plans[2] as { targetRow: number }).targetRow, 2);
});

test("import plan: exact source ids are idempotent — same content is a no-op, changed content links to the same prospect, repeated ids in a file are skipped", () => {
  const csv = [H, "A-1,Garage Roy,5 rue C,Laval,QC,H7A 1A1,,,,,"].join("\n");
  const first = plan(csv);
  assert.equal(first.plans[0].action, "CREATE");
  const rk = first.rk.get(2)!, fp = first.fp.get(2)!;
  assert.equal(rk, "id:A-1");
  assert.equal(plan(csv, [], new Map([[rk, [{ fingerprint: fp, prospectId: "p1" }]]])).plans[0].action, "ALREADY_IMPORTED");
  const changed = [H, "A-1,Garage Roy,5 rue C,Laval,QC,H7A 1A1,514-555-0111,,,,"].join("\n");
  const p2 = plan(changed, [], new Map([[rk, [{ fingerprint: fp, prospectId: "p1" }]]])).plans[0];
  assert.deepEqual(p2, { row: 2, action: "LINK_EXACT", target: "p1" });
  assert.equal(plan([H, "A-1,One,1 rue X,Laval,QC,H7A 1A1,,,,,", "A-1,Two,2 rue Y,Laval,QC,H7A 1A1,,,,,"].join("\n")).plans[1].action, "DUPLICATE_SOURCE_ID");
});

test("import plan: rows WITHOUT a source id are keyed by file hash + row, so re-reading the same file is a no-op but another file is matched by content", () => {
  const csv = [H, ",Garage Roy,5 rue C,Laval,QC,H7A 1A1,,,,,"].join("\n");
  const a = plan(csv, [], new Map(), "fileA");
  assert.equal(a.rk.get(2), "row:fileA:2");
  const seen = new Map([["row:fileA:2", [{ fingerprint: a.fp.get(2)!, prospectId: "p1" }]]]);
  assert.equal(plan(csv, [], seen, "fileA").plans[0].action, "ALREADY_IMPORTED");
  const asPool: PoolEntry = { id: "p1", doNotContact: false, ...a.parsed.candidates[0].keys };
  assert.equal(plan(csv, [asPool], seen, "fileB").plans[0].action, "LINK_STRONG", "a different file with the same business is matched, not duplicated");
});

test("import parse: flexible mapping, EN/FR aliases, no hardcoded source schema, formula/URL safety, unknown mapping fields rejected", () => {
  const csv = "Raison sociale,Rue,Ville,Réf,Lien\n=cmd|calc,12 rue X,Laval,R-9,javascript:alert(1)\nGarage B,3 rue Z,Laval,R-10,https://src.example/r/10\n";
  const insp = inspectCsv(csv);
  assert.equal(insp.headers.length, 5); assert.equal(insp.suggested["0"], null, "unknown header is not guessed");
  assert.equal(parseProspectCsv(csv).headerError, "NO_NAME_COLUMN");
  const mapping = { "0": "name", "1": "address", "2": "city", "3": "externalId", "4": "sourceUrl" };
  const r = parseProspectCsv(csv, { mapping });
  assert.equal(r.headerError, null); assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].prospect.name, "'=cmd|calc"); assert.equal(r.candidates[0].externalId, "R-9");
  assert.equal(r.candidates[0].sourceUrl, null, "non-http source URLs are dropped");
  assert.equal(r.candidates[1].sourceUrl, "https://src.example/r/10");
  assert.equal(sanitizeMapping({ "0": "name", "1": "name" }, 5), null, "a field can be mapped once");
  assert.equal(sanitizeMapping({ "0": "password" }, 5), null);
  assert.equal(sanitizeMapping({ "0": "name" }, 1)?.["0"], "name");
  assert.deepEqual([...ALIAS_FIELDS].sort(), [...IMPORT_FIELDS].sort());
  assert.equal(suggestMapping(["Nom", "Ville", "Ville"])["2"], null);
});

test("observation snapshot keeps business-level facts only (no contact person, no email address, no raw payload)", () => {
  const r = parseProspectCsv([H, "X1,Garage Roy,5 rue C,Laval,QC,H7A 1A1,514-555-0100,roy.ca,info@roy.ca,Jean Roy,jean@roy.ca"].join("\n"));
  const snap = JSON.stringify(snapshotOf(r.candidates[0]));
  assert.ok(!snap.includes("Jean") && !snap.includes("@") && !snap.includes("jean"));
  assert.ok(snap.includes("Garage Roy") && snap.includes("roy.ca"));
});

// ── territory classification ─────────────────────────────────────────────────────────────────────────────────
const rule = (o: Partial<TerritoryRule>): TerritoryRule => ({ key: "k", acquisition: "REMOTE_DEFAULT", provinces: [], cities: [], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 100, ...o });
const MTL = rule({ key: "greater-montreal", acquisition: "FIELD_PRIORITY", provinces: ["QC"], cities: ["montreal", "laval", "longueuil"], postalPrefixes: ["H", "J4"], priorityDays: 14, priorityStartedAt: new Date("2026-01-01"), sortOrder: 10 });
const CA = rule({ key: "canada", sortOrder: 1000 });

test("territory classification: local match, positively national, and honest UNRESOLVED when Québec could be Montréal", () => {
  const rules = [MTL, CA];
  assert.equal(classifyTerritory(rules, { city: "Laval", province: "QC" }).state, "LOCAL");
  assert.equal(classifyTerritory(rules, { postalCode: "H2X 1Y4" }).state, "LOCAL");
  assert.equal(classifyTerritory(rules, { city: "Calgary", province: "Alberta" }).state, "NATIONAL");
  assert.equal(classifyTerritory(rules, { province: "ON", postalCode: "M5V 2T6" }).state, "NATIONAL");
  assert.equal(classifyTerritory(rules, { city: "Trois-Rivières", province: "QC" }).state, "NATIONAL");
  assert.equal(classifyTerritory(rules, { province: "QC" }).state, "UNRESOLVED", "Québec alone could be Greater Montréal");
  assert.equal(classifyTerritory(rules, {}).state, "UNRESOLVED");
  assert.equal(classifyTerritory(rules, { city: "Springfield" }).state, "UNRESOLVED", "city without province");
  assert.equal(classifyTerritory(rules, { province: "AB" }).state, "NATIONAL", "no local rule can apply in Alberta");
});

// ── assignment ───────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date("2026-03-01T12:00:00Z");
const noEng = { touched: false, visited: false, replied: false, activeOpportunity: false };
const prospect = (id: string, o: Partial<AssignableProspect> = {}): AssignableProspect => ({ id, status: "ACTIVE", doNotContact: false, assignedStaffId: null, territoryState: "NATIONAL", rule: CA, engagement: noEng, ...o });
const seller = (id: string, o: Partial<AssignableSeller> = {}): AssignableSeller => ({ id, mode: "REMOTE", coverageKeys: [], active: true, acceptsAutoAssignment: true, maxActiveLeads: null, workload: 0, ...o });

test("assignment: national leads are shared by FIELD and REMOTE sellers, least loaded first, deterministic", () => {
  const out = planAssignments([prospect("p1"), prospect("p2"), prospect("p3"), prospect("p4")], [seller("f", { mode: "FIELD" }), seller("r", { workload: 1 })], NOW);
  assert.deepEqual(out.map((o) => o.staffId), ["f", "f", "r", "f"]);
});

test("assignment: during the FIELD priority window REMOTE sellers get nothing locally; after release they may; FIELD can always sell remotely", () => {
  const during = planAssignments([prospect("p", { territoryState: "LOCAL", rule: MTL })], [seller("r"), seller("f", { mode: "FIELD" })], new Date("2026-01-05"));
  assert.equal(during[0].staffId, "f"); assert.equal(during[0].requiredMode, "FIELD");
  const onlyRemote = planAssignments([prospect("p", { territoryState: "LOCAL", rule: MTL })], [seller("r")], new Date("2026-01-05"));
  assert.equal(onlyRemote[0].skip, "NO_ELIGIBLE_SELLER");
  const after = planAssignments([prospect("p", { territoryState: "LOCAL", rule: MTL })], [seller("r")], new Date("2026-02-01"));
  assert.equal(after[0].staffId, "r", "untouched prospect released to REMOTE after the window");
  const touched = planAssignments([prospect("p", { territoryState: "LOCAL", rule: MTL, engagement: { ...noEng, touched: true } })], [seller("r")], new Date("2026-02-01"));
  assert.equal(touched[0].skip, "NO_ELIGIBLE_SELLER", "a prospect a FIELD agent already touched stays with FIELD");
});

test("assignment: the window never ends when no duration is configured (nothing is invented)", () => {
  const open = rule({ key: "greater-montreal", acquisition: "FIELD_PRIORITY", provinces: ["QC"], cities: ["laval"], priorityDays: null, priorityStartedAt: null });
  const out = planAssignments([prospect("p", { territoryState: "LOCAL", rule: open })], [seller("r")], new Date("2030-01-01"));
  assert.equal(out[0].skip, "NO_ELIGIBLE_SELLER");
});

test("assignment: never takes owned/DNC/archived/unresolved prospects; honours coverage, pause switch and cap", () => {
  const out = planAssignments([
    prospect("owned", { assignedStaffId: "x" }), prospect("dnc", { doNotContact: true }), prospect("arch", { status: "ARCHIVED" }), prospect("unres", { territoryState: "UNRESOLVED" }), prospect("null", { territoryState: null }),
  ], [seller("a")], NOW);
  assert.deepEqual(out.map((o) => o.skip), ["ALREADY_OWNED", "DNC", "ARCHIVED", "UNRESOLVED_TERRITORY", "UNRESOLVED_TERRITORY"]);
  assert.ok(out.every((o) => o.staffId === null));
  const sellers = [seller("paused", { acceptsAutoAssignment: false }), seller("outside", { coverageKeys: ["greater-montreal"] }), seller("capped", { maxActiveLeads: 1, workload: 1 }), seller("ok")];
  assert.equal(planAssignments([prospect("p")], sellers, NOW)[0].staffId, "ok");
  assert.equal(planAssignments([prospect("p"), prospect("q")], [seller("capped", { maxActiveLeads: 1 })], NOW).filter((o) => o.staffId).length, 1, "cap counts proposals in the same run");
  assert.equal(planAssignments([prospect("p")], [seller("inactive", { active: false })], NOW)[0].skip, "NO_ELIGIBLE_SELLER");
});

// ── CASL evidence ────────────────────────────────────────────────────────────────────────────────────────────
const complete = { kind: "IMPLIED_PUBLISHED_ADDRESS", evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://garage.ca/contact", capturedAt: new Date(), supportingFacts: "Email shown on the contact page, no refusal notice.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: true };
const basis = (o = {}) => ({ ...complete, reviewStatus: "PENDING_REVIEW", recordedByUserId: "rep-user", ...o });
const actorOf = (kind: "SALES_REP" | "SALES_MANAGER" | "SUPER_ADMIN", userId: string, scope: string[] = []) => ({ capabilities: capabilitiesFor(kind), all: kind === "SUPER_ADMIN", userId, scopeStaffIds: scope });

test("CASL evidence: completeness rules per basis kind", () => {
  assert.deepEqual(evidenceGaps(complete), []);
  assert.deepEqual(evidenceGaps({ ...complete, sourceUrl: null, publishedConditionsConfirmed: false }).sort(), ["PUBLISHED_CONDITIONS", "SOURCE_URL"]);
  assert.deepEqual(evidenceGaps({ ...complete, kind: "IMPLIED_DISCLOSED_ADDRESS", sourceUrl: null, publishedConditionsConfirmed: false }), [], "disclosed address needs no URL");
  assert.deepEqual(evidenceGaps({ ...complete, evidenceType: null, capturedAt: null, supportingFacts: "short", roleRelevance: "" }).sort(), ["CAPTURED_AT", "EVIDENCE_TYPE", "ROLE_RELEVANCE", "SUPPORTING_FACTS"]);
  assert.equal(requiresApproval("IMPLIED_PUBLISHED_ADDRESS"), true); assert.equal(requiresApproval("EXPRESS_CONSENT"), false);
});

test("CASL approval authority: manager only inside their team, Super Admin globally, reps never, nobody (but Super Admin) approves their own", () => {
  assert.deepEqual(canReviewEvidence(actorOf("SALES_REP", "u1", ["s1"]), basis(), "s1"), { allowed: false, code: "NOT_AUTHORIZED" });
  assert.deepEqual(canReviewEvidence(actorOf("SALES_MANAGER", "mgr", ["m", "s1"]), basis(), "s1"), { allowed: true, selfApproved: false });
  assert.deepEqual(canReviewEvidence(actorOf("SALES_MANAGER", "mgr", ["m", "s1"]), basis(), "other-team"), { allowed: false, code: "OUT_OF_TEAM" });
  assert.deepEqual(canReviewEvidence(actorOf("SALES_MANAGER", "mgr", ["m", "s1"]), basis(), null), { allowed: false, code: "OUT_OF_TEAM" }, "unassigned pool is Super Admin only");
  assert.deepEqual(canReviewEvidence(actorOf("SALES_MANAGER", "rep-user", ["m", "s1"]), basis(), "s1"), { allowed: false, code: "SELF_APPROVAL" });
  assert.deepEqual(canReviewEvidence(actorOf("SUPER_ADMIN", "root"), basis(), "anyone"), { allowed: true, selfApproved: false });
  assert.deepEqual(canReviewEvidence(actorOf("SUPER_ADMIN", "rep-user"), basis(), null), { allowed: true, selfApproved: true });
  assert.deepEqual(canReviewEvidence(actorOf("SUPER_ADMIN", "root"), basis({ reviewStatus: "APPROVED" }), "s1"), { allowed: false, code: "NOT_PENDING" });
  assert.deepEqual(canReviewEvidence(actorOf("SUPER_ADMIN", "root"), basis({ supportingFacts: null }), "s1"), { allowed: false, code: "EVIDENCE_INCOMPLETE" });
});

// ── copy parity ──────────────────────────────────────────────────────────────────────────────────────────────
function flat(o: unknown, p = ""): [string, string][] { return o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [[p, String(o)]]; }
test("Lead Engine copy: every English string has a French counterpart (same keys, none empty, placeholders preserved)", () => {
  const en = new Map(flat(leadEn)), fr = new Map(flat(leadFr));
  assert.deepEqual([...fr.keys()].sort(), [...en.keys()].sort());
  for (const [k, v] of en) {
    assert.ok(v.trim() && (fr.get(k) ?? "").trim(), `empty copy at ${k}`);
    assert.deepEqual((v.match(/\{[a-z]+\}/g) ?? []).sort(), ((fr.get(k) ?? "").match(/\{[a-z]+\}/g) ?? []).sort(), `placeholders at ${k}`);
  }
  for (const f of IMPORT_FIELDS) assert.ok(leadEn.import.fields[f] && leadFr.import.fields[f], `field label ${f}`);
});
