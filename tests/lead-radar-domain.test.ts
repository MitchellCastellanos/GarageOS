// National Lead Radar — pure domain, static guards and EN/FR parity. No database, no network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { cityKey } from "../src/domain/sales-crm/territory";
import { resolveGeo, provincesFromPostal, PROVINCE_BBOX, PROVINCE_CODES } from "../src/domain/lead-radar/geo";
import { classify, hierarchyForGroups, primariesForGroups, PRIMARY_RULES } from "../src/domain/lead-radar/taxonomy";
import { evaluateLicenses } from "../src/domain/lead-radar/license";
import { importEligibility, pickEmail, pickPhone, pickWebsite, toCandidate } from "../src/domain/lead-radar/record";
import { buildPlan, canonicalScope, estimateWorkload, manifestSchema, planHashOf } from "../src/domain/lead-radar/scope";
import { candidatesToImportCsv, phoneForCsv } from "../src/domain/lead-radar/bridge";
import { fitsBudget, HARD_CAP_MICRO_CAD, monthKey, toMicro, usdToMicroCad } from "../src/domain/lead-radar/budget";
import { parseProspectCsv } from "../src/domain/sales-crm/import";
import { radarCopy } from "../src/lib/admin-locale/lead-radar";
import { Sha256 } from "../src/lib/lead-radar/sha256";
import { leadRadarAccessFor } from "../src/domain/lead-radar/access";

const root = path.resolve(import.meta.dirname, "..");
const SCOPE = { provinces: ["QC", "AB"] };
const base = (o: Record<string, unknown> = {}) => ({
  v: 1, id: "11111111-2222-4333-8444-555555555555", confidence: 0.9, name: "Garage Test",
  taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"] },
  address: { freeform: "123 Rue Principale", locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" },
  phones: ["+15145550100"], websites: ["https://garagetest.ca/"], emails: ["info@garagetest.ca"], sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], ...o,
});
const stage = (o: Record<string, unknown> = {}, scope = SCOPE) => toCandidate(base(o), scope, { cityKeyOf: cityKey });

test("geography: every province and territory resolves from region text (accents, abbreviations, English/French) and from postal code as a fallback", () => {
  for (const [region, code] of [["QC", "QC"], ["Qc", "QC"], ["Québec", "QC"], ["Quebec", "QC"], ["Ontario", "ON"], ["British Columbia", "BC"], ["Alberta", "AB"], ["Manitoba", "MB"], ["Saskatchewan", "SK"],
    ["Nova Scotia", "NS"], ["New Brunswick", "NB"], ["Newfoundland and Labrador", "NL"], ["Prince Edward Island", "PE"], ["Yukon", "YT"], ["Northwest Territories", "NT"], ["Nunavut", "NU"]]) {
    assert.equal(resolveGeo({ country: "CA", region }).province, code, region);
  }
  assert.equal(PROVINCE_CODES.length, 13, "10 provinces + 3 territories");
  assert.deepEqual(resolveGeo({ country: "CA", region: null, postcode: "G1R 4S9" }).province, "QC");
  assert.deepEqual(provincesFromPostal("X0A 0H0"), ["NT", "NU"], "X is shared: it can never decide alone");
  assert.equal(resolveGeo({ country: "CA", region: null, postcode: "X0A 0H0" }).province, null);
  assert.equal(resolveGeo({ country: "US", region: "NY" }).inCanada, false);
  assert.ok(resolveGeo({ country: "CA", region: "QC", postcode: "T2P 1J9" }).flags.includes("GEO_POSTAL_MISMATCH"));
  assert.equal(resolveGeo({ country: null, region: null, postcode: null }).inCanada, false, "no Canadian signal at all ⇒ not claimed");
  for (const p of PROVINCE_CODES) { const [a, b, c, d] = PROVINCE_BBOX[p]; assert.ok(a < c && b < d); }
});

