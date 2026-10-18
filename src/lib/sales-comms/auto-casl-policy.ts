import "server-only";
import type { Prisma } from "@prisma/client";
import { NO_AUTO_POLICY, type AutoCaslPolicy } from "@/domain/sales-comms/casl";
import { CASL_RULE_VERSION } from "@/domain/lead-radar/casl-evidence-engine";
import { db } from "@/lib/db";

/**
 * The owner-level switch for the automated CASL policy. It is active only when the Super Admin turned it on AND it names the CURRENT policy version, so changing the
 * rules (a new CASL_RULE_VERSION) silently returns to "not activated" until the owner renews the decision. Every send path reads it through this one function.
 */
export async function loadAutoCaslPolicy(client: Pick<typeof db, "crmLeadAutomation"> | Prisma.TransactionClient = db): Promise<AutoCaslPolicy> {
  const a = await client.crmLeadAutomation.findUnique({ where: { id: "default" }, select: { autoCaslActive: true, autoCaslRuleVersion: true } });
  return a?.autoCaslActive && a.autoCaslRuleVersion === CASL_RULE_VERSION ? { active: true, ruleVersion: CASL_RULE_VERSION } : NO_AUTO_POLICY;
}
