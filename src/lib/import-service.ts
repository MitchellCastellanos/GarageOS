// Servicio de importación (Block 2): carga los registros EXISTENTES del taller (siempre
// scoped por shopId), planifica con src/domain/import.ts y ejecuta en una transacción.
// La autorización (dueño, escritura permitida, entitlement) la hace src/actions/import.ts;
// aquí solo se valida el plan contra los límites del plan comercial.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  IMPORT_LIMITS,
  planCustomers,
  planInventory,
  planVehicles,
  summarize,
  type ColumnMapping,
  type CustomerData,
  type ImportEntity,
  type ImportOptions,
  type InventoryData,
  type PlanSummary,
  type PlannedRow,
  type RowErrorCode,
  type VehicleRowData,
} from "@/domain/import";

export type ImportRefusal = "UPGRADE_REQUIRED" | "TOO_MANY_ROWS";

export interface ImportAccess {
  /** Plan con importación completa (Pro/Complete). */
  full: boolean;
}

/** Comprueba una solicitud contra el plan. Devuelve el motivo del rechazo o null. */
export function checkImportRequest(
  access: ImportAccess,
  entity: ImportEntity,
  options: ImportOptions,
  rowCount: number
): ImportRefusal | null {
  if (!access.full && (entity === "inventory" || options.duplicates === "update")) return "UPGRADE_REQUIRED";
  const max = access.full ? IMPORT_LIMITS.fullMaxRows : IMPORT_LIMITS.basicMaxRows;
  if (rowCount > max) return "TOO_MANY_ROWS";
  return null;
}

export type AnyPlan =
  | { entity: "customers"; rows: PlannedRow<CustomerData>[] }
  | { entity: "vehicles"; rows: PlannedRow<VehicleRowData>[] }
  | { entity: "inventory"; rows: PlannedRow<InventoryData>[] };

type Db = Pick<typeof db, "client" | "vehicle" | "inventoryPart">;

export async function buildImportPlan(
  client: Db,
  shopId: string,
  entity: ImportEntity,
  rows: string[][],
  mapping: ColumnMapping,
  options: ImportOptions
): Promise<AnyPlan> {
  if (entity === "inventory") {
    const existing = await client.inventoryPart.findMany({
      where: { shopId },
      select: { id: true, sku: true, name: true },
    });
    return { entity, rows: planInventory(rows, mapping, existing, options) };
  }

  const existingClients = await client.client.findMany({
    where: { shopId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (entity === "customers") {
    return { entity, rows: planCustomers(rows, mapping, existingClients, options) };
  }
  const existingVehicles = await client.vehicle.findMany({
    where: { client: { shopId } },
    select: { id: true, clientId: true, licensePlate: true, vin: true },
  });
  return { entity, rows: planVehicles(rows, mapping, existingClients, existingVehicles, options) };
}

// ── Vista previa ────────────────────────────────────────────

export interface PreviewIssueRow {
  rowNumber: number;
  codes: RowErrorCode[];
  values: string[];
}

export interface PlanReport {
  summary: PlanSummary;
  /** Primeras filas con error (con sus valores originales, para corregirlas y reimportar). */
  errorRows: PreviewIssueRow[];
  /** Primeras filas omitidas por duplicado. */
  duplicateRows: { rowNumber: number; inFile: boolean; values: string[] }[];
  /** Filas que se crearían/actualizarían (muestra). */
  sample: { rowNumber: number; action: "create" | "update"; label: string }[];
}

export const REPORT_CAP = 1000;

function labelFor(plan: AnyPlan, r: PlannedRow<unknown>): string {
  if (plan.entity === "customers") {
    const d = r.data as CustomerData;
    return [d.firstName, d.lastName].filter(Boolean).join(" ") + (d.email ? ` · ${d.email}` : d.phone ? ` · ${d.phone}` : "");
  }
  if (plan.entity === "vehicles") {
    const d = r.data as VehicleRowData;
    return `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.licensePlate} — ${[d.owner.firstName, d.owner.lastName].filter(Boolean).join(" ") || d.owner.email || d.owner.phone}`;
  }
  const d = r.data as InventoryData;
  return `${d.name}${d.sku ? ` · ${d.sku}` : ""}`;
}

export function reportPlan(plan: AnyPlan, rawRows: string[][]): PlanReport {
  const all = plan.rows as PlannedRow<unknown>[];
  const errorRows: PreviewIssueRow[] = [];
  const duplicateRows: PlanReport["duplicateRows"] = [];
  const sample: PlanReport["sample"] = [];
  for (const r of all) {
    const values = rawRows[r.rowNumber - 2] ?? [];
    if (r.action === "error") {
      if (errorRows.length < REPORT_CAP) errorRows.push({ rowNumber: r.rowNumber, codes: r.errors.map((e) => e.code), values });
    } else if (r.action === "skip_duplicate") {
      if (duplicateRows.length < REPORT_CAP) duplicateRows.push({ rowNumber: r.rowNumber, inFile: !!r.duplicateInFile, values });
    } else if (sample.length < 10) {
      sample.push({ rowNumber: r.rowNumber, action: r.action, label: labelFor(plan, r) });
    }
  }
  return { summary: summarize(all), errorRows, duplicateRows, sample };
}

// ── Ejecución ───────────────────────────────────────────────

const CHUNK = 500;
function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/** Solo los campos con valor: "actualizar" nunca borra datos existentes con celdas vacías. */
function compact<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null)) as { [K in keyof T]?: NonNullable<T[K]> };
}

