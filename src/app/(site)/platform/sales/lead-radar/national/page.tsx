import Link from "next/link";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/domain/lead-radar/geo";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import { PLATFORM } from "@/lib/routes";
import { c3Preflight, nationalReadiness } from "@/lib/lead-radar/national";
import { isProvinceCode } from "@/domain/lead-radar/geo";
import { fill } from "@/lib/admin-locale/lead-radar";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { isLive, readSettings } from "@/lib/lead-radar/settings";
import { Badge, cardCls, formatDate, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { emailReadinessFunnel } from "@/lib/sales-comms/contact-readiness";
import { LADDER } from "@/domain/lead-radar/contact-readiness";
import { RematchAllPanel } from "@/components/lead-radar/RematchAllPanel";
import { ImportScopePanel } from "@/components/lead-radar/ImportScopePanel";
import { ProvinceControls } from "@/components/lead-radar/ProvinceControls";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  READY: "bg-emerald-100 text-emerald-800", PROCESSING: "bg-blue-100 text-blue-800", EXTRACTING: "bg-blue-100 text-blue-800", QUEUED: "bg-blue-100 text-blue-800", RETRYING: "bg-amber-100 text-amber-900",
  NOT_STARTED: "bg-slate-100 text-slate-700", STOPPED_BY_GATE: "bg-red-100 text-red-800", EXTRACTION_FAILED: "bg-red-100 text-red-800",
};
const num = (v: number, l: string) => v.toLocaleString(l === "fr" ? "fr-CA" : "en-CA");
const rate = (v: number | null) => (v === null ? "—" : `${v} %`);

