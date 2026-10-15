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
});
export type PolicyRules = z.infer<typeof policyRulesSchema>;

export const DEFAULT_POLICY_RULES: PolicyRules = policyRulesSchema.parse({});

/** Canonical form: parsed, defaulted, arrays sorted/de-duplicated. Equal intent ⇒ equal bytes ⇒ equal hash. */
export function canonicalRules(raw: unknown): PolicyRules {
  const r = policyRulesSchema.parse(raw ?? {});
  return { ...r, provinces: [...new Set(r.provinces)].sort(), reviewFlags: [...new Set(r.reviewFlags)].sort() };
}
