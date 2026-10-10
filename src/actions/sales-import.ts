"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canAccessAssignedStaff } from "@/domain/sales-crm/access";
import { MAX_IMPORT_BYTES, cleanText, neutralizeFormula, toCsv } from "@/domain/sales-crm/csv";
import {
  fingerprintOf, inspectCsv, parseProspectCsv, planImport, recordKeyOf, sanitizeMapping, type ExistingSource, type ImportCandidate, type ImportIssue, type ImportMapping, type RowPlan,
} from "@/domain/sales-crm/import";
import { computeFitScore, computeIntentScore } from "@/domain/sales-crm/scoring";
import { LEAD_SOURCES } from "@/domain/sales-crm/validation";
import { normalizeEmail } from "@/domain/sales-crm/normalize";
import { classifyTerritory, evaluateAcquisition, NO_ENGAGEMENT } from "@/domain/sales-crm/territory";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { enrichFromCandidate, observationData } from "@/lib/sales-crm/lead-engine";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { CrmError, prospectColumns, resolveAssignee, territoryColumns } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { scoreBreakdownJson } from "@/lib/sales-crm/scoring";
import { staffAcquirerFacts } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

const PREVIEW_TTL_MS = 24 * 3600_000;
const CHUNK = 400;
const MAX_STORED_ISSUES = 2500;
const SOURCE_KEY = /^[a-z0-9][a-z0-9._-]{1,59}$/;

function decode(buf: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); } // Excel "CSV" exports in Quebec are frequently cp1252
}

async function readFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new CrmError("FILE_REQUIRED");
  if (file.size > MAX_IMPORT_BYTES) throw new CrmError("FILE_TOO_LARGE");
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) throw new CrmError("FILE_TYPE");
  return { file, text: decode(await file.arrayBuffer()) };
}

/** Step 1 of the wizard: headers, suggested EN/FR column mapping and a 3-row sample. Writes nothing. */
export async function inspectProspectImport(form: FormData) {
  await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const { text } = await readFile(form);
    const r = inspectCsv(text);
    if (r.headerError && r.headerError !== "TOO_MANY_ROWS") throw new CrmError(`IMPORT_${r.headerError}`);
    if (r.headerError === "TOO_MANY_ROWS") throw new CrmError("IMPORT_TOO_MANY_ROWS");
    return { headers: r.headers, suggested: r.suggested, sample: r.sample, totalRows: r.totalRows };
  });
}

interface SourceMeta { sourceKey: string; sourceUrl: string | null; lawfulSourceNote: string; observedAt: Date }
function readSourceMeta(form: FormData): SourceMeta {
  const sourceKey = String(form.get("sourceKey") ?? "").trim().toLowerCase() || "csv-import";
  if (!SOURCE_KEY.test(sourceKey)) throw new CrmError("SOURCE_KEY_INVALID");
  const note = neutralizeFormula(cleanText(String(form.get("lawfulSourceNote") ?? ""))).slice(0, 500);
  if (note.length < 8) throw new CrmError("LAWFUL_SOURCE_REQUIRED");
  const urlRaw = String(form.get("sourceUrl") ?? "").trim();
  if (urlRaw && !/^https?:\/\/[^\s]{3,480}$/i.test(urlRaw)) throw new CrmError("SOURCE_URL_INVALID");
  const obs = String(form.get("observedAt") ?? "").trim();
  const observedAt = obs ? new Date(`${obs}T12:00:00Z`) : new Date();
  if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > Date.now() + 86_400_000) throw new CrmError("OBSERVED_AT_INVALID");
  return { sourceKey, sourceUrl: urlRaw || null, lawfulSourceNote: note, observedAt };
}

