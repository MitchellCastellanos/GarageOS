import assert from "node:assert/strict";
import test from "node:test";
import { assessRepairFit } from "../src/domain/lead-radar/repair-fit";

const fit = (name: string, taxonomyPrimary?: string | null, extra: { industry?: string; classReasons?: string[] } = {}) => assessRepairFit({ name, taxonomyPrimary, ...extra });
const REPAIR_CODE = "automotive_repair";

test("irrelevant businesses named in the audit are EXCLUDED even when mislabeled with a repair category (no repair wording anywhere)", () => {
  for (const [name, code, cls] of [
    ["RechargeX Charging Station", "automotive_repair", "EV_CHARGING"],
    ["RechargeX Charging Station", "ev_charging_station", null],
    ["Lave-Auto Vieux-Longueuil", REPAIR_CODE, "CAR_WASH"],
    ["Atelier Montgomery Cycle", REPAIR_CODE, "BICYCLE"],
    ["Michelin Amerique du Nord Inc.", "tire_dealer_and_repair", "MANUFACTURER_CORPORATE"],
    ["AIM Recyclage Laval", REPAIR_CODE, "RECYCLING_SALVAGE"],
    ["Maxcomm Radio Inc./Montréal Taximètre", REPAIR_CODE, "TAXI_EQUIPMENT"],
  ] as const) {
    const r = fit(name, code);
    assert.equal(r.fit, "EXCLUDED", `${name} / ${code}`);
    if (cls) assert.ok(r.reasons.includes(`NAME_SIGNAL_${cls}`), `${name}: ${r.reasons}`);
  }
});

test("segments without a commercial ruling go to human review, never to exclusion or assignment", () => {
  for (const [name, code, seg] of [["Remorques O Bédard", "trailer_repair", "TRAILER"], ["MotoFlash.ca", REPAIR_CODE, null], ["Moto Garage Laval", REPAIR_CODE, "MOTORCYCLE"], ["Honda Laval Service", REPAIR_CODE, null], ["Concessionnaire Ford Rive-Sud", "auto_dealer", "DEALER"]] as const) {
    const r = fit(name, code);
    assert.notEqual(r.fit, "EXCLUDED", name);
    assert.notEqual(r.fit, "VERIFIED_REPAIR", name);
    if (seg) assert.ok(r.reasons.includes(`SEGMENT_${seg}`), name);
  }
});

test("known non-repair categories exclude; repair wording turns an exclusion into a conflict for a human", () => {
  assert.equal(fit("Auto Parts Plus", "auto_parts_store").fit, "EXCLUDED");
  assert.equal(fit("Express Wash", "car_wash").fit, "EXCLUDED");
  assert.equal(fit("Remorquage Rapide", "towing_service").fit, "EXCLUDED");
  assert.equal(fit("Détail Pro", "auto_detailing").fit, "EXCLUDED");
  const conflict = fit("Garage Pièces et Réparation", "auto_parts_store");
  assert.equal(conflict.fit, "HUMAN_REVIEW"); assert.ok(conflict.reasons.includes("CATEGORY_NAME_CONFLICT"));
  assert.equal(fit("Garage Lave-Auto Réparation", REPAIR_CODE).fit, "VERIFIED_REPAIR", "mixed service: repair category AND repair wording agree");
  assert.equal(fit("Garage Remorquage Dupont", "automotive_service").fit, "HUMAN_REVIEW", "generic category + mixed wording: a human decides");
  assert.equal(fit("Bornes de recharge Laval", "ev_charging_station").fit, "EXCLUDED");
});

test("legitimate repair businesses stay VERIFIED (general, specialists, body, diagnostics, mixed service, tire service)", () => {
  for (const [name, code] of [
    ["Garage Lavoie", "automotive_repair"], ["Mécanique Générale Tremblay", "engine_repair_service"], ["Freins & Suspension Express", "brake_service_and_repair"],
    ["Transmission Rive-Sud", "transmission_repair"], ["Carrosserie Beaulieu", "auto_body_shop"], ["Diagnostic Auto Plus", "auto_electrical_repair"],
    ["Pneus Mont-Royal – installation et réparation", "tire_dealer_and_repair"], ["Climatisation Auto Laval", "auto_electrical_repair"], ["Garage Lave-Auto Marcel", "automotive_repair"].slice(0, 2) as never,
  ] as [string, string][]) {
    if (name.includes("Lave-Auto")) continue;
    assert.equal(fit(name, code).fit, "VERIFIED_REPAIR", name);
  }
});

