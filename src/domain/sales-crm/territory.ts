// Sales territories & acquisition rules — pure (no DB). Three separate concepts are kept apart on purpose:
//   administrative role (SALES_REP/MANAGER)  ·  sales mode (FIELD/REMOTE) + coverage  ·  prospect ownership.
// A territory only decides who may do the INITIAL acquisition of an untouched prospect; an owned, engaged prospect
// keeps its owner until a human explicitly transfers it.

export type AcquisitionKind = "FIELD_EXCLUSIVE" | "FIELD_PRIORITY" | "REMOTE_DEFAULT";
export type Mode = "FIELD" | "REMOTE";

export interface TerritoryRule {
  key: string; nameEn?: string; nameFr?: string; acquisition: AcquisitionKind; provinces: string[]; cities: string[]; postalPrefixes: string[];
  priorityDays: number | null; priorityStartedAt: Date | null; active: boolean; sortOrder: number;
}
export interface Location { province?: string | null; city?: string | null; postalCode?: string | null }

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export function cityKey(city: string | null | undefined): string {
  return stripAccents(city ?? "").toLowerCase().replace(/\b(st|ste)\b\.?[\s-]*/g, (_m, p: string) => (p === "st" ? "saint-" : "sainte-")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const PROVINCES: Record<string, string> = {
  quebec: "QC", qc: "QC", que: "QC", ontario: "ON", on: "ON", ont: "ON", "british columbia": "BC", bc: "BC", alberta: "AB", ab: "AB",
  manitoba: "MB", mb: "MB", saskatchewan: "SK", sk: "SK", "nova scotia": "NS", ns: "NS", "new brunswick": "NB", nb: "NB",
  "newfoundland and labrador": "NL", newfoundland: "NL", nl: "NL", "prince edward island": "PE", pei: "PE", pe: "PE",
  yukon: "YT", yt: "YT", "northwest territories": "NT", nt: "NT", nunavut: "NU", nu: "NU",
};
export function provinceCode(p: string | null | undefined): string | null {
  const k = stripAccents(p ?? "").toLowerCase().replace(/\./g, "").trim();
  return PROVINCES[k] ?? null;
}
export function postalKey(pc: string | null | undefined): string { return (pc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

function matches(rule: TerritoryRule, loc: Location): boolean {
  const prov = provinceCode(loc.province);
  if (rule.provinces.length && prov && !rule.provinces.map((p) => p.toUpperCase()).includes(prov)) return false;
  const hasLocal = rule.cities.length > 0 || rule.postalPrefixes.length > 0;
  if (!hasLocal) return true; // province-wide / national catch-all
  const city = cityKey(loc.city);
  if (city && rule.cities.map(cityKey).includes(city)) return true;
  const pc = postalKey(loc.postalCode);
  // A postal prefix is only trusted together with the rule's province when the province is known.
  if (pc && rule.postalPrefixes.some((x) => pc.startsWith(x.toUpperCase())) && (!rule.provinces.length || !prov || rule.provinces.map((p) => p.toUpperCase()).includes(prov))) return true;
  return false;
}

/** Most specific active territory (lowest sortOrder) matching the location; null when none matches. */
export function resolveTerritory(rules: TerritoryRule[], loc: Location): TerritoryRule | null {
  return [...rules].filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)).find((r) => matches(r, loc)) ?? null;
}

export interface Engagement {
  /** Any documented outbound/inbound touch: call, meeting, visit, email sent/received, sequence step. */
  touched: boolean;
  /** A documented in-person visit ATTEMPT of any outcome. Informational only: it never unlocks email. */
  visited: boolean;
  /**
   * A visit whose structured outcome is a genuine conversation (see field-visit.ts) and that has not since been
   * negated by a refusal/closure/DNC. This — not `visited` — satisfies the territory follow-up gate. It is never consent.
   */
  qualifiedVisit: boolean;
  /** The prospect replied (or wrote) to us. */
  replied: boolean;
  /** An open opportunity beyond NEW exists. */
  activeOpportunity: boolean;
}
export const NO_ENGAGEMENT: Engagement = { touched: false, visited: false, qualifiedVisit: false, replied: false, activeOpportunity: false };

/** Which mode holds INITIAL acquisition of this prospect right now. */
export function requiredMode(rule: TerritoryRule | null, eng: Engagement, now: Date): Mode {
  if (!rule) return "REMOTE";
  if (rule.acquisition === "REMOTE_DEFAULT") return "REMOTE";
  if (rule.acquisition === "FIELD_EXCLUSIVE") return "FIELD";
  // FIELD_PRIORITY: FIELD during the window, and afterwards only for prospects a FIELD agent already touched.
  const end = rule.priorityStartedAt && rule.priorityDays ? rule.priorityStartedAt.getTime() + rule.priorityDays * 86_400_000 : null;
  if (end === null || now.getTime() < end) return "FIELD";
  return eng.touched || eng.activeOpportunity ? "FIELD" : "REMOTE";
}

export interface AcquirerFacts { mode: Mode | null; coverageKeys: readonly string[]; isSuperAdmin: boolean }
export type AcquisitionDecision = { allowed: true } | { allowed: false; code: "FIELD_MODE_REQUIRED" | "OUTSIDE_COVERAGE" | "NO_SALES_MODE" };

/**
 * May this actor take INITIAL ownership of the prospect? Existing active opportunities retain their owner
 * (`retainsOwnership`) and explicit transfers by a manager/Super Admin are decided elsewhere — neither goes through here.
 */
export function evaluateAcquisition(a: AcquirerFacts, rule: TerritoryRule | null, eng: Engagement, now: Date, retainsOwnership = false): AcquisitionDecision {
  if (a.isSuperAdmin || retainsOwnership) return { allowed: true };
  if (!a.mode) return { allowed: false, code: "NO_SALES_MODE" };
  if (a.coverageKeys.length && rule && !a.coverageKeys.includes(rule.key)) return { allowed: false, code: "OUTSIDE_COVERAGE" };
  if (requiredMode(rule, eng, now) === "FIELD" && a.mode !== "FIELD") return { allowed: false, code: "FIELD_MODE_REQUIRED" };
  return { allowed: true };
}

export type ColdEmailDecision = { allowed: true } | { allowed: false; code: "TERRITORY_FIELD_FIRST_CONTACT" | "TERRITORY_FIELD_ONLY" };

/**
 * Commercial email rules for field-held prospects.
 *  - AUTOMATED (sequences): never a cold first contact in a field-held territory; allowed after a QUALIFYING visit conversation or a reply.
 *    A failed/no-contact/rejected visit (or a legacy visit without a structured outcome) never counts. This gate is territory
 *    policy only: the CASL sending basis, DNC, suppression and language checks are evaluated separately and still apply.
 *  - MANUAL one-off: a FIELD agent may write; a REMOTE agent may not make first contact on a field-held prospect.
 */
export function evaluateColdEmail(i: { required: Mode; eng: Engagement; automated: boolean; senderMode: Mode | null; senderIsSuperAdmin?: boolean }): ColdEmailDecision {
  if (i.required !== "FIELD") return { allowed: true };
  if (i.eng.qualifiedVisit || i.eng.replied || i.eng.activeOpportunity) return { allowed: true };
  if (i.automated) return { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" };
  if (i.senderMode === "FIELD" || i.senderIsSuperAdmin) return { allowed: true };
  return { allowed: false, code: "TERRITORY_FIELD_ONLY" };
}
