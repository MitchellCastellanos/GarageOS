import "server-only";
import type { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { assessRepairFit, type FitReason, type RepairFit } from "@/domain/lead-radar/repair-fit";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

// CRM-level repair fit: classify existing prospects with the SAME assessor Lead Radar qualification uses, preview it read-only, apply it in bounded,
// resumable, idempotent pages, and let people decide the ambiguous ones. Nothing here deletes, unassigns, archives or reassigns a prospect, touches DNC
// or suppression, or rewrites activities; a HUMAN decision is never overwritten by an automatic one.

type Client = Prisma.TransactionClient | typeof db;

export const CLEANUP_PAGE = 200;
export const PREVIEW_PAGE = 1000;
export const PREVIEW_MAX_ROWS = 60_000;
export const PREVIEW_DEADLINE_MS = 45_000;
export const MAX_DECISION_BATCH = 100;

const MEANINGFUL_ACTIVITY = ["NOTE", "CALL", "MEETING", "EMAIL_LOGGED", "DEMO", "EMAIL_SENT", "EMAIL_RECEIVED", "FIELD_VISIT"] as const;

export const PROSPECT_FIT_SELECT = {
  id: true, name: true, city: true, website: true, industry: true, source: true, status: true, assignedStaffId: true, assignmentMode: true, createdAt: true,
  repairFit: true, repairFitSource: true, repairFitReasons: true, repairFitProtected: true,
  importBatch: { select: { sourceKey: true } },
} satisfies Prisma.CrmProspectSelect;
export type FitProspectRow = Prisma.CrmProspectGetPayload<{ select: typeof PROSPECT_FIT_SELECT }>;

export interface CandidateEvidence { taxonomyPrimary: string | null; classReasons: string[]; qualificationPolicyVersion: number | null; reviewState: string; approvedByPolicyVersion: number | null; reviewNote: string | null; reviewedByUserId: string | null }

/** The staged candidate each prospect was created from / linked to (the most recently updated one), for its taxonomy evidence. */
export async function candidateEvidence(client: Client, ids: readonly string[]): Promise<Map<string, CandidateEvidence>> {
  const out = new Map<string, CandidateEvidence>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await client.crmDiscoveryCandidate.findMany({
      where: { importedProspectId: { in: ids.slice(i, i + 1000) } }, orderBy: { updatedAt: "desc" },
      select: { importedProspectId: true, taxonomyPrimary: true, classReasons: true, qualificationPolicyVersion: true, reviewState: true, approvedByPolicyVersion: true, reviewNote: true, reviewedByUserId: true },
    });
    for (const r of rows) if (r.importedProspectId && !out.has(r.importedProspectId)) out.set(r.importedProspectId, { ...r });
  }
  return out;
}

/** Active opportunity beyond NEW, a terminal opportunity, meaningful activity or an open task ⇒ real sales work exists: never removed automatically. */
export async function protectedProspects(client: Client, ids: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const [opps, acts, tasks] = await Promise.all([
      client.crmOpportunity.findMany({ where: { prospectId: { in: chunk }, stage: { not: "NEW" } }, distinct: ["prospectId"], select: { prospectId: true } }),
      client.crmActivity.findMany({ where: { prospectId: { in: chunk }, type: { in: [...MEANINGFUL_ACTIVITY] } }, distinct: ["prospectId"], select: { prospectId: true } }),
      client.crmTask.findMany({ where: { prospectId: { in: chunk }, status: "OPEN" }, distinct: ["prospectId"], select: { prospectId: true } }),
    ]);
    for (const r of [...opps, ...acts, ...tasks]) out.add(r.prospectId);
  }
  return out;
}

/** `UNCLASSIFIED`: a hand-entered CRM record (no staged candidate) with no evidence either way and nothing contradicting it. It is NOT held: only what we have a
 *  reason to doubt (a contradiction, an unruled segment) or what the automated pipeline brought in without category evidence is held for a person. */
export type ProposedFit = RepairFit | "UNCLASSIFIED";
export interface FitProposal {
  fit: ProposedFit; reasons: string[]; protected: boolean;
  /** What the automatic assessment said before protection turned an exclusion into a review. */
  assessed: ProposedFit; evidence: string;
  /** A human decision exists: nothing is proposed. */
  humanLocked: boolean;
}