test("classification: primary shops vs secondary categories vs ambiguous vs excluded; independence is never asserted; unknown subcategories stay reviewable", () => {
  const mk = (primary: string, extra: Record<string, unknown> = {}) => classify({ primary, hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: [], name: "Atelier Dupont", brandWikidata: null, operatingStatus: null, ...extra });
  for (const p of ["automotive_repair", "transmission_repair", "brake_service_and_repair", "tire_shop", "tire_dealer_and_repair", "oil_change_station", "engine_repair_service", "auto_electrical_repair"]) assert.equal(mk(p).tier, "PRIMARY", p);
  for (const p of ["auto_body_shop", "car_wash", "auto_glass_service", "auto_detailing", "towing_service"]) assert.equal(mk(p).tier, "SECONDARY", p);
  for (const p of ["auto_dealer", "used_auto_dealer"]) assert.equal(classify({ primary: p, hierarchy: ["shopping", "vehicle_dealer"], alternates: [], name: "X", brandWikidata: null, operatingStatus: null }).group, "DEALER");
  assert.equal(mk("automotive_service").tier, "AMBIGUOUS");
  assert.equal(mk("brand_new_code").tier, "AMBIGUOUS");
  assert.equal(classify({ primary: "gas_station", hierarchy: ["travel_and_transportation", "fueling_station"], alternates: [], name: "Esso", brandWikidata: null, operatingStatus: null }).tier, "EXCLUDED");
  assert.equal(mk("automotive_repair", { operatingStatus: "permanently_closed" }).tier, "EXCLUDED");
  assert.equal(mk("automotive_repair", { name: "Toyota Laval Service" }).tier, "AMBIGUOUS", "OEM-branded repair listing may be a dealer service department");
  const plain = mk("automotive_repair");
  assert.equal(plain.chainSignal, "NO_CHAIN_SIGNAL");
  assert.ok(!JSON.stringify(plain).toLowerCase().includes("independent"), "the word independent is never produced");
  assert.equal(mk("automotive_repair", { brandWikidata: "Q1" }).chainSignal, "CHAIN_SIGNAL");
  assert.equal(mk("automotive_repair", { name: "Midas Laval" }).chainSignal, "CHAIN_SIGNAL");
  assert.ok(primariesForGroups(["REPAIR"]).every((p) => PRIMARY_RULES[p].group === "REPAIR"));
  assert.deepEqual(hierarchyForGroups(["DEALER"]), []);
  assert.deepEqual(hierarchyForGroups(["REPAIR"]), ["vehicle_service"]);
});

