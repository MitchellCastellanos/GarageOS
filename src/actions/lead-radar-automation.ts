"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { requireLeadRadar } from "@/lib/lead-radar/access";
import { runAutomationTick, saveAutomation, setAutomationEnabled, setPilotEnabled, type AutomationInput } from "@/lib/lead-radar/automation";
import { activatePolicy, createPolicyDraft, previewPolicy } from "@/lib/lead-radar/policy";
import { compareRulesOnPool, renderComparisonMarkdown } from "@/lib/lead-radar/compare";
import { canonicalRules, DEFAULT_POLICY_RULES, RECOMMENDED_V2_RULES } from "@/domain/lead-radar/policy-rules";
import { db } from "@/lib/db";

// Super Admin only, re-checked server-side on every call (requireLeadRadar("admin") resolves the actor from the session; the UI only hides controls).
const touch = () => revalidatePath(PLATFORM.salesLeadRadarAutomation);

export async function createLeadPolicy(input: { name: string; note?: string | null; rules: unknown }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await createPolicyDraft(actor, input); touch(); return r; });
}
export async function previewLeadPolicy(policyId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await previewPolicy(actor, String(policyId)); touch(); return { preview: r.summary, version: r.version }; });
}
export async function activateLeadPolicy(policyId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await activatePolicy(actor, String(policyId)); touch(); return r; });
}
export async function saveLeadAutomation(input: AutomationInput) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { await saveAutomation(actor, input); touch(); return {}; });
}
export async function setLeadAutomationEnabled(enabled: boolean, reason?: string | null) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { await setAutomationEnabled(actor, enabled === true, reason); touch(); return {}; });
}
export async function setLeadPilotEnabled(enabled: boolean) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { await setPilotEnabled(actor, enabled === true); touch(); return {}; });
}
/** One manual, bounded tick (same code and the same lease as the scheduled one). */
export async function runLeadAutomationNow() {
  await requireLeadRadar("admin");
  return crmAction(async () => {
    const r = await runAutomationTick({ trigger: "MANUAL", budgetMs: 40_000 });
    touch();
    if (r.status === "SKIPPED") throw new CrmError(r.reason ?? "SKIPPED");
    return { status: r.status };
  });
}

/**
 * READ-ONLY V1 vs V2 comparison over the staged candidates (nothing is written: no policy, no candidate, no audit row). Each side is a stored policy id, the V1 defaults
 * ("V1"), the recommended V2 ("V2"), or ad-hoc rules.
 */
type Side = { policyId: string } | { preset: "V1" | "V2" } | { rules: unknown };
async function resolveSide(s: Side) {
  if ("policyId" in s) {
    const p = await db.crmLeadPolicy.findUnique({ where: { id: String(s.policyId) }, select: { rules: true } });
    if (!p) throw new CrmError("NOT_FOUND");
    return canonicalRules(p.rules);
  }
  if ("preset" in s) return s.preset === "V2" ? RECOMMENDED_V2_RULES : DEFAULT_POLICY_RULES;
  try { return canonicalRules(s.rules); } catch { throw new CrmError("INVALID_POLICY"); }
}
export async function compareLeadPolicies(input: { a: Side; b: Side; includeNames?: boolean }) {
  await requireLeadRadar("admin");
  return crmAction(async () => {
    const [ra, rb] = await Promise.all([resolveSide(input.a), resolveSide(input.b)]);
    const { report, truncated } = await compareRulesOnPool(ra, rb, { includeNames: input.includeNames === true, examplesPerGroup: 4, deadline: Date.now() + 45_000 });
    return { report, truncated, markdown: renderComparisonMarkdown(report) };
  });
}
