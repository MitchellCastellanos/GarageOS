// National Lead Radar — what a business DOES (pure). The staged `tier` (taxonomy.ts) answers "is this record in an automotive category?"; this answers the
// sales question: "does it perform vehicle maintenance/repair work that GarageOS software would run?". It is evaluated by the qualification POLICY from facts
// that are already stored on every candidate (taxonomy code, class reasons, name), so a better judgement applies to the 2,000+ staged Québec candidates without
// re-extraction and without changing what V1 means.
//
//  · REPAIR_*       real repair/maintenance work: general, brake/transmission/electrical/tire/truck specialists, body/collision, glass, restoration/trailer.
//  · NON_TARGET     parts-only retail, car wash, detailing-only, towing/roadside, tint/wrap/upholstery/security, registration, consultants.
//  · UNCERTAIN      dealers (may or may not run a service department), customization, inspection: a human decides.
//  · UNSPECIFIED    Overture's generic `automotive_service` or a code we have not mapped: classified ONLY from independent evidence (the code's own words, the business
//                   name) and only when nothing in the name points the other way. No evidence ⇒ stays UNSPECIFIED ⇒ human review.
// Nothing here uses completeness or source confidence: a complete record is not proof that the business is what we want.

import { OEM_NAME } from "@/domain/lead-radar/taxonomy";

