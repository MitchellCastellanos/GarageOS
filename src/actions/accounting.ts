"use server";

import { db } from "@/lib/db";
import { requirePermissions } from "@/lib/access";
import { canView } from "@/lib/subscription";
import { ReportRangeError, resolveRange, type ResolvedRange } from "@/domain/reports";
import {
  getAccountingSummary,
  getFinancialActivity,
  getPaymentsLedger,
  getSalesJournal,
  type SalesBasis,
} from "@/lib/accounting-service";
import { ACCOUNTING_EXPORTS, activityCsv, paymentsLedgerCsv, salesJournalCsv, taxSummaryCsv, type AccountingExportKind } from "@/lib/accounting-export";

export type AccountingInput = { preset?: string | null; from?: string | null; to?: string | null; basis?: string | null };
export type AccountingError = "INVALID_RANGE" | "UPGRADE_REQUIRED" | "INVALID_KIND" | "NO_SHOP";

/**
 * Autorización única de Accounting Light: `financial.view` + plan `accounting.light` (canView: un
 * taller restringido conserva la lectura/exportación de lo que ya contrató) + rango válido en la
 * zona del taller. El taller sale siempre de la sesión.
 */
async function buildContext(input: AccountingInput): Promise<{ shopId: string; range: ResolvedRange; basis: SalesBasis } | { error: AccountingError }> {
  const session = await requirePermissions(["financial.view"]);
  const shopId = session.user.shopId!;
  const [entitled, shop] = await Promise.all([canView(shopId, "accounting.light"), db.shop.findFirst({ where: { id: shopId }, select: { timezone: true } })]);
  if (!shop) return { error: "NO_SHOP" };
  if (!entitled) return { error: "UPGRADE_REQUIRED" };
  let range: ResolvedRange;
  try {
    range = resolveRange(input, { timeZone: shop.timezone });
  } catch (e) {
    if (e instanceof ReportRangeError) return { error: "INVALID_RANGE" };
    throw e;
  }
  return { shopId, range, basis: input.basis === "paid" ? "paid" : "issued" };
}

export async function getAccountingSummaryAction(input: AccountingInput) {
  const ctx = await buildContext(input);
  if ("error" in ctx) return { error: ctx.error } as const;
  const summary = await getAccountingSummary(ctx);
  return { range: { preset: ctx.range.preset, fromYmd: ctx.range.fromYmd, toYmd: ctx.range.toYmd, days: ctx.range.days }, summary } as const;
}

export async function getFinancialActivityAction(cursor?: string | null) {
  const session = await requirePermissions(["financial.view"]);
  const shopId = session.user.shopId!;
  if (!(await canView(shopId, "accounting.light"))) return { error: "UPGRADE_REQUIRED" as AccountingError };
  return getFinancialActivity(shopId, { cursor: cursor ?? null });
}

export async function exportAccountingCsv(kind: string, input: AccountingInput) {
  if (!(ACCOUNTING_EXPORTS as readonly string[]).includes(kind)) return { error: "INVALID_KIND" as AccountingError };
  const ctx = await buildContext(input);
  if ("error" in ctx) return { error: ctx.error } as const;
  const label = `${ctx.range.fromYmd}_${ctx.range.toYmd}`;
  let csv: string;
  switch (kind as AccountingExportKind) {
    case "sales-journal":
      csv = salesJournalCsv(await getSalesJournal(ctx));
      break;
    case "payments":
      csv = paymentsLedgerCsv(await getPaymentsLedger(ctx));
      break;
    case "tax-summary":
      csv = taxSummaryCsv(await getAccountingSummary(ctx));
      break;
    case "activity": {
      const all: Awaited<ReturnType<typeof getFinancialActivity>>["rows"] = [];
      let cursor: string | null = null;
      do {
        const page: Awaited<ReturnType<typeof getFinancialActivity>> = await getFinancialActivity(ctx.shopId, { cursor, take: 500, range: ctx.range });
        all.push(...page.rows);
        cursor = page.nextCursor;
      } while (cursor && all.length < 20_000);
      csv = activityCsv(all);
      break;
    }
  }
  return { filename: `garageos-${kind}-${label}.csv`, csv } as const;
}
