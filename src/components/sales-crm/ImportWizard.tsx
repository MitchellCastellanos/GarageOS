"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelProspectImport, confirmProspectImport, importIssueReport, inspectProspectImport, previewProspectImport } from "@/actions/sales-import";
import { PLATFORM } from "@/lib/routes";
import { IMPORT_FIELDS } from "@/domain/sales-crm/import-fields";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { crmCopy, crmError } from "@/lib/admin-locale/sales-crm";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

type Preview = Extract<Awaited<ReturnType<typeof previewProspectImport>>, { ok: true }>;
type Inspection = { headers: string[]; suggested: Record<string, string | null>; sample: string[][]; totalRows: number };
type Done = { created: number; skipped: number; linked: number; review: number };

export function ImportWizard({ locale, staff, canPickOwner, defaultOwner }: { locale: "en" | "fr"; staff: { id: string; name: string }[]; canPickOwner: boolean; defaultOwner: string | null }) {
  const t = crmCopy(locale), L = leadCopy(locale), i = L.import;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [meta, setMeta] = useState({ sourceKey: "csv-import", sourceUrl: "", lawfulSourceNote: "", observedAt: "", assignedStaffId: defaultOwner ?? "", source: "IMPORT" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function guarded<T>(fn: () => Promise<T>, after: (r: T) => void) {
    setError(null);
    start(async () => {
      try { after(await fn()); } catch (e) { setError(t.errors[e instanceof Error ? e.message : ""] ?? t.errors.unexpected); }
    });
  }
  const reset = () => { setPreview(null); setInsp(null); setFile(null); setError(null); };

  if (done) {
    return (
      <div className={`${cardCls} space-y-3`} role="status">
        <h2 className="text-lg font-semibold text-emerald-800">{i.resultTitle}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {([[i.created, done.created], [i.linked, done.linked], [i.review, done.review], [i.skipped, done.skipped]] as const).map(([k, v]) => <div key={k} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-2xl font-semibold">{v}</dd></div>)}
        </dl>
        <p className="text-xs text-slate-500">{i.noConsent}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={PLATFORM.salesProspects} className={btnPrimary}>{t.import.viewProspects}</Link>
          {done.review > 0 && <Link href={PLATFORM.salesDuplicates} className={btnSecondary}>{i.reviewLink}</Link>}
        </div>
      </div>
    );
  }

  // ── Step 1: choose a file
  if (!insp) {
    return (
      <form className={`${cardCls} grid gap-4`} action={(form) => { const f = form.get("file"); if (f instanceof File) setFile(f); guarded(() => inspectProspectImport(form), (r) => { if (!r.ok) setError(crmError(t, r.error)); else { setInsp(r); setMapping(r.suggested); } }); }}>
        <h2 className="font-semibold text-slate-900">{i.step1}</h2>
        <p className="text-sm text-slate-600">{t.import.help}</p>
        <label className={labelCls}>{t.import.file} *<input className={inputCls} type="file" name="file" accept=".csv,text/csv,text/plain" required disabled={pending} /></label>
        <p className="text-xs text-slate-500">{t.import.safety}</p>
        <FormMessage error={error} />
        <div><button className={btnPrimary} disabled={pending}>{pending ? i.inspecting : i.inspect}</button></div>
      </form>
    );
  }

  // ── Step 2: mapping + source
  if (!preview) {
    const hasName = Object.values(mapping).includes("name");
    const used = new Set(Object.values(mapping).filter(Boolean) as string[]);
    const submit = () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file); fd.set("mapping", JSON.stringify(mapping)); fd.set("assignedStaffId", meta.assignedStaffId); fd.set("source", meta.source);
      fd.set("sourceKey", meta.sourceKey); fd.set("sourceUrl", meta.sourceUrl); fd.set("lawfulSourceNote", meta.lawfulSourceNote); fd.set("observedAt", meta.observedAt);
      guarded(() => previewProspectImport(fd), (r) => { if (!r.ok) setError(crmError(t, r.error)); else setPreview(r); });
    };
    return (
      <div className="space-y-4">
        <section className={`${cardCls} space-y-3`}>
          <h2 className="font-semibold text-slate-900">{i.step2}</h2>
          <h3 className="text-sm font-medium text-slate-800">{i.mappingTitle} <span className="font-normal text-slate-500">({insp.totalRows})</span></h3>
          <p className="text-xs text-slate-500">{i.mappingHelp}</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {insp.headers.map((h, idx) => (
              <li key={idx} className="rounded-lg border border-slate-200 p-3">
                <p className="break-words text-sm font-medium text-slate-900">{h || `#${idx + 1}`}</p>
                <p className="mb-2 break-words text-xs text-slate-500">{i.example}: {insp.sample.map((r) => r[idx]).filter(Boolean).slice(0, 2).join(" · ") || "—"}</p>
                <label className={labelCls}><span className="sr-only">{i.mapsTo}</span>
                  <select className={inputCls} value={mapping[String(idx)] ?? ""} disabled={pending} onChange={(e) => setMapping({ ...mapping, [String(idx)]: e.target.value || null })}>
                    <option value="">{i.ignore}</option>
                    {IMPORT_FIELDS.map((f) => <option key={f} value={f} disabled={used.has(f) && mapping[String(idx)] !== f}>{i.fields[f] ?? f}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          {!hasName && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{i.needName}</p>}
        </section>

        <section className={`${cardCls} grid gap-4 sm:grid-cols-2`}>
          <h3 className="text-sm font-medium text-slate-800 sm:col-span-2">{i.sourceTitle}</h3>
          <label className={labelCls}>{i.sourceKey}<input className={inputCls} value={meta.sourceKey} maxLength={60} onChange={(e) => setMeta({ ...meta, sourceKey: e.target.value })} /><span className="mt-1 block text-xs text-slate-500">{i.sourceKeyHelp}</span></label>
          <label className={labelCls}>{i.sourceUrl}<input className={inputCls} type="url" inputMode="url" value={meta.sourceUrl} maxLength={480} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} /></label>
          <label className={`${labelCls} sm:col-span-2`}>{i.lawfulNote} *<textarea className={`${inputCls} min-h-20 py-2`} value={meta.lawfulSourceNote} maxLength={500} required onChange={(e) => setMeta({ ...meta, lawfulSourceNote: e.target.value })} /><span className="mt-1 block text-xs text-slate-500">{i.lawfulHelp}</span></label>
          <label className={labelCls}>{i.observedAt}<input className={inputCls} type="date" value={meta.observedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setMeta({ ...meta, observedAt: e.target.value })} /></label>
          <label className={labelCls}>{t.import.defaultSource}
            <select className={inputCls} value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })}>{Object.entries(t.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {canPickOwner && (
            <label className={labelCls}>{t.import.assignTo}
              <select className={inputCls} value={meta.assignedStaffId} onChange={(e) => setMeta({ ...meta, assignedStaffId: e.target.value })}><option value="">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
          )}
        </section>
        <FormMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={pending || !hasName || meta.lawfulSourceNote.trim().length < 8} onClick={submit}>{pending ? t.import.previewing : i.previewBtn}</button>
          <button className={btnSecondary} disabled={pending} onClick={reset}>{i.back}</button>
        </div>
      </div>
    );
  }

  // ── Step 3: preview
  const s = preview.summary;
  const stat = (label: string, value: number, tone = "text-slate-900") => <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-2xl font-semibold ${tone}`}>{value}</p></div>;
  const terr = s.territory;
  return (
    <div className="space-y-4">
      <section className={`${cardCls} space-y-4`}>
        <h2 className="font-semibold text-slate-900">{i.step3}</h2>
        {s.previouslyImported && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.import.sameFile}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat(t.import.totalRows, s.totalRows)}{stat(t.import.importable, s.importable, "text-emerald-700")}{stat(t.import.errors, s.errors, s.errors ? "text-rose-700" : undefined)}{stat(t.import.warnings, s.warnings, s.warnings ? "text-amber-700" : undefined)}
          {stat(i.stats.linked, s.linkedExisting)}{stat(i.stats.review, s.needsReview, s.needsReview ? "text-amber-700" : undefined)}{stat(i.stats.already, s.alreadyImported)}{stat(i.stats.branches, s.branchWarnings)}
          {stat(t.import.dupInFile, s.duplicatesInFile)}{stat(t.import.dncRows, s.doNotContactRows)}{stat(t.import.ignored, s.ignoredColumns)}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-medium text-slate-800">{i.territoryTitle}</h3>
            <ul className="space-y-1 text-sm text-slate-700">
              {Object.entries(terr.byKey).map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span className="break-words">{k}</span><b>{n}</b></li>)}
              <li className="flex justify-between gap-3"><span>{i.stats.national}</span><b>{terr.national}</b></li>
              <li className="flex justify-between gap-3"><span>{i.stats.unresolved}</span><b className={terr.unresolved ? "text-amber-700" : undefined}>{terr.unresolved}</b></li>
            </ul>
            <h3 className="mb-1 mt-3 text-sm font-medium text-slate-800">{i.quality}</h3>
            <ul className="space-y-1 text-sm text-slate-700">{Object.entries(s.addressQuality).map(([q, n]) => <li key={q} className="flex justify-between gap-3"><span>{L.indicators.quality[q]}</span><b>{n as number}</b></li>)}</ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-medium text-slate-800">{i.assignmentTitle}</h3>
            {s.assignment.owner ? (
              <ul className="space-y-1 text-sm text-slate-700">
                <li className="flex justify-between gap-3"><span>{i.ownerReady}</span><b>{s.assignment.ready}</b></li>
                <li className="flex justify-between gap-3"><span>{i.ownerPooled}</span><b>{s.assignment.pooled}</b></li>
                <li className="flex justify-between gap-3"><span>{i.ownerBlocked}</span><b>{s.assignment.blocked}</b></li>
              </ul>
            ) : (
              <p className="text-sm text-slate-700">{i.noOwner} <b>{s.assignment.eligibleForAutoAssign}</b> {i.autoAssign.toLowerCase()}.</p>
            )}
          </div>
        </div>

        {preview.rows.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="mb-1 text-left text-xs font-medium text-slate-500">{i.rowsTitle}</caption>
            <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{i.row}</th><th scope="col" className="py-1 pr-3">{t.common.name}</th><th scope="col" className="py-1 pr-3">{t.common.city}</th><th scope="col" className="py-1 pr-3">{i.outcome}</th><th scope="col" className="py-1 pr-3">{i.territoryCol}</th><th scope="col" className="py-1">{i.addressCol}</th></tr></thead>
            <tbody>{preview.rows.map((r) => (
              <tr key={r.row} className="border-t border-slate-100"><td className="py-1 pr-3 tabular-nums">{r.row}</td><td className="py-1 pr-3 break-words">{r.name}{r.doNotContact && <> <Badge tone="bg-red-100 text-red-800">DNC</Badge></>}</td><td className="py-1 pr-3">{r.city ?? "—"}</td>
                <td className="py-1 pr-3"><Badge tone={r.outcome === "CREATE" ? "bg-emerald-100 text-emerald-800" : r.outcome === "REVIEW" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{i.outcomes[r.outcome]}</Badge></td>
                <td className="py-1 pr-3">{r.territory === "unresolved" ? L.indicators.territory.UNRESOLVED : r.territory === "national" ? i.stats.national : r.territory}</td><td className="py-1">{L.indicators.quality[r.quality]}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {preview.issues.length > 0 && (
          <details open={s.errors > 0}><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-800">{t.import.issues}</summary>
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{i.row}</th><th scope="col" className="py-1 pr-3">{t.import.field}</th><th scope="col" className="py-1">{t.import.problem}</th></tr></thead>
              <tbody>{preview.issues.map((x, idx) => (
                <tr key={idx} className="border-t border-slate-100"><td className="py-1 pr-3 tabular-nums">{x.row}</td><td className="py-1 pr-3">{x.field}</td>
                  <td className="py-1"><Badge tone={x.severity === "error" ? "bg-rose-100 text-rose-800" : x.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{t.import.severity[x.severity]}</Badge> {i.codes[x.code] ?? t.import.codes[x.code] ?? x.code}</td></tr>
              ))}</tbody>
            </table></div>
          </details>
        )}
        <p className="text-xs text-slate-500">{i.noConsent}</p>
        <FormMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={pending || (s.importable === 0 && s.needsReview === 0 && s.linkedExisting === 0)}
            onClick={() => guarded(() => confirmProspectImport(preview.batchId), (r) => { if (!r.ok) setError(crmError(t, r.error)); else setDone({ created: r.created, skipped: r.skipped, linked: r.linked, review: r.review }); })}>
            {pending ? t.import.importing : t.import.confirm.replace("{n}", String(s.importable))}
          </button>
          <button className={btnSecondary} disabled={pending} onClick={() => guarded(() => importIssueReport(preview.batchId), (r) => {
            if (!r.ok) { setError(crmError(t, r.error)); return; }
            const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a"); a.href = url; a.download = "import-report.csv"; a.click(); URL.revokeObjectURL(url);
          })}>{t.import.downloadReport}</button>
          <button className={btnSecondary} disabled={pending} onClick={() => guarded(() => cancelProspectImport(preview.batchId), () => reset())}>{t.import.cancelImport}</button>
        </div>
      </section>
    </div>
  );
}
