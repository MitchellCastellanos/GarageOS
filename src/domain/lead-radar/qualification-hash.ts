// Rules fingerprint (server only: node:crypto). A policy's hash is what a preview is bound to and what activation re-verifies.
import { createHash } from "node:crypto";
import { canonicalRules, type PolicyRules } from "@/domain/lead-radar/policy-rules";

export function rulesHashOf(rules: PolicyRules): string {
  const c = canonicalRules(rules);
  // Fixed key order: the hash must not depend on object insertion order.
  const keys = ["schema", "provinces", "secondaryTier", "chainSignal", "existingMatch", "requireLocation", "requireReachableChannel", "reviewFlags"] as const;
  return createHash("sha256").update(JSON.stringify(keys.map((k) => [k, c[k]]))).digest("hex");
}

/** Short, stable digest of a summary: the activation step requires the previewed hash of the exact rules, never a client-supplied summary. */
export const previewDigest = (rulesHash: string, s: { evaluated: number; lanes: unknown }) =>
  createHash("sha256").update(JSON.stringify([rulesHash, s.evaluated, s.lanes])).digest("hex").slice(0, 32);
