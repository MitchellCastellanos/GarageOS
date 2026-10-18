// Early commercial screen + email-level Overture provenance — pure rules (no database, no network).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCREEN_VERSION, screenCandidate, type ScreenFacts } from "../src/domain/lead-radar/commercial-screen";
import { emailProvenanceOf, isAggregatorDataset, normaliseSourceItems, pointsAtEmail, MAX_STORED_ITEMS } from "../src/domain/lead-radar/provenance";
import { toCandidate } from "../src/domain/lead-radar/record";
import { classifyTerritory, cityKey, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { territoryDefaultLanguage } from "../src/domain/sales-crm/language";

const RULES: TerritoryRule[] = [
  { key: "greater-montreal", acquisition: "FIELD_EXCLUSIVE", provinces: ["QC"], cities: ["montreal", "laval", "longueuil", "brossard"], postalPrefixes: ["H", "J4", "J3V", "J3Y", "J5R", "J5C"], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 10 },
  { key: "canada", acquisition: "REMOTE_DEFAULT", provinces: [], cities: [], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 100 },
];
const loc = (province: string | null, city: string | null, postalCode: string | null) => classifyTerritory(RULES, { province, city, postalCode }).state;
const facts = (o: Partial<ScreenFacts> = {}): ScreenFacts => ({ licenseOk: true, tier: "PRIMARY", fit: "VERIFIED_REPAIR", operatingStatus: "open", territory: "NATIONAL", address: "10 Main St", city: "Calgary", postalCode: "T2P 1J9", phone: "+14035550100", email: "info@shop.ca", ...o });

test("screen: FIELD needs a verified independent repair shop and a visitable address (email optional); REMOTE needs a usable email; UNRESOLVED never enters", () => {
  assert.deepEqual(screenCandidate(facts({ territory: "LOCAL", email: null })), { lane: "FIELD", reasons: [] });
  assert.deepEqual(screenCandidate(facts({ territory: "LOCAL", address: null, postalCode: null, city: "Montréal" })).reasons, ["FIELD_NOT_VISITABLE"]);
  assert.deepEqual(screenCandidate(facts({ territory: "LOCAL", address: "1 rue X", postalCode: null, city: null })).reasons, ["FIELD_NOT_VISITABLE"]);
  assert.deepEqual(screenCandidate(facts()), { lane: "REMOTE", reasons: [] });
  assert.deepEqual(screenCandidate(facts({ email: null })).reasons, ["REMOTE_NO_USABLE_EMAIL"]);
  assert.deepEqual(screenCandidate(facts({ email: "not-an-email" })).reasons, ["REMOTE_NO_USABLE_EMAIL"]);
  assert.deepEqual(screenCandidate(facts({ territory: "UNRESOLVED" })).reasons, ["TERRITORY_UNRESOLVED"]);
  assert.equal(screenCandidate(facts({ territory: "UNRESOLVED", email: null })).lane, null);
});

test("screen: commercially useless records are rejected by cheap facts alone — licence, category, fit, closed, no contact data", () => {
  assert.deepEqual(screenCandidate(facts({ licenseOk: false })).reasons, ["LICENSE_BLOCKED"]);
  assert.deepEqual(screenCandidate(facts({ tier: "EXCLUDED" })).reasons, ["TIER_EXCLUDED"]);
  assert.deepEqual(screenCandidate(facts({ fit: "EXCLUDED" })).reasons, ["FIT_EXCLUDED"]);
  assert.deepEqual(screenCandidate(facts({ fit: "HUMAN_REVIEW" })).reasons, ["FIT_NOT_VERIFIED"], "ambiguous is skipped — there is no manual review lane");
  assert.deepEqual(screenCandidate(facts({ fit: null })).reasons, ["FIT_NOT_VERIFIED"]);
  assert.equal(screenCandidate(facts({ fit: "HUMAN_REVIEW", humanFitDecision: true })).lane, "REMOTE", "an explicit recorded human fit decision is honoured");
  assert.equal(screenCandidate(facts({ fit: "EXCLUDED", humanFitDecision: true })).lane, null, "…but never overrides a confirmed exclusion");
  assert.deepEqual(screenCandidate(facts({ operatingStatus: "permanently_closed" })).reasons, ["NOT_OPERATING"]);
  assert.deepEqual(screenCandidate(facts({ phone: null, address: null, postalCode: null })).reasons, ["INSUFFICIENT_CONTACT"]);
  const multi = screenCandidate(facts({ licenseOk: false, fit: "EXCLUDED", email: null }));
  assert.deepEqual(multi.reasons, ["LICENSE_BLOCKED", "FIT_EXCLUDED", "REMOTE_NO_USABLE_EMAIL"], "every reason is reported, deterministically");
  assert.match(SCREEN_VERSION, /^screen-v\d+$/);
});

test("territory & language: Montréal/Laval/South Shore are FIELD; rest of Canada is REMOTE; Québec with no city/postal is UNRESOLVED and never silently REMOTE; Québec outside FIELD defaults to French, elsewhere English", () => {
  assert.equal(loc("QC", "Montréal", "H2X 1Y4"), "LOCAL");
  assert.equal(loc("QC", "Laval", "H7A 9N9"), "LOCAL");
  assert.equal(loc("QC", "Longueuil", "J4K 1A1"), "LOCAL");
  assert.equal(loc("QC", "Brossard", null), "LOCAL");
  assert.equal(loc("QC", "Québec", "G1R 5T8"), "NATIONAL");
  assert.equal(loc("QC", "Trois-Rivières", "G8Z 1A1"), "NATIONAL");
  assert.equal(loc("AB", "Calgary", "T2P 1J9"), "NATIONAL");
  assert.equal(loc("QC", null, null), "UNRESOLVED");
  assert.equal(loc(null, null, null), "UNRESOLVED");
  assert.equal(screenCandidate(facts({ territory: loc("QC", null, null) })).lane, null);
  assert.equal(territoryDefaultLanguage({ province: "QC" }), "FR");
  assert.equal(territoryDefaultLanguage({ province: "ON" }), "EN");
  assert.equal(territoryDefaultLanguage({ province: "NB" }), "EN");
});

test("provenance: place-level vs email-level — a source item names an address only when its property points at /emails (or this address's index)", () => {
  assert.equal(pointsAtEmail("/emails", 0), true);
  assert.equal(pointsAtEmail("/emails/1", 1), true);
  assert.equal(pointsAtEmail("/emails/1", 0), false);
  assert.equal(pointsAtEmail("", 0), false);
  assert.equal(pointsAtEmail("/websites/0", 0), false);
  const items = normaliseSourceItems([
    { property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "PLACE-REC", updateTime: "2026-01-01" },
    { property: "/emails/0", dataset: "msft", license: "MIT", recordId: "EMAIL-REC", updateTime: "2026-02-02T00:00:00Z", confidence: 0.6 },
    { property: "/emails/1", dataset: "foursquare", license: "Apache-2.0", recordId: "OTHER-REC" },
  ]);
  const email = emailProvenanceOf({ placeId: "gers-1", release: "2026-09-23.1", email: "a@shop.ca", emailIndex: 0, items });
  assert.equal(email.scope, "EMAIL");
  assert.deepEqual(email.items.map((i) => i.recordId), ["EMAIL-REC"], "only the item about THIS address is kept as email-level");
  assert.equal(email.originalPublisherKnown, false, "a dataset/provider is not the original publisher");
  const second = emailProvenanceOf({ placeId: "gers-1", release: null, email: "b@shop.ca", emailIndex: 1, items });
  assert.deepEqual(second.items.map((i) => i.recordId), ["OTHER-REC"]);
  const placeOnly = emailProvenanceOf({ placeId: "gers-1", release: "r", email: "a@shop.ca", emailIndex: 0, items: items.filter((i) => i.property === "") });
  assert.deepEqual([placeOnly.scope, placeOnly.items.map((i) => i.recordId)], ["PLACE", ["PLACE-REC"]], "a place-level source never proves where an individual email came from");
  const none = emailProvenanceOf({ placeId: "gers-1", release: "r", email: "a@shop.ca", emailIndex: 0, items: [] });
  assert.deepEqual([none.scope, none.items], ["NONE", []], "nothing is invented when the record carries no sources");
  const many = emailProvenanceOf({ placeId: "g", release: "r", email: "a@shop.ca", emailIndex: 0, items: Array.from({ length: 30 }, (_, i) => ({ property: "/emails/0", dataset: "meta", license: null, recordId: `r${i}`, updateTime: null, confidence: null })) });
  assert.equal(many.items.length, MAX_STORED_ITEMS, "storage is bounded");
  assert.equal(isAggregatorDataset("Meta"), true); assert.equal(isAggregatorDataset("AllThePlaces"), true); assert.equal(isAggregatorDataset("garagetremblay.ca"), false);
});

test("staging keeps minimal provenance for the picked email and never the raw record", () => {
  const raw = {
    v: 1, id: "11111111-2222-4333-8444-555555555555", confidence: 0.9, name: "Garage Test", taxonomy: { primary: "automotive_repair", hierarchy: ["vehicle_service"], alternates: [] },
    address: { freeform: "1 Main", locality: "Calgary", postcode: "T2P 1J9", region: "AB", country: "CA" }, phones: ["+14035550100"], websites: ["https://garagetest.ca/"], emails: ["bad address", "info@garagetest.ca"],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }],
    sourceItems: [{ property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "P1", updateTime: "2026-01-01" }, { property: "/emails/1", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "FB-9", updateTime: "2026-02-01", confidence: 0.5, secretField: "NEVER" }],
    unknownKey: "NEVER",
  };
  const r = toCandidate(raw, { provinces: ["AB"] }, { cityKeyOf: cityKey, release: "2026-09-23.1" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = r.candidate.emailProvenance!;
  assert.deepEqual([p.scope, p.email, p.placeId, p.release, p.items.map((i) => i.recordId)], ["EMAIL", "info@garagetest.ca", "11111111-2222-4333-8444-555555555555", "2026-09-23.1", ["FB-9"]], "the picked address is the SECOND in the list: its own index selects its source");
  assert.ok(!JSON.stringify(p).includes("NEVER"));
  assert.equal(r.candidate.operatingStatus, null);
  const older = toCandidate({ ...raw, sourceItems: undefined }, { provinces: ["AB"] }, { cityKeyOf: cityKey });
  assert.ok(older.ok && older.candidate.emailProvenance?.scope === "NONE", "older extracts have no per-property sources: scope NONE, never guessed");
  const noEmail = toCandidate({ ...raw, emails: [] }, { provinces: ["AB"] }, { cityKeyOf: cityKey });
  assert.ok(noEmail.ok && noEmail.candidate.emailProvenance === null);
});

test("every import path is guarded by the same screen: the shared import transaction calls screenCandidate before building the CSV", () => {
  const src = readFileSync("src/lib/lead-radar/import-service.ts", "utf8");
  const gate = src.indexOf("screenCandidate({");
  assert.ok(gate > 0 && gate < src.indexOf("candidatesToImportCsv(cands"), "screen runs before any CRM write");
  const staging = readFileSync("src/lib/lead-radar/staging.ts", "utf8");
  assert.ok(staging.indexOf("screenCandidate({") < staging.indexOf("loadMatchPool(toMatch"), "staging screens before matching and before any write");
  // the extractor keeps per-property provenance
  assert.match(readFileSync("scripts/lead-radar/overture_extract.py", "utf8"), /"sourceItems": \[source_item\(s\)/);
});
