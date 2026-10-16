// Rules fingerprint (server only: node:crypto). A policy's hash is what a preview is bound to and what activation re-verifies.
import { createHash } from "node:crypto";
import { canonicalRules, DEFAULT_POLICY_RULES, type PolicyRules } from "@/domain/lead-radar/policy-rules";

export function rulesHashOf(rules: PolicyRules): string {
  const c = canonicalRules(rules);
  // Fixed key order: the hash must not depend on object insertion order.
  const keys = ["schema", "provinces", "secondaryTier", "chainSignal", "existingMatch", "requireLocation", "requireReachableChannel", "reviewFlags"] as const;
  const parts: [string, unknown][] = keys.map((k) => [k, c[k]]);
  // V2 options join the fingerprint ONLY when they differ from their V1 default, so every policy created before they existed keeps its recorded hash
  // (activation re-verifies it) and V1 behaviour is provably unchanged.
  const v2 = ["businessTypes", "nonTargetBusiness", "genericService", "lowConfidence"] as const;
  for (const k of v2) if (c[k] !== DEFAULT_POLICY_RULES[k]) parts.push([k, c[k]]);
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Short, stable digest of a summary: the activation step requires the previewed hash of the exact rules, never a client-supplied summary. */
export const previewDigest = (rulesHash: string, s: { evaluated: number; lanes: unknown }) =>
  createHash("sha256").update(JSON.stringify([rulesHash, s.evaluated, s.lanes])).digest("hex").slice(0, 32);
