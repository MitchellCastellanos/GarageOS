// Explainable Fit Score and Buying Intent — deterministic, computed only from data a human recorded.
// Nothing here is "AI": every point can be traced to a factor with a weight, and a human can override the result.
// Missing data is EXCLUDED (not scored as zero) and lowers the reported confidence instead.

export type Level = "LOW" | "MEDIUM" | "HIGH";
export type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type Basis = "CONFIRMED" | "INFERRED";

export interface ScoreFactor {
  key: string;
  weight: number;
  /** 0..1, or null when the data is missing. */
  value: number | null;
  /** Machine-readable evidence for the UI to localize (never free text from the model). */
  detail?: Record<string, string | number | boolean | null>;
}
export interface ScoreResult {
  /** null = not enough data to score honestly. */
  score: number | null;
  /** Share of total factor weight backed by recorded data, 0..1. */
  confidence: number;
  factors: ScoreFactor[];
}

export const MIN_CONFIDENCE = 0.2;

export function combineFactors(factors: ScoreFactor[]): ScoreResult {
  const total = factors.reduce((a, f) => a + f.weight, 0);
  const known = factors.filter((f) => f.value !== null);
  const knownWeight = known.reduce((a, f) => a + f.weight, 0);
  const confidence = total ? knownWeight / total : 0;
  if (!known.length || confidence < MIN_CONFIDENCE) return { score: null, confidence, factors };
  const score = Math.round((100 * known.reduce((a, f) => a + f.weight * (f.value as number), 0)) / knownWeight);
  return { score: Math.max(0, Math.min(100, score)), confidence, factors };
}

const SEVERITY: Record<Severity, number> = { NONE: 0, LOW: 0.4, MEDIUM: 0.7, HIGH: 1 };
const PRIORITY: Record<Level, number> = { LOW: 0.8, MEDIUM: 0.9, HIGH: 1 };
const BASIS: Record<Basis, number> = { CONFIRMED: 1, INFERRED: 0.5 };

export interface NeedInput {
  key: string; feature: string; weight: number; severity: Severity; priority: Level; basis: Basis;
}
export interface FitInput {
  shopSize: "SOLO" | "SMALL" | "MEDIUM" | "LARGE" | null;
  industry: string | null;
  currentSoftware: string | null;
  preferredLanguage: "FR" | "EN" | "UNKNOWN";
  activeContactCount: number;
  hasDecisionMaker: boolean;
  /** Active definitions (weight) so unassessed categories still count toward the denominator. */
  activeNeedWeights: number[];
  needs: NeedInput[];
}

const SIZE_FIT = { SOLO: 0.6, SMALL: 1, MEDIUM: 0.9, LARGE: 0.6 } as const;
const INDUSTRY_FIT: Record<string, number> = {
  GENERAL_REPAIR: 1, DIAGNOSTIC: 0.9, TIRE_SHOP: 0.8, TRANSMISSION: 0.8, SPECIALTY: 0.8, BODY_SHOP: 0.5, FLEET: 0.5, OTHER: 0.4,
};
const MANUAL_SOFTWARE = /^(none|no|n\/a|nothing|paper|pen|excel|spreadsheet|sheets?|notebook|aucun|aucune|rien|papier|cahier|chiffrier)\b/i;

export function needContribution(n: NeedInput): number {
  return n.weight * SEVERITY[n.severity] * PRIORITY[n.priority] * BASIS[n.basis];
}

