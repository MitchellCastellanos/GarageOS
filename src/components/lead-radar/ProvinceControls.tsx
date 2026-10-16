"use client";

import { useState } from "react";
import { queueDiscoveryRunForWorker, saveProvinceSchedule } from "@/actions/lead-radar";
import { PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { btnPrimary, btnSecondary } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import { fill } from "@/lib/admin-locale/lead-radar";

/** Owner-only controls for one province: queue a real extraction on the worker, opt in/out of the automatic refresh, pause. Nothing here imports, assigns or sends. */
export function ProvinceControls({ locale, province, autoRefresh, paused, intervalDays, busy, live }: { locale: "en" | "fr"; province: ProvinceCode; autoRefresh: boolean; paused: boolean; intervalDays: number; busy: boolean; live: boolean }) {
  const { error, notice, pending, run, setNotice } = useRadarAction(locale);
  const k = nationalCopy(locale).dash.controls;
  const [auto, setAuto] = useState(autoRefresh), [pause, setPause] = useState(paused), [days, setDays] = useState(String(intervalDays));
  const name = PROVINCE_NAMES[province][locale];
  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <h4 className="text-sm font-medium text-slate-800">{k.title}</h4>
      <p className="text-xs text-slate-500">{k.workerNote}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnSecondary} disabled={pending || busy || !live || pause}
          onClick={() => { if (window.confirm(fill(k.queueConfirm, { province: name }))) run(() => queueDiscoveryRunForWorker({ scope: { provinces: [province], groups: ["REPAIR", "BODY_GLASS"] }, release: "latest" }), undefined, k.queued); }}>{k.queue}</button>
      </div>
      <div className="grid gap-2 text-sm text-slate-700">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={auto} onChange={(e) => { setAuto(e.target.checked); setNotice(null); }} />{k.auto}</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={pause} onChange={(e) => { setPause(e.target.checked); setNotice(null); }} />{k.paused}</label>
        <label className="grid gap-1">{k.interval}<input inputMode="numeric" className="min-h-11 w-28 rounded-lg border border-slate-300 px-3" value={days} onChange={(e) => setDays(e.target.value)} /></label>
      </div>
      <FormMessage error={error} notice={notice} />
      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => saveProvinceSchedule({ province, autoRefresh: auto, paused: pause, refreshIntervalDays: Number(days) }), undefined, k.saved)}>{k.save}</button>
    </div>
  );
}