export const BUSINESS_TYPES = [
  "GENERAL_REPAIR", "SPECIALTY_REPAIR", "BODY_COLLISION", "GLASS", "RESTORATION_TRAILER",
  "PARTS_RETAIL", "CAR_WASH_DETAILING", "TOWING_ROADSIDE", "OTHER_NON_REPAIR",
  "DEALER", "CUSTOMIZATION", "INSPECTION",
  "UNSPECIFIED_REPAIR_EVIDENCE", "UNSPECIFIED",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export type RepairCapability = "REPAIR" | "NON_TARGET" | "UNCERTAIN" | "UNSPECIFIED";
export const CAPABILITY: Record<BusinessType, RepairCapability> = {
  GENERAL_REPAIR: "REPAIR", SPECIALTY_REPAIR: "REPAIR", BODY_COLLISION: "REPAIR", GLASS: "REPAIR", RESTORATION_TRAILER: "REPAIR",
  PARTS_RETAIL: "NON_TARGET", CAR_WASH_DETAILING: "NON_TARGET", TOWING_ROADSIDE: "NON_TARGET", OTHER_NON_REPAIR: "NON_TARGET",
  DEALER: "UNCERTAIN", CUSTOMIZATION: "UNCERTAIN", INSPECTION: "UNCERTAIN",
  UNSPECIFIED_REPAIR_EVIDENCE: "REPAIR", UNSPECIFIED: "UNSPECIFIED",
};

/** Known Overture taxonomy codes (same universe as taxonomy.ts PRIMARY_RULES) → what the business does. */
export const BY_CODE: Record<string, BusinessType> = {
  automotive_repair: "GENERAL_REPAIR", engine_repair_service: "GENERAL_REPAIR", oil_change_station: "GENERAL_REPAIR",
  brake_service_and_repair: "SPECIALTY_REPAIR", transmission_repair: "SPECIALTY_REPAIR", auto_electrical_repair: "SPECIALTY_REPAIR", wheel_and_rim_repair: "SPECIALTY_REPAIR",
  tire_dealer_and_repair: "SPECIALTY_REPAIR", tire_shop: "SPECIALTY_REPAIR", truck_repair: "SPECIALTY_REPAIR",
  auto_body_shop: "BODY_COLLISION", auto_glass_service: "GLASS", windshield_installation_and_repair: "GLASS",
  auto_restoration_service: "RESTORATION_TRAILER", trailer_repair: "RESTORATION_TRAILER",
  auto_parts_store: "PARTS_RETAIL", truck_parts_and_accessories: "PARTS_RETAIL",
  car_wash: "CAR_WASH_DETAILING", auto_detailing: "CAR_WASH_DETAILING",
  towing_service: "TOWING_ROADSIDE", emergency_roadside_service: "TOWING_ROADSIDE",
  car_window_tinting: "OTHER_NON_REPAIR", vehicle_wrap: "OTHER_NON_REPAIR", auto_upholstery: "OTHER_NON_REPAIR", auto_security: "OTHER_NON_REPAIR",
  automobile_registration_service: "OTHER_NON_REPAIR", automotive_consultant: "OTHER_NON_REPAIR",
  auto_dealer: "DEALER", used_auto_dealer: "DEALER", commercial_vehicle_dealer: "DEALER", truck_dealer: "DEALER",
  auto_customization: "CUSTOMIZATION", car_inspection: "INSPECTION",
};

export const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const words = (s: string) => ` ${strip(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Words in a business NAME (EN/FR) that mean the shop works on vehicles. Whole-word/prefix matches on accent-stripped text. */
export const NAME_REPAIR = [
  "garage", "mecanique", "mecanicien", "mecano", "mechanic", "mechanical", "repair", "repairs", "reparation", "reparations", "service auto", "auto service", "auto services", "services automobiles",
  "pneu", "pneus", "tire", "tires", "frein", "freins", "brake", "brakes", "transmission", "transmissions", "muffler", "mufflers", "silencieux", "exhaust", "echappement",
  "radiateur", "radiator", "suspension", "alignement", "alignment", "diagnostic", "carrosserie", "collision", "body shop", "autobody", "auto body", "peinture auto", "vitres d auto", "auto glass",
  "oil change", "changement d huile", "lube", "tune up", "mise au point", "automobile repair", "truck repair", "reparation de camions",
];
/** Words in a NAME that mean the opposite (retail, washing, towing, selling, renting). Any hit blocks name-based qualification. */
const NAME_NON_TARGET = [
  "lave auto", "lavage", "car wash", "carwash", "detail", "detailing", "esthetique auto", "remorquage", "remorqueur", "towing", "tow", "depannage routier", "roadside",
  "pieces d auto", "pieces auto", "auto parts", "parts", "accessoires", "concessionnaire", "concession", "dealer", "dealership", "auto sales", "ventes auto", "auto vente", "vente d autos", "used cars", "autos usagees",
  "location", "rental", "rent a car", "leasing", "location d auto", "taxi", "limousine", "storage", "entreposage", "stationnement", "parking", "driving school", "ecole de conduite",
  "teinture", "tinting", "wrap", "upholstery", "sellerie", "alarme", "demarreur", "starter remote", "audio", "stereo", "sono",
];

export function hit(text: string, list: readonly string[]): string | null {
  for (const w of list) {
    const needle = ` ${w} `;
    if (text.includes(needle)) return w;
    // allow a plural / suffix on the last word of a phrase ("garage" ⇢ "garages") without opening substring noise
    if (!w.includes(" ") && text.includes(` ${w}s `)) return w;
  }
  return null;
}

/** Name evidence: positive hit and NO negative hit. Returned so the report can explain exactly why. */
export function nameEvidence(name: string | null | undefined): { repair: string | null; nonTarget: string | null } {
  const t = words(name ?? "");
  return { repair: hit(t, NAME_REPAIR), nonTarget: hit(t, NAME_NON_TARGET) };
}

const CODE_REPAIR_TOKENS = ["repair", "mechanic", "tire", "tires", "brake", "brakes", "transmission", "muffler", "exhaust", "radiator", "suspension", "alignment", "engine", "lube", "tuneup"];
export const CODE_NON_TARGET_TOKENS = ["wash", "detailing", "dealer", "dealers", "parts", "towing", "rental", "storage", "parking", "charging", "fuel", "gas", "tinting", "wrap", "upholstery", "registration", "school", "taxi", "limo"];
export function codeEvidence(code: string | null | undefined): { repair: string | null; nonTarget: string | null } {
  const toks = strip(code ?? "").split(/[^a-z0-9]+/).filter(Boolean);
  return { repair: CODE_REPAIR_TOKENS.find((t) => toks.includes(t)) ?? null, nonTarget: CODE_NON_TARGET_TOKENS.find((t) => toks.includes(t)) ?? null };
}

export interface BusinessTypeInput { taxonomyPrimary: string | null | undefined; name: string | null | undefined }
export interface BusinessTypeResult { type: BusinessType; capability: RepairCapability; basis: "TAXONOMY" | "CODE_WORDS" | "NAME" | "NONE"; evidence: string | null }

/**
 * Deterministic and explainable. A KNOWN code is trusted as the platform's own category. A generic/unknown code never decides by itself: it needs a positive
 * word in the code or in the name AND no contrary word in either; otherwise it stays UNSPECIFIED (a human looks at it).
 */
export function classifyBusinessType(i: BusinessTypeInput): BusinessTypeResult {
  const code = i.taxonomyPrimary ?? "";
  const known = BY_CODE[code];
  if (known) return { type: known, capability: CAPABILITY[known], basis: "TAXONOMY", evidence: code };
  const c = codeEvidence(code), n = nameEvidence(i.name);
  // A vehicle-maker name on a generic/unmapped listing is most likely a dealership service department: never qualified on name evidence.
  if (OEM_NAME.test(i.name ?? "")) return { type: "UNSPECIFIED", capability: "UNSPECIFIED", basis: "NAME", evidence: "name:oem-brand" };
  if (c.nonTarget) return { type: "UNSPECIFIED", capability: "UNSPECIFIED", basis: "CODE_WORDS", evidence: `code:${c.nonTarget}` };
  if (n.nonTarget) return { type: "UNSPECIFIED", capability: "UNSPECIFIED", basis: "NAME", evidence: `name:${n.nonTarget}` };
  if (c.repair) return { type: "UNSPECIFIED_REPAIR_EVIDENCE", capability: "REPAIR", basis: "CODE_WORDS", evidence: `code:${c.repair}` };
  if (n.repair) return { type: "UNSPECIFIED_REPAIR_EVIDENCE", capability: "REPAIR", basis: "NAME", evidence: `name:${n.repair}` };
  return { type: "UNSPECIFIED", capability: "UNSPECIFIED", basis: "NONE", evidence: null };
}

/** Datasets that are an AGGREGATOR label rather than an independent upstream contributor. */
const AGGREGATOR = /^(overture|overturemaps|overture maps)/i;
/** Number of DISTINCT upstream datasets behind a candidate, excluding Overture's own label. Independent corroboration needs ≥ 2. */
export function independentSources(datasets: readonly string[]): number {
  return new Set(datasets.map((d) => strip(d).trim()).filter((d) => d && !AGGREGATOR.test(d))).size;
}