export function computeFitScore(i: FitInput): ScoreResult {
  const software = (i.currentSoftware ?? "").trim();
  const totalNeedWeight = i.activeNeedWeights.reduce((a, b) => a + b, 0);
  const contribution = i.needs.reduce((a, n) => a + needContribution(n), 0);
  const factors: ScoreFactor[] = [
    { key: "shopSize", weight: 15, value: i.shopSize ? SIZE_FIT[i.shopSize] : null, detail: { shopSize: i.shopSize } },
    { key: "industry", weight: 10, value: i.industry ? (INDUSTRY_FIT[i.industry] ?? 0.4) : null, detail: { industry: i.industry } },
    { key: "software", weight: 15, value: software ? (MANUAL_SOFTWARE.test(software) ? 1 : 0.6) : null, detail: { manual: software ? MANUAL_SOFTWARE.test(software) : null } },
    { key: "language", weight: 5, value: i.preferredLanguage === "UNKNOWN" ? null : 1, detail: { language: i.preferredLanguage } },
    { key: "decisionMaker", weight: 10, value: i.activeContactCount === 0 ? 0 : i.hasDecisionMaker ? 1 : 0.4, detail: { contacts: i.activeContactCount, decisionMaker: i.hasDecisionMaker } },
    {
      // Half of all weighted needs at full severity/confirmed evidence is a "full" fit.
      key: "needs", weight: 45,
      value: i.needs.length && totalNeedWeight ? Math.min(1, contribution / (0.5 * totalNeedWeight)) : null,
      detail: { assessed: i.needs.length, confirmed: i.needs.filter((n) => n.basis === "CONFIRMED").length },
    },
  ];
  return combineFactors(factors);
}

export interface IntentInput {
  stage: string;
  urgency: Level | null;
  /** CALL(connected/interested) + MEETING activities in the last 30 days. */
  meaningfulTouches30d: number;
  linkedDemoCount: number;
  daysSinceLastActivity: number | null;
}
const STAGE_INTENT: Record<string, number> = {
  NEW: 0, CONTACTED: 0.15, ENGAGED: 0.4, QUALIFIED: 0.55, DEMO_SCHEDULED: 0.75, DEMO_COMPLETED: 0.85, DECISION: 1,
  WON: 1, LOST: 0, UNQUALIFIED: 0, DO_NOT_CONTACT: 0,
};
const URGENCY: Record<Level, number> = { LOW: 0.2, MEDIUM: 0.6, HIGH: 1 };

export function computeIntentScore(i: IntentInput): ScoreResult {
  const fresh = i.daysSinceLastActivity === null ? 0 : i.daysSinceLastActivity <= 7 ? 1 : i.daysSinceLastActivity <= 14 ? 0.6 : i.daysSinceLastActivity <= 30 ? 0.3 : 0;
  return combineFactors([
    { key: "stage", weight: 40, value: STAGE_INTENT[i.stage] ?? 0, detail: { stage: i.stage } },
    { key: "engagement", weight: 20, value: i.meaningfulTouches30d >= 2 ? 1 : i.meaningfulTouches30d === 1 ? 0.5 : 0, detail: { touches: i.meaningfulTouches30d } },
    { key: "urgency", weight: 20, value: i.urgency ? URGENCY[i.urgency] : null, detail: { urgency: i.urgency } },
    { key: "demo", weight: 10, value: i.linkedDemoCount > 0 ? 1 : 0, detail: { demos: i.linkedDemoCount } },
    { key: "freshness", weight: 10, value: fresh, detail: { days: i.daysSinceLastActivity } },
  ]);
}

/** Human override beats the computed value; both stay visible to the UI. */
export function effectiveScore(computed: number | null, override: number | null | undefined): { value: number | null; overridden: boolean } {
  return override !== null && override !== undefined ? { value: override, overridden: true } : { value: computed, overridden: false };
}

export interface FeatureRecommendation { needKey: string; feature: string; score: number; basis: Basis }
/** Ordered features to demonstrate, derived ONLY from recorded needs (confirmed evidence outranks inferred). */
export function recommendDemoFeatures(needs: NeedInput[], limit = 5): FeatureRecommendation[] {
  return needs.filter((n) => n.severity !== "NONE")
    .map((n) => ({ needKey: n.key, feature: n.feature, score: Math.round(needContribution(n) * 100) / 100, basis: n.basis }))
    .sort((a, b) => b.score - a.score || a.needKey.localeCompare(b.needKey)).slice(0, limit);
}
