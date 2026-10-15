"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canAccessAssignedStaff } from "@/domain/sales-crm/access";
import { MAX_IMPORT_BYTES, cleanText, neutralizeFormula, toCsv } from "@/domain/sales-crm/csv";
import {
  inspectCsv, parseProspectCsv, planImport, sanitizeMapping, type ImportCandidate, type ImportIssue, type ImportMapping, type RowPlan,
} from "@/domain/sales-crm/import";
import { LEAD_SOURCES } from "@/domain/sales-crm/validation";
import { classifyTerritory, evaluateAcquisition, NO_ENGAGEMENT } from "@/domain/sales-crm/territory";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { applyImportBatch, loadPlanInputs } from "@/lib/sales-crm/lead-engine";
import { CrmError, resolveAssignee } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { staffAcquirerFacts } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

const PREVIEW_TTL_MS = 24 * 3600_000;
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
      const result = await db.$transaction(async (tx) => {
        const r = await applyImportBatch(tx, actor, batch, candidates, assignedStaffId);
        const { rows: _rows, ...counts } = r; void _rows;
        return counts;
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
