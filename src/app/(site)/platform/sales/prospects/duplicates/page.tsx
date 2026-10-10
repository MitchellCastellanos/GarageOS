import Link from "next/link";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { listDuplicateReviews } from "@/lib/sales-crm/review-queries";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";
import { PLATFORM } from "@/lib/routes";
import { EmptyState, PageHeader, Pager, PermissionDenied } from "@/components/sales-crm/ui";
import { DuplicateReviewList } from "@/components/sales-crm/DuplicateReviewList";

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, t, locale } = await loadCrmPage("manage_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const L = leadCopy(locale), status = sp.status === "decided" ? "DECIDED" : "PENDING";
  const r = await listDuplicateReviews(actor, { status, page: Number(sp.page) || 1 });
  const href = (extra: string) => `${PLATFORM.salesDuplicates}?${extra}`;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={L.duplicates.title} subtitle={`${r.total}`} />
      <p className="text-sm text-slate-600">{L.duplicates.help}</p>
      <nav className="flex gap-2" aria-label={L.duplicates.title}>
        <Link href={href("status=pending")} aria-current={status === "PENDING" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${status === "PENDING" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white"}`}>{L.duplicates.pending}</Link>
        <Link href={href("status=decided")} aria-current={status === "DECIDED" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${status === "DECIDED" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white"}`}>{L.duplicates.decided}</Link>
      </nav>
      {r.rows.length === 0 ? <EmptyState title={L.duplicates.empty} /> : <DuplicateReviewList locale={locale} rows={r.rows.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), decidedAt: x.decidedAt?.toISOString() ?? null }))} />}
      <Pager page={r.page} pages={r.pages} hrefFor={(n) => href(`status=${status === "PENDING" ? "pending" : "decided"}&page=${n}`)} t={t} />
    </div>
  );
}
