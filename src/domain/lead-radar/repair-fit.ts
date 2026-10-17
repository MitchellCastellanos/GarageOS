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
import { assessIcp, icpReasons, OUTSIDE_ICP_REASON } from "@/domain/lead-radar/icp";
import { OEM_NAME } from "@/domain/lead-radar/taxonomy";
import { BANNER_NAME } from "@/domain/sales-crm/shared-identity";

export const REPAIR_FITS = ["VERIFIED_REPAIR", "HUMAN_REVIEW", "EXCLUDED"] as const;
export type RepairFit = (typeof REPAIR_FITS)[number];

/** Segments that, with no repair wording at all, are decisive evidence the business is not a repair shop. */
const DECISIVE: Record<string, readonly string[]> = {
  EV_CHARGING: ["charging station", "charging stations", "ev charging", "borne de recharge", "bornes de recharge", "borne electrique", "bornes electriques", "charge point", "chargepoint", "supercharger", "superchargeur", "recharge electrique"],
  BICYCLE: ["cycle", "cycles", "velo", "velos", "bicycle", "bicycles", "bicyclette", "bicyclettes", "bike", "bikes", "ebike", "e bike", "bmx", "cyclo"],
  RECYCLING_SALVAGE: ["recyclage", "recycling", "recyclers", "salvage", "scrap", "ferraille", "ferrailleur", "casse auto", "casse automobile", "demolition auto", "wrecker", "wreckers", "auto wrecking", "junk", "pieces usagees", "used auto parts", "used parts", "pick a part", "pick n pull", "pull a part", "u pull", "upull", "libre service pieces"],
  CAR_WASH: ["lave auto", "lave autos", "lavage", "car wash", "carwash", "wash", "auto spa"],
  DETAILING: ["detailing", "detail", "detailz", "car spa", "auto spa", "esthetique auto", "esthetique automobile", "polissage"],
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
  // Industrial / fleet / oil-field / truck-body / coating businesses carry an automotive repair code but are often not walk-in repair shops: a person decides.
  INDUSTRIAL_OTHER: ["oilfield", "industrial", "industriel", "industrielle", "powder coating", "peinture en poudre", "truck stop", "relais routier", "mining", "mine site", "truck body", "truck bodies", "registry", "registries", "registre", "registres", "air liquide"],
  // Accessory / aftermarket-product businesses (tonneau covers, bedliners, lift kits…) carry the repair code but usually sell and fit products rather than repair: a person decides.
  ACCESSORIES_ONLY: ["tonneau", "tonno", "cover depot", "truck accessories", "accessories", "accessoires", "bedliner", "bed liner", "running boards", "lift kit", "lift kits"],
  // Single-component / niche services (steering wheel restoration, headlight restoration): relevant to automotive but not a general repair shop. Review, never auto-excluded.
  SPECIALTY_SERVICE: ["steering wheel", "wheel restoration", "headlight restoration", "restauration de volant"],
  OTHER_NON_REPAIR: ["supplies", "supply", "fournitures", "parking", "stationnement", "entreposage", "storage", "driving school", "ecole de conduite", "location", "rental", "rent a car", "leasing", "assurance", "insurance"],
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

/** Any word (EN/FR, substring on the accent-stripped name) that ties a business name to vehicles or their service. Absence is NOT proof against a business: it only means the category
 *  stands alone, and a category on its own is not enough to call a business a verified repair shop (small-business categories in open data are often loose). */
const AUTOMOTIVE_WORDING = /(auto|tire|tyre|pneu|motor|garage|mechani|mecani|collision|carrosserie|body|glass|vitre|windshield|lube|oil change|brake|frein|transmission|muffler|silencieux|exhaust|echappement|diesel|repair|repar|entretien|wheel|roue|align|radiat|suspens|perform|import|european|dent|pdr|paint|hybrid|engine|moteur|tune|tuning|starter|alternat|crank|driveline|truck|camion|vehic|fleet|service|svc|atelier|krown|rust|napa|carstar|midas|speedy|fix|jiffy|kal|bumper|hot ?rod|heavy duty|mobile|\\bcars?\\b|\\b4x4\\b|offroad|off-road|custom|restor|detail|tint|wrap|battery|quick lane)/;

export type FitReason =
  | "REPAIR_CATEGORY" | "REPAIR_CATEGORY_AND_NAME" | "REPAIR_INDUSTRY_AND_NAME"
  | "NON_TARGET_CATEGORY" | `NAME_SIGNAL_${string}` | "CATEGORY_NAME_CONFLICT"
  | "OEM_BRAND_NAME" | "EMPLOYEE_LISTING" | "NO_AUTOMOTIVE_WORDING" | "POSSIBLE_DEALER_SERVICE" | `SEGMENT_${string}` | "UNCERTAIN_CATEGORY" | "INSUFFICIENT_EVIDENCE" | "NO_CATEGORY_EVIDENCE"
  | "OUTSIDE_ICP_CHAIN_OR_CORPORATE" | `ICP_${string}`;

export interface FitFacts {
  name: string | null | undefined;
  /** Overture taxonomy primary code, when the record has one (staged candidate). */
  taxonomyPrimary?: string | null;
  classReasons?: readonly string[];
  /** CRM industry (CrmIndustry value) — category evidence for records that have no taxonomy code. */
  industry?: string | null;
  /** Website and city feed the discovery-ICP gate only (franchisor/banner host, store-number names). Optional: the gate degrades to name evidence. */
  website?: string | null;
  city?: string | null;
  /** A Super Admin released this business from the ICP exclusion (stored on the staged candidate): the commercial ICP gate is skipped, every other rule still applies. */
  icpOverride?: boolean;
  /** The verdict stored on the candidate. A stored exclusion tombstone ("ICP_TOMBSTONE": the business was excluded earlier, possibly under another id) keeps excluding it even if the registry later changes. */
  storedReasons?: readonly string[] | null;
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
  // "Truck and Trailer Repair": heavy-duty repair is an eligible specialist segment; the trailer word alone only matters when nothing says heavy-duty repair.
  if (segments.has("TRAILER") && /\b(truck|trucks|diesel|heavy duty|heavy equipment|fleet|semi)\b/.test(raw) && hit(t, NAME_REPAIR)) segments.delete("TRAILER");
  // A person listed at a business ("Meggie at Mighty Peace"): a dealership/shop employee or contact card, not a business of its own.
  const employeeListing = /^[A-Z][\w'’.-]{1,20}(?: [A-Z][\w'’.-]{1,20}){0,2} (?:at|chez|@) \S/.test((name ?? "").trim()) && !hit(words(((name ?? "").split(/ (?:at|chez|@) /i)[0]) ?? ""), NAME_REPAIR) && !BANNER_NAME.test(strip(name ?? ""));
  return { employeeListing, automotiveWording: AUTOMOTIVE_WORDING.test(strip(name ?? "")), repairWord: hit(t, NAME_REPAIR), decisive: [...decisive].sort(), soft: hitAny(t, SOFT).sort(), segments: [...segments].sort(), oem: OEM_NAME.test(name ?? "") };
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

  // 0 — commercial ICP gate: GarageOS targets INDEPENDENT repair businesses. A confirmed chain/franchise/retail/parts-network/dealership location is EXCLUDED with its own
  // auditable reason, whatever its repair wording or category (a Kal Tire does repair tires; it is still not who we sell to). Heavy-duty/diesel shops are NOT affected.
  const icp = f.icpOverride ? { outside: false, review: false } as ReturnType<typeof assessIcp> : assessIcp({ name: f.name, website: f.website, city: f.city, taxonomyPrimary: f.taxonomyPrimary, classReasons: f.classReasons });
  if (icp.outside) return { fit: "EXCLUDED", reasons: icpReasons(icp) as FitReason[], evidence: "NONE" };
  if (!f.icpOverride && f.storedReasons?.includes("ICP_TOMBSTONE") && f.storedReasons.includes(OUTSIDE_ICP_REASON)) return { fit: "EXCLUDED", reasons: f.storedReasons.filter((x) => x === OUTSIDE_ICP_REASON || x.startsWith("ICP_")) as FitReason[], evidence: "NONE" };

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
    // "Full Throttle Cycle" in a motorcycle/powersport/RV category is a motorcycle shop, not a bicycle shop: the platform category settles the ambiguity of the word "cycle".
    if (s.decisive.length === 1 && s.decisive[0] === "BICYCLE" && /motorcycle|powersport|snowmobile|(^|_)atv(_|$)|recreation_vehicle/.test(code)) return { fit: "HUMAN_REVIEW", reasons: ["SEGMENT_MOTORCYCLE"], evidence: "NONE" };
    if (!mixed) {
      if (s.repairWord) return { fit: "HUMAN_REVIEW", reasons: [...sig, "CATEGORY_NAME_CONFLICT"], evidence: "NONE" };
      return { fit: "EXCLUDED", reasons: sig, evidence: "NONE" };
    }
  }
  // 3 — segments with no commercial ruling, soft signals, brand-named listings: a human decides.
  // The platform's own category can name such a segment even when the business name does not (e.g. an unmapped "motorcycle_repair" code).
  const codeSegments = !known && /motorcycle|powersport|snowmobile|(^|_)atv(_|$)/.test(code) ? ["MOTORCYCLE"] : [];
  for (const x of codeSegments) if (!s.segments.includes(x)) s.segments.push(x);
  if (s.employeeListing) return { fit: "HUMAN_REVIEW", reasons: ["EMPLOYEE_LISTING"], evidence: "NONE" };
  if (s.segments.length || s.soft.length || s.oem || icp.review || f.classReasons?.includes("POSSIBLE_DEALER_SERVICE") || f.classReasons?.includes("ALSO_DEALER")) {
    const r: FitReason[] = [...(icp.review ? (icpReasons(icp) as FitReason[]) : []), ...s.segments.map((x): FitReason => `SEGMENT_${x}`), ...s.soft.map((x): FitReason => `NAME_SIGNAL_${x}`)];
    if (s.oem) r.push("OEM_BRAND_NAME");
    if (f.classReasons?.includes("POSSIBLE_DEALER_SERVICE") || f.classReasons?.includes("ALSO_DEALER")) r.push("POSSIBLE_DEALER_SERVICE");
    return { fit: "HUMAN_REVIEW", reasons: r, evidence: "NONE" };
  }
  // 4 — positive category evidence.
  // A specific repair category verifies a business only together with SOME automotive wording in its name (two independent signals, as for generic codes). A name that says
  // nothing about vehicles ("Pro Trac Gear", "Phantom Films", "Garner's Fuel Oils") with a loose category goes to a person — never to an automatic exclusion.
  if (specificRepair && !s.automotiveWording && !s.repairWord && !f.classReasons?.includes("CHAIN_NAME")) return { fit: "HUMAN_REVIEW", reasons: ["NO_AUTOMOTIVE_WORDING"], evidence: "NONE" };
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


