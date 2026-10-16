// National Lead Radar — qualification policy rules (pure, crypto-free so the admin UI can import the schema and defaults).
import { z } from "zod";
import { PROVINCE_CODES } from "@/domain/lead-radar/geo";

export const POLICY_SCHEMA_VERSION = 1;

/** Staging quality flags a policy may turn into "send to a human". Informational flags (NO_WEBSITE, EMAIL_UNVERIFIED, GEO_FROM_POSTAL…) are not listed on purpose. */
export const REVIEWABLE_FLAGS = ["LOW_CONFIDENCE", "ADDRESS_INCOMPLETE", "GEO_POSTAL_MISMATCH", "GEO_UNRESOLVED", "GEO_REGION_MISSING", "GEO_COUNTRY_MISSING", "WEBSITE_IS_SOCIAL"] as const;
export type ReviewableFlag = (typeof REVIEWABLE_FLAGS)[number];
const DEFAULT_REVIEW_FLAGS: ReviewableFlag[] = ["LOW_CONFIDENCE", "ADDRESS_INCOMPLETE", "GEO_POSTAL_MISMATCH", "GEO_UNRESOLVED", "GEO_REGION_MISSING"];

export const policyRulesSchema = z.object({
  schema: z.literal(POLICY_SCHEMA_VERSION).default(POLICY_SCHEMA_VERSION),
  /** Provinces/territories this policy is allowed to advance. Empty = every province. Candidates outside stay untouched (not blocked). */
  provinces: z.array(z.enum(PROVINCE_CODES)).max(PROVINCE_CODES.length).default([]),
  /** Secondary tier = body/glass/dealer/parts/other automotive. Default: a human decides (they are not the independent repair shops GarageOS sells to). */
  secondaryTier: z.enum(["REVIEW", "AUTO"]).default("REVIEW"),
  /** A chain/brand signal never proves franchise vs independent. Default: a human decides. */
  chainSignal: z.enum(["REVIEW", "AUTO", "BLOCK"]).default("REVIEW"),
  /** A STRONG match to an existing prospect only enriches it (never overwrites). AUTO_LINK records the link; REVIEW asks a human. */
  existingMatch: z.enum(["AUTO_LINK", "REVIEW"]).default("AUTO_LINK"),
  /** The candidate must be locatable (street address or postal code). */
  requireLocation: z.boolean().default(true),
  /** The candidate must be reachable by phone or website. */
  requireReachableChannel: z.boolean().default(true),
  reviewFlags: z.array(z.enum(REVIEWABLE_FLAGS)).max(REVIEWABLE_FLAGS.length).default(DEFAULT_REVIEW_FLAGS),
  // ── V2 options (business-type aware). Every default reproduces V1 EXACTLY, and a rule set that leaves them at their defaults keeps its V1 hash.
  /**
   * STORED_TIER (V1): the staged `tier` decides (body/glass/dealer/parts/wash… are all "secondary").
   * REPAIR_CAPABLE: judge what the business DOES (business-type.ts): real repair work (general, specialists, body/collision, glass, restoration/trailer) is in scope;
   * parts-only, wash/detailing-only, towing and similar are NOT target businesses; dealers/customization/inspection and unrecognised ones stay with a human.
   */
  businessTypes: z.enum(["STORED_TIER", "REPAIR_CAPABLE"]).default("STORED_TIER"),
  /** REPAIR_CAPABLE only: what to do with a clearly non-repair business (parts store, car wash, towing…). */
  nonTargetBusiness: z.enum(["BLOCK", "REVIEW"]).default("BLOCK"),
  /** REPAIR_CAPABLE only: Overture's generic `automotive_service` / an unmapped code. NAME_EVIDENCE = qualify only when the code's words or the business name show repair work and nothing points the other way. */
  genericService: z.enum(["REVIEW", "NAME_EVIDENCE"]).default("REVIEW"),
  /**
   * The extractor's LOW_CONFIDENCE flag (< 0.5). REVIEW (V1): always a human. CORROBORATED: tolerated ONLY when independent evidence agrees — at least two distinct upstream
   * datasets (Overture's own label does not count), a phone AND a street address, and a confirmed repair business type. Completeness alone never counts.
   */
  lowConfidence: z.enum(["REVIEW", "CORROBORATED"]).default("REVIEW"),
});
export type PolicyRules = z.infer<typeof policyRulesSchema>;

export const DEFAULT_POLICY_RULES: PolicyRules = policyRulesSchema.parse({});

/** The recommended, conservative V2: business-type aware, name evidence for generic categories, corroborated low confidence. Everything else equals V1. */
export const RECOMMENDED_V2_RULES: PolicyRules = policyRulesSchema.parse({ businessTypes: "REPAIR_CAPABLE", nonTargetBusiness: "BLOCK", genericService: "NAME_EVIDENCE", lowConfidence: "CORROBORATED" });

/** Canonical form: parsed, defaulted, arrays sorted/de-duplicated. Equal intent ⇒ equal bytes ⇒ equal hash. */
export function canonicalRules(raw: unknown): PolicyRules {
  const r = policyRulesSchema.parse(raw ?? {});
  return { ...r, provinces: [...new Set(r.provinces)].sort(), reviewFlags: [...new Set(r.reviewFlags)].sort() };
}