export interface ImportOutcome {
  summary: PlanSummary;
}

export interface ExecuteContext {
  shopId: string;
  userId: string | null;
  fileName: string;
  entity: ImportEntity;
  options: ImportOptions;
}

/**
 * Re-planifica DENTRO de la transacción (los datos existentes pudieron cambiar desde la vista
 * previa) y aplica todo o nada. Las filas con error se omiten y se reportan; no bloquean el resto.
 */
export async function executeImport(
  ctx: ExecuteContext,
  rows: string[][],
  mapping: ColumnMapping
): Promise<PlanReport> {
  const { shopId, entity, options } = ctx;

  return db.$transaction(
    async (tx) => {
      const plan = await buildImportPlan(tx as unknown as Db, shopId, entity, rows, mapping, options);
      const report = reportPlan(plan, rows);

      if (plan.entity === "customers") {
        const creates = plan.rows.filter((r) => r.action === "create");
        for (const batch of chunks(creates)) {
          await tx.client.createMany({
            data: batch.map((r) => ({
              id: randomUUID(),
              shopId,
              firstName: r.data!.firstName,
              lastName: r.data!.lastName || null,
              email: r.data!.email || null,
              phone: r.data!.phone || null,
              address: r.data!.address || null,
              notes: r.data!.notes || null,
              language: r.data!.language ?? options.defaultLanguage,
            })),
          });
        }
        for (const r of plan.rows.filter((x) => x.action === "update")) {
          const d = r.data!;
          await tx.client.updateMany({
            where: { id: r.matchId!, shopId },
            data: compact({ firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone, address: d.address, notes: d.notes, language: d.language }),
          });
        }
      } else if (plan.entity === "vehicles") {
        // 1) Dueños nuevos (id temporal → uuid real), 2) vehículos, 3) actualizaciones.
        const idMap = new Map<string, string>();
        const owners = plan.rows.filter((r) => r.action === "create" && r.createOwner);
        for (const batch of chunks(owners)) {
          await tx.client.createMany({
            data: batch.map((r) => {
              const id = randomUUID();
              idMap.set(r.ownerId!, id);
              const o = r.data!.owner;
              return {
                id,
                shopId,
                firstName: o.firstName,
                lastName: o.lastName || null,
                email: o.email || null,
                phone: o.phone || null,
                address: o.address || null,
                notes: o.notes || null,
                language: o.language ?? options.defaultLanguage,
              };
            }),
          });
        }
        const resolveOwner = (id: string) => idMap.get(id) ?? id;
        const creates = plan.rows.filter((r) => r.action === "create");
        for (const batch of chunks(creates)) {
          await tx.vehicle.createMany({
            data: batch.map((r) => {
              const v = r.data!.vehicle;
              return {
                clientId: resolveOwner(r.ownerId!),
                make: v.make,
                model: v.model,
                year: v.year,
                licensePlate: v.licensePlate,
                vin: v.vin || null,
                color: v.color || null,
                mileageUnit: v.mileageUnit ?? "KM",
              };
            }),
          });
        }
        for (const r of plan.rows.filter((x) => x.action === "update")) {
          const v = r.data!.vehicle;
          await tx.vehicle.updateMany({
            where: { id: r.matchId!, client: { shopId } },
            data: compact({ make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate, vin: v.vin, color: v.color, mileageUnit: v.mileageUnit }),
          });
        }
      } else {
        const creates = plan.rows.filter((r) => r.action === "create");
        for (const batch of chunks(creates)) {
          const withIds = batch.map((r) => ({ id: randomUUID(), d: r.data! }));
          await tx.inventoryPart.createMany({
            data: withIds.map(({ id, d }) => ({
              id,
              shopId,
              name: d.name,
              sku: d.sku || null,
              description: d.description || null,
              unitCost: d.unitCost,
              unitPrice: d.unitPrice,
              quantityOnHand: d.quantityOnHand,
              reorderThreshold: d.reorderThreshold,
            })),
          });
          // El stock inicial entra por el ledger, como en createInventoryPart.
          const receipts = withIds.filter(({ d }) => d.quantityOnHand > 0);
          if (receipts.length) {
            await tx.inventoryMovement.createMany({
              data: receipts.map(({ id, d }) => ({
                shopId,
                partId: id,
                type: "RECEIVE" as const,
                quantity: d.quantityOnHand,
                note: "Import",
              })),
            });
          }
        }
        // "Actualizar" corrige datos del catálogo, nunca la cantidad (el stock solo cambia por movimientos).
        for (const r of plan.rows.filter((x) => x.action === "update")) {
          const d = r.data!;
          await tx.inventoryPart.updateMany({
            where: { id: r.matchId!, shopId },
            data: {
              ...compact({ name: d.name, description: d.description, sku: d.sku }),
              ...(d.unitCost != null ? { unitCost: d.unitCost } : {}),
              unitPrice: d.unitPrice,
              ...(d.reorderThreshold > 0 ? { reorderThreshold: d.reorderThreshold } : {}),
            },
          });
        }
      }

      await tx.importRun.create({
        data: {
          shopId,
          userId: ctx.userId,
          entity,
          fileName: ctx.fileName.slice(0, 200),
          duplicates: options.duplicates,
          totalRows: report.summary.total,
          created: report.summary.create,
          updated: report.summary.update,
          skipped: report.summary.skipped,
          errors: report.summary.errors,
          customersCreated: report.summary.customersCreated,
        },
      });
      return report;
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}
