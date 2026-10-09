"use client";

import { useState } from "react";
import { assessNeed, removeNeed } from "@/actions/sales-needs";
import { Badge, btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface NeedDefinitionRow { id: string; key: string; label: string; description: string | null; category: string }
export interface AssessedNeed { definitionId: string; severity: string; priority: string; basis: string; evidence: string | null; notes: string | null; assessedAt: string }

function NeedForm({ locale, prospectId, def, current, onDone }: { locale: "en" | "fr"; prospectId: string; def: NeedDefinitionRow; current?: AssessedNeed; onDone: () => void }) {
  const { t, pending, error, run } = useCrmAction(locale);
  const [basis, setBasis] = useState(current?.basis ?? "INFERRED");
  return (
    <form className="mt-3 grid gap-3 sm:grid-cols-3" action={(form) => { form.set("definitionId", def.id); run(() => assessNeed(prospectId, form), onDone); }}>
      <label className={labelCls}>{t.needs.severity}
        <select className={inputCls} name="severity" defaultValue={current?.severity ?? "MEDIUM"} disabled={pending}>
          {Object.entries(t.severities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={labelCls}>{t.needs.priority}
        <select className={inputCls} name="priority" defaultValue={current?.priority ?? "MEDIUM"} disabled={pending}>
          {Object.entries(t.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={labelCls}>{t.needs.basis}
        <select className={inputCls} name="basis" value={basis} onChange={(e) => setBasis(e.target.value)} disabled={pending}>
          {Object.entries(t.bases).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={`${labelCls} sm:col-span-3`}>{t.needs.evidence}{basis === "CONFIRMED" ? " *" : ""}
        <textarea className={`${inputCls} min-h-20 py-2`} name="evidence" maxLength={1000} required={basis === "CONFIRMED"} defaultValue={current?.evidence ?? ""} disabled={pending} />
      </label>
      <div className="sm:col-span-3"><FormMessage error={error} /></div>
      <div className="flex gap-2 sm:col-span-3">
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : current ? t.needs.update : t.common.save}</button>
        <button type="button" className={btnSecondary} onClick={onDone} disabled={pending}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

export function NeedsPanel({ locale, prospectId, definitions, assessed, canEdit }: {
  locale: "en" | "fr"; prospectId: string; definitions: NeedDefinitionRow[]; assessed: AssessedNeed[]; canEdit: boolean;
}) {
  const { t, pending, error, run } = useCrmAction(locale);
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(assessed.map((a) => [a.definitionId, a]));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.needs.help}</p>
      <FormMessage error={error} />
      <ul className="space-y-2">
        {definitions.map((d) => {
          const a = byId.get(d.id);
          return (
            <li key={d.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{d.label} <span className="text-xs font-normal text-slate-500">· {t.needCategories[d.category]}</span></p>
                  {d.description && <p className="text-sm text-slate-500">{d.description}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a ? <>
                      <Badge tone={a.severity === "HIGH" ? "bg-rose-100 text-rose-800" : a.severity === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{t.needs.severity}: {t.severities[a.severity]}</Badge>
                      <Badge>{t.needs.priority}: {t.levels[a.priority]}</Badge>
                      <Badge tone={a.basis === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}>{t.bases[a.basis]}</Badge>
                    </> : <Badge>{t.needs.notAssessed}</Badge>}
                  </div>
                  {a?.evidence && <p className="mt-2 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-sm text-slate-700">{a.evidence}</p>}
                </div>
                {canEdit && open !== d.id && (
                  <div className="flex gap-2">
                    <button type="button" className={btnSecondary} onClick={() => setOpen(d.id)}>{a ? t.common.edit : t.needs.add}</button>
                    {a && <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => removeNeed(prospectId, d.id))}>{t.needs.remove}</button>}
                  </div>
                )}
              </div>
              {open === d.id && <NeedForm locale={locale} prospectId={prospectId} def={d} current={a} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
