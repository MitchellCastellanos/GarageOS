"use client";

import { saveTerritory } from "@/actions/sales-platform-settings";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { Badge, btnPrimary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface TerritoryRow { key: string; nameEn: string; nameFr: string; acquisition: string; provinces: string[]; cities: string[]; postalPrefixes: string[]; priorityDays: number | null; priorityStartedAt: string | null; active: boolean; sortOrder: number }

function TerritoryForm({ locale, row }: { locale: "en" | "fr"; row?: TerritoryRow }) {
  const c = identityCopy(locale).territories;
  const { t, pending, error, notice, run } = useCrmAction(locale);
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(f) => run(() => saveTerritory(f), undefined, c.saved)}>
      <label className={labelCls}>{c.key}<input className={inputCls} name="key" required defaultValue={row?.key} readOnly={!!row} maxLength={40} disabled={pending} /></label>
      <label className={labelCls}>{identityCopy(locale).team.mode}
        <select className={inputCls} name="acquisition" defaultValue={row?.acquisition ?? "REMOTE_DEFAULT"} disabled={pending}>{Object.entries(c.acq).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className={labelCls}>{c.nameEn}<input className={inputCls} name="nameEn" required defaultValue={row?.nameEn} maxLength={100} disabled={pending} /></label>
      <label className={labelCls}>{c.nameFr}<input className={inputCls} name="nameFr" required defaultValue={row?.nameFr} maxLength={100} disabled={pending} /></label>
      <label className={labelCls}>{c.provinces}<input className={inputCls} name="provinces" defaultValue={row?.provinces.join(", ")} disabled={pending} /></label>
      <label className={labelCls}>{c.postal}<input className={inputCls} name="postalPrefixes" defaultValue={row?.postalPrefixes.join(", ")} disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{c.cities} ({c.csvHelp})<textarea className={`${inputCls} py-2`} rows={3} name="cities" defaultValue={row?.cities.join(", ")} disabled={pending} /></label>
      <label className={labelCls}>{c.days}<input className={inputCls} type="number" min={1} max={730} name="priorityDays" defaultValue={row?.priorityDays ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{c.start}<input className={inputCls} type="date" name="priorityStartedAt" defaultValue={row?.priorityStartedAt ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{c.order}<input className={inputCls} type="number" min={0} name="sortOrder" defaultValue={row?.sortOrder ?? 100} disabled={pending} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="active" defaultChecked={row?.active ?? true} disabled={pending} className="size-5" />{c.active}</label>
      <div className="sm:col-span-2"><FormMessage error={error} notice={notice ?? null} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : c.save}</button></div>
    </form>
  );
}

export function TerritoryAdmin({ locale, rows }: { locale: "en" | "fr"; rows: TerritoryRow[] }) {
  const c = identityCopy(locale).territories;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <details key={r.key} className={cardCls}>
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 font-medium text-slate-900">
            {locale === "fr" ? r.nameFr : r.nameEn}<Badge>{c.acq[r.acquisition] ?? r.acquisition}</Badge>{!r.active && <Badge tone="bg-slate-200 text-slate-700">inactive</Badge>}
          </summary>
          <div className="mt-3"><TerritoryForm locale={locale} row={r} /></div>
        </details>
      ))}
      <details className={cardCls}><summary className="min-h-11 cursor-pointer font-medium text-blue-700">{c.add}</summary><div className="mt-3"><TerritoryForm locale={locale} /></div></details>
    </div>
  );
}
