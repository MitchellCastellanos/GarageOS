import { postalKey, provinceCode } from "@/domain/sales-crm/territory";

export type CrmLanguage = "FR" | "EN" | "UNKNOWN";
export type EffectiveLanguageSource = "override" | "contact" | "prospect" | "territory" | "unknown";

const known = (v: CrmLanguage | null | undefined): v is "FR" | "EN" => v === "FR" || v === "EN";

/**
 * Deterministic campaign default for a REMOTE (NATIONAL) prospect: Québec → French, the rest of Canada → English. A territory rule, never language detection.
 * Province first; with no province a Québec postal area (G, H, J) decides; with neither, UNKNOWN (a human decides).
 */
export function territoryDefaultLanguage(loc: { province?: string | null; postalCode?: string | null }): CrmLanguage {
  const prov = provinceCode(loc.province);
  if (prov) return prov === "QC" ? "FR" : "EN";
  const first = postalKey(loc.postalCode).charAt(0);
  if (!first) return "UNKNOWN";
  return "GHJ".includes(first) ? "FR" : "ABCEKLMNPRSTVXY".includes(first) ? "EN" : "UNKNOWN";
}

/**
 * Explicit message override > contact preference > prospect (business) preference > campaign territory default (only when the caller passes one) > UNKNOWN.
 * UNKNOWN is a real result: callers must ask a human (or use an approved bilingual template). Never default to French.
 */
export function resolveEffectiveLanguage(input: {
  override?: CrmLanguage | null; contact?: CrmLanguage | null; prospect: CrmLanguage; territoryDefault?: CrmLanguage | null;
}): { language: CrmLanguage; source: EffectiveLanguageSource; needsHumanDecision: boolean } {
  if (known(input.override)) return { language: input.override, source: "override", needsHumanDecision: false };
  if (known(input.contact)) return { language: input.contact, source: "contact", needsHumanDecision: false };
  if (known(input.prospect)) return { language: input.prospect, source: "prospect", needsHumanDecision: false };
  if (known(input.territoryDefault)) return { language: input.territoryDefault, source: "territory", needsHumanDecision: false };
  return { language: "UNKNOWN", source: "unknown", needsHumanDecision: true };
}

/** The campaign default applies only to a prospect positively classified NATIONAL (REMOTE). Anything else keeps the "a human decides" rule. */
export function campaignDefaultFor(p: { territoryState?: string | null; province?: string | null; postalCode?: string | null }): CrmLanguage | null {
  return p.territoryState === "NATIONAL" ? territoryDefaultLanguage(p) : null;
}
