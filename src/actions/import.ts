"use server";

import { revalidatePath } from "next/cache";
import { requirePermissions } from "@/lib/access";
import { getWritableShopId } from "@/lib/shop-context";
import { can } from "@/lib/subscription";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import {
  IMPORT_ENTITIES,
  autoMapColumns,
  fieldsFor,
  missingRequiredFields,
  type ColumnMapping,
  type ImportEntity,
  type ImportOptions,
} from "@/domain/import";
import { ImportFileError, parseImportFile } from "@/lib/import-file";
import {
  buildImportPlan,
  checkImportRequest,
  executeImport,
  reportPlan,
  type ImportRefusal,
  type PlanReport,
} from "@/lib/import-service";

export type ImportActionError =
  | ImportRefusal
  | ImportFileError["code"]
  | "INVALID_REQUEST"
  | "MISSING_COLUMNS"
  | "CONFLICT";

export interface ImportAnalysis {
  headers: string[];
  rowCount: number;
  fields: { key: string; required: boolean }[];
  mapping: ColumnMapping;
  /** Primeras filas crudas para que el usuario verifique el mapeo. */
  sampleRows: string[][];
}

export type ImportPreviewResult =
  | { ok: true; analysis: ImportAnalysis; report: PlanReport | null; missing: string[] }
  | { ok: false; error: ImportActionError; missing?: string[] };

export type ImportCommitResult =
  | { ok: true; report: PlanReport }
  | { ok: false; error: ImportActionError; missing?: string[] };

interface ParsedRequest {
  shopId: string;
  userId: string;
  fileName: string;
  entity: ImportEntity;
  options: ImportOptions;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping | null;
}

async function readRequest(formData: FormData): Promise<ParsedRequest | { error: ImportActionError }> {
  // `import.run`: solo el dueño por defecto (delegable en Pro+); getWritableShopId aplica RESTRICTED mode.
  const session = await requirePermissions(["import.run"]);
  const shopId = await getWritableShopId("import.run");

  const file = formData.get("file");
  const entity = formData.get("entity");
  if (!(file instanceof File) || typeof entity !== "string" || !IMPORT_ENTITIES.includes(entity as ImportEntity)) {
    return { error: "INVALID_REQUEST" };
  }
  let table;
  try {
    table = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (err) {
    if (err instanceof ImportFileError) return { error: err.code };
    throw err;
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { defaultLanguage: true } });
  const options: ImportOptions = {
    duplicates: formData.get("duplicates") === "update" ? "update" : "skip",
    createMissingCustomers: formData.get("createMissingCustomers") !== "false",
    defaultLanguage: shop?.defaultLanguage === "EN" ? "EN" : "FR",
  };

  const full = await can(shopId, "import.full");
  const refusal = checkImportRequest({ full }, entity as ImportEntity, options, table.rows.length);
  if (refusal) return { error: refusal };

  let mapping: ColumnMapping | null = null;
  const rawMapping = formData.get("mapping");
  if (typeof rawMapping === "string" && rawMapping) {
    try {
      const parsed = JSON.parse(rawMapping) as Record<string, unknown>;
      const allowed = new Set(fieldsFor(entity as ImportEntity).map((f) => f.key));
      mapping = {};
      for (const key of allowed) {
        const v = parsed[key];
        mapping[key] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < table.headers.length ? v : null;
      }
    } catch {
      return { error: "INVALID_REQUEST" };
    }
  }

  return {
    shopId,
    userId: session.user.id,
    fileName: file.name,
    entity: entity as ImportEntity,
    options,
    headers: table.headers,
    rows: table.rows,
    mapping,
  };
}

/** Analiza el archivo (encabezados + mapeo sugerido) y, si viene un mapeo, valida todas las filas sin escribir nada. */
export async function previewImportAction(formData: FormData): Promise<ImportPreviewResult> {
  const req = await readRequest(formData);
  if ("error" in req) return { ok: false, error: req.error };

  const suggested = autoMapColumns(req.entity, req.headers);
  const mapping = req.mapping ?? suggested;
  const analysis: ImportAnalysis = {
    headers: req.headers,
    rowCount: req.rows.length,
    fields: fieldsFor(req.entity).map((f) => ({ key: f.key, required: !!f.required })),
    mapping,
    sampleRows: req.rows.slice(0, 5),
  };
  const missing = missingRequiredFields(req.entity, mapping);
  if (!req.mapping || missing.length) return { ok: true, analysis, report: null, missing };

  const plan = await buildImportPlan(db, req.shopId, req.entity, req.rows, mapping, req.options);
  return { ok: true, analysis, report: reportPlan(plan, req.rows), missing };
}

/** Aplica la importación (todo o nada por archivo; las filas inválidas se omiten y se reportan). */
export async function commitImportAction(formData: FormData): Promise<ImportCommitResult> {
  const req = await readRequest(formData);
  if ("error" in req) return { ok: false, error: req.error };
  if (!req.mapping) return { ok: false, error: "INVALID_REQUEST" };
  const missing = missingRequiredFields(req.entity, req.mapping);
  if (missing.length) return { ok: false, error: "MISSING_COLUMNS", missing };

  try {
    const report = await executeImport(
      { shopId: req.shopId, userId: req.userId, fileName: req.fileName, entity: req.entity, options: req.options },
      req.rows,
      req.mapping
    );
    revalidatePath(ADMIN.clients);
    revalidatePath(ADMIN.inventory);
    revalidatePath(ADMIN.import);
    return { ok: true, report };
  } catch (err) {
    // P2002: otro proceso creó el mismo SKU entre la vista previa y la escritura.
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return { ok: false, error: "CONFLICT" };
    }
    throw err;
  }
}

export async function getRecentImportRuns() {
  await requirePermissions(["import.run"]);
  const shopId = await getWritableShopId("import.run").catch(() => null);
  if (!shopId) return [];
  return db.importRun.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 8 });
}
