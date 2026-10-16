"use client";

import Link from "next/link";
import { useState } from "react";
import { runGeocoding, runSourceLocationBackfillAction, saveGeocodingControls } from "@/actions/sales-geocoding";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { PLATFORM } from "@/lib/routes";
import type { GeocodingOverview, BatchResult } from "@/lib/sales-crm/geocoding-admin-service";
import type { BackfillReport, CoverageSummary } from "@/lib/sales-crm/source-location-service";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function GeocodingAdmin({ locale, overview, coverage }: { locale: "en" | "fr"; overview: GeocodingOverview; coverage: CoverageSummary }) {
  const f = fieldCopy(locale), c = f.geocodingAdmin;
  const { pending, error, notice, run } = useCrmAction(locale);
  const [enabled, setEnabled] = useState(overview.settings.enabled);
  const [max, setMax] = useState(String(overview.settings.maxRequests));
  const [includeErrors, setIncludeErrors] = useState(false);
  const [last, setLast] = useState<BatchResult | null>(null);
  const { settings, counts } = overview;
  const [src, setSrc] = useState<BackfillReport | null>(null);
  const sc = c.source;
  function preview() { run(() => runSourceLocationBackfillAction({ dryRun: true }), (r) => setSrc(r.report)); }
  function apply() {
    if (!window.confirm(sc.applyConfirm)) return;
    run(() => runSourceLocationBackfillAction({ dryRun: false, cursor: src && !src.dryRun ? src.nextCursor : null }), (r) => setSrc(r.report), sc.written);
  }
  const canRun = overview.provider.live && settings.enabled && settings.remaining > 0;

  function save() { run(() => saveGeocodingControls({ enabled, maxRequests: Number.parseInt(max, 10) }), undefined, c.saved); }
  function go(mode: "TEST" | "BATCH") {
    if (mode === "BATCH" && !window.confirm(c.confirmBatch)) return;
    run(() => runGeocoding({ mode, includeErrors }), (r) => setLast(r.result));
  }
  function retry(id: string) { run(() => runGeocoding({ mode: "RETRY", prospectIds: [id] }), (r) => setLast(r.result)); }

  const tiles: [string, number][] = [[c.eligible, counts.eligible], [c.ready, counts.ready], [c.toGeocode, counts.toGeocode], [c.review, counts.review], [c.incomplete, counts.incomplete], [c.errorRetry, counts.errorRetry]];
  return (
    <div className="space-y-5">
      <section className={cardCls} aria-labelledby="gp-h">
        <h2 id="gp-h" className="font-semibold text-slate-900">{c.providerTitle}</h2>
        <p role="note" className={`mt-2 rounded-lg px-3 py-2 text-sm ${overview.provider.live ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {f.geocoding[overview.provider.mode as "DISABLED"]} {f.geocoding[overview.provider.reason as "NO_PROVIDER_CONFIGURED"]}
        </p>
        <p className="mt-2 text-xs text-slate-500">{c.providerNote}</p>
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="gs-h">
        <h2 id="gs-h" className="font-semibold text-slate-900">{sc.title}</h2>
        <p className="text-xs text-slate-500">{sc.help}</p>
        <h3 className="text-sm font-medium text-slate-700">{sc.coverage}</h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["LOCATED", "PENDING", "AMBIGUOUS_FAILED", "INSUFFICIENT_ADDRESS"] as const).map((k) => <div key={k} className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{f.planner.coverage[k]}</dt><dd className="text-2xl font-semibold text-slate-900">{coverage.byCoverage[k]}</dd></div>)}
        </dl>
        <p className="text-sm text-slate-800"><strong>{sc.withPoint}:</strong> {coverage.withSourcePointNotLocated}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={preview} disabled={pending}>{pending ? sc.working : sc.preview}</button>
          <button type="button" className={btnPrimary} onClick={apply} disabled={pending || !src || !src.dryRun && src.done}>{pending ? sc.working : sc.apply}</button>
        </div>
        {src && (
          <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
            <strong>{sc.report}:</strong> {src.scanned} {sc.scanned} · {src.located} {sc.located}
            <span className="block text-xs text-slate-600">{src.dryRun ? sc.dry : src.done ? sc.done : sc.more}</span>
            {Object.keys(src.skipped).length > 0 && <ul className="mt-1 text-xs text-slate-600">{Object.entries(src.skipped).map(([k, v]) => <li key={k}>{sc.skipped[k] ?? k}: {v}</li>)}</ul>}
          </div>
        )}
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="gc-h">
        <h2 id="gc-h" className="font-semibold text-slate-900">{c.controls}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={pending} />{c.enabled}</label>
          <label className={labelCls}>{c.maxRequests}
            <input className={inputCls} type="number" inputMode="numeric" min={settings.requestsUsed} max={settings.hardCap} step={1} value={max} onChange={(e) => setMax(e.target.value)} disabled={pending} />
            <span className="text-xs font-normal text-slate-500">{c.maxHelp} {settings.hardCap}</span></label>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{c.used}</dt><dd className="text-2xl font-semibold text-slate-900">{settings.requestsUsed}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{c.remaining}</dt><dd className="text-2xl font-semibold text-slate-900">{settings.remaining}</dd></div>
        </dl>
        <button type="button" className={btnPrimary} onClick={save} disabled={pending}>{pending ? c.saving : c.saveControls}</button>
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="gv-h">
        <h2 id="gv-h" className="font-semibold text-slate-900">{c.previewTitle}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(([label, v]) => <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-2xl font-semibold text-slate-900">{v}</dd></div>)}
        </dl>
        <p className="text-sm text-slate-800"><strong>{c.estimated}:</strong> {overview.estimatedRequests}<span className="block text-xs text-slate-500">{c.estimatedNote}</span></p>
        {overview.samples.length > 0 ? (
          <div><h3 className="text-sm font-medium text-slate-700">{c.samples}</h3>
            <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">{overview.samples.map((s) => <li key={s.id} className="min-w-0 px-3 py-2"><span className="block break-words font-medium text-slate-900">{s.name}</span><span className="block break-words text-xs text-slate-500">{s.address}</span></li>)}</ul></div>
        ) : <p className="text-sm text-slate-600">{c.noneToDo}</p>}
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="gr-h">
        <h2 id="gr-h" className="font-semibold text-slate-900">{c.runTitle}</h2>
        {!overview.provider.live && <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{c.notLive}</p>}
        <p className="text-sm text-slate-600">{c.testFirst}</p>
        {counts.errorRetry > 0 && <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={includeErrors} onChange={(e) => setIncludeErrors(e.target.checked)} disabled={pending} />{c.includeErrors} ({counts.errorRetry})</label>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={() => go("TEST")} disabled={pending || !canRun || counts.toGeocode + (includeErrors ? counts.errorRetry : 0) === 0}>{pending ? c.running : c.testBatch}</button>
          <button type="button" className={btnPrimary} onClick={() => go("BATCH")} disabled={pending || !canRun || counts.toGeocode + (includeErrors ? counts.errorRetry : 0) === 0}>{pending ? c.running : c.fullBatch}</button>
        </div>
        <FormMessage error={error} notice={notice} />
        {last && (
          <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
            <strong>{c.result}:</strong> {last.attempted} {c.attempted} · {last.geocoded} {c.geocoded} · {last.needsReview} {c.needsReview} · {last.failed} {c.failed}
            {last.stoppedReason && <span className="mt-1 block font-medium text-amber-900">{c.stopped[last.stoppedReason]}</span>}
          </div>
        )}
      </section>

      <section className={`${cardCls} space-y-3`} aria-labelledby="grv-h">
        <h2 id="grv-h" className="font-semibold text-slate-900">{c.reviewTitle} <span className="text-sm font-normal text-slate-500">({overview.review.length}{overview.reviewTruncated ? "+" : ""})</span></h2>
        <p className="text-xs text-slate-500">{c.reviewHelp}</p>
        {overview.review.length === 0 ? <p className="text-sm text-slate-600">{c.noReview}</p> : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {overview.review.map((r) => (
              <li key={r.id} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <span className="block break-words text-sm font-medium text-slate-900">{r.name}</span>
                  <span className="block break-words text-xs text-slate-500">{r.address || "—"}</span>
                  <span className="mt-1 flex flex-wrap gap-1"><Badge tone="bg-amber-100 text-amber-900">{c.reasons[r.reason] ?? r.reason}</Badge>{r.attempts > 0 && <Badge>{r.attempts} {c.attempts}</Badge>}</span>
                </span>
                <Link className={btnSecondary} href={PLATFORM.salesProspect(r.id)}>{c.openProspect}</Link>
                {r.retryable && <button type="button" className={btnSecondary} onClick={() => retry(r.id)} disabled={pending || !canRun}>{c.retry}</button>}
              </li>
            ))}
          </ul>
        )}
        {overview.reviewTruncated && <p className="text-xs text-slate-500">{c.truncated}</p>}
      </section>
      <p className="text-xs text-slate-500">{c.mapboxTerms}</p>
    </div>
  );
}
