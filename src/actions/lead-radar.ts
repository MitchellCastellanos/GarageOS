"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { estimateWorkload, canonicalScope, findRunOverlaps, NATIONWIDE_MB_THRESHOLD } from "@/domain/lead-radar/scope";
import { db } from "@/lib/db";
import { toMicro } from "@/domain/lead-radar/budget";
import { PLATFORM } from "@/lib/routes";
import { isProvinceCode } from "@/domain/lead-radar/geo";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { requireLeadRadar } from "@/lib/lead-radar/access";
import { releaseBudget } from "@/lib/lead-radar/budget";
import { importApprovedCandidates } from "@/lib/lead-radar/import-service";
import { reviewCandidates, type ReviewDecision } from "@/lib/lead-radar/candidates";
import { acknowledgeRunQuality, attachManifest, cancelRun, completeRun, createRun, ingestChunk, planFileFor, resumeRun } from "@/lib/lead-radar/runs";
import { saveSettings } from "@/lib/lead-radar/settings";
import { setProvinceSchedule } from "@/lib/lead-radar/province-state";
import { queueWorkerRun } from "@/lib/lead-radar/worker";
import { rematchCandidates } from "@/lib/lead-radar/rematch";
import { releaseIcpExclusion } from "@/lib/lead-radar/exclusions";
import { reviewDiscoveredContact } from "@/lib/sales-comms/contact-readiness";

// Every action re-resolves the actor from the session and re-checks the capability on the server. The UI hides controls, but never decides.
const touch = () => { revalidatePath(PLATFORM.salesLeadRadar); revalidatePath(PLATFORM.salesLeadRadarCandidates); };

export async function saveLeadRadarSettings(input: { enabled: boolean; monthlyBudgetCad: number; usdToCadRate: number; managersCanReview: boolean }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    const budget = typeof input.monthlyBudgetCad === "number" ? input.monthlyBudgetCad : NaN, fx = typeof input.usdToCadRate === "number" ? input.usdToCadRate : NaN;
    if (!Number.isFinite(budget) || !Number.isFinite(fx)) throw new CrmError("INVALID");
    let micro: number;
    try { micro = toMicro(budget); } catch { throw new CrmError("INVALID_BUDGET"); }
    const s = await saveSettings(actor, { enabled: input.enabled === true, monthlyBudgetMicroCad: micro, usdToCadMilli: Math.round(fx * 1000), managersCanReview: input.managersCanReview === true });
    touch();
    return { settings: s };
  });
}

export async function previewDiscoveryWorkload(scope: unknown) {
  await requireLeadRadar("admin");
  return crmAction(async () => {
    let s;
    try { s = canonicalScope(scope); } catch { throw new CrmError("INVALID_SCOPE"); }
    const w = estimateWorkload(s);
    const prior = await db.crmDiscoveryRun.findMany({ orderBy: { createdAt: "desc" }, take: 40, select: { id: true, status: true, sourceRelease: true, scope: true } });
    const overlaps = findRunOverlaps(s, "latest", prior.map((r) => ({ id: r.id, status: r.status, release: r.sourceRelease, scope: r.scope as { provinces: string[]; groups: string[]; cities: string[] } })));
    return { work: { ...w, requiresAcknowledgement: w.nationwide || w.megabytes > NATIONWIDE_MB_THRESHOLD }, overlaps, cost: { paidRequests: 0, note: "OPEN_DATA_NO_PER_RECORD_FEE" } };
  });
}

export async function createDiscoveryRun(input: { scope: unknown; release: string; acknowledgeLargeScope?: boolean }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await createRun(actor, input); touch(); return r; });
}
export async function getDiscoveryPlan(runId: string) {
  await requireLeadRadar("admin");
  return crmAction(async () => ({ plan: await planFileFor(String(runId)) }));
}
export async function attachDiscoveryManifest(runId: string, manifestJson: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    let raw: unknown;
    if (typeof manifestJson !== "string" || manifestJson.length > 20_000) throw new CrmError("MANIFEST_INVALID");
    try { raw = JSON.parse(manifestJson); } catch { throw new CrmError("MANIFEST_INVALID"); }
    const r = await attachManifest(actor, String(runId), raw); touch(); return r;
  });
}
export async function ingestDiscoveryChunk(runId: string, seq: number, ndjson: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { if (typeof ndjson !== "string") throw new CrmError("INVALID"); return ingestChunk(actor, String(runId), Number(seq), ndjson); });
}
export async function completeDiscoveryRun(runId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await completeRun(actor, String(runId)); touch(); return r; });
}
export async function acknowledgeDiscoveryRunQuality(runId: string, note: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await acknowledgeRunQuality(actor, String(runId), String(note ?? "")); touch(); return r; });
}
export async function cancelDiscoveryRun(runId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await cancelRun(actor, String(runId)); touch(); return r; });
}
export async function resumeDiscoveryRun(runId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await resumeRun(actor, String(runId)); touch(); return r; });
}

