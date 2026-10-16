import "server-only";
import type { Prisma } from "@prisma/client";
import { buildComparison, renderComparisonMarkdown, type CompareOptions, type CompareRow, type ComparisonReport } from "@/domain/lead-radar/policy-compare";
import type { PolicyRules } from "@/domain/lead-radar/policy-rules";
import { db } from "@/lib/db";
import { FACT_SELECT, factsOf, poolWhere, PREVIEW_PAGE } from "@/lib/lead-radar/policy";

// READ-ONLY by construction: this module only calls findMany. It writes nothing (not even an audit row) — a comparison is analysis, not a decision.
const SELECT = { ...FACT_SELECT, city: true, sourceConfidence: true } satisfies Prisma.CrmDiscoveryCandidateSelect;
export const COMPARE_MAX_ROWS = 60_000;

export async function compareRulesOnPool(a: PolicyRules, b: PolicyRules, opts: CompareOptions & { deadline?: number; maxRows?: number } = {}): Promise<{ report: ComparisonReport; truncated: boolean }> {
  const rows: CompareRow[] = [];
  let cursor: string | null = null, truncated = false;
  for (;;) {
    const page: Prisma.CrmDiscoveryCandidateGetPayload<{ select: typeof SELECT }>[] = await db.crmDiscoveryCandidate.findMany({ where: { AND: [poolWhere, cursor ? { id: { gt: cursor } } : {}] }, orderBy: { id: "asc" }, take: PREVIEW_PAGE, select: SELECT });
    for (const r of page) rows.push({ ...factsOf(r), city: r.city, sourceConfidence: r.sourceConfidence });
    if (page.length < PREVIEW_PAGE) break;
    cursor = page[page.length - 1].id;
    if (rows.length >= (opts.maxRows ?? COMPARE_MAX_ROWS) || (opts.deadline && Date.now() > opts.deadline)) { truncated = true; break; }
  }
  return { report: buildComparison(rows, a, b, opts), truncated };
}
export { renderComparisonMarkdown };
