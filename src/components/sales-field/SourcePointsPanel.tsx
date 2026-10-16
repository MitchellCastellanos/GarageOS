"use client";

import { useState } from "react";
import { loadPointDiagnosticsAction, refreshSourcePointsAction } from "@/actions/sales-geocoding";
import { pointsCopy } from "@/lib/admin-locale/lead-radar-points";
import type { PointDiagnostics, PointsReport } from "@/lib/lead-radar/points-refresh";
import { btnPrimary, btnSecondary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

const n = (x: number) => x.toLocaleString("en-CA");
const CHUNK_LINES = 2000;

export function SourcePointsPanel({ locale }: { locale: "en" | "fr" }) {
  const p = pointsCopy(locale);
  const { pending, error, notice, run, setError } = useCrmAction(locale);
  const [d, setD] = useState<PointDiagnostics | null>(null);
  const [lines, setLines] = useState<string[] | null>(null), [busy, setBusy] = useState(false), [rep, setRep] = useState<PointsReport | null>(null), [msg, setMsg] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    setRep(null); setMsg(null); setLines(null);
    if (!f) return;
    if (f.size > 20_000_000) { setError("CHUNK_TOO_LARGE"); return; }
    setLines((await f.text()).split("\n").map((l) => l.trim()).filter(Boolean));
  }
  // The file is walked in chunks; every chunk is independent and idempotent, so an interrupted upload is simply started again.
  async function go(apply: boolean) {
    if (!lines) return;
    if (apply && !window.confirm(p.refresh.confirm)) return;
    setBusy(true); setError(null); setMsg(null);
    const total: PointsReport = { dryRun: !apply, lines: 0, matched: 0, wouldUpdate: 0, updated: 0, skipped: {}, importedAmongUpdated: 0 };
    try {
      for (let i = 0; i < lines.length; i += CHUNK_LINES) {
        const r = await refreshSourcePointsAction({ text: lines.slice(i, i + CHUNK_LINES).join("\n"), apply });
        if (!r.ok) { setError(r.error); break; }
        const x = r.report;
        total.lines += x.lines; total.matched += x.matched; total.wouldUpdate += x.wouldUpdate; total.updated += x.updated; total.importedAmongUpdated += x.importedAmongUpdated;
        for (const [k, v] of Object.entries(x.skipped)) total.skipped[k as keyof typeof total.skipped] = (total.skipped[k as keyof typeof total.skipped] ?? 0) + (v ?? 0);
        setRep({ ...total });
      }
      if (apply) setMsg(p.refresh.done);
    } catch { setError("unexpected"); } finally { setBusy(false); }
  }
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="sp-h">
      <h2 id="sp-h" className="font-semibold text-slate-900">{p.title}</h2>
      <p className="text-xs text-slate-500">{p.help}</p>
      <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => loadPointDiagnosticsAction(), (r) => setD(r.diagnostics))}>{pending ? p.loading : p.load}</button>
      {d && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-medium text-slate-800">{p.db.title}</h3>
            <p className={d.database.pointColumnsPresent ? "text-emerald-800" : "font-semibold text-red-700"}>{d.database.pointColumnsPresent ? p.db.ok : p.db.missing}</p>
            {d.database.migrations ? <ul className="mt-1 text-xs text-slate-600">{d.database.migrations.map((m) => <li key={m.name}>{m.name}: {m.rolledBack ? p.db.rolledBack : m.finishedAt ? `${p.db.finished} ${m.finishedAt.slice(0, 10)}` : p.db.pending}</li>)}</ul> : <p className="text-xs text-slate-500">{p.db.unreadable}</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-medium text-slate-800">{p.cand.title}</h3>
            <ul className="grid gap-1 sm:grid-cols-2">{([[p.cand.total, d.candidates.total], [p.cand.withPoint, d.candidates.withPoint], [p.cand.withoutPoint, d.candidates.withoutPoint], [p.cand.imported, d.candidates.imported], [p.cand.importedWithPoint, d.candidates.importedWithPoint], [p.cand.importedWithoutPoint, d.candidates.importedWithoutPoint]] as const).map(([k, v]) => <li key={k}>{k}: <b>{n(v)}</b></li>)}</ul></div>
          <div className="rounded-lg bg-slate-50 p-3"><h3 className="font-medium text-slate-800">{p.run.title}</h3>
            {!d.lastRun ? <p>{p.run.none}</p> : (<>
              <ul className="grid gap-1 sm:grid-cols-2"><li>{p.run.release}: <b>{d.lastRun.release}</b></li><li>{p.run.extractor}: <b>{d.lastRun.extractorVersion ?? "—"}</b></li><li>{p.run.received}: <b>{n(d.lastRun.received)}</b></li><li>{p.run.withPoint}: <b>{n(d.lastRun.recordsWithPoint)}</b></li><li>{p.run.accepted}: <b>{n(d.lastRun.pointsAccepted)}</b></li><li>{p.run.onNew}: <b>{n(d.lastRun.pointsOnNew)}</b> · {p.run.onExisting}: <b>{n(d.lastRun.pointsOnExisting)}</b></li></ul>
              <p role="status" className={`mt-2 rounded px-3 py-2 ${d.lastRun.verdict === "POINTS_OK" ? "bg-emerald-50 text-emerald-900" : d.lastRun.verdict === "OLD_RUN" ? "bg-amber-50 text-amber-900" : "bg-red-50 font-medium text-red-800"}`}>{p.run.verdict[d.lastRun.verdict]}</p></>)}
          </div>
        </div>
      )}
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <h3 className="text-sm font-medium text-slate-800">{p.refresh.title}</h3>
        <p className="text-xs text-slate-500">{p.refresh.help}</p>
        <label className="block text-sm text-slate-700">{p.refresh.file}<input type="file" accept=".ndjson,.jsonl,.txt,application/x-ndjson" className="mt-1 block min-h-11 w-full text-sm" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} disabled={!lines || busy} onClick={() => void go(false)}>{busy ? p.refresh.applying : p.refresh.preview}</button>
          <button type="button" className={btnPrimary} disabled={!lines || busy || !rep || !rep.dryRun || rep.wouldUpdate === 0} onClick={() => void go(true)}>{busy ? p.refresh.applying : p.refresh.apply}</button>
        </div>
        {lines && <p className="text-xs text-slate-500">{n(lines.length)} {p.refresh.lines}</p>}
        {rep && (
          <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
            <p>{n(rep.lines)} {p.refresh.lines} · {n(rep.matched)} {p.refresh.matched} · {rep.dryRun ? `${n(rep.wouldUpdate)} ${p.refresh.would}` : `${n(rep.updated)} ${p.refresh.updated}`} · {n(rep.importedAmongUpdated)} {p.refresh.imported}</p>
            {Object.keys(rep.skipped).length > 0 && <ul className="mt-1 text-xs text-slate-600">{Object.entries(rep.skipped).map(([k, v]) => <li key={k}>{p.refresh.skipped[k] ?? k}: {n(v ?? 0)}</li>)}</ul>}
          </div>
        )}
        {msg && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
        <FormMessage error={error} notice={notice} />
      </div>
    </section>
  );
}