const reviewSchema = z.object({ ids: z.array(z.string().max(40)).min(1).max(200), decision: z.enum(["APPROVED", "REJECTED", "PENDING"]), note: z.string().max(300).nullish(), fitOverride: z.boolean().optional() });
export async function reviewDiscoveryCandidates(input: { ids: string[]; decision: ReviewDecision; note?: string | null; fitOverride?: boolean }) {
  const actor = await requireLeadRadar("review");
  return crmAction(async () => {
    const p = reviewSchema.parse(input);
    const r = await reviewCandidates(actor, p.ids, p.decision, p.note, { fitOverride: p.fitOverride });
    touch();
    return { result: r };
  });
}

const importSchema = z.object({ ids: z.array(z.string().max(40)).min(1).max(400).optional(), province: z.string().length(2).optional() });
export async function importApprovedDiscoveryCandidates(input: { ids?: string[]; province?: string } = {}) {
  const actor = await requireLeadRadar("review");
  return crmAction(async () => {
    const p = importSchema.parse(input ?? {});
    // With a province, only approved candidates of THAT province are taken (the button on a province-filtered list must never import another province's approvals).
    let ids = p.ids;
    if (p.province) {
      if (!isProvinceCode(p.province)) throw new CrmError("INVALID");
      const scoped = (await db.crmDiscoveryCandidate.findMany({ where: { province: p.province, reviewState: "APPROVED", importState: { in: ["NOT_IMPORTED", "FAILED"] }, duplicateOfCandidateId: null, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 400 })).map((x) => x.id);
      if (!scoped.length) return { result: { batchId: null, claimed: 0, created: 0, linked: 0, sentToReview: 0, skipped: 0, failed: 0, createdProspectIds: [], linkedProspectIds: [], reviewProspectIds: [], unassignedCreated: 0 } };
      ids = scoped;
    }
    const r = await importApprovedCandidates(actor, { ids });
    touch(); revalidatePath(PLATFORM.salesProspects);
    return { result: r };
  });
}

/** A reservation whose paid call never happened (crash before sending) can be released by a Super Admin. Audited. */
export async function releaseDiscoveryReservation(ledgerId: string) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    const ok = await releaseBudget(String(ledgerId));
    if (!ok) throw new CrmError("NOT_FOUND");
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_BUDGET_RELEASED", entityType: "CrmDiscoveryBudgetLedger", entityId: String(ledgerId) });
    touch();
    return {};
  });
}


/** Owner starts a province (or any scope) on the automated worker. Same size acknowledgement as a manual run; nothing executes until the scheduled worker claims it. */
export async function queueDiscoveryRunForWorker(input: { scope: unknown; release: string; acknowledgeLargeScope?: boolean }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await queueWorkerRun(actor, input); touch(); return r; });
}
const scheduleSchema = z.object({ province: z.string().max(4), autoRefresh: z.boolean(), paused: z.boolean(), refreshIntervalDays: z.number().int() });
/** Per-province opt-in schedule / pause. Default for every province is OFF. */
export async function saveProvinceSchedule(input: { province: string; autoRefresh: boolean; paused: boolean; refreshIntervalDays: number }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    const p = scheduleSchema.parse(input);
    await setProvinceSchedule(actor, p.province, { autoRefresh: p.autoRefresh, paused: p.paused, refreshIntervalDays: p.refreshIntervalDays });
    touch();
    return {};
  });
}

/** Super Admin decision on a discovered business email. Accepting creates a plain CRM contact only: no consent, no sending basis, no enrollment, no message. */
export async function decideDiscoveredContact(input: { id: string; decision: "ACCEPT" | "REJECT"; note?: string | null }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await reviewDiscoveredContact(actor, String(input?.id ?? ""), input?.decision, input?.note ?? null); touch(); return r; });
}

/** Super Admin: release ONE candidate from the independent-repair ICP exclusion (mandatory note). Keeps the tombstone history; re-evaluated by the active policy. */
export async function releaseDiscoveryExclusion(input: { candidateId: string; note: string }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await releaseIcpExclusion(actor, String(input?.candidateId ?? "").slice(0, 40), String(input?.note ?? "")); touch(); return { result: r }; });
}

/** "Preview all": ONE bounded (500-candidate), strictly read-only batch of the re-check with per-candidate detail. The browser calls it repeatedly with the returned cursor; nothing is written or audited. */
export async function previewProvinceCandidatesBatch(input: { province: string; cursor?: string | null }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => ({ result: await rematchCandidates(actor, { province: String(input?.province ?? ""), apply: false, cursor: input?.cursor ?? null, maxPages: 1, detail: true }) }));
}

/** Re-check the CRM match of staged, not-yet-imported candidates of ONE province with the current matching rules. Preview writes nothing; apply writes derived match columns only. */
export async function rematchProvinceCandidates(input: { province: string; apply: boolean; cursor?: string | null }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => { const r = await rematchCandidates(actor, { province: String(input?.province ?? ""), apply: input?.apply === true, cursor: input?.cursor ?? null }); touch(); return { result: r }; });
}
