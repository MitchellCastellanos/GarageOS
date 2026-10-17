import "server-only";
import type { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { ICP_REGISTRY_VERSION } from "@/domain/lead-radar/icp-registry";
import { OUTSIDE_ICP_REASON } from "@/domain/lead-radar/icp";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { decideTombstone, exclusionIdentityKey, type TombstoneDecision, type TombstoneLike } from "@/domain/lead-radar/icp-tombstone";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

type Client = Prisma.TransactionClient | typeof db;
const SELECT = { sourceRecordId: true, identityKey: true, status: true, reasonCode: true, category: true, brandId: true, registryVersion: true, releasedAt: true } as const;

export interface ExclusionIndex { byId: Map<string, TombstoneLike>; byKey: Map<string, TombstoneLike[]> }

/** Tombstones relevant to a batch of source ids / identity keys (two indexed lookups; never the whole table). */
export async function loadExclusions(client: Client, items: readonly { sourceRecordId: string; identityKey: string | null }[]): Promise<ExclusionIndex> {
  const ids = [...new Set(items.map((i) => i.sourceRecordId))], keys = [...new Set(items.map((i) => i.identityKey).filter((k): k is string => !!k))];
  const rows = ids.length || keys.length ? await client.crmDiscoveryExclusion.findMany({ where: { source: "OVERTURE", OR: [...(ids.length ? [{ sourceRecordId: { in: ids } }] : []), ...(keys.length ? [{ identityKey: { in: keys } }] : [])] }, select: SELECT }) : [];
  const idx: ExclusionIndex = { byId: new Map(), byKey: new Map() };
  for (const r of rows) { idx.byId.set(r.sourceRecordId, r); if (r.identityKey) idx.byKey.set(r.identityKey, [...(idx.byKey.get(r.identityKey) ?? []), r]); }
  return idx;
}
export const decideFor = (idx: ExclusionIndex, c: { sourceRecordId: string; identityKey: string | null }): TombstoneDecision => decideTombstone(c.sourceRecordId, c.identityKey, idx.byId, idx.byKey);

export interface ExclusionInput {
  sourceRecordId: string; province: string | null; name: string; city: string | null; identityKey: string | null;
  /** fit reasons of the ICP exclusion (OUTSIDE_ICP…, ICP_<CATEGORY>, ICP_BRAND_<ID>, ICP_REGISTRY_V<n>, evidence) */
  reasons: readonly string[]; release: string | null;
}
const catOf = (r: readonly string[]) => r.find((x) => x.startsWith("ICP_") && !/^ICP_(BRAND_|REGISTRY_|EVIDENCE_|CONFIRMED_|TOMBSTONE|DOMAIN_ONLY)/.test(x))?.slice(4) ?? null;
const brandOf = (r: readonly string[]) => r.find((x) => x.startsWith("ICP_BRAND_"))?.slice(10) ?? null;
const evidenceOf = (r: readonly string[]) => r.filter((x) => x.startsWith("ICP_CONFIRMED_") || x.startsWith("ICP_EVIDENCE_"));

/** Records (or refreshes) the tombstones of ICP-excluded businesses. Never deletes, never un-releases a Super Admin release, never touches a candidate or a CRM record. */
export async function recordExclusions(client: Client, items: readonly ExclusionInput[], index?: ExclusionIndex): Promise<{ created: number; refreshed: number }> {
  if (!items.length) return { created: 0, refreshed: 0 };
  const idx = index ?? (await loadExclusions(client, items));
  const fresh = items.filter((i) => !idx.byId.has(i.sourceRecordId));
  const seen = items.filter((i) => idx.byId.get(i.sourceRecordId)?.status === "ACTIVE").map((i) => i.sourceRecordId);
  const now = new Date();
  let created = 0;
  if (fresh.length) {
    const r = await client.crmDiscoveryExclusion.createMany({
      skipDuplicates: true,
      data: fresh.map((i) => ({ source: "OVERTURE" as const, sourceRecordId: i.sourceRecordId, province: i.province, name: i.name.slice(0, 200), city: i.city, identityKey: i.identityKey, reasonCode: OUTSIDE_ICP_REASON, category: catOf(i.reasons), brandId: brandOf(i.reasons), evidence: evidenceOf(i.reasons), registryVersion: ICP_REGISTRY_VERSION, lastSeenRelease: i.release })),
    });
    created = r.count;
  }
  let refreshed = 0;
  if (seen.length) {
    const rel = items.find((i) => i.release)?.release ?? null;
    refreshed = (await client.crmDiscoveryExclusion.updateMany({ where: { source: "OVERTURE", sourceRecordId: { in: seen }, status: "ACTIVE" }, data: { seenCount: { increment: 1 }, lastSeenAt: now, ...(rel ? { lastSeenRelease: rel } : {}) } })).count;
  }
  return { created, refreshed };
}

/**
 * Super Admin override: "this business is an independent repair shop after all". Sets the candidate's `icpOverride`, releases its tombstone(s) (history is kept, status RELEASED),
 * re-derives the stored fit WITHOUT the ICP gate (every other rule still applies) and clears the stale qualification verdict so the active policy re-evaluates it. It does not approve,
 * import or assign anything. Audited with a mandatory note.
 */
export async function releaseIcpExclusion(actor: PlatformSalesActor, candidateId: string, noteIn: string) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  const note = noteIn.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300);
  if (note.length < 10) throw new CrmError("NOTE_REQUIRED");
  const c = await db.crmDiscoveryCandidate.findUnique({ where: { id: candidateId } });
  if (!c) throw new CrmError("NOT_FOUND");
  const key = exclusionIdentityKey(c);
  const fit = assessRepairFit({ name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, website: c.website, city: c.city, icpOverride: true });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.crmDiscoveryCandidate.update({ where: { id: c.id }, data: { icpOverride: true, repairFit: fit.fit, repairFitReasons: fit.reasons as string[], repairFitAt: now, qualificationLane: null, qualificationPolicyVersion: null, qualifiedAt: null, qualificationReasons: [] } });
    await tx.crmDiscoveryExclusion.updateMany({ where: { source: c.source, OR: [{ sourceRecordId: c.sourceRecordId }, ...(key ? [{ identityKey: key }] : [])] }, data: { status: "RELEASED", releasedByUserId: actor.userId, releasedAt: now, releaseNote: note } });
    // A released business leaves a RELEASED row even when it was never tombstoned, so a re-keyed record inherits the human decision.
    await tx.crmDiscoveryExclusion.createMany({ skipDuplicates: true, data: [{ source: c.source, sourceRecordId: c.sourceRecordId, province: c.province, name: c.name.slice(0, 200), city: c.city, identityKey: key, reasonCode: OUTSIDE_ICP_REASON, registryVersion: ICP_REGISTRY_VERSION, status: "RELEASED", releasedByUserId: actor.userId, releasedAt: now, releaseNote: note }] });
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_EXCLUSION_RELEASED", entityType: "CrmDiscoveryCandidate", entityId: c.id, metadata: { sourceRecordId: c.sourceRecordId, province: c.province, fit: fit.fit, note } }, tx);
  });
  return { fit: fit.fit };
}