/** Pure given its inputs. HUMAN decisions are returned untouched; a protected record the assessor would EXCLUDE becomes a protected HUMAN_REVIEW. */
export function proposeFit(p: Pick<FitProspectRow, "name" | "repairFit" | "repairFitSource" | "repairFitReasons" | "repairFitProtected"> & { industry: string | null; website?: string | null; city?: string | null }, cand: Pick<CandidateEvidence, "taxonomyPrimary" | "classReasons"> | undefined, isProtected: boolean): FitProposal {
  if (p.repairFitSource === "HUMAN" && p.repairFit) return { fit: p.repairFit, reasons: p.repairFitReasons, protected: p.repairFitProtected, assessed: p.repairFit, evidence: "HUMAN", humanLocked: true };
  const a = assessRepairFit({ name: p.name, taxonomyPrimary: cand?.taxonomyPrimary, classReasons: cand?.classReasons, industry: p.industry, website: p.website, city: p.city });
  if (!cand && a.fit === "HUMAN_REVIEW" && a.reasons.length === 1 && a.reasons[0] === "NO_CATEGORY_EVIDENCE") return { fit: "UNCLASSIFIED", reasons: [], protected: isProtected, assessed: "UNCLASSIFIED", evidence: "NONE", humanLocked: false };
  if (isProtected && a.fit === "EXCLUDED") return { fit: "HUMAN_REVIEW", reasons: [...a.reasons, "PROTECTED_RECORD"], protected: true, assessed: a.fit, evidence: a.evidence, humanLocked: false };
  return { fit: a.fit, reasons: a.reasons as string[], protected: isProtected, assessed: a.fit, evidence: a.evidence, humanLocked: false };
}

const sameProposal = (p: FitProspectRow, x: FitProposal) => x.fit === "UNCLASSIFIED"
  ? p.repairFit === null && !p.repairFitProtected
  : p.repairFit === x.fit && p.repairFitSource === "AUTO" && p.repairFitProtected === x.protected && p.repairFitReasons.length === x.reasons.length && p.repairFitReasons.every((r, i) => r === x.reasons[i]);

// ── Read-only preview ────────────────────────────────────────────────────────────────────────────────────────────────
type Counts = Record<RepairFit, number>;
const zero = (): Counts => ({ VERIFIED_REPAIR: 0, HUMAN_REVIEW: 0, EXCLUDED: 0 });
export interface CleanupPreview {
  scanned: number; truncated: boolean; generatedAt: string;
  proposed: Counts; /** Hand-entered records with no evidence either way: left unlabelled and NOT held. */ unclassified: number; humanDecided: Counts; alreadyCurrent: number; wouldChange: number;
  assignment: { assigned: Counts; unassigned: Counts; assignedField: Counts };
  protected: { total: number; flaggedForReview: number; byAssessed: Counts };
  bySource: Record<string, Counts>; byQualification: Record<string, Counts>;
  reasons: Record<string, number>; evidence: Record<string, number>;
  /** Business names only when asked for. Never phones, emails or addresses. */
  examples: { id: string; name: string | null; city: string | null; fit: RepairFit; reasons: string[]; assigned: boolean; protected: boolean }[];
}

