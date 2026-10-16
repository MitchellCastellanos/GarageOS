// National Lead Radar — automotive classification (pure). Driven by the Overture `taxonomy` (primary + hierarchy).
// Observed on release 2026-09-23.1 (Montréal & Calgary samples): services live under travel_and_transportation/vehicle_service,
// dealers under shopping/vehicle_dealer, parts under shopping/specialty_store/vehicle_parts_store. Unknown subcategories under
// vehicle_service are NOT dropped: they become AMBIGUOUS for a human (the taxonomy can change between releases).
import type { CrmIndustryValue } from "@/domain/lead-radar/types";

export type Tier = "PRIMARY" | "SECONDARY" | "AMBIGUOUS" | "EXCLUDED";
export const CATEGORY_GROUPS = ["REPAIR", "BODY_GLASS", "DEALER", "PARTS", "OTHER_AUTOMOTIVE"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

interface Rule { group: CategoryGroup; tier: Tier; industry: CrmIndustryValue | null; reason: string }
const R = (group: CategoryGroup, tier: Tier, industry: CrmIndustryValue | null, reason: string): Rule => ({ group, tier, industry, reason });

/** Known taxonomy.primary codes. Anything else under vehicle_service falls back to AMBIGUOUS/OTHER_AUTOMOTIVE. */
export const PRIMARY_RULES: Record<string, Rule> = {
  automotive_repair: R("REPAIR", "PRIMARY", "GENERAL_REPAIR", "REPAIR_SHOP"),
  engine_repair_service: R("REPAIR", "PRIMARY", "GENERAL_REPAIR", "ENGINE_REPAIR"),
  brake_service_and_repair: R("REPAIR", "PRIMARY", "SPECIALTY", "BRAKE_SPECIALIST"),
  transmission_repair: R("REPAIR", "PRIMARY", "TRANSMISSION", "TRANSMISSION_REPAIR"),
  auto_electrical_repair: R("REPAIR", "PRIMARY", "SPECIALTY", "ELECTRICAL_REPAIR"),
  wheel_and_rim_repair: R("REPAIR", "PRIMARY", "TIRE_SHOP", "WHEEL_SERVICE"),
  tire_dealer_and_repair: R("REPAIR", "PRIMARY", "TIRE_SHOP", "TIRE_SERVICE"),
  tire_shop: R("REPAIR", "PRIMARY", "TIRE_SHOP", "TIRE_SERVICE"),
  oil_change_station: R("REPAIR", "PRIMARY", "GENERAL_REPAIR", "MAINTENANCE"),
  truck_repair: R("REPAIR", "PRIMARY", "SPECIALTY", "HEAVY_VEHICLE_REPAIR"),
  automotive_service: R("REPAIR", "AMBIGUOUS", "GENERAL_REPAIR", "GENERIC_AUTOMOTIVE_SERVICE"),
  auto_body_shop: R("BODY_GLASS", "SECONDARY", "BODY_SHOP", "COLLISION_BODY"),
  auto_glass_service: R("BODY_GLASS", "SECONDARY", "OTHER", "GLASS"),
  windshield_installation_and_repair: R("BODY_GLASS", "SECONDARY", "OTHER", "GLASS"),
  auto_restoration_service: R("BODY_GLASS", "SECONDARY", "SPECIALTY", "RESTORATION"),
  auto_customization: R("BODY_GLASS", "SECONDARY", "SPECIALTY", "CUSTOMIZATION"),
  trailer_repair: R("BODY_GLASS", "SECONDARY", "SPECIALTY", "TRAILER_REPAIR"),
  auto_dealer: R("DEALER", "SECONDARY", "OTHER", "DEALERSHIP"),
  used_auto_dealer: R("DEALER", "SECONDARY", "OTHER", "DEALERSHIP"),
  commercial_vehicle_dealer: R("DEALER", "SECONDARY", "OTHER", "DEALERSHIP"),
  truck_dealer: R("DEALER", "SECONDARY", "OTHER", "DEALERSHIP"),
  auto_parts_store: R("PARTS", "SECONDARY", "OTHER", "PARTS_STORE"),
  truck_parts_and_accessories: R("PARTS", "SECONDARY", "OTHER", "PARTS_STORE"),
  car_wash: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "CAR_WASH"),
  auto_detailing: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "DETAILING"),
  towing_service: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "TOWING"),
  emergency_roadside_service: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "ROADSIDE"),
  car_window_tinting: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "TINTING"),
  vehicle_wrap: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "WRAP"),
  auto_upholstery: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "UPHOLSTERY"),
  auto_security: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "SECURITY"),
  car_inspection: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "INSPECTION"),
  automobile_registration_service: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "REGISTRATION"),
  automotive_consultant: R("OTHER_AUTOMOTIVE", "SECONDARY", "OTHER", "CONSULTANT"),
};

