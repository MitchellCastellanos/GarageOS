import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  computeFitScore, computeIntentScore, recommendDemoFeatures, type Basis, type Level, type NeedInput, type ScoreResult, type Severity,
} from "@/domain/sales-crm/scoring";

type Tx = Prisma.TransactionClient | typeof db;

export async function loadNeedInputs(tx: Tx, prospectId: string): Promise<NeedInput[]> {
  const rows = await tx.crmProspectNeed.findMany({ where: { prospectId, definition: { active: true } }, include: { definition: true } });
  return rows.map((r) => ({
    key: r.definition.key, feature: r.definition.suggestedFeature, weight: r.definition.weight,
    severity: r.severity as Severity, priority: r.priority as Level, basis: r.basis as Basis,
  }));
}

/** Recomputes Fit + Intent for the prospect's OPEN opportunity (closed opportunities keep their frozen scores). */
export async function recomputeOpportunityScores(tx: Tx, prospectId: string, now = new Date()): Promise<void> {
  const opp = await tx.crmOpportunity.findFirst({
    where: { prospectId, stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } },
    select: { id: true, stage: true, urgency: true, _count: { select: { demos: true } } },
  });
  if (!opp) return;
  const [prospect, contacts, needs, definitions, touches, lastActivity] = await Promise.all([
    tx.crmProspect.findUniqueOrThrow({ where: { id: prospectId }, select: { shopSize: true, industry: true, currentSoftware: true, preferredLanguage: true } }),
    tx.crmContact.findMany({ where: { prospectId, archivedAt: null }, select: { isDecisionMaker: true } }),
    loadNeedInputs(tx, prospectId),
    tx.crmNeedDefinition.findMany({ where: { active: true }, select: { weight: true } }),
    tx.crmActivity.count({
      where: {
        prospectId, occurredAt: { gte: new Date(now.getTime() - 30 * 86400_000) },
        OR: [{ type: "MEETING" }, { type: "CALL", outcome: { in: ["CONNECTED", "INTERESTED"] } }],
      },
    }),
    tx.crmActivity.findFirst({ where: { prospectId, type: { not: "SYSTEM" } }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  const fit = computeFitScore({
    shopSize: prospect.shopSize, industry: prospect.industry, currentSoftware: prospect.currentSoftware,
    preferredLanguage: prospect.preferredLanguage, activeContactCount: contacts.length,
    hasDecisionMaker: contacts.some((c) => c.isDecisionMaker), activeNeedWeights: definitions.map((d) => d.weight), needs,
  });
  const intent = computeIntentScore({
    stage: opp.stage, urgency: opp.urgency, meaningfulTouches30d: touches, linkedDemoCount: opp._count.demos,
    daysSinceLastActivity: lastActivity ? Math.floor((now.getTime() - lastActivity.occurredAt.getTime()) / 86400_000) : null,
  });
  await tx.crmOpportunity.update({
    where: { id: opp.id },
    data: {
      fitScore: fit.score, fitBreakdown: scoreBreakdownJson(fit), intentScore: intent.score, intentBreakdown: scoreBreakdownJson(intent), scoreComputedAt: now,
    },
  });
}

export function scoreBreakdownJson(r: ScoreResult): Prisma.InputJsonValue {
  return { confidence: Math.round(r.confidence * 100) / 100, factors: r.factors.map((f) => ({ key: f.key, weight: f.weight, value: f.value, detail: f.detail ?? {} })) } as Prisma.InputJsonValue;
}

export { recommendDemoFeatures };
