import Link from "next/link";
import { cleanupCopy } from "@/lib/admin-locale/lead-radar-cleanup";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import { PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { formatCad } from "@/domain/lead-radar/budget";
import { PLATFORM } from "@/lib/routes";
import { budgetOverview } from "@/lib/lead-radar/budget";
import { leadRadarOverview } from "@/lib/lead-radar/overview";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { isLive, liveEnvironmentEnabled, readSettings } from "@/lib/lead-radar/settings";
import { Badge, btnPrimary, btnSecondary, cardCls, formatDate, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { ControlsPanel } from "@/components/lead-radar/ControlsPanel";
import { ReleaseButton } from "@/components/lead-radar/ReleaseButton";
import { SettingsPanel } from "@/components/lead-radar/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function LeadRadarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, access, locale, t, c } = await loadRadarPage("review");
  if (!actor || !access) return <PermissionDenied t={t} />;
  const sp = await searchParams;
  const [o, settings] = await Promise.all([leadRadarOverview(actor, { province: sp.province }), readSettings()]);
  const live = isLive(settings);
  const budget = access.admin ? await budgetOverview() : null;
  const tiles: [string, number][] = [
    [c.tiles.total, o.counts.total], [c.tiles.newProspects, o.counts.newProspects], [c.tiles.existing, o.counts.existingMatches], [c.tiles.ambiguous, o.counts.ambiguous],
    [c.tiles.pending, o.counts.pendingReview], [c.tiles.approved, o.counts.approved], [c.tiles.rejected, o.counts.rejected],
    [c.tiles.imported, o.counts.created + o.counts.linked + o.counts.sentToReview], [c.tiles.importedUnassigned, o.counts.importedUnassigned], [c.tiles.failed, o.counts.failed],
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={c.title} subtitle={c.subtitle} actions={<><Link className={btnPrimary} href={PLATFORM.salesLeadRadarCandidates}>{c.candidates.title}</Link>{access.admin && <Link className={btnSecondary} href={PLATFORM.salesLeadRadarNational}>{nationalCopy(locale).dash.nav}</Link>}{access.admin && <Link className={btnSecondary} href={PLATFORM.salesLeadRadarAutomation}>{c.automation.nav}</Link>}{access.review && <Link className={btnSecondary} href={PLATFORM.salesLeadRadarCleanup}>{cleanupCopy(locale).nav}</Link>}</>} />

      <p role="status" className={`rounded-lg px-3 py-2 text-sm ${live ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        <strong>{live ? c.status.live : c.status.disabled}.</strong> {live ? "" : c.status.disabledHelp}
        {!live && access.admin && <span className="block text-xs">{!liveEnvironmentEnabled() ? c.status.envMissing : ""} {!settings.enabled ? c.status.dbOff : ""}</span>}
      </p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={c.tiles.total}>
        {tiles.map(([label, v]) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-2xl font-semibold text-slate-900">{v.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</dd></div>)}
      </dl>

      <section className={`${cardCls} space-y-2`} aria-labelledby="lr-src">
        <h2 id="lr-src" className="font-semibold text-slate-900">{c.source.title}</h2>
        <p className="text-sm text-slate-700">{c.source.name} · {c.source.release}: <strong>{o.lastExtraction?.sourceRelease ?? "—"}</strong> · {c.source.lastExtraction}: <strong>{o.lastExtraction?.finishedAt ? formatDate(o.lastExtraction.finishedAt, locale) : c.source.never}</strong></p>
        <p className="text-xs text-slate-500">{c.source.licenseNote} {c.compliance.attribution}</p>
        <p className="text-xs text-slate-500">{c.compliance.casl}</p>
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="lr-cov">
        <h2 id="lr-cov" className="font-semibold text-slate-900">{c.coverage.title}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">{c.coverage.province}</th><th className="pr-3 text-right">{c.coverage.total}</th><th className="pr-3 text-right">{c.coverage.primary}</th><th className="pr-3 text-right">{c.coverage.pending}</th><th className="pr-3 text-right">{c.coverage.approved}</th><th className="pr-3 text-right">{c.coverage.imported}</th><th className="pr-3">{c.coverage.lastSeen}</th><th>{c.coverage.gap}</th></tr></thead>
            <tbody>
              {o.provinces.map((p) => (
                <tr key={p.province} className="border-t border-slate-100">
                  <td className="py-2 pr-3"><Link className="text-blue-700 underline" href={`${PLATFORM.salesLeadRadar}?province=${p.province}`}>{PROVINCE_NAMES[p.province as ProvinceCode][locale]}</Link></td>
                  <td className="pr-3 text-right tabular-nums">{p.total}</td><td className="pr-3 text-right tabular-nums">{p.primary}</td><td className="pr-3 text-right tabular-nums">{p.pending}</td><td className="pr-3 text-right tabular-nums">{p.approved}</td><td className="pr-3 text-right tabular-nums">{p.imported}</td>
                  <td className="pr-3">{p.lastSeen ? formatDate(p.lastSeen, locale) : "—"}</td>
                  <td>{p.gap === "NEVER" ? <Badge tone="bg-amber-100 text-amber-900">{c.coverage.gapNever}</Badge> : p.gap === "STALE" ? <Badge tone="bg-amber-100 text-amber-900">{c.coverage.gapStale}</Badge> : <Badge tone="bg-emerald-50 text-emerald-800">{c.coverage.ok}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h3 className="text-sm font-medium text-slate-700">{c.coverage.cityTitle}{o.province ? ` — ${o.province}` : ""} {o.province && <Link className="text-xs text-blue-700 underline" href={PLATFORM.salesLeadRadar}>{c.coverage.allProvinces}</Link>}</h3>
            <ul className="mt-1 text-sm text-slate-700">{o.cities.map((x) => <li key={x.city} className="flex justify-between border-t border-slate-100 py-1"><span>{x.city}</span><span className="tabular-nums">{x.count}</span></li>)}</ul></div>
          <div><h3 className="text-sm font-medium text-slate-700">{c.coverage.territoryTitle}</h3>
            <ul className="mt-1 text-sm text-slate-700">{o.territories.map((x) => <li key={x.key} className="flex justify-between border-t border-slate-100 py-1"><span>{x.key}</span><span className="tabular-nums">{x.count}</span></li>)}</ul></div>
        </div>
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="lr-hand">
        <h2 id="lr-hand" className="font-semibold text-slate-900">{c.handoff.title}</h2>
        <p className="text-sm text-slate-600">{c.handoff.help}</p>
        <div className="flex flex-wrap gap-2"><Link className={btnPrimary} href={PLATFORM.salesAssignment}>{c.handoff.assign}</Link><Link className={btnSecondary} href={PLATFORM.salesProspects}>{c.handoff.prospects}</Link><Link className={btnSecondary} href={PLATFORM.salesField}>{c.handoff.field}</Link></div>
        {o.handoff.length === 0 ? <p className="text-sm text-slate-500">{c.handoff.empty}</p> : o.handoff.map((h) => (
          <div key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-medium">{c.handoff.batch} · {formatDate(h.completedAt, locale, true)}</p>
            <p className="text-slate-700">{c.handoff.created}: {h.created} · {c.handoff.linked}: {h.linked} · {c.handoff.review}: {h.review} · {c.handoff.skipped}: {h.skipped} · <strong>{c.handoff.unassigned}: {h.unassigned}</strong></p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{h.sample.map((p) => <li key={p.id}><Link className="text-blue-700 underline" href={PLATFORM.salesProspect(p.id)}>{p.name}</Link><span className="text-xs text-slate-500"> · {p.city ?? "—"} · {p.territoryKey ?? p.territoryState ?? "—"}{p.assignedStaffId ? "" : ` · ${c.handoff.unassigned}`}</span></li>)}</ul>
          </div>
        ))}
      </section>

      {access.admin && <ControlsPanel locale={locale} live={live} />}

      <section className={`${cardCls} space-y-2`} aria-labelledby="lr-runs">
        <h2 id="lr-runs" className="font-semibold text-slate-900">{c.runs.title}</h2>
        {o.runs.length === 0 ? <p className="text-sm text-slate-500">{c.runs.empty}</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {o.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <Badge tone={r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : r.status === "CANCELLED" || r.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>{c.runs.states[r.status]}</Badge>
                <span>{r.release}</span><span className="text-slate-600">{r.scope.provinces.join(", ")}</span>
                <span className="tabular-nums">{r.received}{r.expected ? ` / ${r.expected}` : ""}</span><span className="text-xs text-slate-500">{formatDate(r.createdAt, locale)}</span>
                {r.diagnostics.length > 0 && <span className="text-xs text-amber-800">{r.diagnostics.slice(0, 3).map((d) => `${c.runs.diag[d.code] ?? d.code}: ${d.count}`).join(" · ")}</span>}
                {access.admin && <Link className="ml-auto text-blue-700 underline" href={PLATFORM.salesLeadRadarRun(r.id)}>{c.runs.open}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {budget && (
        <section className={`${cardCls} space-y-3`} aria-labelledby="lr-bud">
          <h2 id="lr-bud" className="font-semibold text-slate-900">{c.budget.title} — {budget.month}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([[c.budget.limit, budget.limitMicroCad], [c.budget.reserved, budget.reservedMicroCad], [c.budget.spent, budget.settledMicroCad], [c.budget.remaining, budget.remainingMicroCad]] as [string, number][]).map(([l, v]) => (
              <div key={l} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-xl font-semibold text-slate-900">CAD {formatCad(v)}</dd></div>))}
          </dl>
          {budget.byProvider.length === 0 ? <p className="text-sm text-slate-500">{c.budget.none}</p> : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><h3 className="text-sm font-medium">{c.budget.byProvider}</h3><ul className="text-sm">{budget.byProvider.map((p) => <li key={p.provider} className="flex justify-between border-t border-slate-100 py-1"><span>{p.provider}</span><span>CAD {formatCad(p.micro)}</span></li>)}</ul></div>
              <div><h3 className="text-sm font-medium">{c.budget.byRun}</h3><ul className="text-sm">{budget.byRun.map((p) => <li key={p.runId} className="flex justify-between border-t border-slate-100 py-1"><span className="truncate">{p.runId}</span><span>CAD {formatCad(p.micro)}</span></li>)}</ul></div>
            </div>
          )}
          {budget.open.length > 0 && (<div><h3 className="text-sm font-medium">{c.budget.open}</h3><ul className="text-sm">{budget.open.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1"><span>{r.provider} · {r.description}</span><span className="flex items-center gap-2">CAD {formatCad(r.estimatedMicroCad)} <ReleaseButton locale={locale} ledgerId={r.id} /></span></li>)}</ul></div>)}
          {budget.history.length > 0 && <p className="text-xs text-slate-500">{c.budget.history}: {budget.history.map((h) => `${h.month} CAD ${formatCad(h.micro)}`).join(" · ")}</p>}
          <p className="text-xs text-slate-500">{c.budget.enforced}</p>
        </section>
      )}

      {access.admin && <SettingsPanel locale={locale} settings={{ enabled: settings.enabled, monthlyBudgetCad: settings.monthlyBudgetMicroCad / 1_000_000, usdToCadRate: settings.usdToCadMilli / 1000, managersCanReview: settings.managersCanReview }} />}
    </div>
  );
}
