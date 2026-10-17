// Discovery ICP gate (pure). "Is this business inside GarageOS's target — an INDEPENDENT automotive repair business?" is a SEPARATE question from "is it a repair
// business at all" (repair-fit.ts). A Kal Tire or a dealership service department does repair vehicles; it is simply not who GarageOS sells to.
//
// The gate is conservative and evidence-based: it reads only the business NAME and the website HOST (never page content), against the versioned registry in
// icp-registry.ts. A confirmed match is OUTSIDE_ICP; everything else is CLEAR here (independence that cannot be determined — OEM-branded names, an unregistered
// brand link — is left to the repair-fit review paths, so a person decides only when it genuinely cannot be settled by evidence).
import { NAME_REPAIR, hit, words } from "@/domain/lead-radar/business-type";
import { DEALER_CODES, DEALER_DEPARTMENT_WORDS, DEALER_MAKES, DEALER_NAME, DEALER_NETWORK_DOMAINS, ICP_BRANDS, ICP_REGISTRY_VERSION, type IcpBrand, type IcpCategory } from "@/domain/lead-radar/icp-registry";

export const OUTSIDE_ICP_REASON = "OUTSIDE_ICP_CHAIN_OR_CORPORATE" as const;
/** A franchisor-website match that nothing else confirms: HUMAN_REVIEW, never an automatic exclusion. */
export const ICP_DOMAIN_REVIEW_REASON = "ICP_DOMAIN_ONLY_REVIEW" as const;