/** Hierarchy segments that put a record in scope even when its primary code is unknown to us. */
export const IN_SCOPE_HIERARCHY = ["vehicle_service"] as const;

/** Taxonomy primaries to request, per category group (plus the hierarchy catch-all for REPAIR/BODY_GLASS/OTHER_AUTOMOTIVE). */
export function primariesForGroups(groups: readonly CategoryGroup[]): string[] {
  const g = new Set(groups);
  return Object.entries(PRIMARY_RULES).filter(([, r]) => g.has(r.group)).map(([k]) => k).sort();
}
export function hierarchyForGroups(groups: readonly CategoryGroup[]): string[] {
  const g = new Set(groups);
  return g.has("REPAIR") || g.has("BODY_GLASS") || g.has("OTHER_AUTOMOTIVE") ? [...IN_SCOPE_HIERARCHY] : [];
}

/** Chains that are known not to be independent shops. A hint for the reviewer, never a verdict. */
export const CHAIN_NAME = /\b(midas|monro|meineke|jiffy lube|valvoline|mr\.? lube|speedy|canadian tire|napa auto ?pro|carstar|fix auto|uniglass|lebeau|vitro ?plus|fountain tire|kal tire|ok tire|ici pneu|great canadian oil change|mr\.? tire|pep boys|firestone|goodyear|walmart|costco|petro[- ]canada|esso|shell|ultramar|couche[- ]tard|harnois|boyd|speedee)\b/i;
export const OEM_NAME = /\b(toyota|honda|ford|chevrolet|gmc|buick|cadillac|nissan|hyundai|kia|mazda|subaru|volkswagen|audi|bmw|mercedes|volvo|jeep|dodge|ram|chrysler|lexus|acura|infiniti|mitsubishi|porsche|tesla|genesis|land rover|jaguar|mini)\b/i;

export interface ClassifyInput {
  primary: string | null | undefined;
  hierarchy: readonly string[];
  alternates: readonly string[];
  name: string;
  brandWikidata: string | null | undefined;
  operatingStatus: string | null | undefined;
}
export interface Classification {
  tier: Tier;
  group: CategoryGroup | null;
  industry: CrmIndustryValue | null;
  reasons: string[];
  chainSignal: "CHAIN_SIGNAL" | "NO_CHAIN_SIGNAL";
  possibleDealerService: boolean;
}

const CLOSED = /^(closed|permanently_closed|temporarily_closed)$/i;

export function classify(i: ClassifyInput): Classification {
  const reasons: string[] = [];
  const chain = !!i.brandWikidata || CHAIN_NAME.test(i.name);
  const base = { chainSignal: chain ? "CHAIN_SIGNAL" as const : "NO_CHAIN_SIGNAL" as const, possibleDealerService: false };
  if (chain) reasons.push(i.brandWikidata ? "BRAND_LINKED" : "CHAIN_NAME");
  if (i.operatingStatus && CLOSED.test(i.operatingStatus)) return { ...base, tier: "EXCLUDED", group: null, industry: null, reasons: [...reasons, "NOT_OPERATING"] };
  const rule = i.primary ? PRIMARY_RULES[i.primary] : undefined;
  const inScope = !!rule || i.hierarchy.some((h) => (IN_SCOPE_HIERARCHY as readonly string[]).includes(h));
  if (!inScope) return { ...base, tier: "EXCLUDED", group: null, industry: null, reasons: [...reasons, "NOT_AUTOMOTIVE"] };
  if (!rule) return { ...base, tier: "AMBIGUOUS", group: "OTHER_AUTOMOTIVE", industry: null, reasons: [...reasons, "UNKNOWN_SUBCATEGORY"] };
  reasons.push(rule.reason);
  let tier = rule.tier;
  let possibleDealerService = false;
  // A repair-type listing under an OEM brand name is probably a dealership service department: keep it reviewable, not "independent".
  if (tier === "PRIMARY" && OEM_NAME.test(i.name)) { tier = "AMBIGUOUS"; possibleDealerService = true; reasons.push("POSSIBLE_DEALER_SERVICE"); }
  // The same business also tagged as a non-repair category (alternates) is noted, not re-tiered.
  if (tier === "PRIMARY" && i.alternates.some((a) => PRIMARY_RULES[a]?.group === "DEALER")) { tier = "AMBIGUOUS"; possibleDealerService = true; reasons.push("ALSO_DEALER"); }
  return { ...base, tier, group: rule.group, industry: rule.industry, reasons, possibleDealerService };
}
