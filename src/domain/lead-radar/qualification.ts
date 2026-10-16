// National Lead Radar — autonomous qualification (pure). The founder approves a POLICY; the policy sorts every staged candidate into one of
// three lanes, with explicit, auditable reasons. The same function powers the Super Admin preview and the automatic executor, so a preview can
// never disagree with what activation later does (tests/lead-radar-automation-domain.test.ts proves it).
//
// Design rules (derived from the real Québec run: 2,084 staged → 1,312 PRIMARY, 2,028 NEW, 37 EXISTING_STRONG, 19 AMBIGUOUS):
//  · No invented numeric score or confidence cut-off. Only signals the pipeline already computed with a documented meaning are used:
//    licence verdict, taxonomy tier, duplicate-match state, chain signal, the staging quality flags (incl. the extractor's own
//    LOW_CONFIDENCE flag) and territory resolution. `completeness` is deliberately NOT an input: a complete record can be wrong.
//  · AMBIGUOUS matches, branch relationships, ambiguous/unknown categories and source changes after approval are ALWAYS human exceptions —
//    no policy option can auto-advance them.
//  · A licence the allow-list rejects, an excluded tier, or a record with no usable contact/location is BLOCKED, whatever the policy says.
//  · A candidate a human rejected is never re-opened by a policy (callers must not evaluate it; `evaluateQualification` also refuses).
import { importEligibility } from "@/domain/lead-radar/record";
import { canonicalRules, REVIEWABLE_FLAGS, type PolicyRules, type ReviewableFlag } from "@/domain/lead-radar/policy-rules";
import { classifyBusinessType, independentSources, type BusinessType } from "@/domain/lead-radar/business-type";
import { OEM_NAME } from "@/domain/lead-radar/taxonomy";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";

export * from "@/domain/lead-radar/policy-rules";

export type QualificationLane = "AUTO_ELIGIBLE" | "HUMAN_REVIEW" | "BLOCKED";
type StaticReason =
  // blocked
  | "LICENSE_BLOCKED" | "EXCLUDED_TIER" | "INSUFFICIENT_CONTACT" | "SOURCE_PROVENANCE_MISSING" | "CHAIN_BLOCKED_BY_POLICY"
  // human review
  | "AMBIGUOUS_MATCH" | "BRANCH_RELATIONSHIP" | "EXISTING_MATCH_REVIEW" | "QUESTIONABLE_CATEGORY" | "SECONDARY_CATEGORY" | "CHAIN_SIGNAL"
  | "NO_LOCATION" | "NO_REACHABLE_CHANNEL" | "TERRITORY_UNRESOLVED" | "SOURCE_CHANGED"
  // V2 (business-type aware)
  | "NOT_TARGET_BUSINESS" | "CATEGORY_NAME_CONFLICT"
  // informational on an auto-eligible candidate
  | "AUTO_LINK_EXISTING" | "REPAIR_CAPABLE_SPECIALTY" | "CATEGORY_NAME_EVIDENCE" | "CORROBORATED_LOW_CONFIDENCE"
  // outside the policy's scope (no lane)
  | "OUT_OF_POLICY_SCOPE";
export type QualificationReason = StaticReason | `FLAG_${ReviewableFlag}`;
/** Every reason code the UI must be able to explain (EN/FR completeness is tested against this list). */
export const QUALIFICATION_REASONS: readonly QualificationReason[] = [
  "LICENSE_BLOCKED", "EXCLUDED_TIER", "INSUFFICIENT_CONTACT", "SOURCE_PROVENANCE_MISSING", "CHAIN_BLOCKED_BY_POLICY",
  "AMBIGUOUS_MATCH", "BRANCH_RELATIONSHIP", "EXISTING_MATCH_REVIEW", "QUESTIONABLE_CATEGORY", "SECONDARY_CATEGORY", "CHAIN_SIGNAL",
  "NO_LOCATION", "NO_REACHABLE_CHANNEL", "TERRITORY_UNRESOLVED", "SOURCE_CHANGED",
  ...REVIEWABLE_FLAGS.map((f): QualificationReason => `FLAG_${f}`),
  "NOT_TARGET_BUSINESS", "CATEGORY_NAME_CONFLICT", "AUTO_LINK_EXISTING", "REPAIR_CAPABLE_SPECIALTY", "CATEGORY_NAME_EVIDENCE", "CORROBORATED_LOW_CONFIDENCE", "OUT_OF_POLICY_SCOPE",
];

