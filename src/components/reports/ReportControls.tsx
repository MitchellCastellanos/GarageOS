"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exportReportCsv } from "@/actions/reports";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { REPORTS_DICT } from "@/lib/admin-locale/reports";

interface Props {
  kind: string;
  preset: string;
  from: string;
  to: string;
  presets: string[];
  canExport: boolean;
}

const field = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function ReportControls({ kind, preset, from, to, presets, canExport }: Props) {
  const t = REPORTS_DICT[useAdminLocale()];
  const router = useRouter();
  const [p, setP] = useState(preset);
  const [f, setF] = useState(from);
  const [e, setE] = useState(to);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(ev: React.FormEvent) {
    ev.preventDefault();
    const q = new URLSearchParams({ kind, preset: p });
    if (p === "custom") {
      q.set("from", f);
      q.set("to", e);
    }
    router.push(`?${q.toString()}`);
  }

  function download() {
    setError(null);
    start(async () => {
      const res = await exportReportCsv({ kind, preset: p, from: f, to: e });
      if ("error" in res) {
        setError(t.errors[res.error as keyof typeof t.errors] ?? res.error);
        return;
      }
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-slate-600 space-y-1">
        <span className="block">{t.filters.period}</span>
        <select value={p} onChange={(ev) => setP(ev.target.value)} className={field}>
          {presets.map((k) => (
            <option key={k} value={k}>{t.presets[k as keyof typeof t.presets]}</option>
          ))}
        </select>
      </label>
      {p === "custom" && (
        <>
          <label className="text-xs font-medium text-slate-600 space-y-1">
            <span className="block">{t.filters.from}</span>
            <input type="date" value={f} onChange={(ev) => setF(ev.target.value)} className={field} required />
          </label>
          <label className="text-xs font-medium text-slate-600 space-y-1">
            <span className="block">{t.filters.to}</span>
            <input type="date" value={e} onChange={(ev) => setE(ev.target.value)} className={field} required />
          </label>
        </>
      )}
      <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">{t.filters.apply}</button>
      {canExport && (
        <button type="button" onClick={download} disabled={pending} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
          {pending ? t.filters.exporting : t.filters.export}
        </button>
      )}
      {error && <p role="alert" className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
