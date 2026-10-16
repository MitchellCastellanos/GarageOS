import Link from "next/link";
import { notFound } from "next/navigation";
import { PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { Badge, cardCls, formatDate, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { pointsCopy } from "@/lib/admin-locale/lead-radar-points";
import { RunControls } from "@/components/lead-radar/RunControls";
import { RunQualityPanel } from "@/components/lead-radar/RunQualityPanel";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import type { RunQuality } from "@/domain/lead-radar/run-quality";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, locale, t, c } = await loadRadarPage("admin");
  if (!actor) return <PermissionDenied t={t} />;
  const { id } = await params;
  const r = await db.crmDiscoveryRun.findUnique({ where: { id } });
  if (!r) notFound();
  const scope = r.scope as { provinces: ProvinceCode[]; cities: string[]; groups: string[]; minConfidence: number };
  const k = c.runs;
  const pc = pointsCopy(locale);
  const diag = (r.diagnostics as { code: string; count: number }[]) ?? [];
  const pct = r.expectedRecords ? Math.min(100, Math.round((100 * r.receivedRecords) / r.expectedRecords)) : 0;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={PLATFORM.salesLeadRadar} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {k.back}</Link>
      <PageHeader title={`${k.title} — ${r.sourceRelease}`} subtitle={`${scope.provinces.map((p) => PROVINCE_NAMES[p]?.[locale] ?? p).join(", ")}`} />
      <section className={`${cardCls} space-y-2`}>
        <div className="flex flex-wrap items-center gap-2"><Badge tone={r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : r.status === "CANCELLED" || r.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>{k.states[r.status]}</Badge><span className="text-sm text-slate-600">{formatDate(r.createdAt, locale, true)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <div><dt className="text-xs text-slate-500">{k.received}</dt><dd className="text-lg font-semibold">{r.receivedRecords}{r.expectedRecords ? ` / ${r.expectedRecords}` : ""}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.staged}</dt><dd className="text-lg font-semibold">{r.stagedNew}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.rejected}</dt><dd className="text-lg font-semibold">{r.rejectedRecords}</dd></div>
          <div><dt className="text-xs text-slate-500">{k.release}</dt><dd className="text-lg font-semibold">{r.sourceRelease}</dd></div>
        </dl>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" aria-label={pc.run.title}>
          <div><dt className="text-xs text-slate-500">{pc.run.withPoint}</dt><dd className="text-lg font-semibold">{r.recordsWithPoint}</dd></div>
          <div><dt className="text-xs text-slate-500">{pc.run.accepted}</dt><dd className="text-lg font-semibold">{r.pointsAccepted}</dd></div>
          <div><dt className="text-xs text-slate-500">{pc.run.onNew}</dt><dd className="text-lg font-semibold">{r.pointsOnNew}</dd></div>
          <div><dt className="text-xs text-slate-500">{pc.run.onExisting}</dt><dd className="text-lg font-semibold">{r.pointsOnExisting}</dd></div>
        </dl>
        {r.status === "COMPLETED" && r.receivedRecords > 0 && r.recordsWithPoint === 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{pc.run.verdict.NO_POINTS_IN_FILE}</p>
        )}
        {diag.length > 0 && (<div><h3 className="text-sm font-medium text-slate-700">{k.errors}</h3><ul className="text-sm text-slate-700">{diag.map((d) => <li key={d.code} className="flex justify-between border-t border-slate-100 py-1"><span>{(k.diag[d.code] ?? nationalCopy(locale).diag[d.code]) ?? d.code}</span><span className="tabular-nums">{d.count}</span></li>)}</ul></div>)}
      </section>
      <RunQualityPanel locale={locale} runId={r.id} status={r.status} quality={r.qualityDetail as unknown as RunQuality | null} ackNote={r.qualityAckNote} />
      <RunControls locale={locale} run={{ id: r.id, status: r.status, lastChunkSeq: r.lastChunkSeq, expected: r.expectedRecords, received: r.receivedRecords, hasManifest: !!r.manifest }} />
    </div>
  );
}
