"use client";

import { createNeedDefinition, updateNeedDefinition } from "@/actions/sales-needs";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface DefinitionRow { id: string; key: string; category: string; labelEn: string; labelFr: string; weight: number; sortOrder: number; active: boolean; builtIn: boolean; suggestedFeature: string }

function Row({ locale, d }: { locale: "en" | "fr"; d: DefinitionRow }) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const n = t.needsAdmin;
  return (
    <form className={`${cardCls} grid gap-3 sm:grid-cols-6`} action={(form) => run(() => updateNeedDefinition(d.id, form), undefined, t.common.saved)}>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
        <b className="text-sm">{d.key}</b><Badge>{t.needCategories[d.category]}</Badge><Badge>{t.features[d.suggestedFeature] ?? d.suggestedFeature}</Badge>{d.builtIn && <Badge tone="bg-blue-50 text-blue-800">{n.builtIn}</Badge>}
      </div>
      <label className={`${labelCls} sm:col-span-2`}>{n.labelEn}<input className={inputCls} name="labelEn" defaultValue={d.labelEn} maxLength={80} required disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{n.labelFr}<input className={inputCls} name="labelFr" defaultValue={d.labelFr} maxLength={80} required disabled={pending} /></label>
      <label className={labelCls}>{n.weight}<input className={inputCls} name="weight" type="number" min={1} max={30} defaultValue={d.weight} disabled={pending} /></label>
      <label className={labelCls}>{n.order}<input className={inputCls} name="sortOrder" type="number" min={0} max={9999} defaultValue={d.sortOrder} disabled={pending} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" name="active" defaultChecked={d.active} className="h-4 w-4" disabled={pending} /> {n.active}</label>
      <div className="flex items-center gap-2 sm:col-span-2 sm:justify-end"><button className={btnSecondary} disabled={pending}>{pending ? t.common.saving : n.saveRow}</button></div>
      <div className="sm:col-span-6"><FormMessage error={error} notice={notice} /></div>
    </form>
  );
}

export function NeedsAdmin({ locale, definitions }: { locale: "en" | "fr"; definitions: DefinitionRow[] }) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const n = t.needsAdmin;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{n.help}</p>
      {definitions.map((d) => <Row key={d.id} locale={locale} d={d} />)}
      <form className={`${cardCls} grid gap-3 sm:grid-cols-2`} action={(form) => run(() => createNeedDefinition(form), undefined, n.created)}>
        <h2 className="font-semibold text-slate-900 sm:col-span-2">{n.add}</h2>
        <label className={labelCls}>{n.key} *<input className={inputCls} name="key" required pattern="[a-z][a-z0-9_]{2,40}" disabled={pending} /></label>
        <label className={labelCls}>{n.category}<select className={inputCls} name="category" disabled={pending}>{Object.entries(t.needCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={labelCls}>{n.labelEn} *<input className={inputCls} name="labelEn" required maxLength={80} disabled={pending} /></label>
        <label className={labelCls}>{n.labelFr} *<input className={inputCls} name="labelFr" required maxLength={80} disabled={pending} /></label>
        <label className={labelCls}>{n.feature} *<input className={inputCls} name="suggestedFeature" required pattern="[a-z][a-z0-9\-]{1,40}" disabled={pending} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>{n.weight}<input className={inputCls} name="weight" type="number" min={1} max={30} defaultValue={8} disabled={pending} /></label>
          <label className={labelCls}>{n.order}<input className={inputCls} name="sortOrder" type="number" min={0} max={9999} defaultValue={200} disabled={pending} /></label>
        </div>
        <input type="hidden" name="active" value="true" />
        <div className="sm:col-span-2"><FormMessage error={error} notice={notice} /></div>
        <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.common.create}</button></div>
      </form>
    </div>
  );
}
