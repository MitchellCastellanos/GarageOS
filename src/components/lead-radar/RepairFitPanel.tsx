"use client";

import { useRef, useState } from "react";
import { applyRepairFitCleanup, decideRepairFit, loadFieldReadiness, loadRepairFitReview, previewRepairFitCleanup } from "@/actions/lead-radar-cleanup";
import { cleanupCopy, reasonLabel } from "@/lib/admin-locale/lead-radar-cleanup";
import type { CleanupPreview, FieldReadiness } from "@/lib/sales-crm/repair-fit-service";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

const n = (x: number) => x.toLocaleString("en-CA");
type Row = { id: string; name: string; city: string | null; province: string | null; fit: string | null; reasons: string[]; protected: boolean; owner: string | null; stage: string | null; category: string | null; website: string | null };
type Review = { total: number; page: number; pageSize: number; rows: Row[] };

export function RepairFitPanel({ locale, isAdmin }: { locale: "en" | "fr"; isAdmin: boolean }) {
  const { c, pending, error, notice, run, setError, setNotice } = useRadarAction(locale);
  const d = cleanupCopy(locale);
  const [names, setNames] = useState(false), [prev, setPrev] = useState<CleanupPreview | null>(null);
  const [ok, setOk] = useState(false), [prog, setProg] = useState<{ processed: number; changed: number; done: boolean; cursor: string | null } | null>(null), [running, setRunning] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const stop = useRef(false);
  const [fun, setFun] = useState<FieldReadiness | null>(null);
  const [fit, setFit] = useState("HUMAN_REVIEW"), [assigned, setAssigned] = useState(""), [protectedOnly, setProtectedOnly] = useState(false), [q, setQ] = useState(""), [page, setPage] = useState(1);
  const [rev, setRev] = useState<Review | null>(null), [sel, setSel] = useState<string[]>([]), [reason, setReason] = useState("");

  async function applyAll(from: string | null) {
    stop.current = false; setRunning(true); setError(null); setMsg(null);
    let cursor = from, processed = prog?.processed ?? 0, changed = prog?.changed ?? 0;
    try {
      for (;;) {
        const r = await applyRepairFitCleanup({ cursor, confirm: ok });
        if (!r.ok) { setError(c.errors?.[r.error] ?? r.error); break; }
        processed += r.processed; changed += r.changed; cursor = r.nextCursor;
        setProg({ processed, changed, done: r.done, cursor });
        if (r.done) { setMsg(d.apply.done); break; }
        if (stop.current) { setMsg(d.apply.stopped); break; }
      }
    } catch { setError(c.errors?.unexpected ?? "unexpected"); } finally { setRunning(false); }
  }
  function load(p = 1) { setPage(p); setSel([]); run(() => loadRepairFitReview({ fit, protectedOnly, assigned, q, page: p }), (r) => setRev({ total: r.total, page: r.page, pageSize: r.pageSize, rows: r.rows as unknown as Row[] })); }
  function decide(decision: "VERIFIED_REPAIR" | "EXCLUDED" | "RESET") {
    setNotice(null);
    run(() => decideRepairFit({ ids: sel, decision, reason }), () => { setNotice(d.review.done); load(page); }, d.review.done);
  }
  const rows = (rec: Record<string, { VERIFIED_REPAIR: number; HUMAN_REVIEW: number; EXCLUDED: number }>) => Object.entries(rec).map(([k, v]) => (
    <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-3 break-words">{k}</td>{(["VERIFIED_REPAIR", "HUMAN_REVIEW", "EXCLUDED"] as const).map((f) => <td key={f} className="pr-3 text-right tabular-nums">{n(v[f])}</td>)}</tr>
  ));
  const head = (first: string) => <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">{first}</th>{(["VERIFIED_REPAIR", "HUMAN_REVIEW", "EXCLUDED"] as const).map((f) => <th key={f} className="pr-3 text-right">{d.dispositions[f]}</th>)}</tr></thead>;

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.how}</p>

      {isAdmin && (
        <section className={`${cardCls} space-y-3`} aria-labelledby="rf-fun">
          <h2 id="rf-fun" className="font-semibold text-slate-900">{d.funnel.title}</h2>
          <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => loadFieldReadiness(), (r) => setFun(r.readiness as FieldReadiness))}>{d.funnel.run}</button>
          {fun && (
            <div className="space-y-2 text-sm">
              <p className="text-xs text-slate-500">{d.funnel.keys}: {fun.fieldTerritoryKeys.join(", ") || "—"}</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>{d.funnel.cand}: <b>{n(fun.candidates.total)}</b> · {n(fun.candidates.withSourcePoint)} {d.funnel.point} · {n(fun.candidates.inFieldTerritory)} {d.funnel.inField}</li>
                <li>{d.funnel.imp}: {Object.entries(fun.candidates.byImportState).map(([k, v]) => `${k} ${n(v)}`).join(" · ")}</li>
                <li className="text-amber-900">{d.funnel.refresh}: <b>{n(fun.importedNeedingRefresh)}</b></li>
                <li>{d.funnel.prospects}: <b>{n(fun.prospects.total)}</b> · {d.funnel.assigned} {n(fun.prospects.assigned)} · {d.funnel.unassigned} {n(fun.prospects.unassigned)} · {d.funnel.fieldSellers} {n(fun.prospects.assignedToFieldSellers)}</li>
                <li>{d.funnel.fit}: {Object.entries(fun.prospects.byFit).map(([k, v]) => `${d.dispositions[k] ?? k} ${n(v)}`).join(" · ")}</li>
                <li>{d.funnel.located}: <b>{n(fun.located.withPosition)}</b> · {d.funnel.notLocated} {n(fun.located.withoutPosition)}</li>
                <li className="text-amber-900">{d.funnel.notApplied}: <b>{n(fun.located.sourcePointNotApplied)}</b></li>
              </ul>
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section className={`${cardCls} space-y-3`} aria-labelledby="rf-prev">
          <h2 id="rf-prev" className="font-semibold text-slate-900">{d.preview.title}</h2>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={names} onChange={(e) => setNames(e.target.checked)} />{d.preview.names}</label>
          <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => previewRepairFitCleanup({ includeNames: names }), (r) => setPrev(r.preview as CleanupPreview))}>{pending ? d.preview.running : d.preview.run}</button>
          {prev && (
            <div className="space-y-4 text-sm">
              <p className="text-xs text-slate-500">{d.preview.scanned}: <strong>{n(prev.scanned)}</strong>{prev.truncated ? ` · ${d.preview.truncated}` : ""}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(["VERIFIED_REPAIR", "HUMAN_REVIEW", "EXCLUDED"] as const).map((f) => <div key={f} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{d.preview.proposed}: {d.dispositions[f]}</dt><dd className="text-2xl font-semibold tabular-nums">{n(prev.proposed[f])}</dd></div>)}
                <div className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{d.preview.wouldChange}</dt><dd className="text-2xl font-semibold tabular-nums">{n(prev.wouldChange)}</dd></div>
                <div className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{d.preview.current}</dt><dd className="text-2xl font-semibold tabular-nums">{n(prev.alreadyCurrent)}</dd></div>
                <div className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{d.preview.humanDecided}</dt><dd className="text-2xl font-semibold tabular-nums">{n(prev.humanDecided.VERIFIED_REPAIR + prev.humanDecided.HUMAN_REVIEW + prev.humanDecided.EXCLUDED)}</dd></div>
              </dl>
              <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left">{head(d.preview.assignment)}<tbody>{rows({ [d.preview.assigned]: prev.assignment.assigned, [d.preview.assignedField]: prev.assignment.assignedField, [d.preview.unassigned]: prev.assignment.unassigned })}</tbody></table></div>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{d.preview.protected}: <strong>{n(prev.protected.total)}</strong> · {n(prev.protected.flaggedForReview)} {d.preview.protectedFlagged}</p>
              <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left">{head(d.preview.bySource)}<tbody>{rows(prev.bySource)}</tbody></table></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left">{head(d.preview.byQualification)}<tbody>{rows(prev.byQualification)}</tbody></table></div>
              <div><h3 className="font-medium text-slate-800">{d.preview.reasons}</h3><ul className="mt-1">{Object.entries(prev.reasons).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => <li key={k} className="flex justify-between gap-3 border-t border-slate-100 py-1"><span>{reasonLabel(d, k)}</span><span className="tabular-nums">{n(v)}</span></li>)}</ul></div>
              {prev.examples.length > 0 && <div><h3 className="font-medium text-slate-800">{d.preview.examples}</h3><ul className="mt-1 text-xs">{prev.examples.map((e) => <li key={e.id} className="border-t border-slate-100 py-1"><b>{d.dispositions[e.fit]}</b> · {e.name} {e.city ? `· ${e.city}` : ""} — {e.reasons.map((r) => reasonLabel(d, r)).join(", ")}{e.protected ? ` · ${d.review.protectedBadge}` : ""}</li>)}</ul></div>}
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section className={`${cardCls} space-y-3`} aria-labelledby="rf-apply">
          <h2 id="rf-apply" className="font-semibold text-slate-900">{d.apply.title}</h2>
          <p className="text-sm text-slate-600">{d.apply.help}</p>
          <label className="flex min-h-11 items-start gap-2 text-sm font-medium text-slate-900"><input type="checkbox" className="mt-0.5 size-5" checked={ok} onChange={(e) => setOk(e.target.checked)} />{d.apply.confirm}</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={!ok || running} onClick={() => void applyAll(null)}>{d.apply.run}</button>
            {prog && !prog.done && <button type="button" className={btnSecondary} disabled={!ok || running} onClick={() => void applyAll(prog.cursor)}>{d.apply.resume}</button>}
            {running && <button type="button" className={btnSecondary} onClick={() => { stop.current = true; }}>{d.apply.stop}</button>}
          </div>
          {prog && <p role="status" className="text-sm text-slate-700">{d.apply.progress}: <b>{n(prog.processed)}</b> · <b>{n(prog.changed)}</b> {d.apply.changed}</p>}
          {msg && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
        </section>
      )}

      <section className={`${cardCls} space-y-3`} aria-labelledby="rf-rev">
        <h2 id="rf-rev" className="font-semibold text-slate-900">{d.review.title}</h2>
        <p className="text-sm text-slate-600">{d.review.help}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className={labelCls}>{d.review.filter}<select className={inputCls} value={fit} onChange={(e) => setFit(e.target.value)}>{(["HUMAN_REVIEW", "EXCLUDED", "VERIFIED_REPAIR"] as const).map((f) => <option key={f} value={f}>{d.dispositions[f]}</option>)}</select></label>
          <label className={labelCls}>{d.review.assigned}<select className={inputCls} value={assigned} onChange={(e) => setAssigned(e.target.value)}><option value="">{d.review.any}</option><option value="yes">{d.review.yes}</option><option value="no">{d.review.no}</option></select></label>
          <label className={labelCls}>{d.review.search}<input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} /></label>
          <label className="flex min-h-11 items-end gap-2 pb-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={protectedOnly} onChange={(e) => setProtectedOnly(e.target.checked)} />{d.review.protectedOnly}</label>
        </div>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => load(1)}>{d.review.load}</button>
        <FormMessage error={error} notice={notice} />
        {rev && (rev.rows.length === 0 ? <p className="text-sm text-slate-600">{d.review.none}</p> : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{d.review.page} {rev.page} {d.review.of} {Math.max(1, Math.ceil(rev.total / rev.pageSize))} · {n(rev.total)} · {sel.length} {d.review.selected}</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rev.rows.map((r) => (
                <li key={r.id}><label className="flex min-h-14 cursor-pointer items-start gap-3 px-3 py-2">
                  <input type="checkbox" className="mt-1 size-5 shrink-0" aria-label={`${d.review.select}: ${r.name}`} checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : s.length >= 100 ? s : [...s, r.id]))} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block break-words font-medium text-slate-900">{r.name}{r.protected && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{d.review.protectedBadge}</span>}</span>
                    <span className="block text-xs text-slate-500">{[r.city, r.province, r.category, r.owner ? `${d.review.owner}: ${r.owner}` : null, r.stage].filter(Boolean).join(" · ")}</span>
                    <span className="block text-xs text-slate-700">{r.reasons.map((x) => reasonLabel(d, x)).join(" · ")}</span>
                  </span>
                </label></li>
              ))}
            </ul>
            <div className="space-y-2">
              <label className={labelCls}>{d.review.decisionReason}<input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={pending || !sel.length || reason.trim().length < 3} onClick={() => decide("VERIFIED_REPAIR")}>{d.review.verified}</button>
                <button type="button" className={btnSecondary} disabled={pending || !sel.length || reason.trim().length < 3} onClick={() => decide("EXCLUDED")}>{d.review.excluded}</button>
                <button type="button" className={btnSecondary} disabled={pending || !sel.length || reason.trim().length < 3} onClick={() => decide("RESET")}>{d.review.reset}</button>
              </div>
              <div className="flex gap-2">
                <button type="button" className={btnSecondary} disabled={pending || page <= 1} onClick={() => load(page - 1)}>‹</button>
                <button type="button" className={btnSecondary} disabled={pending || page >= Math.ceil(rev.total / rev.pageSize)} onClick={() => load(page + 1)}>›</button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
