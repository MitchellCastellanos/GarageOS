"use client";

import { saveVideo } from "@/actions/sales-platform-settings";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { Badge, btnPrimary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface VideoRowView { key: string; language: string; title: string; description: string | null; url: string; thumbnailUrl: string | null; status: string; allowWebsite: boolean; allowOutreach: boolean }

function VideoForm({ locale, row }: { locale: "en" | "fr"; row?: VideoRowView }) {
  const c = identityCopy(locale).videos;
  const { t, pending, error, notice, run } = useCrmAction(locale);
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(f) => run(() => saveVideo(f), undefined, c.saved)}>
      <label className={labelCls}>{c.key}<input className={inputCls} name="key" required defaultValue={row?.key ?? "product-overview"} readOnly={!!row} maxLength={48} disabled={pending} /></label>
      <label className={labelCls}>{c.language}<select className={inputCls} name="language" defaultValue={row?.language ?? "EN"} disabled={pending || !!row}><option value="EN">English</option><option value="FR">Français</option></select></label>
      {row && <><input type="hidden" name="language" value={row.language} /></>}
      <label className={`${labelCls} sm:col-span-2`}>{c.titleField}<input className={inputCls} name="title" required defaultValue={row?.title} maxLength={140} disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{c.description}<input className={inputCls} name="description" defaultValue={row?.description ?? ""} maxLength={500} disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{c.url}<input className={inputCls} type="url" name="url" defaultValue={row?.url} maxLength={500} placeholder="https://" disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{c.thumb}<input className={inputCls} type="url" name="thumbnailUrl" defaultValue={row?.thumbnailUrl ?? ""} maxLength={500} placeholder="https://" disabled={pending} /></label>
      <label className={labelCls}>{c.status}<select className={inputCls} name="status" defaultValue={row?.status ?? "DRAFT"} disabled={pending}>{Object.entries(c.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="allowWebsite" defaultChecked={row?.allowWebsite ?? true} disabled={pending} className="size-5" />{c.website}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="allowOutreach" defaultChecked={row?.allowOutreach ?? true} disabled={pending} className="size-5" />{c.outreach}</label>
      </div>
      <div className="sm:col-span-2"><FormMessage error={error} notice={notice ?? null} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : c.save}</button></div>
    </form>
  );
}

export function VideoAdmin({ locale, rows }: { locale: "en" | "fr"; rows: VideoRowView[] }) {
  const c = identityCopy(locale).videos;
  return (
    <div className="space-y-4">
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{c.empty}</p>}
      {rows.map((r) => (
        <details key={`${r.key}-${r.language}`} className={cardCls}>
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 font-medium text-slate-900">{r.title}<Badge>{r.key} · {r.language}</Badge>
            <Badge tone={r.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>{c.statuses[r.status]}</Badge></summary>
          <div className="mt-3"><VideoForm locale={locale} row={r} /></div>
        </details>
      ))}
      <details className={cardCls}><summary className="min-h-11 cursor-pointer font-medium text-blue-700">{c.add}</summary><div className="mt-3"><VideoForm locale={locale} /></div></details>
    </div>
  );
}