export async function cleanupPreview(opts: { includeNames?: boolean; examplesPerClass?: number; deadlineMs?: number } = {}): Promise<CleanupPreview> {
  const t0 = Date.now(), per = Math.min(opts.examplesPerClass ?? 8, 25);
  const out: CleanupPreview = {
    scanned: 0, truncated: false, generatedAt: new Date().toISOString(), proposed: zero(), unclassified: 0, humanDecided: zero(), alreadyCurrent: 0, wouldChange: 0,
    assignment: { assigned: zero(), unassigned: zero(), assignedField: zero() }, protected: { total: 0, flaggedForReview: 0, byAssessed: zero() },
    bySource: {}, byQualification: {}, reasons: {}, evidence: {}, examples: [],
  };
  const exampleCount: Counts = zero();
  let cursor: string | undefined;
  for (;;) {
    if (out.scanned >= PREVIEW_MAX_ROWS || Date.now() - t0 > (opts.deadlineMs ?? PREVIEW_DEADLINE_MS)) { out.truncated = true; break; }
    const rows = await db.crmProspect.findMany({ where: { status: "ACTIVE", mergedIntoId: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: PREVIEW_PAGE, select: PROSPECT_FIT_SELECT });
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);
    const [cands, prot] = await Promise.all([candidateEvidence(db, ids), protectedProspects(db, ids)]);
    for (const p of rows) {
      const cand = cands.get(p.id), isProt = prot.has(p.id), x = proposeFit(p, cand, isProt);
      out.scanned++;
      if (x.humanLocked) { out.humanDecided[x.fit as RepairFit]++; continue; }
      if (x.fit === "UNCLASSIFIED") { out.unclassified++; if (sameProposal(p, x)) out.alreadyCurrent++; else out.wouldChange++; continue; }
      out.proposed[x.fit]++;
      (p.assignedStaffId ? out.assignment.assigned : out.assignment.unassigned)[x.fit]++;
      if (p.assignedStaffId && p.assignmentMode === "FIELD") out.assignment.assignedField[x.fit]++;
      const src = p.importBatch?.sourceKey ?? `manual:${p.source}`;
      (out.bySource[src] ??= zero())[x.fit]++;
      const q = cand ? (cand.qualificationPolicyVersion === null ? "candidate:not-qualified" : `policy-v${cand.qualificationPolicyVersion}`) : "no-candidate (legacy/manual)";
      (out.byQualification[q] ??= zero())[x.fit]++;
      out.evidence[x.evidence] = (out.evidence[x.evidence] ?? 0) + 1;
      for (const r of x.reasons) out.reasons[r] = (out.reasons[r] ?? 0) + 1;
      if (isProt) { out.protected.total++; out.protected.byAssessed[x.assessed as RepairFit]++; if (x.assessed === "EXCLUDED") out.protected.flaggedForReview++; }
      if (sameProposal(p, x)) out.alreadyCurrent++; else out.wouldChange++;
      if (opts.includeNames && x.fit !== "VERIFIED_REPAIR" && exampleCount[x.fit] < per) { exampleCount[x.fit]++; out.examples.push({ id: p.id, name: p.name, city: p.city, fit: x.fit, reasons: x.reasons, assigned: !!p.assignedStaffId, protected: isProt }); }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PREVIEW_PAGE) break;
  }
  return out;
}

// ── Bounded, resumable, idempotent application ───────────────────────────────────────────────────────────────────────
export interface CleanupPageResult { processed: number; changed: number; humanSkipped: number; counts: Counts; nextCursor: string | null; done: boolean }

/**
 * Applies the proposal to ONE page (≤ 200 prospects after `cursor`, by id) in ONE transaction: all rows of the page or none. Re-running a page, or the whole
 * walk, changes nothing that is already current (compare-and-set on "not a human decision"), so an interrupted run is recovered by calling again from the
 * last returned cursor — or from the start. Never unassigns, archives, deletes or reassigns; pending route stops of an EXCLUDED, unprotected prospect are
 * closed as unavailable so no seller is routed to it.
 */
