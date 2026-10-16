import test from "node:test";
import assert from "node:assert/strict";
import { assessIcp, icpReasons, isIcpExclusion, OUTSIDE_ICP_REASON } from "../src/domain/lead-radar/icp";
import { DEALER_NETWORK_DOMAINS, ICP_BRANDS, ICP_REGISTRY_VERSION, type IcpBrand } from "../src/domain/lead-radar/icp-registry";
import { assessRepairFit } from "../src/domain/lead-radar/repair-fit";
import { DEFAULT_POLICY_RULES, RECOMMENDED_V2_RULES, evaluateQualification, type QualificationFacts } from "../src/domain/lead-radar/qualification";
import { isSharedIdentityDomain } from "../src/domain/sales-crm/shared-identity";

const REPAIR = "automotive_repair";
const fit = (name: string, extra: { website?: string; city?: string; taxonomyPrimary?: string } = {}) => assessRepairFit({ name, taxonomyPrimary: extra.taxonomyPrimary ?? REPAIR, classReasons: [], website: extra.website, city: extra.city });

test("explicit corporate/chain brands are EXCLUDED with the distinct ICP reason", () => {
  const names = [
    "Walmart Auto Care Centre", "Canadian Tire Auto Service", "Pneus Canadian Tire", "NAPA Auto Parts", "NAPA AUTOPRO", "Napa Auto Pro Edmonton", "Bumper to Bumper", "Bumper To Bumper Auto Parts",
    "OK Tire", "OK Tire St. Albert", "OK Pneus", "Fountain Tire", "Fountain Tire - Calgary", "Kal Tire", "Midas Auto Service", "Mr. Lube", "Jiffy Lube #123", "CARSTAR Collision", "Fix Auto Leduc", "Krown Rust Control",
    "Great Canadian Oil Change", "Boyd Autobody & Glass", "Gerber Collision & Glass", "Speedy Glass", "Active Green + Ross", "Integra Tire", "Tirecraft", "AutoZone", "Lordco Auto Parts", "PartSource",
  ];
  for (const n of names) {
    const r = fit(n);
    assert.equal(r.fit, "EXCLUDED", n);
    assert.ok(r.reasons.includes(OUTSIDE_ICP_REASON), n);
    assert.ok(isIcpExclusion(r.reasons), n);
    assert.ok(r.reasons.includes(`ICP_REGISTRY_V${ICP_REGISTRY_VERSION}`), n);
  }
  assert.ok(fit("NAPA AUTOPRO").reasons.includes("ICP_BRAND_NAPA"));
  assert.ok(fit("Fountain Tire").reasons.includes("ICP_TIRE_NETWORK"));
});

test("branded location with its own name is excluded through the franchisor website host", () => {
  const r = fit("R.R. Station Service Inc.", { website: "https://www.napaautopro.com/stations/rr" });
  assert.equal(r.fit, "EXCLUDED");
  assert.ok(r.reasons.includes("ICP_BRAND_NAPA"));
  assert.equal(fit("Peace Valley Tire", { website: "http://oktire.ca/store/123" }).fit, "EXCLUDED");
});

test("independent shops that merely mention a supplier, certification or affiliation stay eligible", () => {
  const ok = [
    ["Joe's Garage (NAPA parts available)", {}],
    ["Elm Street Auto Repair - NAPA Certified", {}],
    ["Riverside Auto - member of NAPA AUTOPRO", {}],
    ["Mike's Brake & Muffler (Bosch Car Service partner)", {}],
    ["Midas Touch Auto Detail & Repair", {}],
    ["Napa Valley Motors Repair", {}],
    ["Speedy's Garage", { city: "Camrose" }],
    ["Dad's Auto Repair Shop", { website: "https://yp.ca/bus/dads" }],
    ["Prairie Diesel & Truck Repair", {}],
    ["Foothills Heavy Duty Truck Repair", {}],
    ["Hinton Mobile Diesel Mechanic", {}],
    ["Family Discount Tire Centre", {}], ["Fix And Go Auto Repair", {}], ["Good To Go Auto Repair & Maintenance Ltd", { website: "http://go-to-auto.ca" }],
    ["Speedy Muffler Tire & Auto Repair", { website: "https://speedymufflerz.com" }],
    ["North Edmonton Brake & Suspension", { website: "https://northedmontonbrakes.ca" }],
  ] as const;
  for (const [n, extra] of ok) {
    const r = fit(n, extra);
    assert.ok(!isIcpExclusion(r.reasons), n);
    assert.notEqual(r.fit, "EXCLUDED", n);
  }
  assert.equal(assessIcp({ name: "AMSOIL Dealer Wholesale and Retail", taxonomyPrimary: "oil_change_station" }).outside, false, "a bare \"dealer\" (product reseller) is not a dealership");
  assert.equal(assessIcp({ name: "On the Go Auto Detailing" }).outside, false, "substring of a brand is not the brand (it is excluded as detailing, not as a chain)");
  // A page that only mentions a brand is invisible to the gate: only the name and website host are read.
  assert.equal(assessIcp({ name: "Smith Auto Service", website: "https://smithauto.ca/napa-autopro-parts" }).outside, false);
});

