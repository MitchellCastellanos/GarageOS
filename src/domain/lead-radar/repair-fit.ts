// Repair fit — "is this business a legitimate automotive repair/maintenance shop that GarageOS can sell to?" (pure, no DB).
// ONE assessor shared by: Lead Radar qualification (contradiction gate), CRM import (stamps the prospect), the CRM cleanup/preview, the
// assignment engine and the Field Planner. It judges from evidence already stored (taxonomy code, category words, class reasons, industry,
// business name) and never from the name alone:
//
//   VERIFIED_REPAIR  a repair category (platform taxonomy, or a generic automotive-service category PLUS repair wording, or a CRM industry PLUS
//                    repair wording) and nothing contradicting it.
//   EXCLUDED         clear evidence it is something else: a known non-repair category, or a decisive non-repair signal (EV charging, car wash,
//                    towing, recycling/salvage, bicycle, taxi equipment, parts retail, manufacturer/corporate…) with NO repair wording at all.
//   HUMAN_REVIEW     everything else: category and name disagree, segments the commercial policy has not ruled on (motorcycle, trailer, dealer,
//                    tire retail, OEM-branded), or not enough evidence. Never auto-excluded, never auto-assigned.
//
// A human decision (stored on the prospect) always wins over this function; callers apply it. Keyword lists are conservative EN/FR heuristics.
import { BY_CODE, CAPABILITY, CODE_NON_TARGET_TOKENS, NAME_REPAIR, codeEvidence, hit, strip, words } from "@/domain/lead-radar/business-type";
import { OEM_NAME } from "@/domain/lead-radar/taxonomy";

export const REPAIR_FITS = ["VERIFIED_REPAIR", "HUMAN_REVIEW", "EXCLUDED"] as const;
export type RepairFit = (typeof REPAIR_FITS)[number];

/** Segments that, with no repair wording at all, are decisive evidence the business is not a repair shop. */
const DECISIVE: Record<string, readonly string[]> = {
  EV_CHARGING: ["charging station", "charging stations", "ev charging", "borne de recharge", "bornes de recharge", "borne electrique", "bornes electriques", "charge point", "chargepoint", "supercharger", "superchargeur", "recharge electrique"],
  BICYCLE: ["cycle", "cycles", "velo", "velos", "bicycle", "bicycles", "bicyclette", "bicyclettes", "bike", "bikes", "ebike", "e bike", "bmx", "cyclo"],
  RECYCLING_SALVAGE: ["recyclage", "recycling", "recyclers", "salvage", "scrap", "ferraille", "ferrailleur", "casse auto", "casse automobile", "demolition auto", "wrecker", "wreckers", "auto wrecking", "junk", "pieces usagees", "used auto parts", "used parts"],
  CAR_WASH: ["lave auto", "lave autos", "lavage", "car wash", "carwash", "wash", "auto spa"],
  DETAILING: ["detailing", "detail", "esthetique auto", "esthetique automobile", "polissage"],
  TOWING: ["remorquage", "remorqueur", "remorqueurs", "towing", "tow", "depanneuse", "depanneuses", "assistance routiere", "roadside"],
  PARTS_RETAIL: ["pieces d auto", "pieces auto", "pieces automobiles", "pieces et accessoires", "auto parts", "car parts", "parts store", "accessoires auto", "auto accessories"],
  TAXI_EQUIPMENT: ["taximetre", "taximetres", "taxi meter", "taxi", "taxis", "limousine", "limousines", "limo"],
  MANUFACTURER_CORPORATE: [
    "michelin", "bridgestone", "pirelli", "yokohama", "hankook", "nokian", "dunlop", "continental", "cooper tire", "toyo tires", "bosch", "denso", "valeo", "magna", "delphi",
    "north america", "amerique du nord", "head office", "siege social", "corporate", "headquarters", "manufacturing", "manufacturier", "fabricant", "fabrication", "distribution", "distributeur", "distributeurs", "distributor", "distributors", "wholesale", "grossiste", "logistics", "logistique",
  ],
};
/** Signals that are suggestive but not decisive: with a specific repair category they only trigger a review. */
const SOFT: Record<string, readonly string[]> = {
  OTHER_NON_REPAIR: ["parking", "stationnement", "entreposage", "storage", "driving school", "ecole de conduite", "location", "rental", "rent a car", "leasing", "assurance", "insurance"],
  TINT_AUDIO_WRAP: ["tinting", "teinture", "wrap", "upholstery", "sellerie", "alarme", "demarreur", "audio", "stereo", "sono"],
};
/** Segments the commercial targeting policy has not ruled on (or that may include a service department): a human decides. */
const REVIEW_SEGMENTS: Record<string, readonly string[]> = {
  MOTORCYCLE: ["moto", "motos", "motocyclette", "motocyclettes", "motorcycle", "motorcycles", "scooter", "scooters", "vtt", "atv", "powersports", "motoneige", "snowmobile", "harley davidson"],
  TRAILER: ["remorque", "remorques", "trailer", "trailers"],
  DEALER: ["concessionnaire", "concession", "dealer", "dealership", "auto sales", "ventes auto", "auto vente", "vente d autos", "used cars", "autos usagees"],
  MARINE_RV: ["marine", "bateau", "bateaux", "boat", "boats", "rv", "vr", "caravane", "caravanes"],
  TIRE_RETAIL: ["vente de pneus", "tire sales", "tire warehouse", "entrepot de pneus", "pneus usages", "used tires", "pneus neufs et usages", "pneus discount", "discount tire"],
};
/** Substring patterns for compound names ("RechargeX"). Applied to the accent-stripped, lower-cased name. */
const COMPOUND: { cls: string; re: RegExp }[] = [
  { cls: "EV_CHARGING", re: /recharg|chargepoint|supercharg|\bev ?charg/ },
];

