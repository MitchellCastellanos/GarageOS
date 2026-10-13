// Sales territories & acquisition rules — pure (no DB). Three separate concepts are kept apart on purpose:
//   administrative role (SALES_REP/MANAGER)  ·  sales mode (FIELD/REMOTE) + coverage  ·  prospect ownership.
// A territory only decides who may do the INITIAL acquisition of an untouched prospect; an owned, engaged prospect
// keeps its owner until a human explicitly transfers it.

export type AcquisitionKind = "FIELD_EXCLUSIVE" | "FIELD_PRIORITY" | "REMOTE_DEFAULT";
export type Mode = "FIELD" | "REMOTE";

export interface TerritoryRule {
  key: string; nameEn?: string; nameFr?: string; acquisition: AcquisitionKind; provinces: string[]; cities: string[]; postalPrefixes: string[];
  /** FIELD_PRIORITY: length of EACH prospect's own priority window, in days. */
  priorityDays: number | null;
  /** @deprecated Territory-wide start date from the first design. Kept for compatibility and IGNORED: windows are per prospect. */
  priorityStartedAt: Date | null;
  active: boolean; sortOrder: number;
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
  /** Any documented touch OTHER than a field-visit attempt (call, meeting, email, sequence step, demo). */
  otherTouch: boolean;
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
export const NO_ENGAGEMENT: Engagement = { touched: false, visited: false, otherTouch: false, qualifiedVisit: false, replied: false, activeOpportunity: false };

/** Per-prospect acquisition timing (CrmProspect columns). Both NULL = no window started, not released. */
export interface AcquisitionTiming { fieldPriorityStartedAt?: Date | null; remoteReleasedAt?: Date | null }
export const NO_TIMING: AcquisitionTiming = { fieldPriorityStartedAt: null, remoteReleasedAt: null };

/** Territory where FIELD sellers hold initial acquisition (exclusive, or priority for a window). */
export const isFieldHeld = (rule: TerritoryRule | null): boolean => !!rule && rule.acquisition !== "REMOTE_DEFAULT";

/**
 * Engagement that keeps a prospect with FIELD after its window ends: a qualifying visit conversation, a reply, an active
 * opportunity, or a non-visit touch. A failed / no-answer / rejected / unavailable visit is NOT meaningful engagement.
 */
export const meaningfulEngagement = (e: Engagement): boolean => e.qualifiedVisit || e.replied || e.activeOpportunity || e.otherTouch;

/** End of THIS prospect's FIELD priority window: its own start + the territory's days. null when no window was started. */
export function priorityDeadline(rule: TerritoryRule | null, timing: AcquisitionTiming): Date | null {
  if (!rule || rule.acquisition !== "FIELD_PRIORITY" || !rule.priorityDays || !timing.fieldPriorityStartedAt) return null;
  return new Date(timing.fieldPriorityStartedAt.getTime() + rule.priorityDays * 86_400_000);
}

export type AcquisitionReason = "NOT_FIELD_HELD" | "MANUALLY_RELEASED" | "FIELD_EXCLUSIVE" | "WINDOW_NOT_STARTED" | "WINDOW_OPEN" | "EXPIRED_ENGAGED" | "EXPIRED_RELEASED";
export interface AcquisitionState { mode: Mode; reason: AcquisitionReason; deadline: Date | null }

/**
 * Which mode holds INITIAL acquisition of this prospect right now (never about who OWNS it: an owner is kept until a human
 * transfers it explicitly).
 *  · REMOTE_DEFAULT / no territory  → REMOTE
 *  · manually released               → REMOTE
 *  · FIELD_EXCLUSIVE                 → FIELD
 *  · FIELD_PRIORITY                  → FIELD while the prospect's OWN window is open or was never started (old prospects are
 *    not given invented dates); after it ends FIELD keeps only prospects with meaningful engagement, the rest become REMOTE.
 * Pure function of (rule, engagement, now, timing): nothing to schedule, so there is no job that could race or reset a window.
 */
export function acquisitionState(rule: TerritoryRule | null, eng: Engagement, now: Date, timing: AcquisitionTiming = NO_TIMING): AcquisitionState {
  if (!isFieldHeld(rule)) return { mode: "REMOTE", reason: "NOT_FIELD_HELD", deadline: null };
  if (timing.remoteReleasedAt) return { mode: "REMOTE", reason: "MANUALLY_RELEASED", deadline: null };
  if (rule!.acquisition === "FIELD_EXCLUSIVE") return { mode: "FIELD", reason: "FIELD_EXCLUSIVE", deadline: null };
  const deadline = priorityDeadline(rule, timing);
  if (!deadline) return { mode: "FIELD", reason: "WINDOW_NOT_STARTED", deadline: null };
  if (now.getTime() < deadline.getTime()) return { mode: "FIELD", reason: "WINDOW_OPEN", deadline };
  return meaningfulEngagement(eng) ? { mode: "FIELD", reason: "EXPIRED_ENGAGED", deadline } : { mode: "REMOTE", reason: "EXPIRED_RELEASED", deadline };
}

/** Which mode holds INITIAL acquisition of this prospect right now. */
export function requiredMode(rule: TerritoryRule | null, eng: Engagement, now: Date, timing: AcquisitionTiming = NO_TIMING): Mode {
  return acquisitionState(rule, eng, now, timing).mode;
}

export interface AcquirerFacts { mode: Mode | null; coverageKeys: readonly string[]; isSuperAdmin: boolean }
export type AcquisitionDecision = { allowed: true } | { allowed: false; code: "FIELD_MODE_REQUIRED" | "OUTSIDE_COVERAGE" | "NO_SALES_MODE" };

/**
 * May this actor take INITIAL ownership of the prospect? Existing active opportunities retain their owner
 * (`retainsOwnership`) and explicit transfers by a manager/Super Admin are decided elsewhere — neither goes through here.
 */
export function evaluateAcquisition(a: AcquirerFacts, rule: TerritoryRule | null, eng: Engagement, now: Date, retainsOwnership = false, timing: AcquisitionTiming = NO_TIMING): AcquisitionDecision {
  if (a.isSuperAdmin || retainsOwnership) return { allowed: true };
  if (!a.mode) return { allowed: false, code: "NO_SALES_MODE" };
  if (a.coverageKeys.length && rule && !a.coverageKeys.includes(rule.key)) return { allowed: false, code: "OUTSIDE_COVERAGE" };
  if (requiredMode(rule, eng, now, timing) === "FIELD" && a.mode !== "FIELD") return { allowed: false, code: "FIELD_MODE_REQUIRED" };
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

// ── Lead Engine: territory classification of a (possibly incomplete) address ────────────────────────────────────────
export type TerritoryState = "LOCAL" | "NATIONAL" | "UNRESOLVED";
export interface TerritoryClassification { state: TerritoryState; rule: TerritoryRule | null }
const isLocalRule = (r: TerritoryRule) => r.cities.length > 0 || r.postalPrefixes.length > 0;
const validFsa = (pc: string) => /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]/.test(pc);

/**
 * Like `resolveTerritory`, but honest about missing data. A location that matches a city/postal-specific territory is
 * LOCAL. A location that is positively outside every local territory (province known + a city or valid postal that
 * matches nothing local) is NATIONAL. Anything else — e.g. "Québec" with no city and no postal code could be
 * Montréal — is UNRESOLVED and must never be auto-assigned as a remote lead.
 */
export function classifyTerritory(rules: TerritoryRule[], loc: Location): TerritoryClassification {
  const rule = resolveTerritory(rules, loc);
  if (rule && isLocalRule(rule)) return { state: "LOCAL", rule };
  const prov = provinceCode(loc.province);
  const hasCity = !!cityKey(loc.city);
  const pc = postalKey(loc.postalCode);
  const hasPostal = validFsa(pc);
  if (!prov && !hasPostal) return { state: "UNRESOLVED", rule: null };
  if (!hasCity && !hasPostal) {
    const couldBeLocal = rules.some((r) => r.active && isLocalRule(r) && (!r.provinces.length || !prov || r.provinces.map((p) => p.toUpperCase()).includes(prov)));
    if (couldBeLocal) return { state: "UNRESOLVED", rule: null };
  }
  return { state: "NATIONAL", rule };
}