test("licences: only the permissive allow-list is importable; missing, unknown, share-alike and OSM-derived sources are blocked", () => {
  assert.equal(evaluateLicenses([{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Foursquare", license: "Apache-2.0" }, { dataset: "AllThePlaces", license: "CC0-1.0" }]).ok, true);
  assert.deepEqual(evaluateLicenses([]).blocks, ["NO_SOURCES"]);
  assert.deepEqual(evaluateLicenses([{ dataset: "x", license: null }]).blocks, ["LICENSE_MISSING"]);
  assert.deepEqual(evaluateLicenses([{ dataset: "x", license: "CC-BY-SA-4.0" }]).blocks, ["LICENSE_NOT_ALLOWED"]);
  assert.deepEqual(evaluateLicenses([{ dataset: "OpenStreetMap", license: "CC0-1.0" }]).blocks, ["OSM_ODBL_DISABLED"], "OSM-derived data is blocked whatever licence string it carries");
  assert.deepEqual(evaluateLicenses([{ dataset: "meta", license: "ODbL-1.0" }]).blocks, ["OSM_ODBL_DISABLED"]);
  assert.equal(evaluateLicenses([{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "z", license: "proprietary" }]).ok, false, "one bad source blocks the record");
});

test("record normalisation: whitelisting, missing fields, malformed input, social websites, bad contacts, scope filters", () => {
  const ok = stage();
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual([ok.candidate.province, ok.candidate.postalCode, ok.candidate.tier, ok.candidate.licenseOk], ["QC", "H2X 1Y4", "PRIMARY", true]);
    assert.equal(ok.candidate.completeness, 100);
    assert.ok(ok.candidate.qualityFlags.includes("EMAIL_UNVERIFIED"), "a published email is flagged as unverified, never as consent");
  }
  const bare = toCandidate({ v: 1, id: "abcdefgh-1", name: "Only Name", address: { region: "QC", country: "CA" } }, SCOPE, { cityKeyOf: cityKey });
  assert.ok(bare.ok && bare.candidate.completeness === 20 && bare.candidate.qualityFlags.includes("NO_PHONE") && bare.candidate.qualityFlags.includes("NO_ADDRESS"));
  assert.deepEqual(toCandidate("garbage", SCOPE, { cityKeyOf: cityKey }), { ok: false, issue: "SCHEMA_INVALID" });
  assert.deepEqual(toCandidate({ v: 9, id: "abcdefgh-1" }, SCOPE, { cityKeyOf: cityKey }), { ok: false, issue: "SCHEMA_VERSION_UNSUPPORTED" });
  assert.deepEqual(toCandidate(base({ name: "   " }), SCOPE, { cityKeyOf: cityKey }), { ok: false, issue: "MISSING_NAME" });
  assert.deepEqual(toCandidate(base({ address: { country: "US", region: "NY" } }), SCOPE, { cityKeyOf: cityKey }), { ok: false, issue: "OUTSIDE_CANADA" });
  assert.deepEqual(toCandidate(base({ address: { country: "CA", region: "ON", locality: "Ottawa" } }), SCOPE, { cityKeyOf: cityKey }), { ok: false, issue: "OUT_OF_SCOPE_PROVINCE" });
  assert.deepEqual(toCandidate(base(), { provinces: ["QC"], cityKeys: [cityKey("Laval")] }, { cityKeyOf: cityKey }), { ok: false, issue: "OUT_OF_SCOPE_CITY" });
  assert.ok(toCandidate(base({ address: { country: "CA", region: "QC", locality: "Montréal" } }), { provinces: ["QC"], cityKeys: [cityKey("montreal")] }, { cityKeyOf: cityKey }).ok, "city match ignores accents and case");
  // unknown/extra fields never survive
  const leaked = toCandidate(base({ secretField: "LEAK", sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0", record_id: "UPSTREAM-ID" }] }), SCOPE, { cityKeyOf: cityKey });
  assert.ok(!JSON.stringify(leaked).includes("LEAK") && !JSON.stringify(leaked).includes("UPSTREAM-ID"));
  // helpers
  assert.equal(pickWebsite(["https://www.facebook.com/x", "https://garage.ca/a"]).website, "https://garage.ca/a");
  assert.deepEqual(pickWebsite(["https://www.facebook.com/x"]), { website: null, social: true });
  assert.equal(pickWebsite(["not a url", "javascript:alert(1)"]).website, null);
  assert.equal(pickPhone(["abc", "+15145550100"]), "+15145550100");
  assert.equal(pickEmail(["nope", "Info@Shop.CA"]), "info@shop.ca");
  // suppressed emails are dropped, the business stays
  const sup = toCandidate(base(), SCOPE, { cityKeyOf: cityKey, isSuppressed: (e) => e === "info@garagetest.ca" });
  assert.ok(sup.ok && sup.candidate.email === null && sup.candidate.qualityFlags.includes("EMAIL_SUPPRESSED"));
  // stable identity & fingerprint
  const a = stage(), b = stage(), c = stage({ phones: ["+15145550999"] });
  assert.ok(a.ok && b.ok && c.ok);
  if (a.ok && b.ok && c.ok) { assert.equal(a.candidate.contentFingerprint, b.candidate.contentFingerprint); assert.notEqual(a.candidate.contentFingerprint, c.candidate.contentFingerprint); assert.equal(a.candidate.sourceRecordId, c.candidate.sourceRecordId); }
});

test("import eligibility: licence, tier and minimum contact", () => {
  assert.equal(importEligibility({ licenseOk: true, tier: "PRIMARY", address: "1 A", phone: null, postalCode: null }).eligible, true);
  assert.deepEqual(importEligibility({ licenseOk: false, tier: "EXCLUDED", address: null, phone: null, postalCode: null }).reasons, ["LICENSE_BLOCKED", "EXCLUDED_TIER", "INSUFFICIENT_CONTACT"]);
});

test("scope & plan: canonical, deterministic hash, validated release, workload hints and the nationwide gate", () => {
  const a = canonicalScope({ provinces: ["QC", "AB", "QC"], cities: ["Montréal", "montreal", "Laval"], groups: ["BODY_GLASS", "REPAIR"] });
  const b = canonicalScope({ provinces: ["AB", "QC"], cities: ["Laval", "Montréal"], groups: ["REPAIR", "BODY_GLASS"] });
  assert.deepEqual(a, b); assert.equal(planHashOf(a), planHashOf(b));
  assert.throws(() => canonicalScope({ provinces: [] }));
  assert.throws(() => canonicalScope({ provinces: ["XX"] }));
  const plan = buildPlan({ provinces: ["QC"] }, "2026-09-23.1");
  assert.deepEqual([plan.planVersion, plan.release, plan.bboxes.length, plan.hierarchyAny], [1, "2026-09-23.1", 1, ["vehicle_service"]]);
  assert.match(plan.planHash, /^[0-9a-f]{64}$/);
  for (const bad of ["../../etc", "http://evil/x", "2026-9-23", "latest/../x", ""]) assert.throws(() => buildPlan({ provinces: ["QC"] }, bad), /INVALID_RELEASE/);
  assert.equal(estimateWorkload(canonicalScope({ provinces: [...PROVINCE_CODES] })).nationwide, true);
  assert.equal(estimateWorkload(canonicalScope({ provinces: ["QC"] })).nationwide, false);
  assert.ok(manifestSchema.safeParse({ extractor: "x", extractorVersion: "1", planHash: "a".repeat(64), release: "2026-09-23.1", recordCount: 1, fileSha256: "b".repeat(64), generatedAt: "now" }).success);
  assert.ok(!manifestSchema.safeParse({ extractor: "x", extractorVersion: "1", planHash: "a".repeat(64), release: "../x", recordCount: 1, fileSha256: "b".repeat(64), generatedAt: "now" }).success);
});

test("bridge to the existing CSV importer: phones survive the formula guard, rows map back to candidates, validators are the existing ones", () => {
  assert.equal(phoneForCsv("+15145550100"), "514-555-0100");
  assert.equal(phoneForCsv(null), "");
  const { csv, rowToCandidate } = candidatesToImportCsv([
    { id: "c1", sourceRecordId: "gers-1", name: "=HYPERLINK(\"x\")", website: "https://a.ca/", address: "1 Rue A", city: "Montréal", province: "QC", postalCode: "H2X 1Y4", phone: "+15145550100", email: "a@a.ca", industry: "GENERAL_REPAIR", lastSeenRelease: "2026-09-23.1" },
    { id: "c2", sourceRecordId: "gers-2", name: "Bad Phone", website: null, address: "2 Rue B", city: "Laval", province: "QC", postalCode: null, phone: "12", email: null, industry: null, lastSeenRelease: "2026-09-23.1" },
  ]);
  assert.deepEqual([...rowToCandidate.entries()], [[2, "c1"], [3, "c2"]]);
  const mapping = Object.fromEntries(["name", "website", "address", "city", "province", "postalCode", "phone", "email", "industry", "externalId", "source", "sourceDetail", "tags"].map((h, i) => [String(i), h]));
  const parsed = parseProspectCsv(csv, { defaultSource: "DIRECTORY", mapping });
  assert.equal(parsed.candidates.length, 2);
  const [first] = parsed.candidates;
  assert.equal(first.externalId, "gers-1");
  assert.equal(first.prospect.phone, "514-555-0100");
  assert.equal(first.prospect.industry, "GENERAL_REPAIR");
  assert.equal(first.prospect.source, "DIRECTORY");
  assert.ok(first.prospect.name.startsWith("'="), "formula injection is defused by the existing importer");
  assert.equal(first.prospect.preferredLanguage, "UNKNOWN", "language is never guessed");
  assert.equal(first.contact, null, "no contact person is invented");
  assert.equal(first.doNotContact, false);
});

test("budget math: micro-CAD, conservative FX rounding up, hard cap, month key in Toronto time, invalid amounts refused", () => {
  assert.equal(HARD_CAP_MICRO_CAD, 25_000_000);
  assert.equal(usdToMicroCad(1_000_000, 1450), 1_450_000);
  assert.equal(usdToMicroCad(1, 1450), 2, "always rounded up");
  assert.equal(usdToMicroCad(1_000_000, 10), 1_000_000, "an absurdly low rate is clamped (never underestimates)");
  assert.equal(toMicro(0.1 + 0.2), 300_000);
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => toMicro(bad), /INVALID_AMOUNT/);
  assert.equal(fitsBudget(24_000_000, 1_000_000, 25_000_000), true);
  assert.equal(fitsBudget(24_000_001, 1_000_000, 25_000_000), false);
  assert.equal(fitsBudget(0, 26_000_000, 99_000_000), false, "a configured limit above the hard cap is clamped to it");
  assert.equal(fitsBudget(0, -1, 25_000_000), false);
  assert.equal(monthKey(new Date("2026-10-31T23:30:00-04:00")), "2026-10");
  assert.equal(monthKey(new Date("2026-11-01T03:30:00Z")), "2026-10", "03:30Z on Nov 1 is still October in Toronto");
  assert.equal(monthKey(new Date("2026-11-01T05:30:00Z")), "2026-11");
});

test("incremental SHA-256 (browser upload) equals node:crypto for assorted sizes and chunkings", () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
    const data = Buffer.alloc(n); for (let i = 0; i < n; i++) data[i] = (i * 31 + 7) & 255;
    const want = createHash("sha256").update(data).digest("hex");
    const h = new Sha256();
    for (let i = 0; i < n; i += 977) h.update(new Uint8Array(data.subarray(i, i + 977)));
    assert.equal(h.hex(), want, `length ${n}`);
  }
});

test("access matrix: Super Admin always; managers only when allowed (review, never admin); reps and tenants never", () => {
  const actor = (kind: string, all = false) => ({ kind, all, capabilities: new Set(kind === "SUPER_ADMIN" ? ["manage_lead_radar", "review_lead_radar", "import_prospects"] : ["import_prospects"]) }) as never;
  assert.deepEqual(leadRadarAccessFor(actor("SUPER_ADMIN", true), false), { admin: true, review: true });
  assert.deepEqual(leadRadarAccessFor(actor("SALES_MANAGER"), false), { admin: false, review: false });
  assert.deepEqual(leadRadarAccessFor(actor("SALES_MANAGER"), true), { admin: false, review: true });
  assert.deepEqual(leadRadarAccessFor(actor("SALES_REP"), true), { admin: false, review: false });
});

// ── static guards ───────────────────────────────────────────────────────────────────────────────────────────────────
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
// The AUTOMATION LAYER (policy → handoff → assignment → eligibility → pilot enrollment) deliberately reads and, for assignment/enrollment, writes outreach and ownership
// tables, so it is held to its own, narrower static guards in tests/lead-radar-automation-domain.test.ts (never creates or sends a message, reads no credential,
// gated by two switches + lease, every action re-checks Super Admin). EVERYTHING ELSE here (acquisition, staging, review, import, budget) keeps the original strict guard.
const AUTOMATION_LAYER = new Set(["automation.ts", "eligibility.ts", "dashboard.ts"]);
const sources = () => [...walk(path.join(root, "src/lib/lead-radar")), ...walk(path.join(root, "src/domain/lead-radar")), path.join(root, "src/actions/lead-radar.ts")].filter((f) => /\.tsx?$/.test(f) && !(f.includes("src/lib/lead-radar/") && AUTOMATION_LAYER.has(path.basename(f))));

test("every Lead Radar server action re-checks authorization on the server before doing anything", () => {
  const src = readFileSync(path.join(root, "src/actions/lead-radar.ts"), "utf8");
  const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n\s*const actor = await requireLeadRadar\("(admin|review)"\)|export async function (\w+)\([^)]*\)[^{]*\{\s*\n\s*await requireLeadRadar\("(admin|review)"\)/g)];
  const all = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.equal(fns.length, all.length, `unguarded action among ${all.join(", ")}`);
  const admin = ["saveLeadRadarSettings", "previewDiscoveryWorkload", "createDiscoveryRun", "getDiscoveryPlan", "attachDiscoveryManifest", "ingestDiscoveryChunk", "completeDiscoveryRun", "cancelDiscoveryRun", "resumeDiscoveryRun", "releaseDiscoveryReservation", "acknowledgeDiscoveryRunQuality", "queueDiscoveryRunForWorker", "saveProvinceSchedule", "decideDiscoveredContact", "rematchProvinceCandidates", "previewProvinceCandidatesBatch", "releaseDiscoveryExclusion", "applyProvinceReclassificationBatch"];
  for (const name of admin) assert.match(src, new RegExp(`export async function ${name}\\([^)]*\\)[^{]*\\{\\s*\\n\\s*(const actor = await|await) requireLeadRadar\\("admin"\\)`), name);
  for (const name of ["reviewDiscoveryCandidates", "importApprovedDiscoveryCandidates"]) assert.match(src, new RegExp(`export async function ${name}\\([^)]*\\)[^{]*\\{\\s*\\n\\s*const actor = await requireLeadRadar\\("review"\\)`), name);
});

test("Lead Radar never sends anything, never touches sending bases or sequences, never fetches arbitrary URLs and never touches the Mapbox geocoding budget", () => {
  for (const f of sources()) {
    const s = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\bfetch\s*\(|axios|XMLHttpRequest|node:https?|node:net\b/.test(s), `${path.relative(root, f)} must not perform network requests`);
    assert.ok(!/crmSendingBasis|crmSequenceEnrollment|crmEmailMessage|crmEmailThread|sendEmail|sendSms|twilio|resend/i.test(s), `${path.relative(root, f)} must not touch outreach`);
    assert.ok(!/crmGeocodingSettings|requestsUsed/.test(s), `${path.relative(root, f)} must not touch the geocoding budget`);
    assert.ok(!/assignedStaffId\s*:[ \t]*(?![ \t]|null\b|true\b)/.test(s), `${path.relative(root, f)} must not assign owners`);
    assert.ok(!/crmProspect\.(update|updateMany|create|createMany|delete)\b/.test(s), `${path.relative(root, f)} must not write prospects directly (only the shared import transaction does)`);
  }
});

test("extractor and docs: the only hosts are the Overture bucket and its STAC catalog; no credentials; output whitelisted", () => {
  const py = readFileSync(path.join(root, "scripts/lead-radar/overture_extract.py"), "utf8");
  const hosts = new Set([...py.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
  for (const h of hosts) assert.ok(["overturemaps-us-west-2.s3.amazonaws.com", "stac.overturemaps.org"].includes(h) || h.includes("{"), `unexpected host ${h}`);
  assert.ok(!/DATABASE_URL|API_KEY|SECRET|TOKEN/.test(py));
});

test("EN/FR: identical key structure, no empty strings, matching placeholders; the migration is additive-only and caps the budget", () => {
  const flat = (o: unknown, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o as object).flatMap(([k, v]) => (typeof v === "string" ? [[`${p}${k}`, v]] : Object.entries(flat(v, `${p}${k}.`)))));
  const en = flat(radarCopy("en")), fr = flat(radarCopy("fr"));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const [k, v] of Object.entries(en)) { assert.ok(v.trim() && fr[k].trim(), k); assert.deepEqual((v.match(/\{\w+\}/g) ?? []).sort(), (fr[k].match(/\{\w+\}/g) ?? []).sort(), `placeholders ${k}`); }
  const differing = Object.keys(en).filter((k) => en[k] !== fr[k]).length;
  assert.ok(differing / Object.keys(en).length > 0.9, "French is actually translated");
  const sql = readFileSync(path.join(root, "prisma/migrations/20261015090000_lead_radar_foundation/migration.sql"), "utf8");
  assert.ok(!/\bDROP\b|\bTRUNCATE\b|^\s*DELETE\b|ALTER TABLE "garageos"\."(?!CrmDiscovery)/im.test(sql), "additive only: no existing table is altered or dropped");
  assert.ok(/<= 25000000/.test(sql), "database-level CAD 25 cap");
});
