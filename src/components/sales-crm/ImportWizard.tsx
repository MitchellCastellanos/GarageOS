"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelProspectImport, confirmProspectImport, importIssueReport, previewProspectImport } from "@/actions/sales-import";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { crmCopy, crmError } from "@/lib/admin-locale/sales-crm";

type Preview = Extract<Awaited<ReturnType<typeof previewProspectImport>>, { ok: true }>;

export function ImportWizard({ locale, staff, canPickOwner, defaultOwner }: { locale: "en" | "fr"; staff: { id: string; name: string }[]; canPickOwner: boolean; defaultOwner: string | null }) {
  const t = crmCopy(locale);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);
  const i = t.import;

  function guarded<T>(fn: () => Promise<T>, after: (r: T) => void) {
    setError(null);
    start(async () => {
      try { after(await fn()); } catch (e) { setError(t.errors[e instanceof Error ? e.message : ""] ?? t.errors.unexpected); }
    });
  }

  if (done) {
    return (
      <div className={`${cardCls} space-y-3`} role="status">
        <h2 className="text-lg font-semibold text-emerald-800">{i.done}</h2>
        <p className="text-sm">{i.createdCount}: <b>{done.created}</b> · {i.skippedCount}: <b>{done.skipped}</b></p>
        <Link href={PLATFORM.salesProspects} className={btnPrimary}>{i.viewProspects}</Link>
      </div>
    );
  }

  if (!preview) {
    return (
      <form className={`${cardCls} grid gap-4`} action={(form) => guarded(() => previewProspectImport(form), (r) => {
        if (!r.ok) setError(crmError(t, r.error)); else setPreview(r);
      })}>
        <p className="text-sm text-slate-600">{i.help}</p>
        <p className="text-xs text-slate-500">{i.fieldHelp}</p>
        <label className={labelCls}>{i.file} *<input className={inputCls} type="file" name="file" accept=".csv,text/csv,text/plain" required disabled={pending} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          {canPickOwner && (
            <label className={labelCls}>{i.assignTo}
              <select className={inputCls} name="assignedStaffId" defaultValue={defaultOwner ?? ""} disabled={pending}><option value="">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
          )}
          <label className={labelCls}>{i.defaultSource}
            <select className={inputCls} name="source" defaultValue="IMPORT" disabled={pending}>{Object.entries(t.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
        </div>
        <p className="text-xs text-slate-500">{i.safety}</p>
        <FormMessage error={error} />
        <div><button className={btnPrimary} disabled={pending}>{pending ? i.previewing : i.preview}</button></div>
      </form>
    );
  }

  const s = preview.summary;
  const stat = (label: string, value: number, tone = "text-slate-900") => <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-2xl font-semibold ${tone}`}>{value}</p></div>;
  return (
    <div className="space-y-4">
      <section className={`${cardCls} space-y-4`}>
        <h2 className="font-semibold text-slate-900">{i.summary}</h2>
        {s.previouslyImported && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{i.sameFile}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat(i.totalRows, s.totalRows)}{stat(i.importable, s.importable, "text-emerald-700")}{stat(i.errors, s.errors, s.errors ? "text-rose-700" : undefined)}{stat(i.warnings, s.warnings, s.warnings ? "text-amber-700" : undefined)}
          {stat(i.dupInFile, s.duplicatesInFile)}{stat(i.dupExisting, s.duplicatesExisting)}{stat(i.dncRows, s.doNotContactRows)}{stat(i.ignored, s.ignoredColumns)}
        </div>
        {preview.sample.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="mb-1 text-left text-xs font-medium text-slate-500">{i.sample}</caption>
            <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{i.row}</th><th scope="col" className="py-1 pr-3">{t.common.name}</th><th scope="col" className="py-1 pr-3">{t.common.city}</th><th scope="col" className="py-1 pr-3">{t.common.language}</th><th scope="col" className="py-1">{t.prospects.contact}</th></tr></thead>
            <tbody>{preview.sample.map((r) => (
              <tr key={r.row} className="border-t border-slate-100"><td className="py-1 pr-3 tabular-nums">{r.row}</td><td className="py-1 pr-3 break-words">{r.name}{r.doNotContact && <> <Badge tone="bg-red-100 text-red-800">DNC</Badge></>}</td><td className="py-1 pr-3">{r.city ?? "—"}</td><td className="py-1 pr-3">{t.languages[r.language]}</td><td className="py-1">{r.contact ?? "—"}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {preview.issues.length > 0 && (
          <details open={s.errors > 0}><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-800">{i.issues}</summary>
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{i.row}</th><th scope="col" className="py-1 pr-3">{i.field}</th><th scope="col" className="py-1">{i.problem}</th></tr></thead>
              <tbody>{preview.issues.map((x, idx) => (
                <tr key={idx} className="border-t border-slate-100"><td className="py-1 pr-3 tabular-nums">{x.row}</td><td className="py-1 pr-3">{x.field}</td>
                  <td className="py-1"><Badge tone={x.severity === "error" ? "bg-rose-100 text-rose-800" : x.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{i.severity[x.severity]}</Badge> {i.codes[x.code] ?? x.code}</td></tr>
              ))}</tbody>
            </table></div>
          </details>
        )}
        <FormMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={pending || s.importable === 0}
            onClick={() => guarded(() => confirmProspectImport(preview.batchId), (r) => { if (!r.ok) setError(crmError(t, r.error)); else setDone({ created: r.created, skipped: r.skipped }); })}>
            {pending ? i.importing : i.confirm.replace("{n}", String(s.importable))}
          </button>
          {(s.errors > 0 || s.duplicatesInFile + s.duplicatesExisting > 0) && (
            <button className={btnSecondary} disabled={pending} onClick={() => guarded(() => importIssueReport(preview.batchId), (r) => {
              if (!r.ok) { setError(crmError(t, r.error)); return; }
              const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
              const a = document.createElement("a"); a.href = url; a.download = "import-report.csv"; a.click(); URL.revokeObjectURL(url);
            })}>{i.downloadReport}</button>
          )}
          <button className={btnSecondary} disabled={pending} onClick={() => guarded(() => cancelProspectImport(preview.batchId), () => setPreview(null))}>{i.cancelImport}</button>
        </div>
      </section>
    </div>
  );
}
