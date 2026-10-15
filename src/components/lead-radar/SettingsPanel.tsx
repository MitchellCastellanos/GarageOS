"use client";

import { useState } from "react";
import { saveLeadRadarSettings } from "@/actions/lead-radar";
import { btnPrimary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

export function SettingsPanel({ locale, settings }: { locale: "en" | "fr"; settings: { enabled: boolean; monthlyBudgetCad: number; usdToCadRate: number; managersCanReview: boolean } }) {
  const { c, pending, error, notice, run } = useRadarAction(locale);
  const s = c.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [managers, setManagers] = useState(settings.managersCanReview);
  const [budget, setBudget] = useState(settings.monthlyBudgetCad.toFixed(2));
  const [fx, setFx] = useState(settings.usdToCadRate.toFixed(3));
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="lr-set">
      <h2 id="lr-set" className="font-semibold text-slate-900">{s.title}</h2>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={pending} />{s.enabled}</label>
      <label className="flex min-h-11 items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 size-5" checked={managers} onChange={(e) => setManagers(e.target.checked)} disabled={pending} /><span>{s.managers}<span className="block text-xs text-slate-500">{s.managersHelp}</span></span></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>{s.budget}<input className={inputCls} type="number" step="0.01" min={0} max={25} value={budget} onChange={(e) => setBudget(e.target.value)} disabled={pending} /><span className="text-xs font-normal text-slate-500">{s.budgetHelp}</span></label>
        <label className={labelCls}>{s.fx}<input className={inputCls} type="number" step="0.001" min={1} max={3} value={fx} onChange={(e) => setFx(e.target.value)} disabled={pending} /><span className="text-xs font-normal text-slate-500">{s.fxHelp}</span></label>
      </div>
      <FormMessage error={error} notice={notice} />
      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => saveLeadRadarSettings({ enabled, managersCanReview: managers, monthlyBudgetCad: Number(budget), usdToCadRate: Number(fx) }), undefined, s.saved)}>{pending ? s.saving : s.save}</button>
    </section>
  );
}