test("weak brand words need generic filler, a store number or the city", () => {
  assert.equal(assessIcp({ name: "Midas" }).outside, true);
  assert.equal(assessIcp({ name: "Midas Auto Service #204" }).outside, true);
  assert.equal(assessIcp({ name: "Speedy Camrose", city: "Camrose" }).outside, true);
  assert.equal(assessIcp({ name: "NAPA Edmonton", city: "Edmonton" }).outside, true);
  assert.equal(assessIcp({ name: "Speedy's Garage" }).outside, false);
  assert.equal(assessIcp({ name: "Midas Touch Detailing" }).outside, false);
});

test("dealerships and dealer service departments are excluded; mixed independent shops are not", () => {
  assert.equal(fit("Park Chevrolet Dealership").fit, "EXCLUDED");
  assert.equal(fit("Concessionnaire Auto Laval", { taxonomyPrimary: "auto_dealer" }).fit, "EXCLUDED");
  assert.ok(fit("Valley Motors", { taxonomyPrimary: "used_auto_dealer" }).reasons.includes(OUTSIDE_ICP_REASON));
  assert.equal(fit("Southside Service", { website: "https://www.toyota.ca/dealers/southside" }).fit, "EXCLUDED");
  assert.equal(fit("Joe's Auto Repair & Used Car Dealer").fit === "EXCLUDED" && isIcpExclusion(fit("Joe's Auto Repair & Used Car Dealer").reasons), false);
  assert.equal(assessIcp({ name: "AutoCanada Edmonton" }).category, "DEALERSHIP_GROUP");
});

test("an OEM-branded repair listing whose independence is unknown is still a human question (not an automatic exclusion)", () => {
  const r = fit("Edmonton Toyota Repair Centre");
  assert.equal(r.fit, "HUMAN_REVIEW");
  assert.ok(!isIcpExclusion(r.reasons));
});

test("heavy-duty and diesel shops remain eligible specialists", () => {
  for (const n of ["Alberta Diesel Repair", "Peace River Heavy Duty Truck Repair", "Fleet Diesel Service"]) assert.equal(fit(n, { taxonomyPrimary: "truck_repair" }).fit, "VERIFIED_REPAIR", n);
});

test("registry integrity: unique ids, normalised aliases, and every franchisor domain is ignored for CRM identity", () => {
  const ids = new Set<string>();
  for (const b of ICP_BRANDS) {
    assert.ok(!ids.has(b.id), b.id); ids.add(b.id);
    assert.ok(b.aliases.length > 0, b.id);
    for (const a of [...b.aliases, ...(b.weakAliases ?? [])]) assert.equal(a, a.toLowerCase(), `${b.id}:${a}`);
    for (const d of b.domains ?? []) assert.equal(d, d.toLowerCase());
  }
  // Excluding a chain by its domain must never become identity: shared-identity domains are a separate, stricter list.
  const lacking = ICP_BRANDS.flatMap((b) => b.domains ?? []).filter((d) => ["napaautopro.com", "oktire.ca", "fountaintire.com", "kaltire.com", "canadiantire.ca"].includes(d) && !isSharedIdentityDomain(d));
  assert.deepEqual(lacking, []);
  assert.ok(DEALER_NETWORK_DOMAINS.length > 0);
});

