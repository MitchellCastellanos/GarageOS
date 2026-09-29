"use server";

import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermissions } from "@/lib/access";
import { canView } from "@/lib/subscription";
import {
  BASIC_KINDS,
  BASIC_PRESETS,
  FINANCIAL_KINDS,
  ReportRangeError,
  isReportKind,
  resolveRange,
  type ReportKind,
  type ResolvedRange,
} from "@/domain/reports";
import type { Permission } from "@/domain/permissions";
import {
  getCustomersReport,
  getInventoryReport,
  getOperationsReport,
  getOverviewReport,
  getReceivablesReport,
  getSalesReport,
  type ReportScope,
} from "@/lib/reports-service";
import {
  customersCsv,
  inventoryCsv,
  operationsCsv,
  overviewCsv,
  rangeLabel,
  receivablesCsv,
  salesCsv,
} from "@/lib/reports-export";

export type ReportInput = { kind: string; preset?: string | null; from?: string | null; to?: string | null };
export type ReportError = "INVALID_KIND" | "INVALID_RANGE" | "UPGRADE_REQUIRED" | "NO_SHOP";

export interface ReportContext {
  shopId: string;
  advanced: boolean;
  scope: ReportScope;
}

/**
 * Punto único de autorización de reportes: `reports.view` (+ `financial.view` para los que muestran
 * dinero), plan (`reports.advanced` para todo lo que no sea el resumen básico) y rango válido en la
 * zona del taller. La lectura sigue el estado de solo-lectura (canView): un taller restringido
 * conserva la vista/exportación de lo que ya contrató, sin escribir nada.
 */
async function buildContext(input: ReportInput, opts: { forExport?: boolean } = {}): Promise<{ ctx: ReportContext; kind: ReportKind; range: ResolvedRange } | { error: ReportError }> {
  if (!isReportKind(input.kind)) return { error: "INVALID_KIND" };
  const kind = input.kind;
  const needs: Permission[] = ["reports.view", ...(FINANCIAL_KINDS.includes(kind) ? (["financial.view"] as Permission[]) : [])];
  const session = await requirePermissions(needs);
  const shopId = session.user.shopId!;

  const [advanced, perms, shop] = await Promise.all([
    canView(shopId, "reports.advanced"),
    getEffectivePermissions(session),
    db.shop.findFirst({ where: { id: shopId }, select: { timezone: true } }),
  ]);
  if (!shop) return { error: "NO_SHOP" };
  if (!advanced && (!BASIC_KINDS.includes(kind) || opts.forExport)) return { error: "UPGRADE_REQUIRED" };

  let range: ResolvedRange;
  try {
    range = resolveRange(input, { timeZone: shop.timezone, allowedPresets: advanced ? undefined : BASIC_PRESETS });
  } catch (e) {
    if (e instanceof ReportRangeError) return { error: e.code === "PRESET_NOT_ALLOWED" ? "UPGRADE_REQUIRED" : "INVALID_RANGE" };
    throw e;
  }
  return {
    ctx: { shopId, advanced, scope: { shopIds: [shopId], range, includeFinancial: perms.has("financial.view") } },
    kind,
    range,
  };
}

function serializeRange(r: ResolvedRange) {
  return { preset: r.preset, fromYmd: r.fromYmd, toYmd: r.toYmd, days: r.days, timeZone: r.timeZone };
}

export async function getReport(input: ReportInput) {
  const built = await buildContext(input);
  if ("error" in built) return { error: built.error } as const;
  const { ctx, kind, range } = built;
  const { scope } = ctx;
  const data =
    kind === "overview" ? await getOverviewReport(scope)
    : kind === "sales" ? await getSalesReport(scope)
    : kind === "receivables" ? await getReceivablesReport(scope)
    : kind === "operations" ? await getOperationsReport(scope)
    : kind === "customers" ? await getCustomersReport(scope)
    : await getInventoryReport(scope);
  return { kind, advanced: ctx.advanced, range: serializeRange(range), data } as const;
}

/** CSV del reporte (Pro+). Devuelve el contenido; el cliente lo descarga como archivo. */
export async function exportReportCsv(input: ReportInput) {
  const built = await buildContext(input, { forExport: true });
  if ("error" in built) return { error: built.error } as const;
  const { ctx, kind, range } = built;
  const { scope } = ctx;
  let csv: string;
  if (kind === "sales") csv = salesCsv(await getSalesReport(scope));
  else if (kind === "receivables") csv = receivablesCsv(await getReceivablesReport(scope, new Date(), 10_000));
  else if (kind === "operations") csv = operationsCsv(await getOperationsReport(scope));
  else if (kind === "customers") csv = customersCsv(await getCustomersReport(scope));
  else if (kind === "inventory") csv = inventoryCsv(await getInventoryReport(scope));
  else csv = overviewCsv(await getOverviewReport(scope));
  return { filename: `garageos-${kind}-${rangeLabel(range)}.csv`, csv } as const;
}