export async function applyCleanupPage(actor: PlatformSalesActor, cursor: string | null, limit = CLEANUP_PAGE, now = new Date()): Promise<CleanupPageResult> {
  if (!actor.all) throw new Error("SALES_FORBIDDEN");
  const take = Math.min(Math.max(1, limit), CLEANUP_PAGE);
  return db.$transaction(async (tx) => {
    const rows = await tx.crmProspect.findMany({ where: { status: "ACTIVE", mergedIntoId: null, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take, select: PROSPECT_FIT_SELECT });
    const counts = zero();
    if (!rows.length) return { processed: 0, changed: 0, humanSkipped: 0, counts, nextCursor: null, done: true };
    const ids = rows.map((r) => r.id);
    const [cands, prot] = await Promise.all([candidateEvidence(tx, ids), protectedProspects(tx, ids)]);
    let changed = 0, humanSkipped = 0;
    const changedIds: string[] = [], excludedIds: string[] = [];
    for (const p of rows) {
      const x = proposeFit(p, cands.get(p.id), prot.has(p.id));
      if (x.humanLocked) { humanSkipped++; continue; }
      if (x.fit !== "UNCLASSIFIED") counts[x.fit]++;
      if (sameProposal(p, x)) continue;
      const r = await tx.crmProspect.updateMany({
        where: { id: p.id, OR: [{ repairFitSource: null }, { repairFitSource: "AUTO" }] },
        data: x.fit === "UNCLASSIFIED"
          ? { repairFit: null, repairFitSource: null, repairFitReasons: [], repairFitProtected: false, repairFitAt: null, repairFitByUserId: null, repairFitNote: null }
          : { repairFit: x.fit, repairFitSource: "AUTO", repairFitReasons: x.reasons, repairFitProtected: x.protected, repairFitAt: now, repairFitByUserId: null, repairFitNote: null },
      });
      if (r.count === 1) { changed++; changedIds.push(p.id); if (x.fit === "EXCLUDED") excludedIds.push(p.id); }
    }
    if (excludedIds.length) {
      await tx.crmFieldRouteStop.updateMany({ where: { prospectId: { in: excludedIds }, status: "PENDING", route: { status: { in: ["DRAFT", "IN_PROGRESS"] } } }, data: { status: "UNAVAILABLE", resolvedAt: now, skipReason: "FIT_EXCLUDED" } });
    }
    const last = rows[rows.length - 1].id, done = rows.length < take;
    await writeCrmAudit({ actorUserId: actor.userId, action: "REPAIR_FIT_CLEANUP_PAGE", entityType: "CrmProspect", metadata: { cursor, lastId: last, processed: rows.length, changed, humanSkipped, counts, ids: changedIds.slice(0, CLEANUP_PAGE) } }, tx);
    if (done) await writeCrmAudit({ actorUserId: actor.userId, action: "REPAIR_FIT_CLEANUP_COMPLETED", entityType: "CrmProspect", metadata: { lastId: last } }, tx);
    return { processed: rows.length, changed, humanSkipped, counts, nextCursor: done ? null : last, done };
  }, { timeout: 60_000, maxWait: 10_000 });
}

// ── Import-time stamp (new prospects are classified the moment they exist) ───────────────────────────────────────────
/** Sets the AUTOMATIC fit of prospects an import just created or linked, only where none exists. A human override approved in Lead Radar becomes a HUMAN fit. */
export async function stampFitAtImport(tx: Prisma.TransactionClient, items: readonly { prospectId: string; created: boolean; name: string; industry: string | null; website?: string | null; city?: string | null; taxonomyPrimary: string | null; classReasons: readonly string[]; override: { userId: string; note: string } | null }[], now = new Date()) {
  let set = 0;
  for (const it of items) {
    if (it.override) {
      const r = await tx.crmProspect.updateMany({ where: { id: it.prospectId, repairFit: null }, data: { repairFit: "VERIFIED_REPAIR", repairFitSource: "HUMAN", repairFitReasons: ["HUMAN_OVERRIDE_AT_APPROVAL"], repairFitAt: now, repairFitByUserId: it.override.userId, repairFitNote: it.override.note.slice(0, 300) } });
      set += r.count; continue;
    }
    const a = assessRepairFit({ name: it.name, taxonomyPrimary: it.taxonomyPrimary, classReasons: it.classReasons, industry: it.industry, website: it.website, city: it.city });
    const r = await tx.crmProspect.updateMany({ where: { id: it.prospectId, repairFit: null }, data: { repairFit: a.fit, repairFitSource: "AUTO", repairFitReasons: a.reasons as string[], repairFitAt: now } });
    set += r.count;
  }
  return set;
}

// ── Review queue and human decisions ─────────────────────────────────────────────────────────────────────────────────
export type FitDecision = "VERIFIED_REPAIR" | "EXCLUDED" | "RESET";
export interface ReviewFilters { fit?: "HUMAN_REVIEW" | "EXCLUDED" | "VERIFIED_REPAIR"; protectedOnly?: boolean; assigned?: "yes" | "no"; q?: string; page?: number }
export const REVIEW_PAGE = 50;

export async function listFitReview(actor: PlatformSalesActor, f: ReviewFilters) {
  if (!actor.all && actor.kind !== "SALES_MANAGER") throw new Error("SALES_FORBIDDEN");
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.CrmProspectWhereInput = {
    status: "ACTIVE", mergedIntoId: null, repairFit: f.fit ?? "HUMAN_REVIEW",
    ...(f.protectedOnly ? { repairFitProtected: true } : {}),
    ...(f.assigned === "yes" ? { assignedStaffId: { not: null } } : f.assigned === "no" ? { assignedStaffId: null } : {}),
    ...(f.q ? { name: { contains: f.q.slice(0, 80), mode: "insensitive" as const } } : {}),
    ...(actor.all ? {} : { OR: [{ assignedStaffId: { in: [...actor.scopeStaffIds] } }, { assignedStaffId: null }] }),
  };
  const [total, rows] = await Promise.all([
    db.crmProspect.count({ where }),
    db.crmProspect.findMany({
      where, orderBy: [{ repairFitProtected: "desc" }, { id: "asc" }], skip: (page - 1) * REVIEW_PAGE, take: REVIEW_PAGE,
      select: { ...PROSPECT_FIT_SELECT, province: true, website: true, repairFitAt: true, repairFitNote: true, assignedStaff: { select: { user: { select: { name: true } } } }, opportunities: { select: { stage: true }, orderBy: { stageChangedAt: "desc" }, take: 1 } },
    }),
  ]);
  const cands = await candidateEvidence(db, rows.map((r) => r.id));
  return {
    total, page, pageSize: REVIEW_PAGE,
    rows: rows.map((r) => ({
      id: r.id, name: r.name, city: r.city, province: r.province, website: r.website, industry: r.industry, fit: r.repairFit, source: r.repairFitSource, reasons: r.repairFitReasons, protected: r.repairFitProtected,
      owner: r.assignedStaff?.user.name ?? null, stage: r.opportunities[0]?.stage ?? null, category: cands.get(r.id)?.taxonomyPrimary ?? null, note: r.repairFitNote,
    })),
  };
}

const cleanNote = (v: string) => v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300);