/** Everything the plan needs from the database: prior observations of these records and the matching pool. */
async function loadPlanInputs(candidates: ImportCandidate[], fileHash: string, sourceKey: string, client: Prisma.TransactionClient | typeof db = db) {
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

export type RowOutcome = "CREATE" | "LINK_EXISTING" | "LINK_IN_FILE" | "REVIEW" | "ALREADY_IMPORTED" | "DUPLICATE_SOURCE_ID";
const outcomeOf = (p: RowPlan): RowOutcome => p.action === "CREATE" ? "CREATE" : p.action === "LINK_EXACT" || p.action === "LINK_STRONG" ? "LINK_EXISTING" : p.action;

export async function previewProspectImport(form: FormData) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const { file, text } = await readFile(form);
    const requestedStaff = (form.get("assignedStaffId") as string | null) || (actor.all ? null : actor.staffId);
    const assignedStaffId = await resolveAssignee(actor, requestedStaff);
    const source = (form.get("source") as string) || "IMPORT";
    if (!(LEAD_SOURCES as readonly string[]).includes(source)) throw new CrmError("INVALID");
    const meta = readSourceMeta(form);

    const insp = inspectCsv(text);
    if (insp.headerError && insp.headerError !== "TOO_MANY_ROWS") throw new CrmError(`IMPORT_${insp.headerError}`);
    let mapping: ImportMapping = insp.suggested;
    const rawMapping = form.get("mapping");
    if (typeof rawMapping === "string" && rawMapping.trim()) {
      let parsedMapping: unknown;
      try { parsedMapping = JSON.parse(rawMapping); } catch { throw new CrmError("MAPPING_INVALID"); }
      const clean = sanitizeMapping(parsedMapping, insp.headers.length);
      if (!clean) throw new CrmError("MAPPING_INVALID");
      mapping = clean;
    }
    const fileHash = createHash("sha256").update(text).digest("hex");
    const parsed = parseProspectCsv(text, { defaultSource: source, mapping });
    if (parsed.headerError) throw new CrmError(`IMPORT_${parsed.headerError}`);

    const [inputs, rules] = await Promise.all([loadPlanInputs(parsed.candidates, fileHash, meta.sourceKey), loadTerritoryRulesWith(db)]);
    const plans = planImport(parsed.candidates, inputs.recordKeys, inputs.fingerprints, inputs.pool, inputs.sources);
    const byRow = new Map(parsed.candidates.map((c) => [c.rowNumber, c]));
    const poolById = new Map(inputs.pool.map((p) => [p.id, p]));

    const issues: ImportIssue[] = [...parsed.issues];
    const rowOutcomes: { row: number; outcome: RowOutcome; territory: string; quality: string }[] = [];
    const dupLinks: { row: number; prospectId: string }[] = [];
    const ownerFacts = assignedStaffId ? await staffAcquirerFacts(assignedStaffId) : null;
    const canPool = actor.all || actor.kind === "SALES_MANAGER";
    const territory = { byKey: {} as Record<string, number>, national: 0, unresolved: 0 };
    let ownerReady = 0, ownerPooled = 0, ownerBlocked = 0;
    const count: Record<RowOutcome, number> = { CREATE: 0, LINK_EXISTING: 0, LINK_IN_FILE: 0, REVIEW: 0, ALREADY_IMPORTED: 0, DUPLICATE_SOURCE_ID: 0 };
    let dncCreated = 0;

    for (const pl of plans) {
      const c = byRow.get(pl.row)!;
      const o = outcomeOf(pl);
      count[o]++;
      const cls = classifyTerritory(rules, c.prospect);
      rowOutcomes.push({ row: pl.row, outcome: o, territory: cls.state === "LOCAL" ? cls.rule!.key : cls.state === "NATIONAL" ? "national" : "unresolved", quality: c.addressQuality });
      const visible = (id: string) => { const m = poolById.get(id); return !!m && canAccessAssignedStaff(actor, m.assignedStaffId); };
      if (pl.action === "ALREADY_IMPORTED") issues.push({ row: pl.row, field: "*", code: "ALREADY_IMPORTED", severity: "skipped" });
      else if (pl.action === "DUPLICATE_SOURCE_ID") issues.push({ row: pl.row, field: "externalId", code: "DUPLICATE_SOURCE_ID", severity: "skipped" });
      else if (pl.action === "LINK_IN_FILE") issues.push({ row: pl.row, field: "name", code: "DUPLICATE_IN_FILE", severity: "skipped" });
      else if (pl.action === "LINK_EXACT" || pl.action === "LINK_STRONG") {
        issues.push({ row: pl.row, field: "name", code: poolById.get(pl.target)?.doNotContact ? "DUPLICATE_DO_NOT_CONTACT" : "DUPLICATE_EXISTING", severity: "skipped" });
        if (visible(pl.target)) dupLinks.push({ row: pl.row, prospectId: pl.target });
      } else if (pl.action === "REVIEW") issues.push({ row: pl.row, field: "name", code: "NEEDS_REVIEW", severity: "warning" });
      else {
        if (pl.branchOf.length) issues.push({ row: pl.row, field: "address", code: "BRANCH_OF_EXISTING", severity: "warning" });
        if (c.doNotContact) dncCreated++;
        if (cls.state === "LOCAL") territory.byKey[cls.rule!.key] = (territory.byKey[cls.rule!.key] ?? 0) + 1;
        else if (cls.state === "NATIONAL") territory.national++; else territory.unresolved++;
        if (ownerFacts) {
          const unresolvedOk = cls.state !== "UNRESOLVED" || ownerFacts.mode === "FIELD";
          const ok = unresolvedOk && evaluateAcquisition({ ...ownerFacts, isSuperAdmin: false }, cls.rule, NO_ENGAGEMENT, new Date()).allowed;
          if (ok) ownerReady++; else { if (canPool) ownerPooled++; else ownerBlocked++; issues.push({ row: pl.row, field: "territory", code: "TERRITORY_BLOCKED", severity: canPool ? "warning" : "skipped" }); }
        }
      }
    }
    issues.sort((a, b) => a.row - b.row);
    const sev = (s: string) => issues.filter((i) => i.severity === s).length;
    const previouslyImported = await db.crmImportBatch.count({ where: { fileHash, createdByUserId: actor.userId, status: "COMPLETED" } });
    const eligibleForAutoAssign = assignedStaffId ? 0 : plans.filter((p) => p.action === "CREATE" && !byRow.get(p.row)!.doNotContact && classifyTerritory(rules, byRow.get(p.row)!.prospect).state !== "UNRESOLVED").length;

    const summary = {
      totalRows: parsed.totalRows, importable: count.CREATE, errors: sev("error"), warnings: sev("warning"),
      duplicatesInFile: count.LINK_IN_FILE + count.DUPLICATE_SOURCE_ID, duplicatesExisting: count.LINK_EXISTING,
      linkedExisting: count.LINK_EXISTING, needsReview: count.REVIEW, alreadyImported: count.ALREADY_IMPORTED,
      branchWarnings: issues.filter((i) => i.code === "BRANCH_OF_EXISTING").length,
      doNotContactRows: dncCreated, ignoredColumns: parsed.ignoredColumns, previouslyImported: previouslyImported > 0,
      territory, assignment: { owner: assignedStaffId, ready: ownerReady, pooled: ownerPooled, blocked: ownerBlocked, eligibleForAutoAssign },
      addressQuality: Object.fromEntries(["COMPLETE", "PARTIAL", "INCOMPLETE", "UNKNOWN"].map((q) => [q, parsed.candidates.filter((c) => c.addressQuality === q).length])),
      existingLinks: dupLinks.slice(0, 100), rowOutcomes: rowOutcomes.slice(0, 2000),
    };
    // Housekeeping: stale previews drop their stored rows (they hold personal data).
    await db.crmImportBatch.updateMany({ where: { status: "PREVIEWED", createdAt: { lt: new Date(Date.now() - PREVIEW_TTL_MS) } }, data: { status: "CANCELLED", rows: Prisma.DbNull } });
    const batch = await db.crmImportBatch.create({
      data: {
        createdByUserId: actor.userId, assignedStaffId, filename: file.name.slice(0, 120), fileHash, status: "PREVIEWED",
        rows: parsed.candidates as unknown as Prisma.InputJsonValue, summary: summary as unknown as Prisma.InputJsonValue,
        errors: issues.slice(0, MAX_STORED_ISSUES) as unknown as Prisma.InputJsonValue,
        skippedCount: count.LINK_EXISTING + count.LINK_IN_FILE + count.ALREADY_IMPORTED + count.DUPLICATE_SOURCE_ID, errorCount: summary.errors,
        defaultSource: source as never, sourceKey: meta.sourceKey, sourceUrl: meta.sourceUrl, lawfulSourceNote: meta.lawfulSourceNote, observedAt: meta.observedAt,
        mapping: mapping as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_PREVIEWED", entityType: "CrmImportBatch", entityId: batch.id, metadata: { total: parsed.totalRows, importable: count.CREATE, sourceKey: meta.sourceKey } });
    const { rowOutcomes: _all, ...slimSummary } = summary; void _all;
    return {
      batchId: batch.id, summary: slimSummary,
      rows: rowOutcomes.slice(0, 200).map((r) => {
        const c = byRow.get(r.row)!;
        return { ...r, name: c.prospect.name, city: c.prospect.city, language: c.prospect.preferredLanguage, contact: c.contact?.name ?? null, doNotContact: c.doNotContact };
      }),
      issues: issues.slice(0, 50),
    };
  });
}

export async function confirmProspectImport(batchId: string) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const batch = await db.crmImportBatch.findFirst({ where: { id: batchId, ...(actor.all ? {} : { createdByUserId: actor.userId }) } });
    if (!batch) throw new CrmError("NOT_FOUND");
    if (batch.status === "COMPLETED") return { created: batch.createdCount, skipped: batch.skippedCount, linked: 0, review: 0, alreadyImported: 0, alreadyCompleted: true };
    if (batch.status !== "PREVIEWED" || !Array.isArray(batch.rows)) throw new CrmError("IMPORT_NOT_CONFIRMABLE");
    if (Date.now() - batch.createdAt.getTime() > PREVIEW_TTL_MS) throw new CrmError("PREVIEW_EXPIRED");
    const assignedStaffId = await resolveAssignee(actor, batch.assignedStaffId);

    // Compare-and-set: a double click or two tabs cannot import the same batch twice.
    const claimed = await db.crmImportBatch.updateMany({ where: { id: batchId, status: "PREVIEWED" }, data: { status: "IMPORTING" } });
    if (claimed.count !== 1) throw new CrmError("IMPORT_NOT_CONFIRMABLE");

    try {
      const candidates = batch.rows as unknown as ImportCandidate[];
      const observedAt = batch.observedAt ?? new Date();
      const now = new Date();
      const result = await db.$transaction(async (tx) => {
        // The world may have changed since the preview: re-plan against the live database inside the transaction.
        const inputs = await loadPlanInputs(candidates, batch.fileHash, batch.sourceKey, tx);
        const plans = planImport(candidates, inputs.recordKeys, inputs.fingerprints, inputs.pool, inputs.sources);
        const byRow = new Map(candidates.map((c) => [c.rowNumber, c]));
        const rules = await loadTerritoryRulesWith(tx);
        const canPool = actor.all || actor.kind === "SALES_MANAGER";
        const ownerFacts = assignedStaffId ? await staffAcquirerFacts(assignedStaffId) : null;
        const definitions = await tx.crmNeedDefinition.findMany({ where: { active: true }, select: { weight: true } });
        const weights = definitions.map((d) => d.weight);

        // 1) CREATE rows → prospects. A row whose territory the chosen owner may not acquire is imported UNASSIGNED when the
        //    actor may hold a pool (manager / Super Admin), otherwise it is skipped. Nothing is silently handed to the wrong mode.
        const created = new Map<number, string>();
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
              id: prospectId, ...prospectColumns({ ...p, tags: p.tags, notes: p.notes }), ...territoryColumns(rules, p, now), assignedStaffId: ownerFor.get(c.rowNumber) ?? null,
              createdByUserId: actor.userId, importBatchId: batchId, doNotContact: c.doNotContact, doNotContactAt: c.doNotContact ? now : null, lastActivityAt: now,
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
          const base = { sourceKey: batch.sourceKey, recordKey: inputs.recordKeys.get(pl.row)!, fingerprint: inputs.fingerprints.get(pl.row)!, observedAt, batchId, sourceUrl: batch.sourceUrl, lawfulSourceNote: batch.lawfulSourceNote, c };
          if (pl.action === "ALREADY_IMPORTED") { tally.alreadyImported++; continue; }
          if (pl.action === "DUPLICATE_SOURCE_ID") { tally.skippedSourceId++; continue; }
          if (skippedRows.has(pl.row)) continue; // territory-skipped: no prospect, no observation (nothing to attach it to)
          if (pl.action === "CREATE") { obs.push(observationData({ ...base, outcome: "CREATED", prospectId: created.get(pl.row)! })); continue; }
          if (pl.action === "LINK_IN_FILE") {
            const target = created.get(pl.targetRow);
            if (target) { obs.push(observationData({ ...base, outcome: "LINKED_IN_FILE", prospectId: target, reasons: pl.reasons })); tally.linked++; }
            continue;
          }
          if (pl.action === "LINK_EXACT" || pl.action === "LINK_STRONG") {
            const { conflicts } = await enrichFromCandidate(tx, actor, pl.target, c, rules);
            obs.push(observationData({ ...base, outcome: pl.action === "LINK_EXACT" ? "LINKED_EXACT" : "LINKED_STRONG", prospectId: pl.target, reasons: pl.action === "LINK_STRONG" ? pl.reasons : ["SOURCE_ID"], conflicts }));
            tally.linked++;
            continue;
          }
          // REVIEW: nothing is created or merged until a human decides.
          const target = resolve(pl.target);
          if (!target) continue;
          const o = await tx.crmSourceObservation.create({ data: observationData({ ...base, outcome: "REVIEW_PENDING", prospectId: null, reasons: pl.reasons }), select: { id: true } });
          await tx.crmDuplicateReview.create({ data: { observationId: o.id, prospectId: target, reasons: pl.reasons, pendingCandidate: c as unknown as Prisma.InputJsonValue, createdByUserId: actor.userId } });
          tally.review++;
        }
        if (obs.length) await tx.crmSourceObservation.createMany({ data: obs, skipDuplicates: true });

        const skipped = tally.alreadyImported + tally.skippedSourceId + territorySkipped + tally.linked;
        await tx.crmImportBatch.update({
          where: { id: batchId },
          data: {
            status: "COMPLETED", completedAt: now, createdCount: created.size, skippedCount: skipped, rows: Prisma.DbNull,
            summary: { ...(batch.summary as Record<string, unknown>), result: { ...tally, territorySkipped } } as Prisma.InputJsonValue,
          },
        });
        await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_COMPLETED", entityType: "CrmImportBatch", entityId: batchId, metadata: { ...tally, territorySkipped, assignedStaffId, sourceKey: batch.sourceKey } }, tx);
        return { created: created.size, skipped, linked: tally.linked, review: tally.review, alreadyImported: tally.alreadyImported };
      }, { timeout: 120_000, maxWait: 10_000 });
      revalidatePath(PLATFORM.salesProspects);
      revalidatePath(PLATFORM.sales);
      return { ...result, alreadyCompleted: false };
    } catch (err) {
      await db.crmImportBatch.updateMany({ where: { id: batchId, status: "IMPORTING" }, data: { status: "FAILED", rows: Prisma.DbNull } });
      console.error("[sales-import] import failed and was rolled back");
      // A concurrent confirmation of the same records hit the observation uniqueness guard: nothing was written.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new CrmError("IMPORT_CONFLICT");
      throw err instanceof CrmError ? err : new CrmError("IMPORT_FAILED");
    }
  });
}

