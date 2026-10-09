"use client";

import { useState } from "react";
import { overrideOpportunityScore, startNewOpportunity, updateOpportunityDetails } from "@/actions/sales-pipeline";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function OpportunityDetailsForm({ locale, opportunityId, values, disabled }: {
  locale: "en" | "fr"; opportunityId: string; values: { urgency: string | null; estimatedPlan: string | null; estimatedMrrCents: number | null; expectedCloseDate: string | null }; disabled: boolean;
}) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(form) => run(() => updateOpportunityDetails(opportunityId, form), undefined, t.common.saved)}>
      <label className={labelCls}>{t.opp.urgency}
        <select className={inputCls} name="urgency" defaultValue={values.urgency ?? ""} disabled={pending || disabled}>
          <option value="">{t.common.none}</option>{Object.entries(t.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={labelCls}>{t.opp.plan}
        <select className={inputCls} name="estimatedPlan" defaultValue={values.estimatedPlan ?? ""} disabled={pending || disabled}>
          <option value="">{t.common.none}</option>{["CORE", "PRO", "COMPLETE"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className={labelCls}>{t.opp.mrr}
        <input className={inputCls} name="estimatedMrr" inputMode="decimal" defaultValue={values.estimatedMrrCents === null ? "" : String(values.estimatedMrrCents / 100)} disabled={pending || disabled} />
      </label>
      <label className={labelCls}>{t.opp.close}
        <input className={inputCls} name="expectedCloseDate" type="date" defaultValue={values.expectedCloseDate ?? ""} disabled={pending || disabled} />
      </label>
      <div className="sm:col-span-2"><FormMessage error={error} notice={notice} /></div>
      {!disabled && <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.opp.saveDetails}</button></div>}
    </form>
  );
}

export function ScoreOverrideForm({ locale, opportunityId, kind, current }: { locale: "en" | "fr"; opportunityId: string; kind: "fit" | "intent"; current: number | null }) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="text-sm text-blue-700 underline-offset-2 hover:underline" onClick={() => setOpen(true)}>{t.scoring.override}</button>;
  return (
    <form className="mt-2 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" action={(form) => { form.set("kind", kind); run(() => overrideOpportunityScore(opportunityId, form), () => setOpen(false), t.common.saved); }}>
      <p className="text-sm font-medium text-slate-900">{t.scoring.overrideTitle}</p>
      <p className="text-xs text-slate-600">{t.scoring.overrideHelp}</p>
      <label className={labelCls}>{t.scoring.overrideValue}<input className={inputCls} name="value" type="number" min={0} max={100} defaultValue={current ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{t.scoring.overrideReason}<input className={inputCls} name="reason" maxLength={500} disabled={pending} /></label>
      <FormMessage error={error} notice={notice} />
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.common.save}</button>
        <button type="button" className={btnSecondary} onClick={() => setOpen(false)} disabled={pending}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

export function StartOpportunityButton({ locale, prospectId }: { locale: "en" | "fr"; prospectId: string }) {
  const { t, pending, error, run } = useCrmAction(locale);
  return (
    <div className="space-y-2">
      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => startNewOpportunity(prospectId))}>{t.prospects.detail.startOpp}</button>
      <FormMessage error={error} />
    </div>
  );
}
