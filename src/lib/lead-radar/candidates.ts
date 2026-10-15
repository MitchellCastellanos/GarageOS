import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { importEligibility } from "@/domain/lead-radar/record";
import { PRIMARY_RULES, CATEGORY_GROUPS } from "@/domain/lead-radar/taxonomy";
import { PROVINCE_CODES } from "@/domain/lead-radar/geo";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

export const PAGE_SIZE = 50;
export const MAX_REVIEW_BATCH = 200;

const optEnum = <T extends readonly [string, ...string[]]>(v: T) => z.enum(v).optional().catch(undefined);
export const candidateFilterSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  province: optEnum(PROVINCE_CODES),
  city: z.string().trim().max(80).optional().catch(undefined),
  tier: optEnum(["PRIMARY", "SECONDARY", "AMBIGUOUS", "EXCLUDED"] as const),
  group: optEnum(CATEGORY_GROUPS),
  review: optEnum(["PENDING", "APPROVED", "REJECTED"] as const),
  match: optEnum(["NEW", "EXISTING_STRONG", "AMBIGUOUS", "BRANCH_OF_EXISTING"] as const),
  imp: optEnum(["NOT_IMPORTED", "CREATED", "LINKED", "SENT_TO_REVIEW", "SKIPPED", "FAILED"] as const),
  chain: optEnum(["CHAIN_SIGNAL", "NO_CHAIN_SIGNAL"] as const),
  minCompleteness: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  hasPhone: z.enum(["1"]).optional().catch(undefined),
  hasWebsite: z.enum(["1"]).optional().catch(undefined),
  hasEmail: z.enum(["1"]).optional().catch(undefined),
  licenseBlocked: z.enum(["1"]).optional().catch(undefined),
  runId: z.string().max(40).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type CandidateFilters = z.infer<typeof candidateFilterSchema>;

export function whereFor(f: CandidateFilters): Prisma.CrmDiscoveryCandidateWhereInput {
  const and: Prisma.CrmDiscoveryCandidateWhereInput[] = [];
  if (f.q) and.push({ OR: [{ nameNormalized: { contains: f.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), mode: "insensitive" } }, { phone: { contains: f.q.replace(/\D/g, "") || "\u0000" } }, { website: { contains: f.q, mode: "insensitive" } }] });
  if (f.province) and.push({ province: f.province });
  if (f.city) and.push({ city: { equals: f.city, mode: "insensitive" } });
  if (f.tier) and.push({ tier: f.tier });
  if (f.group) and.push({ taxonomyPrimary: { in: Object.entries(PRIMARY_RULES).filter(([, r]) => r.group === f.group).map(([k]) => k) } });
  if (f.review) and.push({ reviewState: f.review });
  if (f.match) and.push({ matchState: f.match });
  if (f.imp) and.push({ importState: f.imp });
  if (f.chain) and.push({ chainSignal: f.chain });
  if (f.minCompleteness !== undefined) and.push({ completeness: { gte: f.minCompleteness } });
  if (f.hasPhone) and.push({ phone: { not: null } });
  if (f.hasWebsite) and.push({ website: { not: null } });
  if (f.hasEmail) and.push({ email: { not: null } });
  if (f.licenseBlocked) and.push({ licenseOk: false });
  if (f.runId) and.push({ lastRunId: f.runId });
  return and.length ? { AND: and } : {};
}

export async function listCandidates(actor: PlatformSalesActor, f: CandidateFilters) {
  const where = whereFor(f);
  const page = f.page ?? 1;
  const [total, rows] = await Promise.all([
    db.crmDiscoveryCandidate.count({ where }),
    db.crmDiscoveryCandidate.findMany({
      where, orderBy: [{ tier: "asc" }, { completeness: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, address: true, city: true, province: true, postalCode: true, phone: true, website: true, email: true, territoryKey: true, taxonomyPrimary: true, tier: true,
        industry: true, classReasons: true, chainSignal: true, sourceConfidence: true, completeness: true, qualityFlags: true, licenses: true, datasets: true, licenseOk: true,
        lastSeenRelease: true, reviewState: true, reviewNote: true, matchState: true, matchProspectId: true, matchReasons: true, importState: true, importedProspectId: true,
        importErrorCode: true, changedSinceImport: true,
      },
    }),
  ]);
  // A CRM prospect is only named/linked when the viewer may open it (team scope); otherwise only "an existing record" is revealed.
  const linkIds = [...new Set(rows.flatMap((r) => [r.matchProspectId, r.importedProspectId]).filter((x): x is string => !!x))];
  const visible = new Map((linkIds.length ? await db.crmProspect.findMany({ where: { AND: [{ id: { in: linkIds } }, assignedScopeWhere(actor)] }, select: { id: true, name: true, assignedStaffId: true } }) : []).map((p) => [p.id, p]));
  return {
    total, page, pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({
      ...r,
      eligibility: importEligibility(r),
      match: r.matchProspectId ? { id: r.matchProspectId, visible: visible.has(r.matchProspectId), name: visible.get(r.matchProspectId)?.name ?? null, owned: visible.get(r.matchProspectId)?.assignedStaffId != null } : null,
      imported: r.importedProspectId ? { id: r.importedProspectId, visible: visible.has(r.importedProspectId) } : null,
    })),
  };
}

export type ReviewDecision = "APPROVED" | "REJECTED" | "PENDING";
const CHANGEABLE = ["NOT_IMPORTED", "FAILED", "SKIPPED"] as const;

/**
 * Batch review. Idempotent (repeating a decision changes nothing), compare-and-set (a candidate that was imported meanwhile is never touched),
 * and an approval is refused for licence-blocked or excluded candidates. Writes one audit row with ids and counts only.
 */
export async function reviewCandidates(actor: PlatformSalesActor, idsIn: readonly string[], decision: ReviewDecision, note?: string | null) {
  const ids = [...new Set(idsIn.filter((i) => typeof i === "string" && i.length <= 40))];
  if (!ids.length || ids.length > MAX_REVIEW_BATCH) throw new CrmError("BATCH_SIZE");
  if (!["APPROVED", "REJECTED", "PENDING"].includes(decision)) throw new CrmError("INVALID");
  const cleanNote = note ? note.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300) || null : null;
  const rows = await db.crmDiscoveryCandidate.findMany({ where: { id: { in: ids } }, select: { id: true, reviewState: true, importState: true, licenseOk: true, tier: true } });
  const found = new Set(rows.map((r) => r.id));
  const blocked = rows.filter((r) => decision === "APPROVED" && (!r.licenseOk || r.tier === "EXCLUDED"));
  const locked = rows.filter((r) => !(CHANGEABLE as readonly string[]).includes(r.importState));
  const unchanged = rows.filter((r) => r.reviewState === decision);
  const upd = await db.crmDiscoveryCandidate.updateMany({
    where: {
      id: { in: ids }, importState: { in: [...CHANGEABLE] }, reviewState: { not: decision },
      ...(decision === "APPROVED" ? { licenseOk: true, tier: { not: "EXCLUDED" } } : {}),
    },
    data: decision === "PENDING"
      ? { reviewState: "PENDING", reviewedByUserId: null, reviewedAt: null, reviewNote: null }
      : { reviewState: decision, reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: cleanNote },
  });
  const result = { requested: ids.length, updated: upd.count, unchanged: unchanged.length, blocked: blocked.length, alreadyImported: locked.length, notFound: ids.length - found.size };
  if (upd.count > 0) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_CANDIDATES_REVIEWED", entityType: "CrmDiscoveryCandidate", metadata: { decision, ids: ids.slice(0, MAX_REVIEW_BATCH), ...result } });
  return result;
}
