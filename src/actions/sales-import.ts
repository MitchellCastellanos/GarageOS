"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canAccessAssignedStaff } from "@/domain/sales-crm/access";
import { MAX_IMPORT_BYTES, toCsv } from "@/domain/sales-crm/csv";
import { dedupeWithinFile, findExistingMatch, parseProspectCsv, type ImportCandidate, type ImportIssue, type ExistingKey } from "@/domain/sales-crm/import";
import { normalizeCity } from "@/domain/sales-crm/normalize";
import { computeFitScore, computeIntentScore } from "@/domain/sales-crm/scoring";
import { LEAD_SOURCES } from "@/domain/sales-crm/validation";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, prospectColumns, resolveAssignee } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { scoreBreakdownJson } from "@/lib/sales-crm/scoring";
import { normalizeEmail } from "@/domain/sales-crm/normalize";

const PREVIEW_TTL_MS = 24 * 3600_000;
const CHUNK = 400;
const MAX_STORED_ISSUES = 500;

function decode(buf: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); } // Excel "CSV" exports in Quebec are frequently cp1252
}

async function loadExisting(c: ImportCandidate[]): Promise<ExistingKey[]> {
  const domains = [...new Set(c.map((x) => x.keys.websiteDomain).filter(Boolean))] as string[];
  const phones = [...new Set(c.map((x) => x.keys.phoneDigits).filter(Boolean))] as string[];
  const names = [...new Set(c.map((x) => x.keys.nameNormalized).filter(Boolean))];
  const or: Prisma.CrmProspectWhereInput[] = [];
  if (domains.length) or.push({ websiteDomain: { in: domains } });
  if (phones.length) or.push({ phoneDigits: { in: phones } });
  if (names.length) or.push({ nameNormalized: { in: names } });
  if (!or.length) return [];
  const rows = await db.crmProspect.findMany({ where: { OR: or }, select: { id: true, nameNormalized: true, city: true, websiteDomain: true, phoneDigits: true, doNotContact: true, assignedStaffId: true } });
  return rows.map((r) => ({ id: r.id, nameNormalized: r.nameNormalized, city: normalizeCity(r.city), websiteDomain: r.websiteDomain, phoneDigits: r.phoneDigits, doNotContact: r.doNotContact, assignedStaffId: r.assignedStaffId })) as (ExistingKey & { assignedStaffId: string | null })[];
}

function splitByExisting(candidates: ImportCandidate[], existing: (ExistingKey & { assignedStaffId?: string | null })[], actorCan: (staffId: string | null) => boolean) {
  const accepted: ImportCandidate[] = [], issues: ImportIssue[] = [];
  const dupLinks: { row: number; prospectId: string }[] = [];
  for (const c of candidates) {
    const m = findExistingMatch(c, existing) as (ExistingKey & { assignedStaffId?: string | null }) | null;
    if (!m) { accepted.push(c); continue; }
    issues.push({ row: c.rowNumber, field: "name", code: m.doNotContact ? "DUPLICATE_DO_NOT_CONTACT" : "DUPLICATE_EXISTING", severity: "skipped" });
    // Only reveal the id of a duplicate the actor may open.
    if (actorCan(m.assignedStaffId ?? null)) dupLinks.push({ row: c.rowNumber, prospectId: m.id });
  }
  return { accepted, issues, dupLinks };
}

