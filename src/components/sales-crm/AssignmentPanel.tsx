"use client";

import { useState } from "react";
import { cancelAssignmentRun, confirmAssignmentRun, previewAssignmentRun, recomputeProspectDerived, setStaffAssignmentSettings } from "@/actions/sales-assignment";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

type Seller = { id: string; name: string; mode: "FIELD" | "REMOTE"; accepts: boolean; cap: number | null; fieldCap: number | null; remoteCap: number | null; languages: string[]; coverage: string[]; workload: number };
type PreviewResult = Extract<Awaited<ReturnType<typeof previewAssignmentRun>>, { ok: true }>;

export function AssignmentPanel({ locale, sellers, territories, isSuperAdmin }: { locale: "en" | "fr"; sellers: Seller[]; territories: { key: string; name: string }[]; isSuperAdmin: boolean }) {
  const L = leadCopy(locale), a = L.assignment;
  const { pending, error, notice, run, setError } = useCrmAction(locale);
  const [territory, setTerritory] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<{ applied: number; skipped: number } | null>(null);
  const [recomputed, setRecomputed] = useState<number | null>(null);

  async function recomputeAll() {
    setError(null); let cursor: string | undefined, total = 0;
    for (let guard = 0; guard < 400; guard++) {
      const r = await recomputeProspectDerived(cursor);
      if (!r.ok) { setError(r.error); return; }
      total += r.processed; if (!r.nextCursor) break; cursor = r.nextCursor;
    }
    setRecomputed(total);
  }

  return (
    <div className="space-y-5">
      <section className={`${cardCls} space-y-3`}>
        <p className="text-xs text-slate-500">{a.rules}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className={labelCls}>{a.territory}<select className={inputCls} value={territory} onChange={(e) => setTerritory(e.target.value)}><option value="">{a.all}</option>{territories.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
          <button className={btnPrimary} disabled={pending} onClick={() => { setResult(null); const fd = new FormData(); fd.set("territoryKey", territory); run(() => previewAssignmentRun(fd), (r) => setPreview(r)); }}>{pending ? a.previewing : a.preview}</button>
        </div>
        <FormMessage error={error} notice={notice} />
      </section>

      {result && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{a.result}: {a.applied} {result.applied} · {a.skippedNow} {result.skipped}</p>}

      {preview && (
        <section className={`${cardCls} space-y-4`}>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {([[a.considered, preview.summary.considered], [a.proposed, preview.summary.proposed], [a.skipped, preview.summary.considered - preview.summary.proposed]] as const).map(([k, v]) => <div key={k} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-2xl font-semibold">{v}</dd></div>)}
          </dl>
          {preview.summary.backlog && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <h3 className="font-medium text-slate-900">{a.backlogTitle}</h3>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-5">
                {([[a.backlogTotal, preview.summary.backlog.total], [a.backlogVerified, preview.summary.backlog.verified], [a.backlogReview, preview.summary.backlog.underReview], [a.backlogExcluded, preview.summary.backlog.excluded], [a.backlogNotEvaluated, preview.summary.backlog.notEvaluated]] as const).map(([k, v]) => <li key={k}>{k}: <b>{v}</b></li>)}
              </ul>
              <p className="text-xs text-slate-500">{a.batchNote.replace("{n}", String(preview.summary.batchLimit))}</p>
              {preview.summary.deferred > 0 && <p className="text-xs font-medium text-amber-800">{preview.summary.deferred} — {a.deferred.replace("{n}", String(preview.summary.batchLimit))}</p>}
              {preview.summary.moreUnread && <p className="text-xs text-amber-800">{a.moreUnread}</p>}
            </div>
          )}
          {preview.sellers.length > 0 && <div><h3 className="mb-1 text-sm font-medium text-slate-800">{a.perSeller}</h3><ul className="space-y-1 text-sm">{preview.sellers.map((s) => <li key={s.id} className="flex justify-between gap-3"><span>{s.name} <Badge>{a.mode[s.mode]}</Badge></span><b>{s.count}</b></li>)}</ul></div>}
          {Object.keys(preview.summary.skips).length > 0 && <div><h3 className="mb-1 text-sm font-medium text-slate-800">{a.skipped}</h3><ul className="space-y-1 text-sm">{Object.entries(preview.summary.skips).map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span>{a.skipReasons[k] ?? k}</span><b>{n as number}</b></li>)}</ul></div>}
          {preview.rows.length === 0 ? <p className="text-sm text-slate-600">{a.empty}</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="mb-1 text-left text-xs font-medium text-slate-500">{a.rowsTitle}</caption>
              <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{a.prospect}</th><th scope="col" className="py-1 pr-3">{a.territory}</th><th scope="col" className="py-1 pr-3">{a.required}</th><th scope="col" className="py-1">{a.seller}</th></tr></thead>
              <tbody>{preview.rows.map((r) => (
                <tr key={r.prospectId} className="border-t border-slate-100"><td className="py-1 pr-3 break-words">{r.name}{r.city ? ` · ${r.city}` : ""}</td><td className="py-1 pr-3">{r.territoryKey ?? "—"}</td><td className="py-1 pr-3">{r.requiredMode ? a.mode[r.requiredMode] : "—"}</td>
                  <td className="py-1">{r.staffName ?? <span className="text-slate-500">{a.skipReasons[r.skip ?? ""] ?? "—"}</span>}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={pending || preview.summary.proposed === 0} onClick={() => run(() => confirmAssignmentRun(preview.runId), (r) => { setResult({ applied: r.applied, skipped: r.skipped }); setPreview(null); })}>{pending ? a.confirming : a.confirm.replace("{n}", String(preview.summary.proposed))}</button>
            <button className={btnSecondary} disabled={pending} onClick={() => run(() => cancelAssignmentRun(preview.runId), () => setPreview(null))}>{a.discard}</button>
          </div>
        </section>
      )}

      <section className={`${cardCls} space-y-3`}>
        <h2 className="font-semibold text-slate-900">{a.sellersTitle}</h2>
        <ul className="space-y-3">
          {sellers.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 p-3">
              <form className="grid gap-3 sm:grid-cols-[1fr_auto_8rem_8rem_8rem_auto_auto] sm:items-end" action={(fd) => { run(() => setStaffAssignmentSettings(s.id, fd)); }}>
                <p className="min-w-0 break-words text-sm font-medium text-slate-900">{s.name} <Badge>{a.mode[s.mode]}</Badge> <span className="text-xs font-normal text-slate-500">{a.workload}: {s.workload}</span></p>
                <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="acceptsAutoAssignment" defaultChecked={s.accepts} className="h-4 w-4" /> {a.acceptsAuto}</label>
                <label className={labelCls}><span className="text-xs">{a.cap}</span><input className={inputCls} name="maxActiveLeads" inputMode="numeric" defaultValue={s.cap ?? ""} /></label>
                <label className={labelCls}><span className="text-xs">{a.capField}</span><input className={inputCls} name="maxActiveFieldLeads" inputMode="numeric" defaultValue={s.fieldCap ?? ""} /></label>
                <label className={labelCls}><span className="text-xs">{a.capRemote}</span><input className={inputCls} name="maxActiveRemoteLeads" inputMode="numeric" defaultValue={s.remoteCap ?? ""} /></label>
                <fieldset className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><legend className="sr-only">{a.languages}</legend><span className="text-xs">{a.languages}</span>{(["FR", "EN"] as const).map((l) => <label key={l} className="flex items-center gap-1"><input type="checkbox" name={`lang${l}`} defaultChecked={s.languages.includes(l)} className="h-4 w-4" />{l}</label>)}</fieldset>
                <button className={btnSecondary} disabled={pending}>{a.save}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {isSuperAdmin && (
        <section className={`${cardCls} space-y-2`}>
          <h2 className="font-semibold text-slate-900">{a.maintenanceTitle}</h2>
          <p className="text-sm text-slate-600">{a.maintenanceHelp}</p>
          <button className={btnSecondary} disabled={pending} onClick={recomputeAll}>{a.maintenanceRun}</button>
          {recomputed !== null && <p role="status" className="text-sm text-emerald-800">{a.maintenanceDone.replace("{n}", String(recomputed))}</p>}
        </section>
      )}
    </div>
  );
}
