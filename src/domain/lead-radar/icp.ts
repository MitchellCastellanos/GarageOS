// Discovery ICP gate (pure). "Is this business inside GarageOS's target — an INDEPENDENT automotive repair business?" is a SEPARATE question from "is it a repair
// business at all" (repair-fit.ts). A Kal Tire or a dealership service department does repair vehicles; it is simply not who GarageOS sells to.
//
// The gate is conservative and evidence-based: it reads only the business NAME and the website HOST (never page content), against the versioned registry in
// icp-registry.ts. A confirmed match is OUTSIDE_ICP; everything else is CLEAR here (independence that cannot be determined — OEM-branded names, an unregistered
// brand link — is left to the repair-fit review paths, so a person decides only when it genuinely cannot be settled by evidence).
import { NAME_REPAIR, hit, words } from "@/domain/lead-radar/business-type";
import { DEALER_CODES, DEALER_DEPARTMENT_WORDS, DEALER_MAKES, DEALER_NAME, DEALER_NETWORK_DOMAINS, ICP_BRANDS, ICP_REGISTRY_VERSION, type IcpBrand, type IcpCategory } from "@/domain/lead-radar/icp-registry";

export const OUTSIDE_ICP_REASON = "OUTSIDE_ICP_CHAIN_OR_CORPORATE" as const;

export interface IcpFacts { name: string | null | undefined; website?: string | null; city?: string | null; taxonomyPrimary?: string | null }
export type IcpEvidence = "NAME" | "DOMAIN" | "TAXONOMY_DEALER" | "DEALER_WORDING" | "DEALER_NETWORK_DOMAIN" | "OEM_DEALER_PATTERN";
export interface IcpResult { outside: boolean; category: IcpCategory | null; brandId: string | null; evidence: IcpEvidence[]; registryVersion: number }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`]/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** Affiliation / supplier / certification wording: a brand that only follows it ("Joe's Garage – NAPA Certified", "member of NAPA") is not the business's own brand. */
const AFFILIATION = /\b(certified|certifie|certifiee|member of|membre de|partner|partenaire|powered by|supplied by|parts by|pieces par|authorized|autorise|preferred|approved|affiliated|proud)\b.*$/;
const GENERIC = new Set(["auto", "autos", "automobile", "automotive", "service", "services", "center", "centre", "centers", "centres", "inc", "ltd", "ltee", "limited", "store", "shop", "repair", "the", "and", "of", "de", "du", "la", "le", "station", "garage", "pneus", "tire", "tires"]);

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
const onDomain = (host: string, domains: readonly string[] | undefined) => !!host && !!domains?.some((d) => host === d || host.endsWith(`.${d}`));

function weakMatch(name: string, brand: IcpBrand, city: string): boolean {
  const cityTokens = new Set(norm(city).split(" ").filter(Boolean));
  for (const w of brand.weakAliases ?? []) {
    const alias = norm(w).split(" ");
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
    const evidence: IcpEvidence[] = [];
    if (nameHit) evidence.push("NAME");
    if (domainHit) evidence.push("DOMAIN");
    return { outside: true, category: brand.category, brandId: brand.id, evidence, registryVersion: ICP_REGISTRY_VERSION };
  }
  // Dealerships and dealer-owned service departments. Repair wording in the name ("… Auto Repair & Used Car Dealer") keeps an independent mixed shop out of this rule.
  const repairWord = hit(words(rawName), NAME_REPAIR);
  if (onDomain(host, DEALER_NETWORK_DOMAINS)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["DEALER_NETWORK_DOMAIN"] };
  if (!repairWord && f.taxonomyPrimary && DEALER_CODES.includes(f.taxonomyPrimary)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["TAXONOMY_DEALER"] };
  if (isDealerName(name)) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["OEM_DEALER_PATTERN"] };
  if (!repairWord && DEALER_NAME.test(norm(rawName))) return { ...none, outside: true, category: "DEALERSHIP", evidence: ["DEALER_WORDING"] };
  return none;
}

/** Stable, human-readable reason codes stored on the candidate/prospect (`repairFitReasons`): the exclusion reason, its category, the brand and the registry version. */
export function icpReasons(r: IcpResult): string[] {
  if (!r.outside) return [];
  return [OUTSIDE_ICP_REASON, `ICP_${r.category}`, ...(r.brandId ? [`ICP_BRAND_${r.brandId}`] : []), ...(r.evidence.length === 1 && r.evidence[0] === "DOMAIN" ? ["ICP_EVIDENCE_DOMAIN_ONLY"] : []), `ICP_REGISTRY_V${r.registryVersion}`];
}
export const isIcpExclusion = (reasons: readonly string[] | null | undefined) => !!reasons?.includes(OUTSIDE_ICP_REASON);