export interface IcpFacts {
  name: string | null | undefined; website?: string | null; city?: string | null; taxonomyPrimary?: string | null;
  /** Source class reasons (BRAND_LINKED = the source itself links the place to a brand, CHAIN_NAME): independent corroboration for a website-domain match. */
  classReasons?: readonly string[] | null;
}
export type IcpEvidence = "NAME" | "DOMAIN" | "TAXONOMY_DEALER" | "DEALER_WORDING" | "DEALER_NETWORK_DOMAIN" | "OEM_DEALER_PATTERN" | "DOMAIN_LOCATOR_PAGE" | "SOURCE_BRAND_LINK";
export interface IcpResult {
  outside: boolean; category: IcpCategory | null; brandId: string | null; evidence: IcpEvidence[]; registryVersion: number;
  /** Matched only through a weak alias (an ordinary word such as "Midas"): the most error-prone name match, surfaced for review. */
  weak?: boolean;
  /** A brand in the name PLUS words that look like the location's own name ("NAPA AUTOPRO - Lakey Diesel & Auto"): branded, but possibly an independent franchisee worth a second look. */
  ownName?: boolean;
  /** A website-domain match with NO independent confirmation (no brand in the name, no franchisor store-locator page, no source brand link): not enough to exclude a business — it goes to a person. */
  review?: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`]/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** Affiliation / supplier / certification wording: a brand that only follows it ("Joe's Garage – NAPA Certified", "member of NAPA") is not the business's own brand. */
const AFFILIATION = /\b(certified|certifie|certifiee|member of|membre de|partner|partenaire|powered by|supplied by|parts by|pieces par|authorized|autorise|preferred|approved|affiliated|proud)\b.*$/;
const GENERIC = new Set(["auto", "autos", "automobile", "automotive", "service", "services", "center", "centre", "centers", "centres", "inc", "ltd", "ltee", "limited", "store", "shop", "repair", "the", "and", "of", "de", "du", "la", "le", "station", "garage", "pneus", "tire", "tires", "gas", "fuel", "essence"]);

function cleanName(raw: string): string {
  // parenthetical mentions and affiliation tails are not part of the business's own name
  const noParens = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return norm(noParens.toLowerCase().replace(AFFILIATION, " "));
}
const hasPhrase = (name: string, alias: string) => ` ${name} `.includes(` ${norm(alias)} `);
const hostOf = (website: string | null | undefined): string => {
  const s = (website ?? "").trim().toLowerCase();
  if (!s) return "";
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/]*@)?([^/:?#\s]+)/.exec(s);
  return (m?.[1] ?? "").replace(/^www\./, "");
};
/** The franchisor's own page for ONE location (".../stores/…", ".../auto-repair/alberta/edmonton-…", "?shopnum=…"): independent proof that this place is a branded location, unlike a bare home page. */
const LOCATOR_PATH = /(^|\/)(stores?|locations?|shops?|branch(?:es)?|dealers?|service-cent(?:re|er)s?|find-(?:a|us)-[a-z-]+)(\/|$)|store\.aspx|[?&](shopnum|storeid|store_id|locationid)=/;
function isLocatorPage(website: string | null | undefined): boolean {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#\s]+([^?#\s]*)(\?[^#\s]*)?/i.exec((website ?? "").trim());
  if (!m) return false;
  const path = (m[1] ?? "").toLowerCase(), query = (m[2] ?? "").toLowerCase();
  return path.split("/").filter(Boolean).length >= 3 || LOCATOR_PATH.test(path + query);
}
const onDomain = (host: string, domains: readonly string[] | undefined) => !!host && !!domains?.some((d) => host === d || host.endsWith(`.${d}`));

function weakMatch(name: string, brand: IcpBrand, city: string): boolean {
  const cityTokens = new Set(norm(city).split(" ").filter(Boolean));
  for (const w of brand.weakAliases ?? []) {
    const alias = norm(w).split(" ");
    if (alias.every((a) => cityTokens.has(a))) continue; // "Shell Lake Garage" in Shell Lake: the word is the place, not the brand
    const tokens = name.split(" ").filter(Boolean);
    const at = tokens.findIndex((_, i) => alias.every((a, j) => tokens[i + j] === a));
    if (at < 0) continue;
    const rest = [...tokens.slice(0, at), ...tokens.slice(at + alias.length)];
    if (rest.every((t) => GENERIC.has(t) || /^\d+$/.test(t) || cityTokens.has(t))) return true;
  }
  return false;
}

const alt = (list: readonly string[]) => list.map((x) => norm(x).replace(/ /g, " ")).sort((a, b) => b.length - a.length).join("|");
// "<place or owner words> <make> [department words]": a franchised dealer or one of its departments/staff ("Lacombe Ford", "New Lethbridge Mitsubishi", "CH Nissan - Body Shop", "Kelvin Singh - Capital GMC").
// Any other word after the make ("Honda Specialists", "Toyota Repair", "Ford & Chev Mechanical") breaks the pattern, so independent specialists are never matched.
const DEALER_PATTERN = new RegExp(`^(?:[a-z0-9]+ ){0,4}(?:${alt(DEALER_MAKES)})(?: (?:${alt(DEALER_DEPARTMENT_WORDS)}))*$`);

/** Words that mean "an independent specialist or product business that names a make" ("Unlock My BMW", "Euro Import Specialists"): they veto the dealer-name pattern. */
const NOT_DEALER_PREFIX = new Set(["my", "your", "our", "for", "unlock", "key", "keys", "custom", "customs", "tune", "tuning", "performance", "speed", "racing", "wrap", "wraps", "mobile", "specialist", "specialists", "independent", "euro", "european", "import", "imports", "used", "quality", "discount", "cheap"]);
const isDealerName = (name: string) => DEALER_PATTERN.test(name) && !name.split(" ").some((t) => NOT_DEALER_PREFIX.has(t));

export function assessIcp(f: IcpFacts): IcpResult {
  const none: IcpResult = { outside: false, category: null, brandId: null, evidence: [], registryVersion: ICP_REGISTRY_VERSION };
  const rawName = f.name ?? "";
  const name = cleanName(rawName);
  const host = hostOf(f.website);
  const city = f.city ?? "";
  let nameHit: IcpBrand | undefined, domainHit: IcpBrand | undefined;
  for (const b of ICP_BRANDS) {
    if (!nameHit && name && (b.aliases.some((a) => hasPhrase(name, a)) || weakMatch(name, b, city))) nameHit = b;
    if (!domainHit && onDomain(host, b.domains)) domainHit = b;
    if (nameHit && domainHit) break;
  }
  const brand = nameHit ?? domainHit;
  if (brand) {
    // A brand in the NAME is the evidence. A franchisor website alone is not: it must be corroborated independently (a store-locator page of that franchisor, or the source's own brand link),
    // otherwise the place is only flagged for a person (a different independent business can list a franchisor URL, or an old one).
    const sourceLink = !!f.classReasons?.includes("BRAND_LINKED");
    const locator = !nameHit && isLocatorPage(f.website);
    if (!nameHit && !locator && !sourceLink) return { ...none, review: true, category: brand.category, brandId: brand.id, evidence: ["DOMAIN"] };
    const evidence: IcpEvidence[] = [];
    if (nameHit) evidence.push("NAME");
    if (domainHit) evidence.push("DOMAIN");
    if (locator) evidence.push("DOMAIN_LOCATOR_PAGE");
    if (!nameHit && sourceLink) evidence.push("SOURCE_BRAND_LINK");
    const strong = !!nameHit && nameHit.aliases.some((a) => hasPhrase(name, a));
    let ownName = false;
    if (strong && nameHit) {
      const alias = nameHit.aliases.map(norm).filter((a) => ` ${name} `.includes(` ${a} `)).sort((a, b) => b.length - a.length)[0];
      const cityTokens = new Set(norm(city).split(" ").filter(Boolean));
      const rest = ` ${name} `.replace(` ${alias} `, " ").split(" ").filter((t) => t && !GENERIC.has(t) && !/^\d+$/.test(t) && !cityTokens.has(t));
      ownName = rest.length >= 2;
    }
    return { outside: true, category: brand.category, brandId: brand.id, evidence, registryVersion: ICP_REGISTRY_VERSION, weak: !!nameHit && !strong, ownName };
  }
  // Dealerships and dealer-owned service departments. Repair wording in the name ("… Auto Repair & Used Car Dealer") keeps an independent mixed shop out of this rule.
  const repairWord = hit(words(rawName), NAME_REPAIR);
  if (onDomain(host, DEALER_NETWORK_DOMAINS)) {
    // "kingsway.toyota.ca" is one dealer's own site (a sub-domain of the manufacturer); the manufacturer's home page ("kia.ca") on a repair-named listing is only a hint.
    const dealerSite = DEALER_NETWORK_DOMAINS.some((d) => host.endsWith(`.${d}`));
    if (dealerSite || isLocatorPage(f.website)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["DEALER_NETWORK_DOMAIN"] };
    if (!repairWord) return { ...none, review: true, category: "DEALERSHIP", evidence: ["DEALER_NETWORK_DOMAIN"] };
  }
  if (!repairWord && f.taxonomyPrimary && DEALER_CODES.includes(f.taxonomyPrimary)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["TAXONOMY_DEALER"] };
  // a trailing city is not part of the make-at-the-end pattern ("Rolls-Royce Motor Cars Calgary")
  const cityNorm = norm(city), bare = cityNorm && name.endsWith(` ${cityNorm}`) ? name.slice(0, -(cityNorm.length + 1)) : name;
  if (isDealerName(bare)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["OEM_DEALER_PATTERN"] };
  if (!repairWord && DEALER_NAME.test(norm(rawName))) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["DEALER_WORDING"] };
  return none;
}

/** Stable, human-readable reason codes stored on the candidate/prospect (`repairFitReasons`): the exclusion reason, its category, the brand and the registry version. */
export function icpReasons(r: IcpResult): string[] {
  if (r.review) return [ICP_DOMAIN_REVIEW_REASON, `ICP_${r.category}`, ...(r.brandId ? [`ICP_BRAND_${r.brandId}`] : []), "ICP_EVIDENCE_DOMAIN_ONLY", `ICP_REGISTRY_V${r.registryVersion}`];
  if (!r.outside) return [];
  return [OUTSIDE_ICP_REASON, `ICP_${r.category}`, ...(r.brandId ? [`ICP_BRAND_${r.brandId}`] : []), ...(r.evidence.includes("DOMAIN_LOCATOR_PAGE") ? ["ICP_CONFIRMED_BY_LOCATOR_PAGE"] : []), ...(r.evidence.includes("SOURCE_BRAND_LINK") ? ["ICP_CONFIRMED_BY_SOURCE_BRAND_LINK"] : []), `ICP_REGISTRY_V${r.registryVersion}`];
}
export const isIcpDomainReview = (reasons: readonly string[] | null | undefined) => !!reasons?.includes(ICP_DOMAIN_REVIEW_REASON);
export const isIcpExclusion = (reasons: readonly string[] | null | undefined) => !!reasons?.includes(OUTSIDE_ICP_REASON);