export async function previewProspectImport(form: FormData) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new CrmError("FILE_REQUIRED");
    if (file.size > MAX_IMPORT_BYTES) throw new CrmError("FILE_TOO_LARGE");
    if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) throw new CrmError("FILE_TYPE");
    const requestedStaff = (form.get("assignedStaffId") as string | null) || (actor.all ? null : actor.staffId);
    const assignedStaffId = await resolveAssignee(actor, requestedStaff);
    const source = (form.get("source") as string) || "IMPORT";
    if (!(LEAD_SOURCES as readonly string[]).includes(source)) throw new CrmError("INVALID");

    const text = decode(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(text).digest("hex");
    const parsed = parseProspectCsv(text, { defaultSource: source });
    if (parsed.headerError) throw new CrmError(`IMPORT_${parsed.headerError}`);

    const inFile = dedupeWithinFile(parsed.candidates);
    const existing = await loadExisting(inFile.kept);
    const { accepted, issues: dbIssues, dupLinks } = splitByExisting(inFile.kept, existing, (staffId) => canAccessAssignedStaff(actor, staffId));
    const issues = [...parsed.issues, ...inFile.issues, ...dbIssues].sort((a, b) => a.row - b.row);
    const count = (sev: string) => issues.filter((i) => i.severity === sev).length;
    const previouslyImported = await db.crmImportBatch.count({ where: { fileHash, createdByUserId: actor.userId, status: "COMPLETED" } });

    const summary = {
      totalRows: parsed.totalRows, importable: accepted.length, errors: count("error"), warnings: count("warning"),
      duplicatesInFile: issues.filter((i) => i.code === "DUPLICATE_IN_FILE").length,
      duplicatesExisting: issues.filter((i) => i.code === "DUPLICATE_EXISTING" || i.code === "DUPLICATE_DO_NOT_CONTACT").length,
      doNotContactRows: accepted.filter((a) => a.doNotContact).length, ignoredColumns: parsed.ignoredColumns, previouslyImported: previouslyImported > 0,
      existingLinks: dupLinks.slice(0, 100),
    };
    // Housekeeping: stale previews drop their stored rows (they hold personal data).
    await db.crmImportBatch.updateMany({ where: { status: "PREVIEWED", createdAt: { lt: new Date(Date.now() - PREVIEW_TTL_MS) } }, data: { status: "CANCELLED", rows: Prisma.DbNull } });
    const batch = await db.crmImportBatch.create({
      data: {
        createdByUserId: actor.userId, assignedStaffId, filename: file.name.slice(0, 120), fileHash, status: "PREVIEWED",
        rows: accepted as unknown as Prisma.InputJsonValue, summary: summary as Prisma.InputJsonValue,
        errors: issues.slice(0, MAX_STORED_ISSUES) as unknown as Prisma.InputJsonValue,
        skippedCount: summary.duplicatesInFile + summary.duplicatesExisting, errorCount: summary.errors,
        defaultSource: source as never,
      },
      select: { id: true },
    });
    await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_PREVIEWED", entityType: "CrmImportBatch", entityId: batch.id, metadata: { total: parsed.totalRows, importable: accepted.length } });
    return {
      batchId: batch.id, summary,
      sample: accepted.slice(0, 8).map((a) => ({ row: a.rowNumber, name: a.prospect.name, city: a.prospect.city, language: a.prospect.preferredLanguage, contact: a.contact?.name ?? null, doNotContact: a.doNotContact })),
      issues: issues.slice(0, 50),
    };
  });
}