/** A person's decision: durable (never overwritten by cleanup or refresh), audited with reviewer, time and reason. RESET clears it so the next cleanup re-evaluates. */
export async function decideFit(actor: PlatformSalesActor, idsIn: readonly string[], decision: FitDecision, reasonIn: string, now = new Date()) {
  if (!actor.all && actor.kind !== "SALES_MANAGER") throw new Error("SALES_FORBIDDEN");
  const ids = [...new Set(idsIn.filter((i) => typeof i === "string" && i.length <= 40))];
  if (!ids.length || ids.length > MAX_DECISION_BATCH) throw new CrmError("BATCH_SIZE");
  if (!["VERIFIED_REPAIR", "EXCLUDED", "RESET"].includes(decision)) throw new CrmError("INVALID");
  const reason = cleanNote(reasonIn);
  if (reason.length < 3) throw new CrmError("NOTE_REQUIRED");
  return db.$transaction(async (tx) => {
    const rows = await tx.crmProspect.findMany({ where: { id: { in: ids }, status: "ACTIVE", ...(actor.all ? {} : { OR: [{ assignedStaffId: { in: [...actor.scopeStaffIds] } }, { assignedStaffId: null }] }) }, select: { id: true, repairFit: true, repairFitSource: true } });
    let updated = 0;
    for (const r of rows) {
      const data: Prisma.CrmProspectUncheckedUpdateManyInput = decision === "RESET"
        ? { repairFit: null, repairFitSource: null, repairFitReasons: [], repairFitProtected: false, repairFitAt: null, repairFitByUserId: null, repairFitNote: null }
        : { repairFit: decision, repairFitSource: "HUMAN", repairFitReasons: [decision === "EXCLUDED" ? "HUMAN_EXCLUDED" : "HUMAN_VERIFIED"], repairFitAt: now, repairFitByUserId: actor.userId, repairFitNote: reason };
      const u = await tx.crmProspect.updateMany({ where: { id: r.id }, data });
      updated += u.count;
      await writeCrmAudit({ actorUserId: actor.userId, action: "REPAIR_FIT_DECIDED", entityType: "CrmProspect", entityId: r.id, prospectId: r.id, before: { repairFit: r.repairFit, source: r.repairFitSource }, after: { repairFit: decision === "RESET" ? null : decision }, metadata: { decision, reason } }, tx);
    }
    if (decision === "EXCLUDED" && rows.length) {
      await tx.crmFieldRouteStop.updateMany({ where: { prospectId: { in: rows.map((r) => r.id) }, status: "PENDING", route: { status: { in: ["DRAFT", "IN_PROGRESS"] } } }, data: { status: "UNAVAILABLE", resolvedAt: now, skipReason: "FIT_EXCLUDED" } });
    }
    return { requested: ids.length, updated, notFound: ids.length - rows.length };
  });
}

