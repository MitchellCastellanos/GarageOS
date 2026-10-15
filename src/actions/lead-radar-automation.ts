"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { requireLeadRadar } from "@/lib/lead-radar/access";
import { runAutomationTick, saveAutomation, setAutomationEnabled, setPilotEnabled, type AutomationInput } from "@/lib/lead-radar/automation";
import { activatePolicy, createPolicyDraft, previewPolicy } from "@/lib/lead-radar/policy";

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
