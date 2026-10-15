import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { canAccessAssignedStaff } from "@/domain/sales-crm/access";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { fingerprintOf, planImport, recordKeyOf, snapshotOf, type ExistingSource, type ImportCandidate } from "@/domain/sales-crm/import";
import { normalizeBusinessName, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { computeFitScore, computeIntentScore } from "@/domain/sales-crm/scoring";
import { classifyTerritory, evaluateAcquisition, NO_ENGAGEMENT, type TerritoryRule } from "@/domain/sales-crm/territory";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { dbNow, fieldPriorityColumns, prospectColumns, addressColumns, applyDoNotContact, stampFieldPriorityOnEntry, territoryColumns, type Tx } from "@/lib/sales-crm/prospects";
import { scoreBreakdownJson } from "@/lib/sales-crm/scoring";
import { staffAcquirerFacts } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

/**
 * Source data may ENRICH an existing prospect but never overwrites it: only fields that are currently empty are filled
 * (the address block is filled as a unit, and only when the prospect has no address at all). Fields where the source
 * disagrees are reported by NAME (never by value) so a human can look. Ownership, DNC, activities and opportunities
 * are untouched. Enrichment is skipped when the actor cannot access the prospect (the observation is still linked).
 */
export async function enrichFromCandidate(tx: Tx, actor: PlatformSalesActor, prospectId: string, c: ImportCandidate, rules: TerritoryRule[]): Promise<{ conflicts: string[]; enriched: string[] }> {
  const p = await tx.crmProspect.findUnique({ where: { id: prospectId } });
  if (!p) return { conflicts: [], enriched: [] };
  const conflicts: string[] = [], enriched: string[] = [];
  const data: Prisma.CrmProspectUpdateInput = {};
  let addressFilled = false;
  const src = c.prospect;
  const canWrite = canAccessAssignedStaff(actor, p.assignedStaffId);

  const cmp = (field: string, mine: string | null | undefined, theirs: string | null | undefined, same: boolean) => {
    if (!theirs) return;
    if (!mine) return;
    if (!same) conflicts.push(field);
  };
  cmp("name", p.name, src.name, normalizeBusinessName(p.name) === c.keys.nameNormalized);
  cmp("website", p.website, src.website, websiteDomain(p.website) === c.keys.websiteDomain);
  cmp("phone", p.phone, src.phone, phoneDigits(p.phone) === c.keys.phoneDigits);
  cmp("email", p.email, src.email, normalizeEmail(p.email) === c.keys.email);
  const mineAddr = canonicalAddress(p);
  const hasAddress = !!(p.address || p.city || p.province || p.postalCode);
  if (hasAddress && (src.address || src.city || src.postalCode)) {
    if ((mineAddr.addressKey && c.keys.addressKey && mineAddr.addressKey !== c.keys.addressKey) || (mineAddr.postalKey && c.keys.postalKey && mineAddr.postalKey !== c.keys.postalKey) || (mineAddr.cityKey && c.keys.cityKey && mineAddr.cityKey !== c.keys.cityKey)) conflicts.push("address");
  }

  if (canWrite) {
    if (!p.website && src.website) { data.website = src.website; data.websiteDomain = websiteDomain(src.website); enriched.push("website"); }
    if (!p.phone && src.phone) { data.phone = src.phone; data.phoneDigits = phoneDigits(src.phone); enriched.push("phone"); }
    if (!p.email && src.email) { data.email = normalizeEmail(src.email); enriched.push("email"); }
    if (!hasAddress && (src.address || src.city || src.province || src.postalCode)) {
      Object.assign(data, { address: src.address, city: src.city, province: src.province, postalCode: src.postalCode, ...addressColumns(src), ...territoryColumns(rules, src) });
      enriched.push("address");
      addressFilled = true;
    }
    if (!p.industry && src.industry) { data.industry = src.industry; enriched.push("industry"); }
    if (!p.shopSize && src.shopSize) { data.shopSize = src.shopSize; enriched.push("shopSize"); }
    if (p.preferredLanguage === "UNKNOWN" && src.preferredLanguage !== "UNKNOWN") { data.preferredLanguage = src.preferredLanguage; enriched.push("preferredLanguage"); }
    if (enriched.length) {
      await tx.crmProspect.update({ where: { id: prospectId }, data });
      // A newly completed address may place the prospect in a FIELD_PRIORITY territory for the first time → start its own window once.
      if (addressFilled) await stampFieldPriorityOnEntry(tx, prospectId, rules, src, p);
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_ENRICHED", entityType: "CrmProspect", entityId: prospectId, prospectId, metadata: { fields: enriched, conflicts } }, tx);
    }
  }
  // An opt-out in the source is protective: it is propagated regardless of who may edit the prospect, and never reversed.
  if (c.doNotContact && !p.doNotContact) await applyDoNotContact(tx, actor, prospectId, "Source opt-out");
  return { conflicts, enriched };
}

export function observationData(args: {
  sourceKey: string; recordKey: string; fingerprint: string; observedAt: Date; batchId: string | null; sourceUrl: string | null; lawfulSourceNote: string | null;
  c: ImportCandidate; outcome: Prisma.CrmSourceObservationUncheckedCreateInput["matchOutcome"]; prospectId: string | null; reasons?: string[]; conflicts?: string[];
}): Prisma.CrmSourceObservationUncheckedCreateInput {
  return {
    sourceKey: args.sourceKey, recordKey: args.recordKey, externalId: args.c.externalId, contentFingerprint: args.fingerprint, observedAt: args.observedAt,
    importBatchId: args.batchId, rowNumber: args.c.rowNumber, sourceUrl: args.c.sourceUrl ?? args.sourceUrl, lawfulSourceNote: args.lawfulSourceNote,
    snapshot: snapshotOf(args.c) as Prisma.InputJsonValue, conflicts: args.conflicts ?? [], matchOutcome: args.outcome, matchReasons: args.reasons ?? [], prospectId: args.prospectId,
  };
}


/** Everything the plan needs from the database: prior observations of these records and the matching pool. */
export async function loadPlanInputs(candidates: ImportCandidate[], fileHash: string, sourceKey: string, client: Prisma.TransactionClient | typeof db = db) {
  const recordKeys = new Map<number, string>(), fingerprints = new Map<number, string>();
  for (const c of candidates) { recordKeys.set(c.rowNumber, recordKeyOf(c, fileHash)); fingerprints.set(c.rowNumber, fingerprintOf(c)); }
  const prior = await client.crmSourceObservation.findMany({
    where: { sourceKey, recordKey: { in: [...new Set(recordKeys.values())] } }, select: { recordKey: true, contentFingerprint: true, prospectId: true },
  });
  const sources = new Map<string, ExistingSource[]>();
  for (const o of prior) sources.set(o.recordKey, [...(sources.get(o.recordKey) ?? []), { fingerprint: o.contentFingerprint, prospectId: o.prospectId }]);
  const pool = await loadMatchPool(candidates.map((c) => c.keys), client);
  return { recordKeys, fingerprints, sources, pool };
}

const CHUNK = 400;

export type ImportRowResult =
  | { kind: "CREATED" | "REVIEW" | "ALREADY_IMPORTED"; prospectId: string | null }
  | { kind: "LINKED"; prospectId: string; conflicts?: string[] }
  | { kind: "SKIPPED_TERRITORY" | "DUPLICATE_SOURCE_ID"; prospectId: null };
export interface ImportBatchInput { id: string; fileHash: string; sourceKey: string; sourceUrl: string | null; lawfulSourceNote: string | null; observedAt: Date | null; summary: unknown }

/**
 * The transactional core of "confirm an import batch", shared by the CSV wizard and National Lead Radar so there is ONE import path:
 * re-plans against the live database, creates prospects (+ opportunity, stage event, activity, contact), records source observations,
 * enriches (never overwrites) matched prospects, holds ambiguous matches for the duplicate-review queue, and completes the batch row.
 * Creates no sending basis, no enrollment and no message. Must run inside `tx`. `rows` reports what happened to each source row.
 */
export async function applyImportBatch(tx: Tx, actor: PlatformSalesActor, batch: ImportBatchInput, candidates: ImportCandidate[], assignedStaffId: string | null) {
  const observedAt = batch.observedAt ?? new Date();
  const now = new Date();
  // The world may have changed since the preview: re-plan against the live database inside the transaction.
  const inputs = await loadPlanInputs(candidates, batch.fileHash, batch.sourceKey, tx);
  const plans = planImport(candidates, inputs.recordKeys, inputs.fingerprints, inputs.pool, inputs.sources);
  const byRow = new Map(candidates.map((c) => [c.rowNumber, c]));
  const rules = await loadTerritoryRulesWith(tx);
  const clock = await dbNow(tx); // database clock: start of each NEW prospect's own FIELD priority window (when it lands in a FIELD_PRIORITY territory)
  const canPool = actor.all || actor.kind === "SALES_MANAGER";
  const ownerFacts = assignedStaffId ? await staffAcquirerFacts(assignedStaffId) : null;
  const definitions = await tx.crmNeedDefinition.findMany({ where: { active: true }, select: { weight: true } });
  const weights = definitions.map((d) => d.weight);

  // 1) CREATE rows → prospects. A row whose territory the chosen owner may not acquire is imported UNASSIGNED when the
  //    actor may hold a pool (manager / Super Admin), otherwise it is skipped. Nothing is silently handed to the wrong mode.
  const created = new Map<number, string>();
  const rows = new Map<number, ImportRowResult>();
  let territorySkipped = 0;
  const creates: ImportCandidate[] = [];
  const ownerFor = new Map<number, string | null>();
  for (const pl of plans) {
    if (pl.action !== "CREATE") continue;
    const c = byRow.get(pl.row)!;
    if (!assignedStaffId || !ownerFacts) { ownerFor.set(c.rowNumber, assignedStaffId); creates.push(c); continue; }
    const cls = classifyTerritory(rules, c.prospect);
    const ok = (cls.state !== "UNRESOLVED" || ownerFacts.mode === "FIELD") && evaluateAcquisition({ ...ownerFacts, isSuperAdmin: false }, cls.rule, NO_ENGAGEMENT, now).allowed;
    if (ok) { ownerFor.set(c.rowNumber, assignedStaffId); creates.push(c); }
    else if (canPool) { ownerFor.set(c.rowNumber, null); creates.push(c); }
    else territorySkipped++;
  }
  const skippedRows = new Set(plans.filter((p) => p.action === "CREATE" && !creates.some((c) => c.rowNumber === p.row)).map((p) => p.row));
  for (let i = 0; i < creates.length; i += CHUNK) {
    const chunk = creates.slice(i, i + CHUNK);
    const prospects: Prisma.CrmProspectCreateManyInput[] = [], opps: Prisma.CrmOpportunityCreateManyInput[] = [];
    const events: Prisma.CrmStageEventCreateManyInput[] = [], contacts: Prisma.CrmContactCreateManyInput[] = [], acts: Prisma.CrmActivityCreateManyInput[] = [];
    for (const c of chunk) {
      const prospectId = randomUUID(), oppId = randomUUID();
      created.set(c.rowNumber, prospectId);
      const stage = c.doNotContact ? "DO_NOT_CONTACT" : "NEW";
      const p = c.prospect;
      const fit = computeFitScore({
        shopSize: p.shopSize, industry: p.industry, currentSoftware: p.currentSoftware, preferredLanguage: p.preferredLanguage,
        activeContactCount: c.contact ? 1 : 0, hasDecisionMaker: !!c.contact?.isDecisionMaker, activeNeedWeights: weights, needs: [],
      });
      const intent = computeIntentScore({ stage, urgency: null, meaningfulTouches30d: 0, linkedDemoCount: 0, daysSinceLastActivity: 0 });
      prospects.push({
        id: prospectId, ...prospectColumns({ ...p, tags: p.tags, notes: p.notes }), ...territoryColumns(rules, p, now), ...fieldPriorityColumns(rules, p, clock), assignedStaffId: ownerFor.get(c.rowNumber) ?? null,
        createdByUserId: actor.userId, importBatchId: batch.id, doNotContact: c.doNotContact, doNotContactAt: c.doNotContact ? now : null, lastActivityAt: now,
      });
      opps.push({
        id: oppId, prospectId, assignedStaffId: ownerFor.get(c.rowNumber) ?? null, stage, stageChangedAt: now, createdByUserId: actor.userId,
        closedAt: c.doNotContact ? now : null, fitScore: fit.score, fitBreakdown: scoreBreakdownJson(fit), intentScore: intent.score,
        intentBreakdown: scoreBreakdownJson(intent), scoreComputedAt: now,
      });
      events.push({ opportunityId: oppId, toStage: stage, actorUserId: actor.userId });
      acts.push({ prospectId, opportunityId: oppId, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "PROSPECT_CREATED", source: "IMPORT", sourceKey: batch.sourceKey } });
      if (c.contact) {
        // An imported address never establishes consent: no sending basis is created here, ever.
        contacts.push({
          prospectId, name: c.contact.name, title: c.contact.title, email: c.contact.email, emailNormalized: normalizeEmail(c.contact.email), phone: c.contact.phone,
          isPrimary: true, isDecisionMaker: c.contact.isDecisionMaker, preferredLanguage: c.contact.preferredLanguage, doNotContact: c.doNotContact,
        });
      }
    }
    await tx.crmProspect.createMany({ data: prospects });
    await tx.crmOpportunity.createMany({ data: opps });
    await tx.crmStageEvent.createMany({ data: events });
    if (contacts.length) await tx.crmContact.createMany({ data: contacts });
    await tx.crmActivity.createMany({ data: acts });
  }

  // 2) Observations for every row that carries information; links enrich (never overwrite) and propagate opt-outs.
  const tally = { created: created.size, linked: 0, review: 0, alreadyImported: 0, skippedSourceId: 0 };
  const obs: Prisma.CrmSourceObservationUncheckedCreateInput[] = [];
  const resolve = (t: string) => (t.startsWith("row:") ? created.get(Number(t.slice(4))) ?? null : t);
  for (const pl of plans) {
    const c = byRow.get(pl.row)!;
    const base = { sourceKey: batch.sourceKey, recordKey: inputs.recordKeys.get(pl.row)!, fingerprint: inputs.fingerprints.get(pl.row)!, observedAt, batchId: batch.id, sourceUrl: batch.sourceUrl, lawfulSourceNote: batch.lawfulSourceNote, c };
    if (pl.action === "ALREADY_IMPORTED") { tally.alreadyImported++; rows.set(pl.row, { kind: "ALREADY_IMPORTED", prospectId: inputs.sources.get(inputs.recordKeys.get(pl.row)!)?.find((x) => x.prospectId)?.prospectId ?? null }); continue; }
    if (pl.action === "DUPLICATE_SOURCE_ID") { tally.skippedSourceId++; rows.set(pl.row, { kind: "DUPLICATE_SOURCE_ID", prospectId: null }); continue; }
    if (skippedRows.has(pl.row)) { rows.set(pl.row, { kind: "SKIPPED_TERRITORY", prospectId: null }); continue; } // territory-skipped: no prospect, no observation (nothing to attach it to)
    if (pl.action === "CREATE") { obs.push(observationData({ ...base, outcome: "CREATED", prospectId: created.get(pl.row)! })); rows.set(pl.row, { kind: "CREATED", prospectId: created.get(pl.row)! }); continue; }
    if (pl.action === "LINK_IN_FILE") {
      const target = created.get(pl.targetRow);
      if (target) { obs.push(observationData({ ...base, outcome: "LINKED_IN_FILE", prospectId: target, reasons: pl.reasons })); tally.linked++; rows.set(pl.row, { kind: "LINKED", prospectId: target }); }
      continue;
    }
    if (pl.action === "LINK_EXACT" || pl.action === "LINK_STRONG") {
      const { conflicts } = await enrichFromCandidate(tx, actor, pl.target, c, rules);
      obs.push(observationData({ ...base, outcome: pl.action === "LINK_EXACT" ? "LINKED_EXACT" : "LINKED_STRONG", prospectId: pl.target, reasons: pl.action === "LINK_STRONG" ? pl.reasons : ["SOURCE_ID"], conflicts }));
      tally.linked++;
      rows.set(pl.row, { kind: "LINKED", prospectId: pl.target, conflicts });
      continue;
    }
    // REVIEW: nothing is created or merged until a human decides.
    const target = resolve(pl.target);
    if (!target) continue;
    const o = await tx.crmSourceObservation.create({ data: observationData({ ...base, outcome: "REVIEW_PENDING", prospectId: null, reasons: pl.reasons }), select: { id: true } });
    await tx.crmDuplicateReview.create({ data: { observationId: o.id, prospectId: target, reasons: pl.reasons, pendingCandidate: c as unknown as Prisma.InputJsonValue, createdByUserId: actor.userId } });
    tally.review++;
    rows.set(pl.row, { kind: "REVIEW", prospectId: target });
  }
  if (obs.length) await tx.crmSourceObservation.createMany({ data: obs, skipDuplicates: true });

  const skipped = tally.alreadyImported + tally.skippedSourceId + territorySkipped + tally.linked;
  await tx.crmImportBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED", completedAt: now, createdCount: created.size, skippedCount: skipped, rows: Prisma.DbNull,
      summary: { ...(batch.summary as Record<string, unknown>), result: { ...tally, territorySkipped } } as Prisma.InputJsonValue,
    },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_COMPLETED", entityType: "CrmImportBatch", entityId: batch.id, metadata: { ...tally, territorySkipped, assignedStaffId, sourceKey: batch.sourceKey } }, tx);
  return { created: created.size, skipped, linked: tally.linked, review: tally.review, alreadyImported: tally.alreadyImported, rows };
}
