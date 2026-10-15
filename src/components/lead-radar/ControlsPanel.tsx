"use client";

import Link from "next/link";
import { useState } from "react";
import { createDiscoveryRun, previewDiscoveryWorkload } from "@/actions/lead-radar";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/domain/lead-radar/geo";
import { CATEGORY_GROUPS } from "@/domain/lead-radar/taxonomy";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

export function ControlsPanel({ locale, live }: { locale: "en" | "fr"; live: boolean }) {
  const { c, pending, error, notice, run } = useRadarAction(locale);
  const k = c.controls;
  const [provinces, setProvinces] = useState<string[]>(["QC"]);
  const [groups, setGroups] = useState<string[]>(["REPAIR", "BODY_GLASS"]);
  const [cities, setCities] = useState("");
  const [release, setRelease] = useState("latest");
  const [minConfidence, setMin] = useState("0");
  const [ack, setAck] = useState(false);
  const [work, setWork] = useState<{ rowGroups: number; megabytes: number; nationwide: boolean; requiresAcknowledgement: boolean } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const scope = () => ({ provinces, groups, cities: cities.split(",").map((s) => s.trim()).filter(Boolean), minConfidence: Math.min(1, Math.max(0, Number(minConfidence) || 0)) });

  return (
    <section className={`${cardCls} space-y-4`} aria-labelledby="lr-ctl">
      <h2 id="lr-ctl" className="font-semibold text-slate-900">{k.title}</h2>
      <p className="text-sm text-slate-600">{k.howTo}</p>
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium text-slate-700">{k.provinces}</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
          {PROVINCE_CODES.map((p) => (
            <label key={p} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-5" checked={provinces.includes(p)} onChange={() => { setProvinces((l) => toggle(l, p)); setWork(null); }} />{PROVINCE_NAMES[p][locale]} ({p})
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium text-slate-700">{k.categories}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {CATEGORY_GROUPS.map((g) => (
            <label key={g} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-5" checked={groups.includes(g)} onChange={() => { setGroups((l) => toggle(l, g)); setWork(null); }} />{k.groups[g]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>{k.cities}<input className={inputCls} value={cities} onChange={(e) => setCities(e.target.value)} disabled={pending} maxLength={600} /><span className="text-xs font-normal text-slate-500">{k.citiesHelp}</span></label>
        <label className={labelCls}>{k.release}<input className={inputCls} value={release} onChange={(e) => setRelease(e.target.value)} disabled={pending} maxLength={20} /><span className="text-xs font-normal text-slate-500">{k.releaseHelp}</span></label>
        <label className={labelCls}>{k.minConfidence}<input className={inputCls} type="number" step="0.05" min={0} max={1} value={minConfidence} onChange={(e) => setMin(e.target.value)} disabled={pending} /></label>
      </div>
      {work && (
        <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-medium">{k.workload}</p>
          <p>{k.rowGroups}: {work.rowGroups} · {k.megabytes}: ≤ {work.megabytes} {k.mb}</p>
          <p className="text-xs text-slate-600">{k.cost}</p>
          {work.requiresAcknowledgement && (
            <label className="mt-2 flex items-start gap-2 text-amber-900"><input type="checkbox" className="mt-0.5 size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span><strong>{k.large}</strong> {k.acknowledge}</span></label>
          )}
        </div>
      )}
      <FormMessage error={error} notice={notice} />
      {created && <p className="text-sm"><Link className="text-blue-700 underline" href={PLATFORM.salesLeadRadarRun(created)}>{c.runs.open} →</Link></p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={pending || !provinces.length || !groups.length}
          onClick={() => run(() => previewDiscoveryWorkload(scope()), (r) => setWork(r.work))}>{pending ? k.previewing : k.preview}</button>
        <button type="button" className={btnPrimary} disabled={pending || !live || !work || (work.requiresAcknowledgement && !ack)}
          onClick={() => run(() => createDiscoveryRun({ scope: scope(), release: release.trim() || "latest", acknowledgeLargeScope: ack }), (r) => setCreated(r.runId), k.created)}>{pending ? k.creating : k.create}</button>
      </div>
    </section>
  );
}
