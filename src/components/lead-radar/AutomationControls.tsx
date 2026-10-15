"use client";

import { useState } from "react";
import { runLeadAutomationNow, saveLeadAutomation, setLeadAutomationEnabled, setLeadPilotEnabled } from "@/actions/lead-radar-automation";
import { btnDanger, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

export interface AutomationView {
  enabled: boolean; pausedReason: string | null; qualifyEnabled: boolean; importEnabled: boolean; assignEnabled: boolean; eligibilityEnabled: boolean; releaseUnavailable: boolean;
  assignStaffIds: string[]; importChunkSize: number; pilotEnabled: boolean; pilotSequenceId: string | null; pilotDailyCap: number; pilotTotalCap: number;
}

export function AutomationControls({ locale, automation, sellers, sequences }: { locale: "en" | "fr"; automation: AutomationView; sellers: { id: string; name: string; mode: string }[]; sequences: { id: string; name: string }[] }) {
  const { c, pending, error, notice, run } = useRadarAction(locale);
  const k = c.automation.controls;
  const [stages, setStages] = useState({ qualifyEnabled: automation.qualifyEnabled, importEnabled: automation.importEnabled, assignEnabled: automation.assignEnabled, eligibilityEnabled: automation.eligibilityEnabled, releaseUnavailable: automation.releaseUnavailable });
  const [staff, setStaff] = useState<string[]>(automation.assignStaffIds);
  const [chunk, setChunk] = useState(String(automation.importChunkSize));
  const [seq, setSeq] = useState(automation.pilotSequenceId ?? "");
  const [daily, setDaily] = useState(String(automation.pilotDailyCap));
  const [total, setTotal] = useState(String(automation.pilotTotalCap));
  const [reason, setReason] = useState("");
  const toggle = (id: string) => setStaff((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const save = () => run(() => saveLeadAutomation({ ...stages, assignStaffIds: staff, importChunkSize: Number(chunk), pilotSequenceId: seq || null, pilotDailyCap: Number(daily), pilotTotalCap: Number(total) }), undefined, k.saved);
  const stageRows: [keyof typeof stages, string][] = [["qualifyEnabled", k.qualify], ["importEnabled", k.import], ["assignEnabled", k.assign], ["eligibilityEnabled", k.eligibility], ["releaseUnavailable", k.release]];

  return (
    <section className={`${cardCls} space-y-4`} aria-labelledby="au-ctl">
      <h2 id="au-ctl" className="font-semibold text-slate-900">{k.title}</h2>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">{k.master}</h3>
        <div className="flex flex-wrap items-end gap-2">
          {automation.enabled ? (
            <>
              <label className={`${labelCls} sm:max-w-xs`}>{k.pauseReason}<input className={inputCls} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={pending} /></label>
              <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => setLeadAutomationEnabled(false, reason))}>{k.pause}</button>
            </>
          ) : <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => setLeadAutomationEnabled(true))}>{k.turnOn}</button>}
          <button type="button" className={btnSecondary} disabled={pending || !automation.enabled} onClick={() => run(() => runLeadAutomationNow(), undefined, k.ran)}>{pending ? k.running : k.runNow}</button>
        </div>
      </div>

      <fieldset className="space-y-1" disabled={pending}>
        <legend className="text-sm font-medium text-slate-700">{k.stages}</legend>
        {stageRows.map(([key, label]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={stages[key]} onChange={(e) => setStages((s) => ({ ...s, [key]: e.target.checked }))} />{label}</label>
        ))}
        <label className={`${labelCls} sm:max-w-xs`}>{k.chunk}<input className={inputCls} inputMode="numeric" value={chunk} onChange={(e) => setChunk(e.target.value)} /></label>
      </fieldset>

      <fieldset className="space-y-1" disabled={pending}>
        <legend className="text-sm font-medium text-slate-700">{k.sellers}</legend>
        <p className="text-xs text-slate-500">{k.sellersHelp}</p>
        {sellers.map((s) => (
          <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={staff.includes(s.id)} onChange={() => toggle(s.id)} />{s.name} <span className="text-xs text-slate-500">({s.mode})</span></label>
        ))}
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3" disabled={pending}>
        <legend className="px-1 text-sm font-medium text-slate-700">{k.pilotTitle}</legend>
        <p className="text-xs text-slate-500">{k.pilotHelp}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>{k.sequence}
            <select className={inputCls} value={seq} onChange={(e) => setSeq(e.target.value)}><option value="">{k.noSequence}</option>{sequences.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
          <label className={labelCls}>{k.daily}<input className={inputCls} inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value)} /></label>
          <label className={labelCls}>{k.total}<input className={inputCls} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">{k.pilotState}: <strong>{automation.pilotEnabled ? c.automation.status.on : c.automation.status.off}</strong></span>
          <button type="button" className={automation.pilotEnabled ? btnDanger : btnSecondary} onClick={() => run(() => setLeadPilotEnabled(!automation.pilotEnabled))}>{automation.pilotEnabled ? k.pilotOff : k.pilotOn}</button>
        </div>
      </fieldset>

      <FormMessage error={error} notice={notice} />
      <button type="button" className={btnPrimary} disabled={pending} onClick={save}>{pending ? k.saving : k.save}</button>
    </section>
  );
}