/** The only candidate facts qualification reads. Everything here is already stored on the staging row. */
export interface QualificationFacts {
  tier: "PRIMARY" | "SECONDARY" | "AMBIGUOUS" | "EXCLUDED";
  licenseOk: boolean;
  licenses: readonly string[];
  datasets: readonly string[];
  chainSignal: string;
  matchState: "NEW" | "EXISTING_STRONG" | "AMBIGUOUS" | "BRANCH_OF_EXISTING";
  qualityFlags: readonly string[];
  province: string | null;
  address: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  territoryKey: string | null;
  reviewState: "PENDING" | "APPROVED" | "REJECTED";
  /** Reasons kept from an earlier decision that only a human may clear (SOURCE_CHANGED set by staging when an approval was invalidated). */
  stickyReasons?: readonly string[];
  // Business-type facts (V2). Optional so V1 callers and old fixtures keep working; absent ⇒ the business type is UNSPECIFIED (⇒ human review under V2).
  name?: string | null;
  taxonomyPrimary?: string | null;
  classReasons?: readonly string[];
}

export interface QualificationResult {
  /** null = the policy does not cover this candidate (outside its provinces): left untouched. */
  lane: QualificationLane | null;
  reasons: QualificationReason[];
  /** What the CRM handoff would do for an AUTO_ELIGIBLE candidate. */
  handoff: "CREATE" | "LINK_EXISTING" | null;
  /** What the business does, as judged by business-type.ts (informational under V1; decisive under V2 REPAIR_CAPABLE). */
  businessType?: BusinessType;
}

const uniqSorted = <T extends string>(xs: readonly T[]): T[] => [...new Set(xs)].sort();