export default async function NationalReadinessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, access, locale, t } = await loadRadarPage("admin");
  if (!actor || !access) return <PermissionDenied t={t} />;
  const k = nationalCopy(locale).dash;
  const sp = await searchParams;
  const pfProvince = sp.preflight && isProvinceCode(sp.preflight) ? sp.preflight : null;
  const pf = pfProvince ? await c3Preflight(pfProvince) : null;
  const selected = pfProvince ?? "AB";
  const c3 = k.c3;
  const [d, settings, funnel] = await Promise.all([nationalReadiness(), readSettings(), emailReadinessFunnel()]);
  const live = isLive(settings);
  const at = (x: Date | null) => (x ? formatDate(x, locale) : k.k.never);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={PLATFORM.salesLeadRadar} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {k.back}</Link>
      <PageHeader title={k.title} subtitle={k.subtitle} />
      <section className={`${cardCls} grid gap-3 text-sm sm:grid-cols-3`} aria-label={k.totals}>
        <div><div className="text-xs text-slate-500">{k.k.lastAutomation}</div><div className="font-medium">{d.automation.lastExecution ? `${formatDate(d.automation.lastExecution.at, locale)} · ${d.automation.lastExecution.status}${d.automation.lastExecution.errorCode ? ` (${d.automation.lastExecution.errorCode})` : ""}` : k.k.never}</div></div>
        <div><div className="text-xs text-slate-500">{k.k.nextAutomation}</div><div className="font-medium">{d.automation.nextTick ? formatDate(d.automation.nextTick, locale) : k.k.automationOff}</div></div>
        <div><div className="text-xs text-slate-500">{k.k.nextWorker}</div><div className="font-medium">{formatDate(d.automation.nextWorkerCheck, locale)}</div></div>
      </section>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label={k.totals}>
        {([[k.k.staged, d.totals.staged], [k.k.verified, d.totals.verified], [k.k.review, d.totals.review], [k.k.excluded, d.totals.excluded], [k.k.duplicates, d.totals.duplicates], [k.k.prospects, d.totals.prospects],
          [k.k.assigned, d.totals.assigned], [k.k.eligibleUnassigned, d.totals.eligibleUnassigned], [k.k.withCoordinates, d.totals.withCoordinates], [k.k.missingCoordinates, d.totals.missingCoordinates], [k.k.deferred, d.totals.deferred], [k.k.errors, d.totals.importFailed]] as [string, number][]).map(([label, v]) => (
          <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-semibold text-slate-900">{num(v, locale)}</dd></div>
        ))}
      </dl>
      <ImportScopePanel locale={locale} initial={d.automation.importProvinces} />
      <RematchAllPanel locale={locale} />
      <section className={`${cardCls} space-y-3`} aria-labelledby="nat-c3">
        <h2 id="nat-c3" className="font-semibold text-slate-900">{c3.title}</h2>
        <p className="text-xs text-slate-600">{c3.help}</p>
        <form method="get" action={`${PLATFORM.salesLeadRadar}/national`} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-700">{c3.province}
            <select name="preflight" defaultValue={selected} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
              {PROVINCE_CODES.map((code) => <option key={code} value={code}>{PROVINCE_NAMES[code][locale]} ({code})</option>)}
            </select></label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-blue-700">{fill(c3.run, { province: selected })}</button>
        </form>
        {pf && (
          <div className="space-y-3 text-sm text-slate-700">
            <p className="text-xs text-slate-500">{fill(c3.generated, { at: formatDate(new Date(pf.generatedAt), locale), v: pf.registryVersion })}</p>
            <div><p className="font-semibold text-slate-900">{c3.poolTitle}</p>
              <p className="text-xs">{(Object.entries({ staged: pf.pool.staged, duplicates: pf.pool.duplicates, verified: pf.pool.verified, review: pf.pool.review, excluded: pf.pool.excluded, icpExcluded: pf.pool.icpExcluded, tombstones: pf.pool.activeTombstones, alreadyImported: pf.pool.verifiedAlreadyImported, crmInProvince: pf.pool.crmProspectsInProvince, lrInProvince: pf.pool.leadRadarProspectsInProvince }) as [keyof typeof c3.pool, number][]).map(([key, v]) => `${c3.pool[key]}: ${num(v, locale)}`).join(" · ")}</p></div>
            <div><p className="font-semibold text-slate-900">{c3.resultTitle}</p>
              <p>{c3.evaluated}: <strong>{num(pf.verifiedEvaluated, locale)}</strong> · {c3.importable}: <strong>{num(pf.importable, locale)}</strong> ({num(pf.newProspects, locale)} {c3.newProspects}; {num(pf.linksToExisting, locale)} {c3.links}) · {c3.readyNow}: <strong>{num(pf.readyNow.newProspects + pf.readyNow.links, locale)}</strong></p>
              <p className="mt-1 font-medium">{c3.blocked}: {num(Object.values(pf.blockers).reduce((a, b) => a + b, 0), locale)}</p>
              <ul className="list-disc pl-5 text-xs">{Object.entries(pf.blockers).sort((a, b) => b[1] - a[1]).map(([code, v]) => <li key={code}>{c3.blockers[code as keyof typeof c3.blockers] ?? code}: {num(v, locale)}</li>)}</ul></div>
            <div><p className="font-semibold text-slate-900">{c3.approvalsTitle}</p>
              <ul className="list-disc pl-5 text-xs">{(Object.entries(pf.approvals) as [keyof typeof c3.approvals, number][]).map(([code, v]) => <li key={code}>{c3.approvals[code]}: {num(v, locale)}</li>)}</ul></div>
            <div><p className="font-semibold text-slate-900">{c3.territoryTitle}</p>
              <p className="text-xs">{Object.entries(pf.territories).map(([key, v]) => `${key}: ${num(v, locale)}`).join(" · ")} · {c3.modes}: {Object.entries(pf.modes).map(([key, v]) => `${key} ${num(v, locale)}`).join(" · ")}</p></div>
            <div><p className="font-semibold text-slate-900">{c3.sellersTitle}</p>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="text-slate-500"><tr><th className="pr-2">{c3.sellerCols.name}</th><th className="pr-2">{c3.sellerCols.mode}</th><th className="pr-2">{c3.sellerCols.auto}</th><th className="pr-2">{c3.sellerCols.named}</th><th className="pr-2">{fill(c3.sellerCols.receives, { province: selected })}</th><th>{c3.sellerCols.cap}</th></tr></thead>
                <tbody>{pf.sellers.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="py-1 pr-2">{s.name ?? s.email} <span className="text-slate-500">({s.email}{s.superAdminLogin ? ` · ${c3.superAdmin}` : ""})</span></td><td className="pr-2">{s.mode}</td><td className="pr-2">{s.acceptsAuto ? c3.yes : c3.no}</td><td className="pr-2">{s.namedByAutomation ? c3.yes : c3.no}</td><td className="pr-2">{s.wouldReceiveRemoteProspect ? c3.yes : `${c3.no}${s.probeSkip ? ` (${s.probeSkip})` : ""}`}</td><td>{s.maxRemote ?? "—"}</td></tr>)}</tbody></table></div></div>
            <div><p className="font-semibold text-slate-900">{c3.automationTitle}</p>
              <p className="text-xs">policy: {pf.automation.policyVersion ?? c3.noPolicy} · automation enabled: {String(pf.automation.enabled)} · qualify: {String(pf.automation.qualifyEnabled)} · import: {String(pf.automation.importEnabled)} · assign: {String(pf.automation.assignEnabled)} · import provinces: {pf.automation.importProvinces.join(", ") || "all"} · chunk: {pf.automation.importChunkSize} · territory rule: {pf.territoryRule?.key ?? "—"}</p></div>
            <p className="text-xs text-slate-500">{c3.isolation}: {pf.isolation.writes}</p>
          </div>
        )}
      </section>
      <section className={`${cardCls} space-y-3`} aria-labelledby="nat-email">
        <h2 id="nat-email" className="font-semibold text-slate-900">{k.email.title}</h2>
        <p className="text-xs text-slate-600">{k.email.help}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">{k.email.province}</th>{LADDER.map((r) => <th key={r} className="pr-3 text-right">{k.email.rungs[r]}</th>)}<th className="text-right">{k.email.pending}</th></tr></thead>
            <tbody>
              {funnel.rows.map((r) => <tr key={r.province} className="border-t border-slate-100"><td className="py-2 pr-3">{r.province}</td>{LADDER.map((g) => <td key={g} className="pr-3 text-right tabular-nums">{num(r.counts[g], locale)}</td>)}<td className="text-right tabular-nums">{num(r.pendingReview, locale)}</td></tr>)}
              <tr className="border-t border-slate-300 font-semibold"><td className="py-2 pr-3">{k.email.total}</td>{LADDER.map((g) => <td key={g} className="pr-3 text-right tabular-nums">{num(funnel.total[g], locale)}</td>)}<td className="text-right tabular-nums">{num(funnel.pendingReview, locale)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.rows.map((r) => (
          <section key={r.province} className={`${cardCls} space-y-3`} aria-labelledby={`nat-${r.province}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`nat-${r.province}`} className="font-semibold text-slate-900">{PROVINCE_NAMES[r.province][locale]} ({r.province})</h3>
              <Badge tone={TONE[r.stage]}>{k.stages[r.stage]}</Badge>
            </div>
            <div className="text-sm text-slate-700">
              <p>{k.k.lastSuccess}: <strong>{at(r.lastSuccessAt)}</strong> · {k.k.release}: <strong>{r.release ?? "—"}</strong></p>
              <p>{k.k.raw}: <strong>{r.raw.attributable && r.raw.records !== null ? num(r.raw.records, locale) : k.k.rawShared}</strong></p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3" aria-label={k.sections.candidates}>
              <Cell l={k.k.staged} v={r.candidates.staged} lc={locale} /><Cell l={k.k.verified} v={r.candidates.verified} lc={locale} /><Cell l={k.k.review} v={r.candidates.review} lc={locale} />
              <Cell l={k.k.excluded} v={r.candidates.excluded} lc={locale} /><Cell l={k.k.duplicates} v={r.candidates.duplicates} lc={locale} /><Cell l={k.k.unclassified} v={r.candidates.unclassified} lc={locale} />
            </dl>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3" aria-label={k.sections.crm}>
              <Cell l={k.k.prospects} v={r.crm.prospects} lc={locale} /><Cell l={k.k.eligibleUnassigned} v={r.crm.eligibleUnassigned} lc={locale} /><Cell l={k.k.assigned} v={r.crm.assigned} lc={locale} />
              <Cell l={k.k.withCoordinates} v={r.crm.withCoordinates} lc={locale} /><Cell l={k.k.missingCoordinates} v={r.crm.missingCoordinates} lc={locale} />
            </dl>
            <p className="text-xs text-slate-600">{k.k.rates}: {k.k.rawToStaged} {rate(r.rates.rawToStaged)} · {k.k.stagedToVerified} {rate(r.rates.stagedToVerified)} · {k.k.verifiedToProspects} {rate(r.rates.verifiedToProspects)} · {k.k.prospectsWithCoordinates} {rate(r.rates.prospectsWithCoordinates)}</p>
            <div className="space-y-1 text-sm">
              <p>{k.k.errors}: <strong>{r.errors.importFailed}</strong>{r.errors.lastRunFailure && <> · {k.k.lastRunFailure}: <strong className="text-red-800">{r.errors.lastRunFailure}</strong>{r.errors.lastRunId && <> (<Link className="text-blue-700 underline" href={PLATFORM.salesLeadRadarRun(r.errors.lastRunId)}>→</Link>)</>}</>}</p>
              <p>{k.k.deferred}: <strong>{r.deferred.total}</strong>{r.deferred.total > 0 && <span className="text-xs text-slate-600"> ({r.deferred.awaitingQualification} {k.k.awaitingQualification} · {r.deferred.approvedNotImported} {k.k.approvedNotImported} · {r.deferred.inUnfinishedRun} {k.k.inUnfinishedRun})</span>}</p>
              <p>{k.k.nextRefresh}: <strong>{r.schedule.nextRefreshNotBefore ? formatDate(r.schedule.nextRefreshNotBefore, locale) : k.k.off}</strong></p>
            </div>
            {r.actions.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{r.actions.map((a) => <li key={a}>{k.actions[a]}</li>)}</ul> : r.stage !== "NOT_STARTED" ? <p className="text-sm text-emerald-800">{k.k.noActions}</p> : null}
            <ProvinceControls locale={locale} province={r.province} autoRefresh={r.schedule.autoRefresh} paused={r.schedule.paused} intervalDays={r.schedule.refreshIntervalDays} busy={!!r.activeRun} live={live} />
          </section>
        ))}
      </div>
    </div>
  );
}

function Cell({ l, v, lc }: { l: string; v: number; lc: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{l}</dt><dd className="font-semibold tabular-nums">{num(v, lc)}</dd></div>;
}
