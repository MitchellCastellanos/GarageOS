import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { parseProspectCsv } from "@/domain/sales-crm/import";
import { candidatesToImportCsv, IMPORT_HEADERS, LAWFUL_SOURCE_NOTE, lawfulSourceNoteForPolicy, LEAD_RADAR_SOURCE_KEY, MAX_IMPORT_APPROVALS } from "@/domain/lead-radar/bridge";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { applyImportBatch, type ImportRowResult } from "@/lib/sales-crm/lead-engine";
import { locateFromSource } from "@/lib/sales-crm/source-location-service";
import { isIcpExclusion } from "@/domain/lead-radar/icp";
import { exclusionIdentityKey } from "@/domain/lead-radar/icp-tombstone";
import { recordExclusions } from "@/lib/lead-radar/exclusions";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { stampFitAtImport } from "@/lib/sales-crm/repair-fit-service";
import { CrmError, resolveAssignee } from "@/lib/sales-crm/prospects";
import { screenCandidate } from "@/domain/lead-radar/commercial-screen";
import { classifyTerritory } from "@/domain/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { activeSuppressions } from "@/lib/sales-comms/suppression";

/**
 * Imports APPROVED candidates through the one existing import path (`applyImportBatch`): same validation, same dedupe, same territory resolution,
 * same observations. Always UNASSIGNED (assignment stays the manual preview → confirm flow). Never creates a sending basis, enrollment or message.
 * Concurrency: candidate rows are locked with FOR UPDATE SKIP LOCKED inside the transaction, so two simultaneous imports can never take the same candidate.
 */
export const FIT_OVERRIDE_PREFIX = "FIT_OVERRIDE:";

export interface ImportOptions {
  ids?: readonly string[];
  limit?: number;
  /** Set by the automatic orchestrator: only candidates approved by THIS policy version (or by a human) are claimed, FAILED rows are never retried here,
   *  and the batch/audit trail records the policy. Manual imports leave it undefined and behave exactly as before. */
  automation?: { policyVersion: number; timeoutMs?: number };
}