test("registry is extensible by data only: a new brand excludes without touching the classifier", () => {
  assert.equal(icpReasons(assessIcp({ name: "Totally New Chain Auto Care" })).length, 0);
  (ICP_BRANDS as IcpBrand[]).push({ id: "TEST_NEW_CHAIN", category: "FRANCHISE_SERVICE_CHAIN", aliases: ["totally new chain"] });
  try {
    const r = fit("Totally New Chain Auto Care");
    assert.equal(r.fit, "EXCLUDED");
    assert.ok(r.reasons.includes("ICP_BRAND_TEST_NEW_CHAIN"));
  } finally { (ICP_BRANDS as IcpBrand[]).pop(); }
});

const facts = (over: Partial<QualificationFacts>): QualificationFacts => ({
  tier: "PRIMARY", licenseOk: true, licenses: ["CDLA-Permissive-2.0"], datasets: ["meta", "foursquare"], chainSignal: "NO_CHAIN_SIGNAL", matchState: "NEW", qualityFlags: [], province: "AB",
  address: "1 Main St", postalCode: "T5J 0N3", phone: "7805550100", website: null, territoryKey: "national", reviewState: "PENDING", name: "Acme Auto Repair", city: "Edmonton",
  taxonomyPrimary: REPAIR, classReasons: ["REPAIR_SHOP"], ...over,
});
test("qualification BLOCKS a confirmed chain (never human review) under V1 and V2 policies", () => {
  for (const rules of [DEFAULT_POLICY_RULES, RECOMMENDED_V2_RULES]) {
    const r = evaluateQualification(rules, facts({ name: "Fountain Tire", chainSignal: "CHAIN_SIGNAL" }));
    assert.equal(r.lane, "BLOCKED");
    assert.ok(r.reasons.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE"));
    assert.equal(evaluateQualification(rules, facts({ name: "Joe's Garage (NAPA parts available)" })).lane !== "BLOCKED", true);
  }
  assert.equal(evaluateQualification(RECOMMENDED_V2_RULES, facts({ name: "Acme Auto Repair" })).lane, "AUTO_ELIGIBLE");
});

test("franchised dealers and their departments are recognised by the make-at-the-end pattern; independent specialists with the same make are not", () => {
  for (const n of ["Lacombe Ford", "New Lethbridge Mitsubishi", "CH Nissan - Body Shop", "Kelvin Singh - Capital GMC", "Southview Acura Parts", "Park Chevrolet Buick GMC Ltd"]) {
    const r = assessIcp({ name: n });
    assert.equal(r.outside, true, n); assert.equal(r.category, "DEALERSHIP", n);
  }
  for (const n of ["Honda Specialists", "Toyota & Lexus Repair", "Mike's Ford Repair", "Ram Auto Care", "Mini Mechanics", "Euro Auto - BMW Mercedes Audi Specialist", "Unlock My BMW", "Performance Subaru Tuning", "Dodge City Auto Repair", "First Choice Auto"]) assert.equal(assessIcp({ name: n }).outside, false, n);
  assert.equal(assessIcp({ name: "First Truck Centre Edmonton West" }).category, "DEALERSHIP_GROUP");
});

test("heavy-duty truck AND trailer repair is an eligible specialist, while a trailer-only listing is still a human question", () => {
  assert.equal(fit("WTT Truck and Trailer Repair").fit, "VERIFIED_REPAIR");
  assert.equal(fit("Peace River Heavy Duty Truck & Trailer Repair", { taxonomyPrimary: "truck_repair" }).fit, "VERIFIED_REPAIR");
  assert.equal(fit("Remorques O Bédard", { taxonomyPrimary: "trailer_repair" }).fit, "HUMAN_REVIEW");
});

test("brands found by the Alberta Preview-all review: Quick Lane, Speedy Apollo, fuel retailers, luxury dealers with a trailing city", () => {
  for (const [n, city] of [["Quick Lane", "Innisfail"], ["Drayton Valley Quick Lane Tire & Auto Centre", "Drayton Valley"], ["Speedy Apollo Auto Service Centres", "Calgary"], ["Shell Gas", "Calgary"], ["Petro-Canada", "Edmonton"], ["Rolls-Royce Motor Cars Calgary", "Calgary"]] as const) assert.equal(assessIcp({ name: n, city }).outside, true, n);
  for (const [n, city] of [["Shell Lake Garage", "Shell Lake"], ["Esso Valley Mechanical", "Edmonton"]] as const) assert.equal(assessIcp({ name: n, city }).outside, false, n);
});
