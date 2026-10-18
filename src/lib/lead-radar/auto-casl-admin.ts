import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { CASL_RULE_VERSION } from "@/domain/lead-radar/casl-evidence-engine";
import { db } from "@/lib/db";
import { readAutomation } from "@/lib/lead-radar/automation";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

/** The exact sentence the Super Admin must type: activation is a deliberate, owner-level, policy-wide decision — never a per-contact one. */
export const AUTO_CASL_CONFIRMATION = "ACTIVATE AUTOMATED CASL POLICY";

/**
 * ONE-TIME POLICY-LEVEL decision. While off (the default), automated CASL decisions are only classified (EVIDENCE_SUPPORTED); once on, AUTO_SUPPORTED evidence of the CURRENT policy version
 * can satisfy the basis requirement of the send policy — every other send gate (switches, caps, suppression, identity, domain) still applies, and no contact is approved by anyone.
 * Deactivating takes effect immediately for every send path. Super Admin only; both directions audited.
 */
export async function setAutoCaslPolicy(actor: PlatformSalesActor, input: { active: boolean; ruleVersion?: string; confirmation?: string }) {
  if (!can(actor, "manage_lead_radar") || !actor.all) throw new CrmError("SALES_FORBIDDEN");
  const before = await readAutomation();
  if (input.active) {
    if (input.ruleVersion !== CASL_RULE_VERSION) throw new CrmError("POLICY_VERSION_MISMATCH");
    if ((input.confirmation ?? "").trim() !== AUTO_CASL_CONFIRMATION) throw new CrmError("CONFIRMATION_REQUIRED");
  }
  await db.crmLeadAutomation.update({
    where: { id: "default" },
    data: input.active
      ? { autoCaslActive: true, autoCaslRuleVersion: CASL_RULE_VERSION, autoCaslActivatedAt: new Date(), autoCaslActivatedByUserId: actor.userId, updatedByUserId: actor.userId }
      : { autoCaslActive: false, updatedByUserId: actor.userId },
  });
  await writeCrmAudit({
    actorUserId: actor.userId, action: input.active ? "AUTO_CASL_POLICY_ACTIVATED" : "AUTO_CASL_POLICY_DEACTIVATED", entityType: "CrmLeadAutomation", entityId: "default",
    before: { active: before.autoCaslActive, ruleVersion: before.autoCaslRuleVersion }, after: { active: input.active, ruleVersion: input.active ? CASL_RULE_VERSION : before.autoCaslRuleVersion },
  });
  return readAutomation();
}

/** Evidence stage switch (bounded website evidence reading + automated assessment). Super Admin; audited. Never touches any send switch. */
export async function setEvidenceStageEnabled(actor: PlatformSalesActor, enabled: boolean) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const before = await readAutomation();
  await db.crmLeadAutomation.update({ where: { id: "default" }, data: { evidenceEnabled: enabled === true, updatedByUserId: actor.userId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_AUTOMATION_CHANGED", entityType: "CrmLeadAutomation", entityId: "default", before: { evidenceEnabled: before.evidenceEnabled }, after: { evidenceEnabled: enabled === true }, metadata: { setting: "evidenceEnabled" } });
  return readAutomation();
}
