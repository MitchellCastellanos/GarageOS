import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import {
  addToPreview, canonicalRules, emptyPreview, evaluateQualification, type PolicyRules, type PreviewSummary, type QualificationFacts, type QualificationLane,
} from "@/domain/lead-radar/qualification";
import { rulesHashOf } from "@/domain/lead-radar/qualification-hash";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

/** A preview older than this must be redone before activation (the staged data moves). */
export const PREVIEW_MAX_AGE_MS = 24 * 3600_000;
export const PREVIEW_PAGE = 2000;
export const PREVIEW_MAX_ROWS = 60_000;

/**
 * The qualification POOL — the single definition used by the preview AND the executor, so they cannot drift:
 * not yet imported, from a COMPLETED run (a partial/cancelled extraction is an unresolved integrity concern), and either awaiting a decision
 * (PENDING) or approved by the policy itself. A candidate a human approved or rejected is never touched by a policy.
 */
export const poolWhere: Prisma.CrmDiscoveryCandidateWhereInput = {
  importState: "NOT_IMPORTED",
  lastRun: { status: "COMPLETED" },
  // A staged duplicate of another candidate (same business re-keyed by the source) is evidence, never a second prospect.
  duplicateOfCandidateId: null,
  OR: [{ reviewState: "PENDING" }, { approvedByPolicyVersion: { not: null } }],
};

export const FACT_SELECT = {
  id: true, tier: true, licenseOk: true, licenses: true, datasets: true, chainSignal: true, matchState: true, qualityFlags: true, province: true, address: true, postalCode: true,
  phone: true, website: true, territoryKey: true, reviewState: true, name: true, taxonomyPrimary: true, classReasons: true, qualificationLane: true, qualificationReasons: true, approvedByPolicyVersion: true,
} satisfies Prisma.CrmDiscoveryCandidateSelect;
export type FactRow = Prisma.CrmDiscoveryCandidateGetPayload<{ select: typeof FACT_SELECT }>;

export function factsOf(r: FactRow): QualificationFacts {
  return {
    tier: r.tier, licenseOk: r.licenseOk, licenses: r.licenses, datasets: r.datasets, chainSignal: r.chainSignal, matchState: r.matchState, qualityFlags: r.qualityFlags,
    province: r.province, address: r.address, postalCode: r.postalCode, phone: r.phone, website: r.website, territoryKey: r.territoryKey, reviewState: r.reviewState,
    name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons,
    stickyReasons: r.reviewState === "PENDING" ? r.qualificationReasons.filter((x) => x === "SOURCE_CHANGED") : [],
  };
}

export interface ActivePolicy { id: string; version: number; rules: PolicyRules; rulesHash: string; activatedByUserId: string | null }

export async function getActivePolicy(client: Pick<typeof db, "crmLeadPolicy"> = db): Promise<ActivePolicy | null> {
  const p = await client.crmLeadPolicy.findFirst({ where: { status: "ACTIVE" } });
  return p ? { id: p.id, version: p.version, rules: canonicalRules(p.rules), rulesHash: p.rulesHash, activatedByUserId: p.activatedByUserId } : null;
}

export async function listPolicies() {
  return db.crmLeadPolicy.findMany({ orderBy: { version: "desc" }, take: 20 });
}

const cleanText = (v: string | null | undefined, max: number) => (v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);