export function evaluateQualification(rulesIn: PolicyRules, f: QualificationFacts): QualificationResult {
  const rules = canonicalRules(rulesIn);
  // A human rejection is final for the policy (the executor never selects such rows; this is the belt to that brace).
  if (f.reviewState === "REJECTED") return { lane: null, reasons: [], handoff: null };
  if (rules.provinces.length && !(f.province && (rules.provinces as readonly string[]).includes(f.province))) {
    return { lane: null, reasons: ["OUT_OF_POLICY_SCOPE"], handoff: null };
  }

  const bt = classifyBusinessType({ taxonomyPrimary: f.taxonomyPrimary, name: f.name });
  const v2 = rules.businessTypes === "REPAIR_CAPABLE";
  const done = (r: Omit<QualificationResult, "businessType">): QualificationResult => ({ ...r, businessType: bt.type });

  const blocked: QualificationReason[] = [];
  if (!f.licenseOk) blocked.push("LICENSE_BLOCKED");
  if (f.tier === "EXCLUDED") blocked.push("EXCLUDED_TIER");
  if (!importEligibility({ licenseOk: true, tier: "PRIMARY", address: f.address, phone: f.phone, postalCode: f.postalCode }).eligible) blocked.push("INSUFFICIENT_CONTACT");
  if (f.licenseOk && (f.licenses.length === 0 || f.datasets.length === 0)) blocked.push("SOURCE_PROVENANCE_MISSING"); // provenance is mandatory for attribution
  if (f.chainSignal === "CHAIN_SIGNAL" && rules.chainSignal === "BLOCK") blocked.push("CHAIN_BLOCKED_BY_POLICY");
  // V2: a business that provably does not repair vehicles (parts-only, wash/detailing-only, towing…) is not a GarageOS target. Only a KNOWN category decides this.
  if (v2 && bt.capability === "NON_TARGET" && rules.nonTargetBusiness === "BLOCK") blocked.push("NOT_TARGET_BUSINESS");
  // Contradiction gate (every policy, V1 included): a decisive non-repair signal in the name with NO repair wording (EV charging, car wash, recycling, bicycle, taxi
  // equipment, manufacturer/corporate…) blocks, whatever the stored category says; see repair-fit.ts. A known non-repair CATEGORY stays governed by the policy options above.
  const fit = assessRepairFit({ name: f.name, taxonomyPrimary: f.taxonomyPrimary, classReasons: f.classReasons });
  if (fit.fit === "EXCLUDED" && fit.reasons.some((r) => r.startsWith("NAME_SIGNAL_"))) blocked.push("NOT_TARGET_BUSINESS");
  if (blocked.length) return done({ lane: "BLOCKED", reasons: uniqSorted(blocked), handoff: null });

  const review: QualificationReason[] = [];
  const notes: QualificationReason[] = [];
  if (f.matchState === "AMBIGUOUS") review.push("AMBIGUOUS_MATCH");
  if (f.matchState === "BRANCH_OF_EXISTING") review.push("BRANCH_RELATIONSHIP");
  if (f.matchState === "EXISTING_STRONG" && rules.existingMatch === "REVIEW") review.push("EXISTING_MATCH_REVIEW");
  if (!v2) {
    if (f.tier === "AMBIGUOUS") review.push("QUESTIONABLE_CATEGORY");
    if (f.tier === "SECONDARY" && rules.secondaryTier === "REVIEW") review.push("SECONDARY_CATEGORY");
  } else {
    const cr = f.classReasons ?? [];
    // A repair listing under an OEM brand name, or also tagged as a dealer, may be a dealership service department: always a human.
    const dealerService = cr.includes("POSSIBLE_DEALER_SERVICE") || cr.includes("ALSO_DEALER") || OEM_NAME.test(f.name ?? ""); // incl. a brand-named body shop/glass shop: dealer-affiliated, not independent
    if (dealerService) review.push("QUESTIONABLE_CATEGORY");
    else if (bt.capability === "REPAIR" && bt.basis === "TAXONOMY") {
      // Stored tier AMBIGUOUS on a known repair code without a recorded reason is not something we can explain ⇒ a human decides.
      if (f.tier === "AMBIGUOUS") review.push("QUESTIONABLE_CATEGORY");
      else if (f.tier === "SECONDARY") notes.push("REPAIR_CAPABLE_SPECIALTY");
    } else if (bt.capability === "REPAIR") {
      // Generic / unmapped category judged from the code's words or the business name (and nothing contrary).
      if (rules.genericService === "NAME_EVIDENCE") notes.push("CATEGORY_NAME_EVIDENCE"); else review.push("QUESTIONABLE_CATEGORY");
    } else if (bt.capability === "NON_TARGET") review.push("NOT_TARGET_BUSINESS"); // only reachable when nonTargetBusiness = REVIEW
    else if (bt.capability === "UNCERTAIN") review.push("SECONDARY_CATEGORY"); // dealers / customization / inspection: always a human under V2, whatever `secondaryTier` says
    else review.push("QUESTIONABLE_CATEGORY");
  }
  if (f.chainSignal === "CHAIN_SIGNAL" && rules.chainSignal === "REVIEW") review.push("CHAIN_SIGNAL");
  // Location/channel completeness matters for a record that would CREATE a new prospect. A strong match to an existing prospect only enriches it,
  // so it needs no more than the universal "something usable" floor already enforced above (INSUFFICIENT_CONTACT).
  if (f.matchState !== "EXISTING_STRONG") {
    if (rules.requireLocation && !f.address && !f.postalCode) review.push("NO_LOCATION");
    if (rules.requireReachableChannel && !f.phone && !f.website) review.push("NO_REACHABLE_CHANNEL");
  }
  if (f.territoryKey === "unresolved") review.push("TERRITORY_UNRESOLVED");
  // Low source confidence: independent corroboration may stand in for a human ONLY under `lowConfidence: CORROBORATED`, and only when ALL of it holds:
  // ≥ 2 distinct upstream datasets (Overture's own label excluded), a phone AND a street address, and a category the platform itself recognises as repair work.
  const corroborated = independentSources(f.datasets) >= 2 && !!f.phone && !!f.address && bt.capability === "REPAIR" && bt.basis === "TAXONOMY";
  for (const flag of rules.reviewFlags) {
    if (!f.qualityFlags.includes(flag)) continue;
    if (flag === "LOW_CONFIDENCE" && rules.lowConfidence === "CORROBORATED" && corroborated) { notes.push("CORROBORATED_LOW_CONFIDENCE"); continue; }
    review.push(`FLAG_${flag}`);
  }
  for (const s of f.stickyReasons ?? []) if (s === "SOURCE_CHANGED") review.push("SOURCE_CHANGED");
  // Category and name disagree, or the listing is in a segment nobody has ruled on (motorcycle, trailer, dealer, tire retail, OEM-branded): always a human,
  // and the reason is named when nothing else already sends the record to review.
  if (!review.length && fit.fit === "HUMAN_REVIEW" && fit.reasons.some((r) => r === "CATEGORY_NAME_CONFLICT" || r.startsWith("SEGMENT_") || r === "OEM_BRAND_NAME" || r.startsWith("NAME_SIGNAL_"))) review.push("CATEGORY_NAME_CONFLICT");
  if (review.length) return done({ lane: "HUMAN_REVIEW", reasons: uniqSorted(review), handoff: null });

  const link = f.matchState === "EXISTING_STRONG";
  return done({ lane: "AUTO_ELIGIBLE", reasons: uniqSorted([...(link ? (["AUTO_LINK_EXISTING"] as const) : []), ...notes]), handoff: link ? "LINK_EXISTING" : "CREATE" });
}