export async function cancelProspectImport(batchId: string) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const r = await db.crmImportBatch.updateMany({ where: { id: batchId, status: "PREVIEWED", ...(actor.all ? {} : { createdByUserId: actor.userId }) }, data: { status: "CANCELLED", rows: Prisma.DbNull } });
    if (r.count !== 1) throw new CrmError("NOT_FOUND");
    await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_CANCELLED", entityType: "CrmImportBatch", entityId: batchId });
    return {};
  });
}

/** Per-row report as CSV (row number, outcome, territory, address quality, then issues — never the imported values). */
export async function importIssueReport(batchId: string) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const batch = await db.crmImportBatch.findFirst({ where: { id: batchId, ...(actor.all ? {} : { createdByUserId: actor.userId }) }, select: { errors: true, summary: true } });
    if (!batch) throw new CrmError("NOT_FOUND");
    const issues = (Array.isArray(batch.errors) ? batch.errors : []) as unknown as ImportIssue[];
    const outcomes = ((batch.summary as { rowOutcomes?: { row: number; outcome: string; territory: string; quality: string }[] } | null)?.rowOutcomes ?? []);
    const outByRow = new Map(outcomes.map((o) => [o.row, o]));
    const rows: unknown[][] = [["row", "outcome", "territory", "address_quality", "field", "code", "severity"]];
    const seen = new Set<number>();
    for (const i of issues) { const o = outByRow.get(i.row); seen.add(i.row); rows.push([i.row, o?.outcome ?? "", o?.territory ?? "", o?.quality ?? "", i.field, i.code, i.severity]); }
    for (const o of outcomes) if (!seen.has(o.row)) rows.push([o.row, o.outcome, o.territory, o.quality, "", "", ""]);
    return { csv: toCsv(rows) };
  });
}
