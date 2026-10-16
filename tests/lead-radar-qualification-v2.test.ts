// Lead Radar qualification V2 (business-type aware) — pure domain tests. SYNTHETIC records only: they exercise rules, they make no claim about production distributions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { cityKey } from "../src/domain/sales-crm/territory";
import { toCandidate } from "../src/domain/lead-radar/record";
import { canonicalRules, DEFAULT_POLICY_RULES, evaluateQualification, QUALIFICATION_REASONS, RECOMMENDED_V2_RULES, type PolicyRules, type QualificationFacts } from "../src/domain/lead-radar/qualification";
import { rulesHashOf } from "../src/domain/lead-radar/qualification-hash";
import { BUSINESS_TYPES, classifyBusinessType, independentSources, nameEvidence } from "../src/domain/lead-radar/business-type";
import { buildComparison, renderComparisonMarkdown, type CompareRow } from "../src/domain/lead-radar/policy-compare";
import { radarCopy } from "../src/lib/admin-locale/lead-radar";

const root = path.resolve(import.meta.dirname, "..");
const HIER = ["travel_and_transportation", "vehicle_service"];
const raw = (o: Record<string, unknown> = {}) => ({
  v: 1, id: "11111111-2222-4333-8444-555555555555", confidence: 0.9, name: "Garage Tremblay",
  taxonomy: { primary: "automotive_repair", hierarchy: HIER },
  address: { freeform: "123 Rue Principale", locality: "Laval", postcode: "H7N 1A1", region: "QC", country: "CA" },
  phones: ["+14505550100"], websites: ["https://tremblay-auto.example.ca/"], emails: [], sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "foursquare", license: "Apache-2.0" }], ...o,
});
const cat = (primary: string, extra: Record<string, unknown> = {}) => raw({ taxonomy: { primary, hierarchy: HIER }, ...extra });
function facts(o: Record<string, unknown> = {}, over: Partial<QualificationFacts> = {}): QualificationFacts {
  const r = toCandidate(o, { provinces: [] }, { cityKeyOf: cityKey });
  assert.ok(r.ok, JSON.stringify(r));
  const c = r.candidate;
  return {
    tier: c.tier, licenseOk: c.licenseOk, licenses: c.licenses, datasets: c.datasets, chainSignal: c.chainSignal, matchState: "NEW", qualityFlags: c.qualityFlags, province: c.province,
    address: c.address, postalCode: c.postalCode, phone: c.phone, website: c.website, territoryKey: "greater-montreal", reviewState: "PENDING",
    name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, ...over,
  };
}
const V1 = DEFAULT_POLICY_RULES, V2 = RECOMMENDED_V2_RULES;
const ev = (o: Record<string, unknown>, rules: PolicyRules = V2, over: Partial<QualificationFacts> = {}) => evaluateQualification(rules, facts(o, over));
const lane = (o: Record<string, unknown>, rules: PolicyRules = V2, over: Partial<QualificationFacts> = {}) => { const r = ev(o, rules, over); return `${r.lane}:${r.reasons.join(",")}`; };

