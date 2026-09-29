"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Lock } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { toCsv, type ImportEntity } from "@/domain/import";
import type { ImportDictionary } from "@/lib/admin-locale/import";
import {
  commitImportAction,
  previewImportAction,
  type ImportAnalysis,
  type ImportActionError,
} from "@/actions/import";
import type { PlanReport } from "@/lib/import-service";

interface RecentRun {
  id: string;
  entity: string;
  fileName: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  createdAt: string;
}

interface Props {
  t: ImportDictionary;
  fullImport: boolean;
  basicMaxRows: number;
  recentRuns: RecentRun[];
  locale: string;
}

const inputCls = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const btnCls = "bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors";

export function ImportWizard({ t, fullImport, basicMaxRows, recentRuns, locale }: Props) {
  const [entity, setEntity] = useState<ImportEntity>("customers");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [duplicates, setDuplicates] = useState<"skip" | "update">("skip");
  const [createMissing, setCreateMissing] = useState(true);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [done, setDone] = useState<PlanReport | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const entities: ImportEntity[] = fullImport ? ["customers", "vehicles", "inventory"] : ["customers", "vehicles"];

  function buildForm(withMapping: boolean) {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("entity", entity);
    fd.set("duplicates", duplicates);
    fd.set("createMissingCustomers", String(createMissing));
    if (withMapping) fd.set("mapping", JSON.stringify(mapping));
    return fd;
  }

  function fail(error: ImportActionError) {
    toast.error(t.errors[error] ?? t.errors.INVALID_REQUEST);
  }

  function run(withMapping: boolean) {
    if (!file) return;
    startTransition(async () => {
      const res = await previewImportAction(buildForm(withMapping));
      if (!res.ok) return fail(res.error);
      setAnalysis(res.analysis);
      setMapping(res.analysis.mapping);
      setMissing(res.missing);
      setReport(res.report);
    });
  }

  function commit() {
    startTransition(async () => {
      const res = await commitImportAction(buildForm(true));
      if (!res.ok) return fail(res.error);
      setDone(res.report);
      setReport(null);
    });
  }

  function reset() {
    setFile(null);
    setAnalysis(null);
    setReport(null);
    setDone(null);
    setMissing([]);
  }

  function downloadErrors(r: PlanReport) {
    const rows = [
      [t.row, ...(analysis?.headers ?? []), "Errors"],
      ...r.errorRows.map((e) => [String(e.rowNumber), ...e.values, e.codes.map((c) => t.codes[c] ?? c).join("; ")]),
    ];
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const dateFmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });

  if (done) {
    const s = done.summary;
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="font-semibold text-green-900">{t.doneTitle}</p>
          <SummaryGrid t={t} report={done} />
          {s.errors > 0 && <p className="text-sm text-green-900 mt-3">{t.doneBody}</p>}
        </div>
        {done.errorRows.length > 0 && <Issues t={t} report={done} onDownload={() => downloadErrors(done)} />}
        <button className={btnCls} onClick={reset}>{t.importAnother}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!fullImport && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{t.proTitle}</p>
            <p className="text-slate-600 mt-1">{t.proBody}</p>
            <Link href={`${ADMIN.settings}?tab=billing&plan=pro`} className="text-blue-600 font-medium hover:underline mt-2 inline-block">
              {t.proCta}
            </Link>
          </div>
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.step1}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {entities.map((e) => (
            <label key={e} className={`border rounded-lg p-3 cursor-pointer text-sm ${entity === e ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <input
                type="radio"
                className="mr-2"
                checked={entity === e}
                onChange={() => {
                  setEntity(e);
                  setAnalysis(null);
                  setReport(null);
                }}
              />
              <span className="font-medium text-slate-900">{t.entities[e].label}</span>
              <p className="text-slate-500 mt-1">{t.entities[e].hint}</p>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            aria-label={t.chooseFile}
            className={inputCls}
            onChange={(ev) => {
              setFile(ev.target.files?.[0] ?? null);
              setAnalysis(null);
              setReport(null);
            }}
          />
          <button className={btnCls} disabled={!file || pending} onClick={() => run(false)}>
            <Upload className="inline w-4 h-4 mr-1.5 -mt-0.5" />
            {t.analyze}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {t.fileHint} {!fullImport && t.basicLimits(basicMaxRows)}
        </p>
      </section>

      {analysis && (
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">{t.step2}</h2>
            <p className="text-sm text-slate-500">{t.mappingHelp}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {analysis.fields.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="block text-slate-700 mb-1">
                  {t.fieldLabels[f.key] ?? f.key}
                  {f.required && <span className="text-red-600"> * {t.requiredMark}</span>}
                </span>
                <select
                  className={`${inputCls} w-full`}
                  value={mapping[f.key] ?? ""}
                  onChange={(ev) => {
                    setMapping({ ...mapping, [f.key]: ev.target.value === "" ? null : Number(ev.target.value) });
                    setReport(null);
                  }}
                >
                  <option value="">{t.notMapped}</option>
                  {analysis.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `#${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">{t.sampleTitle}</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="text-xs w-full">
                <thead className="bg-slate-50">
                  <tr>{analysis.headers.map((h, i) => <th key={i} className="text-left px-2 py-1.5 font-medium text-slate-600">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {analysis.sampleRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {analysis.headers.map((_, j) => <td key={j} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{r[j]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-700">{t.optionsTitle}</p>
            <label className="flex items-center gap-2">
              <input type="radio" checked={duplicates === "skip"} onChange={() => { setDuplicates("skip"); setReport(null); }} />
              {t.dupSkip}
            </label>
            <label className={`flex items-center gap-2 ${fullImport ? "" : "opacity-50"}`}>
              <input type="radio" disabled={!fullImport} checked={duplicates === "update"} onChange={() => { setDuplicates("update"); setReport(null); }} />
              {t.dupUpdate}
              {!fullImport && <span className="text-xs text-amber-700">({t.dupUpdatePro})</span>}
            </label>
            {entity === "vehicles" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={createMissing} onChange={(ev) => { setCreateMissing(ev.target.checked); setReport(null); }} />
                {t.createMissing}
              </label>
            )}
          </div>

          {missing.length > 0 && (
            <p className="text-sm text-red-700">
              {t.missingColumns} {missing.map((k) => t.fieldLabels[k] ?? k).join(", ")}
            </p>
          )}
          <button className={btnCls} disabled={pending || missing.length > 0} onClick={() => run(true)}>
            {t.validate}
          </button>
        </section>
      )}

      {report && (
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">{t.step3}</h2>
          <p className="text-sm text-slate-500">{t.previewTitle}</p>
          <SummaryGrid t={t} report={report} />
          {report.sample.length > 0 && (
            <ul className="text-sm text-slate-700 divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {report.sample.map((s) => (
                <li key={s.rowNumber} className="px-3 py-1.5">
                  <span className="text-slate-400 mr-2">{t.row} {s.rowNumber}</span>
                  <span className="text-xs uppercase mr-2 text-blue-700">{s.action === "create" ? t.actionCreate : t.actionUpdate}</span>
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          {report.errorRows.length > 0 && <Issues t={t} report={report} onDownload={() => downloadErrors(report)} />}
          {report.duplicateRows.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">{t.duplicatesTitle} ({report.summary.skipped})</summary>
              <ul className="mt-2 text-slate-600">
                {report.duplicateRows.slice(0, 20).map((d) => (
                  <li key={d.rowNumber}>{t.row} {d.rowNumber} — {d.inFile ? t.duplicateInFile : t.duplicateExisting}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            className={btnCls}
            disabled={pending || report.summary.create + report.summary.update === 0}
            onClick={commit}
          >
            {pending ? t.importing : t.confirm}
          </button>
        </section>
      )}

      {recentRuns.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-slate-900 text-sm">{t.recent}</h2>
          <ul className="text-sm text-slate-600 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {recentRuns.map((r) => (
              <li key={r.id} className="px-4 py-2 flex flex-wrap gap-x-3">
                <span className="text-slate-400">{dateFmt.format(new Date(r.createdAt))}</span>
                <span className="font-medium text-slate-800">{t.entities[r.entity as ImportEntity]?.label ?? r.entity}</span>
                <span>{r.fileName}</span>
                <span>+{r.created} · ↻{r.updated} · ⤼{r.skipped} · ⚠{r.errors}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SummaryGrid({ t, report }: { t: ImportDictionary; report: PlanReport }) {
  const s = report.summary;
  const cells: [string, number][] = [
    [t.rowsTotal, s.total],
    [t.willCreate, s.create],
    [t.willUpdate, s.update],
    [t.willSkip, s.skipped],
    [t.withErrors, s.errors],
  ];
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cells.map(([label, n]) => (
          <div key={label} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xl font-bold text-slate-900">{n}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      {s.customersCreated > 0 && <p className="text-sm text-slate-600 mt-2">{t.newCustomers}: {s.customersCreated}</p>}
    </div>
  );
}

function Issues({ t, report, onDownload }: { t: ImportDictionary; report: PlanReport; onDownload: () => void }) {
  const extra = report.summary.errors - report.errorRows.length;
  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm space-y-2">
      <p className="font-medium text-red-900">{t.issuesTitle} ({report.summary.errors})</p>
      <ul className="text-red-800">
        {report.errorRows.slice(0, 15).map((e) => (
          <li key={e.rowNumber}>
            {t.row} {e.rowNumber}: {e.codes.map((c) => t.codes[c] ?? c).join(", ")}
          </li>
        ))}
      </ul>
      {report.summary.errors > 15 && <p className="text-red-700">{t.moreIssues(report.summary.errors - 15)}</p>}
      {extra > 0 && <p className="text-red-700 text-xs">(CSV: first {report.errorRows.length})</p>}
      <button type="button" onClick={onDownload} className="text-blue-700 font-medium hover:underline">
        {t.downloadErrors}
      </button>
    </div>
  );
}