// ── Commercial fit is a SEPARATE question from "is it a repair business" ─────────────────────────────────────────────────────────────────────────────────────
// A heavy-duty truck / diesel / fleet shop is a real repair business (it stays VERIFIED_REPAIR) but GarageOS's product and sales motion target light-vehicle independent
// garages. The segment is derived (never stored, never changes the fit) so a person can filter and decide the commercial policy separately.
export type CommercialSegment = "LIGHT_VEHICLE" | "HEAVY_DUTY";
const HEAVY_WORDS = ["diesel", "heavy duty", "heavy truck", "heavy equipment", "truck repair", "truck service", "truck and trailer", "truck & trailer", "fleet", "big rig", "semi", "peterbilt", "kenworth", "freightliner", "cummins", "detroit diesel", "mack truck", "volvo truck", "poids lourds", "poids lourd", "camion", "camions", "machinerie lourde", "commercial truck", "oilfield", "reefer"];
export function commercialSegment(f: { name: string | null | undefined; taxonomyPrimary?: string | null }): { segment: CommercialSegment; reasons: string[] } {
  const reasons: string[] = [];
  if (/truck|heavy|diesel|fleet/.test(f.taxonomyPrimary ?? "")) reasons.push("CATEGORY");
  if (hit(words(f.name ?? ""), HEAVY_WORDS)) reasons.push("NAME");
  return { segment: reasons.length ? "HEAVY_DUTY" : "LIGHT_VEHICLE", reasons };
}