// ── V1 is untouched ─────────────────────────────────────────────────────────────────────────────────────
test("V1 compatibility: the V1 default rules keep their recorded fingerprint, explicit V1 options hash identically, V2 differs; V1 outcomes for the new categories are exactly what they were", () => {
  assert.equal(rulesHashOf(V1), "a3598febaf1285daa15ec5d20f3d47460832faecd71757bf4a5101f92f7bd987", "a policy stored before V2 existed still verifies at activation");
  assert.equal(rulesHashOf(canonicalRules({ businessTypes: "STORED_TIER", nonTargetBusiness: "BLOCK", genericService: "REVIEW", lowConfidence: "REVIEW" })), rulesHashOf(V1));
  assert.notEqual(rulesHashOf(V2), rulesHashOf(V1));
  assert.notEqual(rulesHashOf(canonicalRules({ lowConfidence: "CORROBORATED" })), rulesHashOf(V1));
  // Old stored rules (no V2 keys) parse to V1 behaviour.
  assert.deepEqual(canonicalRules({ provinces: ["QC"], secondaryTier: "REVIEW" }).businessTypes, "STORED_TIER");
  assert.equal(lane(cat("auto_body_shop"), V1), "HUMAN_REVIEW:SECONDARY_CATEGORY");
  assert.equal(lane(cat("auto_parts_store"), V1), "HUMAN_REVIEW:SECONDARY_CATEGORY", "V1 does not block parts stores (it only asks a human)");
  assert.equal(lane(cat("automotive_service"), V1), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(lane(raw({ confidence: 0.3 }), V1), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE", "V1: low confidence is always a human, even with two sources");
  assert.equal(lane(cat("automotive_repair"), V1), "AUTO_ELIGIBLE:");
});

// ── business types ──────────────────────────────────────────────────────────────────────────────────────
test("business type: every known category maps to a type; repair-capable vs non-target vs uncertain; unknown codes only from words, never from completeness", () => {
  const t = (code: string, name = "X") => classifyBusinessType({ taxonomyPrimary: code, name });
  for (const c of ["automotive_repair", "engine_repair_service", "oil_change_station"]) assert.equal(t(c).type, "GENERAL_REPAIR");
  for (const c of ["brake_service_and_repair", "transmission_repair", "auto_electrical_repair", "tire_shop", "tire_dealer_and_repair", "truck_repair", "wheel_and_rim_repair"]) assert.equal(t(c).type, "SPECIALTY_REPAIR");
  assert.equal(t("auto_body_shop").type, "BODY_COLLISION");
  assert.equal(t("auto_glass_service").type, "GLASS"); assert.equal(t("windshield_installation_and_repair").type, "GLASS");
  for (const c of ["auto_restoration_service", "trailer_repair"]) assert.equal(t(c).type, "RESTORATION_TRAILER");
  for (const c of ["auto_parts_store", "truck_parts_and_accessories"]) assert.equal(t(c).capability, "NON_TARGET");
  for (const c of ["car_wash", "auto_detailing", "towing_service", "emergency_roadside_service", "car_window_tinting", "vehicle_wrap", "auto_upholstery", "auto_security", "automobile_registration_service", "automotive_consultant"]) assert.equal(t(c).capability, "NON_TARGET", c);
  for (const c of ["auto_dealer", "used_auto_dealer", "commercial_vehicle_dealer", "truck_dealer", "auto_customization", "car_inspection"]) assert.equal(t(c).capability, "UNCERTAIN", c);
  // unknown / generic
  assert.equal(t("automotive_service", "Garage Roy").type, "UNSPECIFIED_REPAIR_EVIDENCE");
  assert.equal(t("automotive_service", "Mécanique Générale Lavoie").capability, "REPAIR");
  assert.equal(t("automotive_service", "Pneus Express").capability, "REPAIR");
  assert.equal(t("automotive_service", "Auto Roy").capability, "UNSPECIFIED", "no evidence ⇒ no guess");
  assert.equal(t("automotive_service", "Garage Remorquage Roy").capability, "UNSPECIFIED", "a contrary word wins");
  assert.equal(t("automotive_service", "Lave-Auto Plus").capability, "UNSPECIFIED");
  assert.equal(t("automotive_service", "Pièces d'auto Garage Beaulieu").capability, "UNSPECIFIED");
  assert.equal(t("automotive_service", "Toyota Laval Garage").capability, "UNSPECIFIED", "an OEM-branded generic listing may be a dealer service department");
  assert.equal(t("tire_installation_service", "Dupuis").type, "UNSPECIFIED_REPAIR_EVIDENCE", "unmapped code with a repair word");
  assert.equal(t("car_rental_service", "Garage Location Roy").capability, "UNSPECIFIED");
  assert.equal(t("exhaust_and_muffler_shop", "Y").capability, "REPAIR");
  assert.ok(nameEvidence("Silencieux Pro").repair && nameEvidence("Carrosserie Bélanger").repair && nameEvidence("Garage Beaulieu").repair);
  assert.deepEqual(BUSINESS_TYPES.length, new Set(BUSINESS_TYPES).size);
});

test("independent sources: Overture's own label and duplicates do not count as corroboration", () => {
  assert.equal(independentSources(["meta", "Overture"]), 1);
  assert.equal(independentSources(["meta", "meta"]), 1);
  assert.equal(independentSources(["meta", "foursquare"]), 2);
  assert.equal(independentSources(["Meta", "Foursquare", "OvertureMaps", "AllThePlaces"]), 3);
  assert.equal(independentSources([]), 0);
});

// ── V2 rules ────────────────────────────────────────────────────────────────────────────────────────────
test("V2: real repair businesses are in scope — body/collision, glass, restoration, trailer repair and every specialist — with an explanatory note; V1 sent the same ones to a human", () => {
  for (const code of ["auto_body_shop", "auto_glass_service", "windshield_installation_and_repair", "auto_restoration_service", "trailer_repair"]) {
    assert.equal(lane(cat(code), V2), "AUTO_ELIGIBLE:REPAIR_CAPABLE_SPECIALTY", code);
    assert.equal(lane(cat(code), V1), "HUMAN_REVIEW:SECONDARY_CATEGORY", `V1 ${code}`);
  }
  for (const code of ["brake_service_and_repair", "transmission_repair", "tire_shop", "auto_electrical_repair", "truck_repair"]) assert.equal(lane(cat(code), V2), "AUTO_ELIGIBLE:", code);
  // A specialised shop with the PROFESSION in its name is still just a repair shop.
  assert.equal(lane(cat("transmission_repair", { name: "Transmission Spécialistes Dupuis" }), V2), "AUTO_ELIGIBLE:");
});

test("V2: parts-only, wash/detailing-only, towing and similar are blocked as NOT_TARGET_BUSINESS (or reviewed, if the policy says so); dealers, customization and inspection stay with a human", () => {
  for (const code of ["auto_parts_store", "truck_parts_and_accessories", "car_wash", "auto_detailing", "towing_service", "emergency_roadside_service", "car_window_tinting", "vehicle_wrap", "auto_upholstery", "auto_security", "automobile_registration_service", "automotive_consultant"]) {
    assert.equal(lane(cat(code), V2), "BLOCKED:NOT_TARGET_BUSINESS", code);
    assert.equal(lane(cat(code), canonicalRules({ ...V2, nonTargetBusiness: "REVIEW" })), "HUMAN_REVIEW:NOT_TARGET_BUSINESS", `${code} review mode`);
  }
  for (const code of ["auto_dealer", "used_auto_dealer", "truck_dealer", "commercial_vehicle_dealer", "auto_customization", "car_inspection"]) assert.equal(lane(cat(code), V2), "HUMAN_REVIEW:SECONDARY_CATEGORY", code);
  // A mapped repair code is never overridden by a contrary-sounding name: the platform's own category wins for KNOWN codes, and the name only matters for generic ones.
  assert.equal(lane(cat("automotive_repair", { name: "Garage Remorquage Roy" }), V2), "AUTO_ELIGIBLE:");
});

test("V2: generic `automotive_service` / unmapped codes qualify ONLY on independent name or code evidence with nothing contrary; otherwise a human", () => {
  const g = (name: string, code = "automotive_service", rules: PolicyRules = V2) => lane(cat(code, { name }), rules);
  assert.equal(g("Garage Tremblay"), "AUTO_ELIGIBLE:CATEGORY_NAME_EVIDENCE");
  assert.equal(g("Mécanique Lavoie Inc."), "AUTO_ELIGIBLE:CATEGORY_NAME_EVIDENCE");
  assert.equal(g("Pneus Alma"), "AUTO_ELIGIBLE:CATEGORY_NAME_EVIDENCE");
  assert.equal(g("Auto Dupont"), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(g("Garage Remorquage Dupont"), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(g("Lave-auto Express"), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(g("Toyota Laval Service"), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(g("Garage Tremblay", "automotive_service", canonicalRules({ ...V2, genericService: "REVIEW" })), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY", "policy can keep humans on generic categories");
  assert.equal(g("Dupuis", "brake_pad_installation"), "AUTO_ELIGIBLE:CATEGORY_NAME_EVIDENCE");
  assert.equal(g("Dupuis", "car_rental_agency"), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  // A known repair code under an OEM brand stays a possible dealer service department.
  assert.equal(lane(cat("automotive_repair", { name: "Toyota Laval Service" }), V2), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
  assert.equal(lane(cat("auto_body_shop", { name: "Honda Carrosserie Laval" }), V2), "HUMAN_REVIEW:QUESTIONABLE_CATEGORY");
});

test("V2: low source confidence needs INDEPENDENT corroboration (2+ upstream datasets, phone, street address, platform-recognised repair category); completeness alone never counts", () => {
  const low = (o: Record<string, unknown> = {}, rules: PolicyRules = V2, code = "brake_service_and_repair") => lane(cat(code, { confidence: 0.3, ...o }), rules);
  assert.equal(low(), "AUTO_ELIGIBLE:CORROBORATED_LOW_CONFIDENCE");
  assert.equal(low({}, V2, "auto_body_shop"), "AUTO_ELIGIBLE:CORROBORATED_LOW_CONFIDENCE,REPAIR_CAPABLE_SPECIALTY");
  assert.equal(low({}, V1), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE", "V1 unchanged");
  assert.equal(low({}, canonicalRules({ ...V2, lowConfidence: "REVIEW" })), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  // one independent source only (Overture's label does not count)
  assert.equal(low({ sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }] }), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  assert.equal(low({ sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }] }), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  // a complete record with a website, phone and address but a single source is NOT corroborated
  assert.equal(low({ sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], emails: ["info@x.ca"], websites: ["https://x.ca/"] }), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  // missing phone or street address
  assert.equal(low({ phones: [] }), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  assert.equal(low({ address: { freeform: null, locality: "Laval", postcode: "H7N 1A1", region: "QC", country: "CA" } }).startsWith("HUMAN_REVIEW"), true);
  // a generic category cannot be rescued by corroboration + a repair-sounding name: category must be platform-recognised
  assert.equal(low({ name: "Garage Roy" }, V2, "automotive_service"), "HUMAN_REVIEW:FLAG_LOW_CONFIDENCE");
  // other reasons are unaffected by corroboration
  assert.equal(low({ name: "Midas Laval" }), "HUMAN_REVIEW:CHAIN_SIGNAL", "corroboration waives only the confidence flag");
});

test("mandatory human review is never bypassed by ANY policy option: ambiguous matches, branches, chains, source change, dealer service, geo conflicts, thin data; blocks stay blocks", () => {
  const open: PolicyRules = canonicalRules({ businessTypes: "REPAIR_CAPABLE", nonTargetBusiness: "BLOCK", genericService: "NAME_EVIDENCE", lowConfidence: "CORROBORATED", secondaryTier: "AUTO", existingMatch: "AUTO_LINK", requireLocation: false, requireReachableChannel: false, reviewFlags: [] });
  assert.equal(ev(cat("auto_body_shop"), open, { matchState: "AMBIGUOUS" }).lane, "HUMAN_REVIEW");
  assert.equal(ev(cat("auto_body_shop"), open, { matchState: "BRANCH_OF_EXISTING" }).lane, "HUMAN_REVIEW");
  assert.deepEqual(ev(raw({ name: "Midas Laval" }), open).reasons, ["CHAIN_SIGNAL"]);
  assert.equal(ev(raw({ brandWikidata: "Q123" }), open).lane, "HUMAN_REVIEW");
  assert.equal(ev(cat("auto_body_shop"), open, { stickyReasons: ["SOURCE_CHANGED"] }).lane, "HUMAN_REVIEW");
  assert.equal(ev(raw({ name: "Toyota Laval Service" }), open).lane, "HUMAN_REVIEW");
  assert.equal(ev(raw({ name: "Kia Garage" }), open, { territoryKey: "unresolved" }).lane, "HUMAN_REVIEW");
  assert.equal(ev(cat("auto_dealer"), open).lane, "HUMAN_REVIEW");
  assert.equal(ev(cat("auto_body_shop", { sources: [{ dataset: "OpenStreetMap", license: "ODbL-1.0" }] }), open).lane, "BLOCKED");
  assert.equal(ev(cat("auto_body_shop", { operatingStatus: "closed" }), open).lane, "BLOCKED");
  assert.equal(ev(cat("auto_body_shop", { phones: [], address: { freeform: null, locality: "Laval", postcode: null, region: "QC", country: "CA" } }), open).lane, "BLOCKED");
  assert.equal(ev(cat("auto_body_shop"), open, { reviewState: "REJECTED" }).lane, null, "a human rejection is never reopened");
  assert.equal(ev(cat("auto_body_shop"), open, { licenses: [], datasets: [] }).lane, "BLOCKED");
});

test("V2 is a pure refinement of V1 for everything V1 already auto-qualified, and never auto-qualifies what V1 blocked (fuzzed, 4,000 synthetic records × 6 rule sets)", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const codes = ["automotive_repair", "auto_body_shop", "auto_glass_service", "tire_shop", "brake_service_and_repair", "automotive_service", "car_wash", "auto_parts_store", "auto_dealer", "towing_service", "weird_new_code", "trailer_repair", "auto_customization"];
  const names = ["Garage Roy", "Auto Roy", "Midas Laval", "Toyota Garage", "Carrosserie Bélanger", "Remorquage Roy", "Pneus Alma", "Lave-auto X", "Centre Mécanique Tremblay", "Dupuis"];
  const sets: PolicyRules[] = [V1, V2, canonicalRules({ ...V2, secondaryTier: "AUTO", chainSignal: "AUTO", lowConfidence: "CORROBORATED" }), canonicalRules({ ...V2, nonTargetBusiness: "REVIEW" }), canonicalRules({ lowConfidence: "CORROBORATED" }), canonicalRules({ businessTypes: "REPAIR_CAPABLE" })];
  const rows: CompareRow[] = [];
  for (let i = 0; i < 4000; i++) {
    const srcs = pick([[{ dataset: "meta" }], [{ dataset: "meta" }, { dataset: "foursquare" }], [{ dataset: "meta" }, { dataset: "Overture" }], [{ dataset: "meta" }, { dataset: "OpenStreetMap", license: "ODbL-1.0" }]]).map((s) => ({ license: "CDLA-Permissive-2.0", ...s }));
    const r = toCandidate(raw({
      confidence: pick([0.2, 0.4, 0.8]), name: pick(names), taxonomy: { primary: pick(codes), hierarchy: HIER }, sources: srcs, phones: rnd() < 0.8 ? ["+14505550100"] : [], websites: rnd() < 0.6 ? ["https://a.example.ca/"] : [],
      address: rnd() < 0.85 ? { freeform: "1 Rue A", locality: "Laval", postcode: "H7N 1A1", region: "QC", country: "CA" } : { freeform: null, locality: "Laval", postcode: null, region: "QC", country: "CA" },
      ...(rnd() < 0.05 ? { operatingStatus: "closed" } : {}),
    }), { provinces: [] }, { cityKeyOf: cityKey });
    if (!r.ok) continue;
    rows.push({ ...facts(raw(), {}), tier: r.candidate.tier, licenseOk: r.candidate.licenseOk, licenses: r.candidate.licenses, datasets: r.candidate.datasets, chainSignal: r.candidate.chainSignal, qualityFlags: r.candidate.qualityFlags,
      address: r.candidate.address, postalCode: r.candidate.postalCode, phone: r.candidate.phone, website: r.candidate.website, name: r.candidate.name, taxonomyPrimary: r.candidate.taxonomyPrimary, classReasons: r.candidate.classReasons,
      matchState: pick(["NEW", "NEW", "NEW", "AMBIGUOUS", "BRANCH_OF_EXISTING", "EXISTING_STRONG"] as const), territoryKey: pick(["greater-montreal", "national", "unresolved"]), city: "Laval", sourceConfidence: r.candidate.sourceConfidence, stickyReasons: rnd() < 0.03 ? ["SOURCE_CHANGED"] : [] });
  }
  assert.ok(rows.length > 3500);
  for (const b of sets) {
    const rep = buildComparison(rows, V1, b);
    assert.equal(rep.invariants.ok, true, JSON.stringify(rep.invariants.violations));
    if (b.businessTypes === "REPAIR_CAPABLE" && b.lowConfidence === "CORROBORATED" && b.secondaryTier === "REVIEW" && b.chainSignal === "REVIEW") {
      // V2 vs V1: nothing V1 auto-qualified is demoted for a reason V2 introduces except the explicit non-target/dealer-service/OEM-generic judgements.
      for (const m of rep.movements.filter((g) => g.from === "AUTO_ELIGIBLE")) assert.ok(/NOT_TARGET_BUSINESS|QUESTIONABLE_CATEGORY|SECONDARY_CATEGORY/.test(m.cause), `unexpected demotion: ${m.cause}`);
    }
    for (const [k] of Object.entries(rep.transitions)) assert.ok(!/^BLOCKED->AUTO_ELIGIBLE$/.test(k) || b.chainSignal === "AUTO" || b.nonTargetBusiness !== undefined, k);
  }
  // V1 blocked integrity records are blocked under every set (licence/excluded/contact/provenance) — transitions BLOCKED→AUTO only for NOT_TARGET removal in V1? V1 never blocks that, so there are none.
  for (const b of sets) { const t = buildComparison(rows, V1, b).transitions; assert.equal(t["BLOCKED->AUTO_ELIGIBLE"] ?? 0, 0); }
});

// ── comparison report ───────────────────────────────────────────────────────────────────────────────────
function population(): CompareRow[] {
  const mk = (o: Record<string, unknown>, over: Partial<QualificationFacts> = {}): CompareRow => ({ ...facts(o, over), city: "Laval", sourceConfidence: (o.confidence as number | undefined) ?? 0.9 });
  return [
    ...Array.from({ length: 5 }, () => mk(cat("automotive_repair"))),
    ...Array.from({ length: 4 }, () => mk(cat("auto_body_shop"))),
    ...Array.from({ length: 2 }, () => mk(cat("auto_glass_service"))),
    ...Array.from({ length: 3 }, () => mk(cat("auto_parts_store"))),
    ...Array.from({ length: 2 }, () => mk(cat("car_wash"))),
    ...Array.from({ length: 3 }, () => mk(cat("automotive_service", { name: "Garage Roy" }))),
    ...Array.from({ length: 2 }, () => mk(cat("automotive_service", { name: "Auto Roy" }))),
    ...Array.from({ length: 2 }, () => mk(cat("tire_shop", { confidence: 0.3 }))),
    mk(cat("tire_shop", { confidence: 0.3, sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }] })),
    mk(cat("auto_body_shop"), { matchState: "AMBIGUOUS" }), mk(cat("auto_body_shop", { name: "Carstar Laval" })), mk(cat("auto_dealer")),
    mk(cat("automotive_repair", { sources: [{ dataset: "OpenStreetMap", license: "ODbL-1.0" }] })),
    mk(cat("automotive_repair"), { territoryKey: "national" }),
  ];
}
test("comparison report: V1 vs V2 distribution, every movement with its reasons, by business type, territory split, pilot estimate, invariants, no names unless asked, no contact data ever", () => {
  const rows = population();
  const rep = buildComparison(rows, V1, V2, { examplesPerGroup: 2 });
  assert.equal(rep.evaluated, rows.length);
  assert.equal(Object.values(rep.a.lanes).reduce((x, y) => x + y, 0), rows.length);
  assert.equal(Object.values(rep.b.lanes).reduce((x, y) => x + y, 0), rows.length);
  assert.ok(rep.b.lanes.AUTO_ELIGIBLE > rep.a.lanes.AUTO_ELIGIBLE);
  assert.equal(rep.invariants.ok, true);
  // movements
  const up = rep.movements.filter((m) => m.to === "AUTO_ELIGIBLE");
  assert.ok(up.every((m) => m.from === "HUMAN_REVIEW"));
  const body = up.find((m) => /SECONDARY_CATEGORY/.test(m.cause) && /REPAIR_CAPABLE_SPECIALTY/.test(m.cause));
  assert.ok(body && body.count >= 6 && body.byBusinessType.BODY_COLLISION >= 4 && body.byBusinessType.GLASS === 2, JSON.stringify(up));
  assert.ok(up.find((m) => /QUESTIONABLE_CATEGORY/.test(m.cause) && /CATEGORY_NAME_EVIDENCE/.test(m.cause))?.count === 3);
  assert.ok(up.find((m) => /FLAG_LOW_CONFIDENCE/.test(m.cause) && /CORROBORATED_LOW_CONFIDENCE/.test(m.cause))?.count === 2);
  const blocked = rep.movements.find((m) => m.to === "BLOCKED" && /NOT_TARGET_BUSINESS/.test(m.cause));
  assert.ok(blocked && blocked.count === 5 && blocked.from === "HUMAN_REVIEW", "parts/wash move from review to blocked, with the reason");
  assert.equal(rep.movements.filter((m) => m.from === "AUTO_ELIGIBLE").length, 0, "nothing V1 auto-qualified was demoted in this population");
  // by type / category / territory / pilot
  assert.equal(rep.byBusinessType.BODY_COLLISION.total, 6);
  assert.equal(rep.byBusinessType.PARTS_RETAIL.b.BLOCKED, 3);
  assert.ok(rep.byCategory.find((c) => c.category === "auto_body_shop")!.bAuto >= 4);
  assert.ok(rep.byTerritory["REMOTE · rest of Canada"] && rep.byTerritory["FIELD · Greater Montréal"]);
  assert.equal(rep.pilot.autoDelta, rep.pilot.autoB - rep.pilot.autoA);
  assert.equal(rep.pilot.autoBMontrealField + rep.pilot.autoBRemote + rep.pilot.autoBUnresolvedTerritory, rep.pilot.autoB);
  assert.ok(rep.pilot.reviewReductionPct > 0);
  assert.equal(rep.lowConfidence.flagged, 3);
  assert.equal(rep.lowConfidence.byIndependentSources["2"], 2);
  assert.equal(rep.lowConfidence.corroboratedAndAutoUnderB, 2);
  // privacy: examples carry no name by default and never a phone/email/address
  assert.ok(rep.movements.flatMap((m) => m.examples).every((e) => e.name === undefined));
  const withNames = buildComparison(rows, V1, V2, { examplesPerGroup: 2, includeNames: true });
  assert.ok(withNames.movements.flatMap((m) => m.examples).some((e) => typeof e.name === "string"));
  const flat = JSON.stringify(withNames);
  assert.ok(!/\+1450555|@|rue principale/i.test(flat), "no phone, email or street address in the report");
  const md = renderComparisonMarkdown(rep, { a: "V1", b: "V2" });
  assert.match(md, /Nothing was imported, assigned, contacted or modified/);
  assert.match(md, /Safety invariants[\s\S]*✔/);
  assert.match(md, /names hidden/);
  // identical rule sets ⇒ no movement
  const same = buildComparison(rows, V1, V1);
  assert.equal(same.movements.length, 0); assert.equal(same.pilot.autoDelta, 0);
});

// ── i18n + static guards ────────────────────────────────────────────────────────────────────────────────
test("EN/FR: every reason, business type and comparison label exists in both languages", () => {
  const flat = (o: unknown, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o as object).flatMap(([k, v]) => (typeof v === "string" ? [[`${p}${k}`, v]] : Object.entries(flat(v, `${p}${k}.`)))));
  const en = radarCopy("en").automation, fr = radarCopy("fr").automation;
  assert.deepEqual(Object.keys(flat(en)).sort(), Object.keys(flat(fr)).sort());
  for (const [k, v] of Object.entries(flat(en))) { assert.ok(v.trim() && flat(fr)[k].trim(), k); assert.deepEqual((v.match(/\{\w+\}/g) ?? []).sort(), (flat(fr)[k].match(/\{\w+\}/g) ?? []).sort(), k); }
  for (const c of [en, fr]) { for (const r of QUALIFICATION_REASONS) assert.ok(c.qualification.reasons[r], r); for (const t of BUSINESS_TYPES) assert.ok(c.types[t], t); }
});

test("read-only guarantees: the comparison library only reads; the production report script runs in ONE read-only transaction, issues SELECTs only and never prints the connection string", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const lib = strip(readFileSync(path.join(root, "src/lib/lead-radar/compare.ts"), "utf8"));
  assert.ok(!/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction|writeCrmAudit/.test(lib), "compare.ts performs no write");
  const action = readFileSync(path.join(root, "src/actions/lead-radar-automation.ts"), "utf8");
  const cmp = action.slice(action.indexOf("export async function compareLeadPolicies"));
  assert.match(cmp, /requireLeadRadar\("admin"\)/);
  assert.ok(!/writeCrmAudit|\.create\(|\.update\(|\.upsert\(|\.delete/.test(cmp), "the compare action writes nothing");
  const script = readFileSync(path.join(root, "scripts/lead-radar/policy-report.ts"), "utf8");
  const code = strip(script);
  assert.match(code, /BEGIN READ ONLY/);
  const sql = [...code.matchAll(/client\.query\(\s*`([\s\S]*?)`/g), ...code.matchAll(/client\.query\(\s*"([^"]*)"/g)].map((m) => m[1]);
  const writers = sql.filter((q) => /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT)\b/i.test(q));
  assert.equal(writers.length, 1, "the only write-shaped statement is the self-test that PROVES the connection rejects writes");
  assert.match(writers[0], /selftest/);
  assert.ok(code.indexOf("INSERT INTO") > code.indexOf("selftest-readonly") && code.indexOf("INSERT INTO") < code.indexOf("ROLLBACK"), "the self-test write lives inside the --selftest-readonly branch and is followed by ROLLBACK");
  assert.ok(!/console\.(log|error)\([^)]*\burl\b/.test(code), "the connection string is never printed");
});
