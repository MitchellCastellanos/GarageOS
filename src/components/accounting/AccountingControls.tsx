"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exportAccountingCsv } from "@/actions/accounting";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ACCOUNTING_DICT } from "@/lib/admin-locale/accounting";
import { REPORT_PRESETS } from "@/domain/reports";

const field = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function AccountingControls({ tab, preset, from, to, basis, exports, exportOnly }: { tab: string; preset: string; from: string; to: string; basis: string; exports: { kind: string; label: string }[]; exportOnly?: boolean }) {
  const t = ACCOUNTING_DICT[useAdminLocale()];
  const router = useRouter();
  const [p, setP] = useState(preset);
  const [f, setF] = useState(from);
  const [e, setE] = useState(to);
  const [b, setB] = useState(basis);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(ev: React.FormEvent) {
    ev.preventDefault();
    const q = new URLSearchParams({ tab, preset: p, basis: b });
    if (p === "custom") {
      q.set("from", f);
      q.set("to", e);
    }
    router.push(`?${q.toString()}`);
  }

  function download(kind: string) {
    setError(null);
    start(async () => {
      const res = await exportAccountingCsv(kind, { preset: p, from: f, to: e, basis: b });
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
    <div className="space-y-3">
      {!exportOnly && <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600 space-y-1">
          <span className="block">{t.controls.period}</span>
          <select value={p} onChange={(ev) => setP(ev.target.value)} className={field}>
            {REPORT_PRESETS.map((k) => <option key={k} value={k}>{t.presets[k]}</option>)}
          </select>
        </label>
        {p === "custom" && (
          <>
            <label className="text-xs font-medium text-slate-600 space-y-1"><span className="block">{t.controls.from}</span><input type="date" required value={f} onChange={(ev) => setF(ev.target.value)} className={field} /></label>
            <label className="text-xs font-medium text-slate-600 space-y-1"><span className="block">{t.controls.to}</span><input type="date" required value={e} onChange={(ev) => setE(ev.target.value)} className={field} /></label>
          </>
        )}
        {tab !== "activity" && (
          <label className="text-xs font-medium text-slate-600 space-y-1">
            <span className="block">{t.controls.basis}</span>
            <select value={b} onChange={(ev) => setB(ev.target.value)} className={field}>
              <option value="issued">{t.controls.basisIssued}</option>
              <option value="paid">{t.controls.basisPaid}</option>
            </select>
          </label>
        )}
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">{t.controls.apply}</button>
      </form>}
      <div className="flex flex-wrap gap-2">
        {exports.map((x) => (
          <button key={x.kind} type="button" disabled={pending} onClick={() => download(x.kind)} className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {pending ? t.controls.exporting : x.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
