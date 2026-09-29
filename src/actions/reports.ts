"use server";

import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermissions } from "@/lib/access";
import { canView } from "@/lib/subscription";
import { resolveLocationAccess } from "@/lib/organization";
import { resolveLocationScope } from "@/domain/locations";
import {
  BASIC_KINDS,
  BASIC_PRESETS,
  MULTI_LOCATION_KINDS,
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
  getLocationComparison,
  getOperationsReport,
  getOverviewReport,
  getReceivablesReport,
  getSalesReport,
  type ReportScope,
} from "@/lib/reports-service";
import {
  customersCsv,
  inventoryCsv,
  locationsCsv,
  operationsCsv,
  overviewCsv,
  rangeLabel,
  receivablesCsv,
  salesCsv,
} from "@/lib/reports-export";

/** `location`: "active" (por defecto) | "all" (todas las ubicaciones accesibles) | id de una ubicación accesible. */
export type ReportInput = { kind: string; preset?: string | null; from?: string | null; to?: string | null; location?: string | null };
export type ReportError = "INVALID_KIND" | "INVALID_RANGE" | "UPGRADE_REQUIRED" | "MULTI_LOCATION_REQUIRED" | "NO_LOCATION_ACCESS" | "NO_SHOP";

export interface ReportContext {
  shopId: string;
  advanced: boolean;
  scope: ReportScope;
  scopeMode: "active" | "all" | "one";
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
  // Multi-Shop: consolidar/comparar/filtrar por otra ubicación exige el entitlement (lectura: canView) y
  // que las ubicaciones pedidas estén entre las accesibles del usuario — nunca se confía en un id enviado.
  let shopIds = [shopId];
  let scopeMode: ReportContext["scopeMode"] = "active";
  const wantsLocations = MULTI_LOCATION_KINDS.includes(kind) || (input.location != null && input.location !== "active");
  if (wantsLocations) {
    if (!(await canView(shopId, "reports.multiLocation"))) return { error: "MULTI_LOCATION_REQUIRED" };
    const access = await resolveLocationAccess(session.user.id, shopId);
    const resolved = resolveLocationScope(input.location ?? "all", shopId, access.locations.map((l) => l.id));
    if (!resolved.ok) return { error: resolved.error };
    shopIds = resolved.shopIds;
    scopeMode = resolved.mode;
  }
  if (!advanced && (!BASIC_KINDS.includes(kind) || opts.forExport)) return { error: "UPGRADE_REQUIRED" };

  let range: ResolvedRange;
  try {
    range = resolveRange(input, { timeZone: shop.timezone, allowedPresets: advanced ? undefined : BASIC_PRESETS });
  } catch (e) {
    if (e instanceof ReportRangeError) return { error: e.code === "PRESET_NOT_ALLOWED" ? "UPGRADE_REQUIRED" : "INVALID_RANGE" };
    throw e;
  }
  return {
    ctx: { shopId, advanced, scopeMode, scope: { shopIds, range, includeFinancial: perms.has("financial.view") } },
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
    : kind === "locations" ? await getLocationComparison(scope)
    : await getInventoryReport(scope);
  // Nombres de las ubicaciones del alcance (para etiquetar byLocation / filtros en la UI).
  const locations = scope.shopIds.length > 1 || ctx.scopeMode !== "active"
    ? await db.shop.findMany({ where: { id: { in: scope.shopIds } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
    : [];
  return { kind, advanced: ctx.advanced, range: serializeRange(range), data, scopeMode: ctx.scopeMode, locations } as const;
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
  else if (kind === "locations") csv = locationsCsv(await getLocationComparison(scope));
  else csv = overviewCsv(await getOverviewReport(scope));
  return { filename: `garageos-${kind}-${rangeLabel(range)}.csv`, csv } as const;
}

/** Ubicaciones que el usuario puede elegir en el filtro de reportes (vacío sin Multi-Shop o con una sola). */
export async function getReportLocationOptions(): Promise<{ enabled: boolean; locations: { id: string; name: string }[]; activeShopId: string }> {
  const session = await requirePermissions(["reports.view"]);
  const shopId = session.user.shopId!;
  if (!(await canView(shopId, "reports.multiLocation"))) return { enabled: false, locations: [], activeShopId: shopId };
  const access = await resolveLocationAccess(session.user.id, shopId);
  return { enabled: access.locations.length > 1, locations: access.locations, activeShopId: shopId };
}