// ── Preview / dashboard aggregation (pure) ───────────────────────────────────────────────────────────────────────────
export interface PreviewSummary {
  evaluated: number;
  lanes: Record<QualificationLane | "OUT_OF_SCOPE", number>;
  reasons: Record<string, number>;
  byProvince: Record<string, { auto: number; review: number; blocked: number }>;
  /** Lane the candidate currently has (under the previously evaluated policy) → lane under this policy. Only changed rows are counted. */
  changes: Record<string, number>;
  truncated: boolean;
}
export const emptyPreview = (): PreviewSummary => ({ evaluated: 0, lanes: { AUTO_ELIGIBLE: 0, HUMAN_REVIEW: 0, BLOCKED: 0, OUT_OF_SCOPE: 0 }, reasons: {}, byProvince: {}, changes: {}, truncated: false });

export function addToPreview(s: PreviewSummary, r: QualificationResult, ctx: { province: string | null; previousLane: QualificationLane | null }): void {
  s.evaluated++;
  s.lanes[r.lane ?? "OUT_OF_SCOPE"]++;
  for (const x of r.reasons) s.reasons[x] = (s.reasons[x] ?? 0) + 1;
  if (r.lane) {
    const p = (s.byProvince[ctx.province ?? "??"] ??= { auto: 0, review: 0, blocked: 0 });
    if (r.lane === "AUTO_ELIGIBLE") p.auto++; else if (r.lane === "HUMAN_REVIEW") p.review++; else p.blocked++;
  }
  if ((ctx.previousLane ?? null) !== r.lane) {
    const k = `${ctx.previousLane ?? "NONE"}->${r.lane ?? "OUT_OF_SCOPE"}`;
    s.changes[k] = (s.changes[k] ?? 0) + 1;
  }
}