export type FitReason =
  | "REPAIR_CATEGORY" | "REPAIR_CATEGORY_AND_NAME" | "REPAIR_INDUSTRY_AND_NAME"
  | "NON_TARGET_CATEGORY" | `NAME_SIGNAL_${string}` | "CATEGORY_NAME_CONFLICT"
  | "OEM_BRAND_NAME" | "POSSIBLE_DEALER_SERVICE" | `SEGMENT_${string}` | "UNCERTAIN_CATEGORY" | "INSUFFICIENT_EVIDENCE" | "NO_CATEGORY_EVIDENCE";

export interface FitFacts {
  name: string | null | undefined;
  /** Overture taxonomy primary code, when the record has one (staged candidate). */
  taxonomyPrimary?: string | null;
  classReasons?: readonly string[];
  /** CRM industry (CrmIndustry value) — category evidence for records that have no taxonomy code. */
  industry?: string | null;
}
export interface FitResult { fit: RepairFit; reasons: FitReason[]; evidence: "TAXONOMY" | "CODE_WORDS" | "CODE_AND_NAME" | "INDUSTRY_AND_NAME" | "NONE" }

const REPAIR_INDUSTRIES = new Set(["GENERAL_REPAIR", "TIRE_SHOP", "BODY_SHOP", "TRANSMISSION", "DIAGNOSTIC", "SPECIALTY"]);
const hitAny = (text: string, table: Record<string, readonly string[]>): string[] => Object.entries(table).filter(([, list]) => hit(text, list)).map(([k]) => k);

/** Name-level facts, exported for reports and tests. */
export function nameSignals(name: string | null | undefined) {
  const raw = strip(name ?? "");
  const t = words(name ?? "");
  const decisive = new Set(hitAny(t, DECISIVE));
  for (const c of COMPOUND) if (c.re.test(raw)) decisive.add(c.cls);
  const segments = new Set(hitAny(t, REVIEW_SEGMENTS));
  if (/\bmoto(?!r)/.test(raw)) segments.add("MOTORCYCLE"); // "MotoFlash", "Motomax"
  return { repairWord: hit(t, NAME_REPAIR), decisive: [...decisive].sort(), soft: hitAny(t, SOFT).sort(), segments: [...segments].sort(), oem: OEM_NAME.test(name ?? "") };
}

