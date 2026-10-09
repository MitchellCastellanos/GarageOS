export type CrmLanguage = "FR" | "EN" | "UNKNOWN";
export type EffectiveLanguageSource = "override" | "contact" | "prospect" | "unknown";

const known = (v: CrmLanguage | null | undefined): v is "FR" | "EN" => v === "FR" || v === "EN";

/**
 * Explicit message override > contact preference > prospect (business) preference > UNKNOWN.
 * UNKNOWN is a real result: callers must ask a human (or use an approved bilingual template). Never default to French.
 */
export function resolveEffectiveLanguage(input: {
  override?: CrmLanguage | null; contact?: CrmLanguage | null; prospect: CrmLanguage;
}): { language: CrmLanguage; source: EffectiveLanguageSource; needsHumanDecision: boolean } {
  if (known(input.override)) return { language: input.override, source: "override", needsHumanDecision: false };
  if (known(input.contact)) return { language: input.contact, source: "contact", needsHumanDecision: false };
  if (known(input.prospect)) return { language: input.prospect, source: "prospect", needsHumanDecision: false };
  return { language: "UNKNOWN", source: "unknown", needsHumanDecision: true };
}