/** Creates an immutable DRAFT. Rules are never edited in place: a change is a new version, so every decision cites exactly the rules it ran under. */
export async function createPolicyDraft(actor: PlatformSalesActor, input: { name: string; note?: string | null; rules: unknown }) {
  const name = cleanText(input.name, 80);
  if (name.length < 3) throw new CrmError("INVALID");
  let rules: PolicyRules;
  try { rules = canonicalRules(input.rules); } catch { throw new CrmError("INVALID_POLICY"); }
  const hash = rulesHashOf(rules);
  for (let attempt = 0; attempt < 4; attempt++) {
    const last = await db.crmLeadPolicy.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    try {
      const row = await db.crmLeadPolicy.create({
        data: { version: (last?.version ?? 0) + 1, name, note: cleanText(input.note, 400) || null, rules: rules as unknown as Prisma.InputJsonValue, rulesHash: hash, createdByUserId: actor.userId },
        select: { id: true, version: true },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_POLICY_CREATED", entityType: "CrmLeadPolicy", entityId: row.id, metadata: { version: row.version, rulesHash: hash } });
      return { policyId: row.id, version: row.version };
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // version raced with another draft: take the next number
    }
  }
  throw new CrmError("POLICY_VERSION_CONFLICT");
}

/**
 * Evaluates `rules` over the qualification pool WITHOUT writing anything (read-only keyset scan). `truncated` is set when the row or time budget ran out,
 * so a partial preview is never mistaken for a full one. Same pool, same pure function as the executor.
 */
export async function scanPolicy(rules: PolicyRules, opts: { maxRows?: number; deadline?: number } = {}, client: Pick<typeof db, "crmDiscoveryCandidate"> = db): Promise<PreviewSummary> {
  const summary = emptyPreview();
  const max = opts.maxRows ?? PREVIEW_MAX_ROWS;
  let cursor: string | null = null;
  for (;;) {
    const rows: FactRow[] = await client.crmDiscoveryCandidate.findMany({
      where: { AND: [poolWhere, cursor ? { id: { gt: cursor } } : {}] }, orderBy: { id: "asc" }, take: PREVIEW_PAGE, select: FACT_SELECT,
    });
    for (const r of rows) addToPreview(summary, evaluateQualification(rules, factsOf(r)), { province: r.province, previousLane: r.qualificationLane as QualificationLane | null });
    if (rows.length < PREVIEW_PAGE) return summary;
    cursor = rows[rows.length - 1].id;
    if (summary.evaluated >= max || (opts.deadline && Date.now() > opts.deadline)) { summary.truncated = true; return summary; }
  }
}

/** Super Admin preview of a DRAFT policy. Stores the result and the exact rules hash that was previewed — activation requires both. Writes nothing else. */
export async function previewPolicy(actor: PlatformSalesActor, policyId: string) {
  const p = await db.crmLeadPolicy.findUnique({ where: { id: policyId } });
  if (!p) throw new CrmError("NOT_FOUND");
  const rules = canonicalRules(p.rules);
  const hash = rulesHashOf(rules);
  if (hash !== p.rulesHash) throw new CrmError("POLICY_TAMPERED"); // stored rules no longer match their recorded hash: refuse to evaluate or activate
  const summary = await scanPolicy(rules, { deadline: Date.now() + 40_000 });
  if (p.status === "DRAFT") {
    await db.crmLeadPolicy.update({ where: { id: p.id }, data: { previewHash: hash, previewedAt: new Date(), previewSummary: summary as unknown as Prisma.InputJsonValue } });
  }
  await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_POLICY_PREVIEWED", entityType: "CrmLeadPolicy", entityId: p.id, metadata: { version: p.version, evaluated: summary.evaluated, lanes: summary.lanes, truncated: summary.truncated } });
  return { policyId: p.id, version: p.version, status: p.status, summary };
}

/**
 * Activates a previewed DRAFT: exactly one policy is ACTIVE (partial unique index + atomic supersede). The previous policy is superseded, never deleted.
 * Activation does not import or assign anything by itself: the automation tick (a separate, explicit switch) advances candidates under the new version.
 */
export async function activatePolicy(actor: PlatformSalesActor, policyId: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.crmLeadPolicy.findUnique({ where: { id: policyId } });
    if (!p) throw new CrmError("NOT_FOUND");
    if (p.status === "ACTIVE") return { policyId, version: p.version, alreadyActive: true };
    if (p.status !== "DRAFT") throw new CrmError("POLICY_NOT_DRAFT");
    const hash = rulesHashOf(canonicalRules(p.rules));
    if (hash !== p.rulesHash) throw new CrmError("POLICY_TAMPERED");
    if (!p.previewedAt || p.previewHash !== hash) throw new CrmError("POLICY_NOT_PREVIEWED");
    if (Date.now() - p.previewedAt.getTime() > PREVIEW_MAX_AGE_MS) throw new CrmError("POLICY_PREVIEW_STALE");
    const now = new Date();
    await tx.crmLeadPolicy.updateMany({ where: { status: "ACTIVE" }, data: { status: "SUPERSEDED", supersededAt: now } });
    await tx.crmLeadPolicy.update({ where: { id: p.id }, data: { status: "ACTIVE", activatedByUserId: actor.userId, activatedAt: now } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_POLICY_ACTIVATED", entityType: "CrmLeadPolicy", entityId: p.id, metadata: { version: p.version, rulesHash: hash } }, tx);
    return { policyId, version: p.version, alreadyActive: false };
  });
}