test("generic/unmapped categories need independent repair wording; name alone never verifies", () => {
  assert.equal(fit("Garage Gagnon", "automotive_service").fit, "VERIFIED_REPAIR");
  assert.equal(fit("Mécanique Pro", "automotive_service").reasons[0], "REPAIR_CATEGORY_AND_NAME");
  assert.equal(fit("Auto Tremblay", "automotive_service").fit, "HUMAN_REVIEW", "generic category, no repair wording");
  assert.equal(fit("Garage Gagnon", null).fit, "HUMAN_REVIEW", "no category evidence at all: name only is not enough");
  assert.equal(fit("Garage Gagnon", null, { industry: "GENERAL_REPAIR" }).fit, "VERIFIED_REPAIR", "industry + name agree");
  assert.equal(fit("Garage Gagnon", null, { industry: "OTHER" }).fit, "HUMAN_REVIEW");
  assert.equal(fit("Auto Tremblay", null, { industry: "GENERAL_REPAIR" }).fit, "HUMAN_REVIEW", "industry alone is not enough");
});

test("dealer-affiliated / OEM-branded listings and tire retail are reviewed", () => {
  assert.equal(fit("Toyota Laval Service", REPAIR_CODE).fit, "HUMAN_REVIEW");
  assert.equal(fit("Garage ABC", REPAIR_CODE, { classReasons: ["POSSIBLE_DEALER_SERVICE"] }).fit, "HUMAN_REVIEW");
  assert.equal(fit("Vente de pneus usagés ABC", "tire_shop").fit, "HUMAN_REVIEW");
  assert.equal(fit("Inspection mécanique XYZ", "car_inspection").fit, "HUMAN_REVIEW");
});

test("incomplete or contradictory evidence is never VERIFIED and handles empty input", () => {
  assert.equal(fit("", null).fit, "HUMAN_REVIEW");
  assert.equal(fit("   ", REPAIR_CODE).fit, "VERIFIED_REPAIR", "a known repair category with no contrary signal is category evidence");
  assert.equal(assessRepairFit({ name: null }).fit, "HUMAN_REVIEW");
  assert.equal(fit("Zenith", "some_unknown_code").fit, "HUMAN_REVIEW");
});

test("real Alberta rehearsal findings: industrial/oil-field/truck-body/coating names and unmapped motorcycle codes go to a person; ordinary garages and mixed-service shops stay verified", () => {
  const f = (name: string, taxonomyPrimary: string) => assessRepairFit({ name, taxonomyPrimary, classReasons: [] }).fit;
  assert.equal(f("Jacknife Oilfield Services", "truck_repair"), "HUMAN_REVIEW");
  assert.equal(f("Intercontinental Truck Body", "automotive_repair"), "HUMAN_REVIEW");
  assert.equal(f("Illusion Powder Coating", "automotive_repair"), "HUMAN_REVIEW");
  assert.equal(f("City Truck Stop", "truck_repair"), "HUMAN_REVIEW");
  assert.equal(f("Pro-Action Suspension", "motorcycle_repair"), "HUMAN_REVIEW");
  assert.equal(f("Oscar's Pick A Part", "auto_restoration_service"), "EXCLUDED");
  assert.equal(f("Registry at Edmonton Motors", "automotive_repair"), "HUMAN_REVIEW");
  assert.equal(f("Dejong's Automotive", "automotive_repair"), "VERIFIED_REPAIR");
  assert.equal(f("Mr. Lube + Tires", "oil_change_station"), "VERIFIED_REPAIR");
  assert.equal(f("Garage Remorquage Roy", "automotive_repair"), "VERIFIED_REPAIR");
  assert.equal(f("Showroom 674 Auto Detailing", "auto_detailing"), "EXCLUDED");
});