export async function confirmProspectImport(batchId: string) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const batch = await db.crmImportBatch.findFirst({ where: { id: batchId, ...(actor.all ? {} : { createdByUserId: actor.userId }) } });
    if (!batch) throw new CrmError("NOT_FOUND");
    if (batch.status === "COMPLETED") return { created: batch.createdCount, skipped: batch.skippedCount, alreadyCompleted: true };
    if (batch.status !== "PREVIEWED" || !Array.isArray(batch.rows)) throw new CrmError("IMPORT_NOT_CONFIRMABLE");
    if (Date.now() - batch.createdAt.getTime() > PREVIEW_TTL_MS) throw new CrmError("PREVIEW_EXPIRED");
    const assignedStaffId = await resolveAssignee(actor, batch.assignedStaffId);

    // Compare-and-set: a double click or two tabs cannot import the same batch twice.
    const claimed = await db.crmImportBatch.updateMany({ where: { id: batchId, status: "PREVIEWED" }, data: { status: "IMPORTING" } });
    if (claimed.count !== 1) throw new CrmError("IMPORT_NOT_CONFIRMABLE");

    try {
      const candidates = batch.rows as unknown as ImportCandidate[];
      // The world may have changed since the preview: re-check duplicates right before writing.
      const existing = await loadExisting(candidates);
      const { accepted, issues: late } = splitByExisting(candidates, existing, () => false);
      const definitions = await db.crmNeedDefinition.findMany({ where: { active: true }, select: { weight: true } });
      const weights = definitions.map((d) => d.weight);
      const now = new Date();

      await db.$transaction(async (tx) => {
        for (let i = 0; i < accepted.length; i += CHUNK) {
          const chunk = accepted.slice(i, i + CHUNK);
          const prospects: Prisma.CrmProspectCreateManyInput[] = [], opps: Prisma.CrmOpportunityCreateManyInput[] = [];
          const events: Prisma.CrmStageEventCreateManyInput[] = [], contacts: Prisma.CrmContactCreateManyInput[] = [], acts: Prisma.CrmActivityCreateManyInput[] = [];
          for (const c of chunk) {
            const prospectId = randomUUID(), oppId = randomUUID();
            const stage = c.doNotContact ? "DO_NOT_CONTACT" : "NEW";
            const p = c.prospect;
            const fit = computeFitScore({
              shopSize: p.shopSize, industry: p.industry, currentSoftware: p.currentSoftware, preferredLanguage: p.preferredLanguage,
              activeContactCount: c.contact ? 1 : 0, hasDecisionMaker: !!c.contact?.isDecisionMaker, activeNeedWeights: weights, needs: [],
            });
            const intent = computeIntentScore({ stage, urgency: null, meaningfulTouches30d: 0, linkedDemoCount: 0, daysSinceLastActivity: 0 });
            prospects.push({
              id: prospectId, ...prospectColumns({ ...p, tags: p.tags, notes: p.notes }), assignedStaffId, createdByUserId: actor.userId,
              importBatchId: batchId, doNotContact: c.doNotContact, doNotContactAt: c.doNotContact ? now : null, lastActivityAt: now,
            });
            opps.push({
              id: oppId, prospectId, assignedStaffId, stage, stageChangedAt: now, createdByUserId: actor.userId,
              closedAt: c.doNotContact ? now : null, fitScore: fit.score, fitBreakdown: scoreBreakdownJson(fit), intentScore: intent.score,
              intentBreakdown: scoreBreakdownJson(intent), scoreComputedAt: now,
            });
            events.push({ opportunityId: oppId, toStage: stage, actorUserId: actor.userId });
            acts.push({ prospectId, opportunityId: oppId, type: "SYSTEM", authorUserId: actor.userId, metadata: { event: "PROSPECT_CREATED", source: "IMPORT" } });
            if (c.contact) {
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
        await tx.crmImportBatch.update({
          where: { id: batchId },
          data: {
            status: "COMPLETED", completedAt: now, createdCount: accepted.length, skippedCount: batch.skippedCount + late.length,
            rows: Prisma.DbNull,
          },
        });
        await writeCrmAudit({ actorUserId: actor.userId, action: "IMPORT_COMPLETED", entityType: "CrmImportBatch", entityId: batchId, metadata: { created: accepted.length, skipped: batch.skippedCount + late.length, assignedStaffId } }, tx);
      }, { timeout: 120_000, maxWait: 10_000 });
      revalidatePath(PLATFORM.salesProspects);
      revalidatePath(PLATFORM.sales);
      return { created: accepted.length, skipped: batch.skippedCount + late.length, alreadyCompleted: false };
    } catch (err) {
      await db.crmImportBatch.updateMany({ where: { id: batchId, status: "IMPORTING" }, data: { status: "FAILED", rows: Prisma.DbNull } });
      console.error("[sales-import] import failed and was rolled back");
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

/** Error/skip report as CSV (row number, field, code, severity only — never the imported values). */
export async function importIssueReport(batchId: string) {
  const actor = await requireCrmActor("import_prospects");
  return crmAction(async () => {
    const batch = await db.crmImportBatch.findFirst({ where: { id: batchId, ...(actor.all ? {} : { createdByUserId: actor.userId }) }, select: { errors: true } });
    if (!batch) throw new CrmError("NOT_FOUND");
    const issues = (Array.isArray(batch.errors) ? batch.errors : []) as unknown as ImportIssue[];
    return { csv: toCsv([["row", "field", "code", "severity"], ...issues.map((i) => [i.row, i.field, i.code, i.severity])]) };
  });
}