export function assessRepairFit(f: FitFacts): FitResult {
  const code = f.taxonomyPrimary ?? "";
  const s = nameSignals(f.name);
  const known = BY_CODE[code];
  const cap = known ? CAPABILITY[known] : null;
  const c = codeEvidence(code);
  const codeNonTarget = !!code && !known && CODE_NON_TARGET_TOKENS.includes(c.nonTarget ?? "") && c.nonTarget !== "dealer" && c.nonTarget !== "dealers";
  const reasons: FitReason[] = [];
  const specificRepair = cap === "REPAIR" && known !== undefined;

  // 1 — the platform's own category says "not a repair business".
  if (cap === "NON_TARGET" || codeNonTarget) {
    reasons.push("NON_TARGET_CATEGORY");
    if (s.repairWord) return { fit: "HUMAN_REVIEW", reasons: [...reasons, "CATEGORY_NAME_CONFLICT"], evidence: "NONE" };
    return { fit: "EXCLUDED", reasons, evidence: "NONE" };
  }
  // 2 — a decisive non-repair signal in the name.
  if (s.decisive.length) {
    const sig = s.decisive.map((x): FitReason => `NAME_SIGNAL_${x}`);
    // Mixed service ("Garage Remorquage Roy"): the platform's own repair category AND repair wording agree, so the secondary activity does not disqualify it.
    const mixed = specificRepair && !!s.repairWord;
    if (!mixed) {
      if (s.repairWord) return { fit: "HUMAN_REVIEW", reasons: [...sig, "CATEGORY_NAME_CONFLICT"], evidence: "NONE" };
      return { fit: "EXCLUDED", reasons: sig, evidence: "NONE" };
    }
  }
  // 3 — segments with no commercial ruling, soft signals, brand-named listings: a human decides.
  if (s.segments.length || s.soft.length || s.oem || f.classReasons?.includes("POSSIBLE_DEALER_SERVICE") || f.classReasons?.includes("ALSO_DEALER")) {
    const r: FitReason[] = [...s.segments.map((x): FitReason => `SEGMENT_${x}`), ...s.soft.map((x): FitReason => `NAME_SIGNAL_${x}`)];
    if (s.oem) r.push("OEM_BRAND_NAME");
    if (f.classReasons?.includes("POSSIBLE_DEALER_SERVICE") || f.classReasons?.includes("ALSO_DEALER")) r.push("POSSIBLE_DEALER_SERVICE");
    return { fit: "HUMAN_REVIEW", reasons: r, evidence: "NONE" };
  }
  // 4 — positive category evidence.
  if (specificRepair) return { fit: "VERIFIED_REPAIR", reasons: ["REPAIR_CATEGORY"], evidence: "TAXONOMY" };
  if (cap === "UNCERTAIN") return { fit: "HUMAN_REVIEW", reasons: ["UNCERTAIN_CATEGORY"], evidence: "NONE" };
  if (code) {
    // Generic / unmapped automotive-service code: needs repair wording from the code itself or the name (two independent signals), nothing contrary.
    if (c.repair) return { fit: "VERIFIED_REPAIR", reasons: ["REPAIR_CATEGORY"], evidence: "CODE_WORDS" };
    if (s.repairWord) return { fit: "VERIFIED_REPAIR", reasons: ["REPAIR_CATEGORY_AND_NAME"], evidence: "CODE_AND_NAME" };
    return { fit: "HUMAN_REVIEW", reasons: ["INSUFFICIENT_EVIDENCE"], evidence: "NONE" };
  }
  // No taxonomy (manual / CSV prospect): the CRM industry is the category evidence; the name must agree.
  if (f.industry && REPAIR_INDUSTRIES.has(f.industry) && s.repairWord) return { fit: "VERIFIED_REPAIR", reasons: ["REPAIR_INDUSTRY_AND_NAME"], evidence: "INDUSTRY_AND_NAME" };
  return { fit: "HUMAN_REVIEW", reasons: ["NO_CATEGORY_EVIDENCE"], evidence: "NONE" };
}

/** Reason codes that mean "contradicted by the name or category" (used by qualification to explain a block / review). */
export const isConflictReason = (r: string) => r === "CATEGORY_NAME_CONFLICT" || r === "NON_TARGET_CATEGORY" || r.startsWith("NAME_SIGNAL_");