export type { FitReason };

// ── FIELD readiness funnel (read-only diagnostics) ───────────────────────────────────────────────────────────────────
export interface FieldReadiness {
  fieldTerritoryKeys: string[];
  candidates: { total: number; withSourcePoint: number; inFieldTerritory: number; byImportState: Record<string, number> };
  importedNeedingRefresh: number;
  prospects: { total: number; byFit: Record<string, number>; assigned: number; unassigned: number; assignedToFieldSellers: number };
  located: { withPosition: number; withoutPosition: number; sourcePointNotApplied: number };
}

/** Where FIELD prospecting is losing records, in one place. Counts only; writes nothing. FIELD territories = the active non-REMOTE_DEFAULT territory rules. */
export async function fieldReadiness(): Promise<FieldReadiness> {
  const { loadTerritoryRules } = await import("@/lib/sales-crm/territory");
  const keys = (await loadTerritoryRules()).filter((r) => r.active && r.acquisition !== "REMOTE_DEFAULT").map((r) => r.key);
  const inField: Prisma.CrmProspectWhereInput = { status: "ACTIVE", mergedIntoId: null, doNotContact: false, territoryKey: { in: keys } };
  const [candTotal, candPoint, candField, candByImport, needRefresh, pTotal, pByFit, pAssigned, pFieldSellers, pLocated, notApplied] = await Promise.all([
    db.crmDiscoveryCandidate.count(),
    db.crmDiscoveryCandidate.count({ where: { sourceLatitude: { not: null } } }),
    db.crmDiscoveryCandidate.count({ where: { territoryKey: { in: keys } } }),
    db.crmDiscoveryCandidate.groupBy({ by: ["importState"], _count: { _all: true } }),
    db.crmDiscoveryCandidate.count({ where: { importedProspectId: { not: null }, sourceLatitude: null } }),
    db.crmProspect.count({ where: inField }),
    db.crmProspect.groupBy({ by: ["repairFit"], where: inField, _count: { _all: true } }),
    db.crmProspect.count({ where: { ...inField, assignedStaffId: { not: null } } }),
    db.crmProspect.count({ where: { ...inField, assignedStaff: { salesMode: "FIELD" } } }),
    db.crmProspect.count({ where: { ...inField, location: { is: { status: { in: ["GEOCODED", "VERIFIED"] }, latitude: { not: null } } } } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId" LEFT JOIN "garageos"."CrmProspectLocation" l ON l."prospectId" = p."id" WHERE c."sourceLatitude" IS NOT NULL AND l."id" IS NULL AND p."status" = 'ACTIVE'`,
  ]);
  const unassigned = pTotal - pAssigned;
  return {
    fieldTerritoryKeys: keys,
    candidates: { total: candTotal, withSourcePoint: candPoint, inFieldTerritory: candField, byImportState: Object.fromEntries(candByImport.map((r) => [r.importState, r._count._all])) },
    importedNeedingRefresh: needRefresh,
    prospects: { total: pTotal, byFit: Object.fromEntries(pByFit.map((r) => [r.repairFit ?? "NOT_EVALUATED", r._count._all])), assigned: pAssigned, unassigned, assignedToFieldSellers: pFieldSellers },
    located: { withPosition: pLocated, withoutPosition: pTotal - pLocated, sourcePointNotApplied: Number(notApplied[0]?.n ?? 0) },
  };
}