export async function importApprovedCandidates(actor: PlatformSalesActor, opts: ImportOptions = {}) {
  await resolveAssignee(actor, null); // the actor must be allowed to hold the unassigned pool (manager / Super Admin)
  const limit = Math.min(Math.max(1, opts.limit ?? MAX_IMPORT_APPROVALS), MAX_IMPORT_APPROVALS);
  const ids = opts.ids ? [...new Set(opts.ids)].slice(0, MAX_IMPORT_APPROVALS) : null;
  if (ids && !ids.length) throw new CrmError("BATCH_SIZE");
  const auto = opts.automation ?? null;
  const states = auto ? Prisma.sql`('NOT_IMPORTED')` : Prisma.sql`('NOT_IMPORTED','FAILED')`;
  const policyGuard = auto ? Prisma.sql`AND ("approvedByPolicyVersion" IS NULL OR "approvedByPolicyVersion" = ${auto.policyVersion})` : Prisma.empty;
  const idGuard = ids ? Prisma.sql`AND "id" IN (${Prisma.join(ids)})` : Prisma.empty;

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "garageos"."CrmDiscoveryCandidate" WHERE "reviewState" = 'APPROVED' AND "importState" IN ${states} AND "licenseOk" = true AND "tier" <> 'EXCLUDED' AND "duplicateOfCandidateId" IS NULL ${idGuard} ${policyGuard} ORDER BY "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    if (!locked.length) return { batchId: null as string | null, claimed: 0, created: 0, linked: 0, sentToReview: 0, skipped: 0, failed: 0, createdProspectIds: [] as string[], linkedProspectIds: [] as string[], reviewProspectIds: [] as string[], unassignedCreated: 0 };

    const claimed = await tx.crmDiscoveryCandidate.findMany({ where: { id: { in: locked.map((l) => l.id) } }, orderBy: { id: "asc" } });
    // Fit gate: a candidate that is clearly not a repair business (EV charging, car wash, recycling, bicycle, manufacturer…) is never imported, even if someone approved it.
    // The rejection is durable (a human/system rejection is never reopened by a refresh). A person who really wants it approves it WITH a fit override, which is stamped as a human decision.
    const overrideOf = (c: { reviewState: string; approvedByPolicyVersion: number | null; reviewNote: string | null }) => c.reviewState === "APPROVED" && c.approvedByPolicyVersion === null && !!c.reviewNote?.startsWith(FIT_OVERRIDE_PREFIX);
    // The discovery ICP (independent repair businesses only) is NOT overridable: a confirmed chain/franchise/dealership never reaches the CRM, even with a fit override.
    const fitOf = new Map(claimed.map((c) => [c.id, assessRepairFit({ name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, website: c.website, city: c.city, icpOverride: c.icpOverride, storedReasons: c.repairFitReasons })]));
    const fitBlocked = claimed.filter((c) => { const a = fitOf.get(c.id)!; return a.fit === "EXCLUDED" && (isIcpExclusion(a.reasons) || !overrideOf(c)); });
    // The exclusion is remembered (tombstone) even when it is discovered at the import door: a later release or a re-keyed record is excluded at staging, not re-reviewed.
    await recordExclusions(tx, fitBlocked.filter((c) => isIcpExclusion(fitOf.get(c.id)!.reasons)).map((c) => ({ sourceRecordId: c.sourceRecordId, province: c.province, name: c.name, city: c.city, identityKey: exclusionIdentityKey(c), reasons: fitOf.get(c.id)!.reasons, release: c.lastSeenRelease })));
    if (fitBlocked.length) {
      await tx.crmDiscoveryCandidate.updateMany({ where: { id: { in: fitBlocked.map((c) => c.id) }, importState: { in: ["NOT_IMPORTED", "FAILED"] } }, data: { reviewState: "REJECTED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: "FIT_EXCLUDED_AT_IMPORT", approvedByPolicyVersion: null } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_CANDIDATES_REVIEWED", entityType: "CrmDiscoveryCandidate", metadata: { decision: "REJECTED", via: "fit-gate-at-import", count: fitBlocked.length, ids: fitBlocked.slice(0, 200).map((c) => c.id) } }, tx);
    }
    const blockedIds = new Set(fitBlocked.map((c) => c.id));
    const afterFit = claimed.filter((c) => !blockedIds.has(c.id));
    // The SAME early commercial screen as staging, enforced here for every import path (manual, automatic, by id): REMOTE needs a usable email, FIELD a visitable address,
    // an unresolved territory never enters, and only a verified repair shop (or an explicit recorded human fit decision) passes. A rejected row is skipped, never imported.
    const rules = await loadTerritoryRulesWith(tx);
    const supp = await activeSuppressions(afterFit.map((c) => c.email).filter((e): e is string => !!e), tx);
    const screenBlocked: { id: string; code: string }[] = [];
    const cands = afterFit.filter((c) => {
      const fit = fitOf.get(c.id)!;
      const sc = screenCandidate({
        licenseOk: c.licenseOk, tier: c.tier,
        // An EXCLUDED fit that got past the fit gate above carries an explicit, recorded human override (the gate already refused every confirmed ICP exclusion and every un-overridden one).
        fit: fit.fit === "EXCLUDED" ? "HUMAN_REVIEW" : fit.fit, humanFitDecision: c.icpOverride || overrideOf(c), territory: classifyTerritory(rules, { province: c.province, city: c.city, postalCode: c.postalCode }).state,
        address: c.address, city: c.city, postalCode: c.postalCode, phone: c.phone, email: c.email && !supp.has(c.email.trim().toLowerCase()) ? c.email : null,
      });
      if (!sc.lane) screenBlocked.push({ id: c.id, code: `SCREEN_${sc.reasons[0]}` });
      return !!sc.lane;
    });
    for (const b of screenBlocked) await tx.crmDiscoveryCandidate.update({ where: { id: b.id }, data: { importState: "SKIPPED", importErrorCode: b.code, importAttempts: { increment: 1 }, importLastAttemptAt: new Date() } });
    if (screenBlocked.length) await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_CANDIDATES_REVIEWED", entityType: "CrmDiscoveryCandidate", metadata: { decision: "SKIPPED", via: "commercial-screen-at-import", count: screenBlocked.length, codes: screenBlocked.reduce<Record<string, number>>((m, b) => ({ ...m, [b.code]: (m[b.code] ?? 0) + 1 }), {}) } }, tx);
    if (!cands.length) return { batchId: null as string | null, claimed: claimed.length, created: 0, linked: 0, sentToReview: 0, skipped: screenBlocked.length, failed: 0, fitBlocked: fitBlocked.length, screenBlocked: screenBlocked.length, createdProspectIds: [] as string[], linkedProspectIds: [] as string[], reviewProspectIds: [] as string[], unassignedCreated: 0 };
    const { csv, rowToCandidate } = candidatesToImportCsv(cands.map((c) => ({ id: c.id, sourceRecordId: c.sourceRecordId, name: c.name, website: c.website, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode, phone: c.phone, email: c.email, industry: c.industry, lastSeenRelease: c.lastSeenRelease })));
    const mapping = Object.fromEntries(IMPORT_HEADERS.map((h, i) => [String(i), h]));
    const parsed = parseProspectCsv(csv, { defaultSource: "DIRECTORY", mapping });
    if (parsed.headerError) throw new CrmError("IMPORT_FAILED");

    // Rows the existing validators rejected are recorded as FAILED (with the issue code only) and never imported.
    const failedByRow = new Map<number, string>();
    for (const i of parsed.issues) if (i.severity === "error" && !failedByRow.has(i.row)) failedByRow.set(i.row, i.code);
    let failed = 0;
    for (const [row, code] of failedByRow) {
      const id = rowToCandidate.get(row);
      if (id) { await tx.crmDiscoveryCandidate.update({ where: { id }, data: { importState: "FAILED", importErrorCode: code, importAttempts: { increment: 1 }, importLastAttemptAt: new Date() } }); failed++; }
    }

    const release = cands.map((c) => c.lastSeenRelease).sort().at(-1) ?? "";
    const rel = /^(\d{4}-\d{2}-\d{2})/.exec(release);
    const observed = rel ? new Date(`${rel[1]}T12:00:00Z`) : new Date();
    const batch = await tx.crmImportBatch.create({
      data: {
        createdByUserId: actor.userId, assignedStaffId: null, filename: `lead-radar-overture-${release || "unknown"}.csv`.slice(0, 120), fileHash: createHash("sha256").update(csv).digest("hex"),
        status: "IMPORTING", summary: { origin: "LEAD_RADAR", candidates: cands.length, ...(auto ? { automation: { policyVersion: auto.policyVersion } } : {}) } as Prisma.InputJsonValue, defaultSource: "DIRECTORY",
        sourceKey: LEAD_RADAR_SOURCE_KEY, lawfulSourceNote: auto ? lawfulSourceNoteForPolicy(auto.policyVersion) : LAWFUL_SOURCE_NOTE, observedAt: observed > new Date() ? new Date() : observed, mapping: mapping as Prisma.InputJsonValue,
      },
      select: { id: true, fileHash: true, sourceKey: true, sourceUrl: true, lawfulSourceNote: true, observedAt: true, summary: true },
    });
    const res = await applyImportBatch(tx, actor, batch, parsed.candidates, null);

    const tally = { created: 0, linked: 0, sentToReview: 0, skipped: 0 };
    const createdIds: string[] = [], linkedIds: string[] = [], reviewIds: string[] = [];
    const now = new Date();
    const importedBy: Record<string, { prospectId: string; created: boolean }> = {};
    for (const [row, r] of res.rows as Map<number, ImportRowResult>) {
      const candidateId = rowToCandidate.get(row);
      if (!candidateId) continue;
      const base = { importBatchId: batch.id, importedAt: now, importErrorCode: null, importAttempts: { increment: 1 }, importLastAttemptAt: now };
      if ((r.kind === "CREATED" || r.kind === "LINKED" || (r.kind === "ALREADY_IMPORTED" && r.prospectId)) && r.prospectId) importedBy[candidateId] = { prospectId: r.prospectId, created: r.kind === "CREATED" };
      if (r.kind === "CREATED") { tally.created++; createdIds.push(r.prospectId!); await tx.crmDiscoveryCandidate.update({ where: { id: candidateId }, data: { ...base, importState: "CREATED", importedProspectId: r.prospectId } }); }
      else if (r.kind === "LINKED" || (r.kind === "ALREADY_IMPORTED" && r.prospectId)) { tally.linked++; linkedIds.push(r.prospectId!); await tx.crmDiscoveryCandidate.update({ where: { id: candidateId }, data: { ...base, importState: "LINKED", importedProspectId: r.prospectId } }); }
      else if (r.kind === "REVIEW") { tally.sentToReview++; if (r.prospectId) reviewIds.push(r.prospectId); await tx.crmDiscoveryCandidate.update({ where: { id: candidateId }, data: { ...base, importState: "SENT_TO_REVIEW", matchProspectId: r.prospectId ?? undefined } }); }
      else { tally.skipped++; await tx.crmDiscoveryCandidate.update({ where: { id: candidateId }, data: { ...base, importState: "SKIPPED" } }); }
    }
    // Classify every prospect this import created or linked, the moment it exists (only where no fit is stored; a human decision is never touched).
    const fitItems = cands.filter((c) => c.id in importedBy).map((c) => ({
      prospectId: importedBy[c.id].prospectId, created: importedBy[c.id].created, name: c.name, industry: c.industry, website: c.website, city: c.city, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons,
      override: overrideOf(c) && c.reviewedByUserId ? { userId: c.reviewedByUserId, note: (c.reviewNote ?? "").slice(FIT_OVERRIDE_PREFIX.length).trim() || "Approved with fit override" } : null,
    }));
    const fitStamped = await stampFitAtImport(tx, fitItems, now);
    // Position from the source point already staged (free, no network). Only prospects this import created or linked, and only if the address is the
    // candidate's own; touches CrmProspectLocation only (never assignment, eligibility or the prospect row).
    const located = { located: 0, skipped: 0 };
    const withPoint = cands.filter((c) => c.sourceLatitude !== null && c.sourceLongitude !== null && (c.id in importedBy));
    if (withPoint.length) {
      const rows = await tx.crmProspect.findMany({ where: { id: { in: [...new Set(withPoint.map((c) => importedBy[c.id].prospectId))] } }, select: { id: true, address: true, city: true, province: true, postalCode: true } });
      const pById = new Map(rows.map((p) => [p.id, p]));
      for (const c of withPoint) {
        const target = importedBy[c.id], p = pById.get(target.prospectId);
        if (!p) { located.skipped++; continue; }
        const r = await locateFromSource(tx, { prospect: p, point: { lat: c.sourceLatitude, lng: c.sourceLongitude }, sourceAddress: target.created ? undefined : c }, { now });
        if (r.written) located.located++; else located.skipped++;
      }
    }
    await writeCrmAudit({ actorUserId: actor.userId, action: "LEAD_RADAR_IMPORT_COMPLETED", entityType: "CrmImportBatch", entityId: batch.id, metadata: { ...tally, failed, fitBlocked: fitBlocked.length, screenBlocked: screenBlocked.length, fitStamped, positions: located, candidates: cands.length, sourceKey: LEAD_RADAR_SOURCE_KEY, ...(auto ? { policyVersion: auto.policyVersion, automatic: true } : {}) } }, tx);
    return { batchId: batch.id as string | null, claimed: claimed.length, ...tally, skipped: tally.skipped + screenBlocked.length, failed, fitBlocked: fitBlocked.length, screenBlocked: screenBlocked.length, createdProspectIds: createdIds, linkedProspectIds: linkedIds, reviewProspectIds: reviewIds, unassignedCreated: createdIds.length };
  }, { timeout: auto?.timeoutMs ?? 120_000, maxWait: 10_000 });
}
