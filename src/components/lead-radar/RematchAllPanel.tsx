"use client";

import { useRef, useState } from "react";
import { applyProvinceReclassificationBatch, previewProvinceCandidatesBatch } from "@/actions/lead-radar";
import { PROVINCE_CODES, PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import {
  APPLY_THRESHOLDS, DOMAIN_ONLY_CSV_COLUMNS, MATCH_CSV_COLUMNS, PREVIEW_BATCH, REVIEW_CSV_COLUMNS, mergeBatch, newAcc, recommendApply, toCsv, type PreviewAcc, type PreviewBatch,
} from "@/domain/lead-radar/icp-preview";
import { applyGate, mergeApplyBatch, newApplyAcc, progressPct, type ApplyAcc } from "@/domain/lead-radar/icp-apply";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { fill, radarError } from "@/lib/admin-locale/lead-radar";
import { fitReasonLabel, nationalCopy } from "@/lib/admin-locale/lead-radar-national";

const KEY = (p: string) => `lead-radar:preview-all:${p}`;
const AKEY = (p: string) => `lead-radar:apply-all:${p}`;
const saveApply = (a: ApplyAcc) => { try { sessionStorage.setItem(AKEY(a.province), JSON.stringify(a)); } catch { /* resumable only within this tab */ } };
const loadApply = (p: string): ApplyAcc | null => { try { const v = sessionStorage.getItem(AKEY(p)); return v ? (JSON.parse(v) as ApplyAcc) : null; } catch { return null; } };
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);
const save = (acc: PreviewAcc) => { try { sessionStorage.setItem(KEY(acc.province), JSON.stringify(acc)); } catch { /* storage unavailable or full: the preview still works, it just cannot be resumed after a reload */ } };
const load = (p: string): PreviewAcc | null => { try { const v = sessionStorage.getItem(KEY(p)); return v ? (JSON.parse(v) as PreviewAcc) : null; } catch { return null; } };

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/** Owner tool: evaluates EVERY staged candidate of a province in bounded, read-only batches (the browser drives the loop and keeps the cursor, so it is resumable and each request stays short). */
export function RematchAllPanel({ locale }: { locale: "en" | "fr" }) {
  const k = nationalCopy(locale).dash.rematch.all;
  const [province, setProvince] = useState<ProvinceCode>("AB");
  const [acc, setAcc] = useState<PreviewAcc>(() => newAcc("AB"));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const stopApply = useRef(false);
  const [applyAcc, setApplyAcc] = useState<ApplyAcc | null>(null);
  const [applying, setApplying] = useState(false);
  const [ack, setAck] = useState(false);
  const [lastApplied, setLastApplied] = useState<ApplyAcc | null>(null);
  const ap = nationalCopy(locale).dash.rematch.all.apply;

  async function drive(start: PreviewAcc) {
    stop.current = false; setRunning(true); setError(null); setAcc(start);
    let cur = start;
    try {
      while (!cur.done && !stop.current) {
        const from = cur.cursor;
        const r = await previewProvinceCandidatesBatch({ province: cur.province, cursor: from });
        if (!r.ok) { setError(radarError(locale, r.error)); break; }
        const res = (r as unknown as { result: PreviewBatch & { detail: PreviewBatch["detail"]; poolSize: number } }).result;
        cur = mergeBatch(cur, res, from);
        setAcc(cur); save(cur);
      }
    } catch { setError(k.failed); }
    setRunning(false);
  }

  async function driveApply(start: ApplyAcc) {
    stopApply.current = false; setApplying(true); setError(null); setApplyAcc(start);
    let cur = start;
    try {
      while (!cur.done && !stopApply.current) {
        const from = cur.cursor;
        const r = await applyProvinceReclassificationBatch({ province: cur.province, cursor: from });
        if (!r.ok) { setError(radarError(locale, r.error)); break; }
        const res = (r as unknown as { result: { examined: number; changed: number; written?: number; skipped?: number; tombstonesCreated?: number; transitions: Record<string, number>; poolSize?: number; nextCursor: string | null } }).result;
        cur = mergeApplyBatch(cur, { examined: res.examined, changed: res.changed, written: res.written ?? 0, skipped: res.skipped ?? 0, tombstonesCreated: res.tombstonesCreated ?? 0, transitions: res.transitions, poolSize: res.poolSize ?? 0, nextCursor: res.nextCursor }, from);
        setApplyAcc(cur); saveApply(cur);
      }
    } catch { setError(k.failed); }
    setApplying(false);
    if (cur.done) {
      // The walk is finished: keep its summary, drop the resumable state and prove the result with a FRESH read-only province-wide preview.
      setLastApplied(cur); setApplyAcc(null);
      try { sessionStorage.removeItem(AKEY(cur.province)); sessionStorage.removeItem(KEY(cur.province)); } catch { /* ignore */ }
      const fresh = newAcc(cur.province); setAcc(fresh); setAck(false);
      await drive(fresh);
    }
  }

  const started = acc.batches > 0;
  const rec = recommendApply(acc);
  const gate = applyGate(started ? acc : null, applyAcc, applying, started && acc.done ? rec.verdict : null);
  const m = rec.metrics, th = APPLY_THRESHOLDS;
  const questionable = acc.detail.review.filter((r) => r.kind === "QUESTIONABLE_EXCLUSION"), ambiguous = acc.detail.review.filter((r) => r.kind === "AMBIGUOUS_VERIFIED");
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="nat-rematch-all">
      <h2 id="nat-rematch-all" className="font-semibold text-slate-900">{nationalCopy(locale).dash.rematch.title}</h2>
      <p className="text-xs text-slate-600">{fill(k.readOnly, { size: PREVIEW_BATCH })}</p>
      <label className={labelCls}>{nationalCopy(locale).dash.rematch.province}<select className={inputCls} value={province} disabled={running} onChange={(e) => { const p = e.target.value as ProvinceCode; setProvince(p); setAcc(load(p) ?? newAcc(p)); setApplyAcc(loadApply(p)); setLastApplied(null); setAck(false); setError(null); }}>{PROVINCE_CODES.map((p) => <option key={p} value={p}>{PROVINCE_NAMES[p][locale]} ({p})</option>)}</select></label>
      <div className="flex flex-wrap gap-2">
        {!running && !applying && !acc.done && <button type="button" className={btnPrimary} onClick={() => drive(acc.batches > 0 ? acc : load(province) ?? acc)}>{started ? k.resume : k.button}</button>}
        {running && <button type="button" className={btnSecondary} onClick={() => { stop.current = true; }}>{k.stop}</button>}
        {started && !running && <button type="button" className={btnSecondary} onClick={() => { try { sessionStorage.removeItem(KEY(province)); } catch { /* ignore */ } setAcc(newAcc(province)); }}>{k.restart}</button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {started && (
        <div className="space-y-3 text-sm text-slate-700" aria-live="polite">
          <p>{acc.done ? fill(k.complete, { n: acc.examined }) : running ? fill(k.progress, { b: acc.batches, n: acc.examined, t: acc.poolSize }) : fill(k.paused, { n: acc.examined, t: acc.poolSize })}</p>
          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{k.totals}</p>
            <p className="text-xs">{k.examined}: <strong>{acc.examined}</strong> · {k.changed}: <strong>{acc.changed}</strong> · {k.newlyExcluded}: <strong>{acc.icp.newlyExcluded}</strong> · {k.newlyEligible}: <strong>{acc.icp.newlyEligible}</strong> · {k.remaining}: <strong>{acc.icp.remainingHumanReview}</strong> · {k.verifiedAfter}: <strong>{acc.icp.verifiedAfter}</strong> · {k.excludedAfter}: <strong>{acc.icp.excludedAfter}</strong></p>
            <ul className="mt-1 list-disc pl-5 text-xs">{Object.entries(acc.transitions).sort().map(([t, n]) => <li key={t}>{t.replace("->", " → ").replace("match:", "match · ").replace("fit:", "fit · ")}: {n}</li>)}</ul>
            <p className="mt-1 text-xs">{Object.entries(acc.icp.newlyExcludedByCategory).map(([c, n]) => `${fitReasonLabel(locale, `ICP_${c}`)} ${n}`).join(" · ")}</p>
            <p className="text-xs">{Object.entries(acc.icp.newlyExcludedByBrand).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c.toLowerCase().replace(/_/g, " ")} ${n}`).join(" · ")}</p>
          </div>

          <div className={`rounded border p-3 ${rec.verdict === "GO" ? "border-green-300 bg-green-50" : rec.verdict === "NO_GO" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
            <p className="text-xs font-semibold uppercase text-slate-600">{k.verdictTitle}</p>
            <p className="font-semibold text-slate-900">{k.verdict[rec.verdict]}</p>
            <ul className="list-disc pl-5 text-xs">{rec.reasons.map((r) => <li key={r}>{k.reasons[r]}</li>)}</ul>
            <p className="mt-1 text-xs">{fill(k.metrics, { f: m.flaggedExclusions, q: m.questionableExclusions, x: m.newlyExcluded, qs: pct(m.questionableShare), d: m.domainOnly, ds: pct(m.domainOnlyShare), a: m.ambiguousVerified, v: m.verifiedAfter, as: pct(m.ambiguousVerifiedShare), tq: pct(th.questionableExclusionShareMax), td: pct(th.domainOnlyShareMax), ta: pct(th.ambiguousVerifiedShareMax) })}</p>
          </div>

          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{k.domainTitle} ({acc.detail.domainOnly.length})</p>
            {acc.detail.domainOnly.length === 0 ? <p className="text-xs">{k.domainNone}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="pr-2">{k.cols.business}</th><th className="pr-2">{k.cols.city}</th><th className="pr-2">{k.cols.domain}</th><th className="pr-2">{k.cols.brand}</th><th>{k.cols.reason}</th></tr></thead>
                <tbody>{acc.detail.domainOnly.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="pr-2">{r.name}</td><td className="pr-2">{r.city ?? ""}</td><td className="pr-2">{r.domain}</td><td className="pr-2">{r.brand?.toLowerCase().replace(/_/g, " ") ?? ""}</td><td>{k.domainReason}</td></tr>)}</tbody></table></div>
            )}
          </div>

          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{k.matchTitle}</p>
            <p className="text-xs">{fill(k.matchLine, { n: acc.detail.matchChanges.length, s: acc.icp.crmMatchImpact.newlyExcludedWithCrmMatch, a: acc.icp.crmMatchImpact.newlyExcludedAmbiguousOrBranch })}</p>
            {acc.detail.matchChanges.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="pr-2">{k.matchCols.business}</th><th className="pr-2">{k.matchCols.from}</th><th className="pr-2">{k.matchCols.to}</th><th>{k.matchCols.crm}</th></tr></thead>
                <tbody>{acc.detail.matchChanges.slice(0, 50).map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="pr-2">{r.name}{r.city ? ` — ${r.city}` : ""}</td><td className="pr-2">{r.from}</td><td className="pr-2">{r.to}</td><td>{r.crmBefore ?? ""}</td></tr>)}</tbody></table></div>
            )}
            {acc.detail.matchChanges.length > 50 && <p className="text-xs text-slate-500">{fill(k.matchMore, { n: 50 })}</p>}
          </div>

          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">{k.protectedTitle}</p>
            <p className="text-xs">{fill(k.protectedLine, { n: acc.icp.protectedDecisions.examined, m: acc.icp.protectedDecisions.fitWouldChange, k: acc.icp.protectedDecisions.approvedNowBlockedAtImport })}</p>
          </div>

          <div className="space-y-2 rounded border border-slate-200 p-3" aria-live="polite">
            <p className="font-semibold text-slate-900">{ap.title}</p>
            <p className="text-xs">{fill(ap.why[gate.state], { n: gate.expectedChanges, size: PREVIEW_BATCH })}</p>
            {applyAcc && applyAcc.batches > 0 && !applyAcc.done && (
              <>
                <div className="h-2 w-full overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={progressPct(applyAcc.examined, applyAcc.poolSize, applyAcc.done)} aria-valuemin={0} aria-valuemax={100}><div className="h-2 bg-blue-600" style={{ width: `${progressPct(applyAcc.examined, applyAcc.poolSize, applyAcc.done)}%` }} /></div>
                <p className="text-xs">{applying ? fill(ap.progress, { b: applyAcc.batches, n: applyAcc.examined, t: applyAcc.poolSize, w: applyAcc.written, s: applyAcc.skipped, x: applyAcc.tombstonesCreated }) : fill(ap.paused, { n: applyAcc.examined, t: applyAcc.poolSize, w: applyAcc.written })}</p>
              </>
            )}
            {lastApplied && <p className="text-xs">{fill(ap.done, { w: lastApplied.written, c: lastApplied.changed, s: lastApplied.skipped, x: lastApplied.tombstonesCreated })}{acc.done ? ` ${acc.changed === 0 ? ap.verified0 : fill(ap.verifiedLeft, { n: acc.changed })}` : ""}</p>}
            {gate.needsAcknowledgement && gate.canApply && <label className="flex min-h-11 items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />{ap.ack}</label>}
            <div className="flex flex-wrap gap-2">
              {gate.canApply && <button type="button" className={btnPrimary} disabled={running || (gate.needsAcknowledgement && !ack)} onClick={() => { if (!window.confirm(fill(ap.confirm, { province: PROVINCE_NAMES[province][locale] }))) return; driveApply(applyAcc ?? loadApply(province) ?? newApplyAcc(province)); }}>{applyAcc && applyAcc.batches > 0 ? ap.resume : fill(ap.button, { n: gate.expectedChanges })}</button>}
              {applying && <button type="button" className={btnSecondary} onClick={() => { stopApply.current = true; }}>{ap.stop}</button>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={!acc.detail.review.length} onClick={() => download(`c2-review-${province}.csv`, toCsv(acc.detail.review, REVIEW_CSV_COLUMNS))}>{fill(k.csvReview, { n: questionable.length + ambiguous.length })}</button>
            <button type="button" className={btnSecondary} disabled={!acc.detail.domainOnly.length} onClick={() => download(`domain-only-exclusions-${province}.csv`, toCsv(acc.detail.domainOnly, DOMAIN_ONLY_CSV_COLUMNS))}>{fill(k.csvDomain, { n: acc.detail.domainOnly.length })}</button>
            <button type="button" className={btnSecondary} disabled={!acc.detail.matchChanges.length} onClick={() => download(`crm-match-changes-${province}.csv`, toCsv(acc.detail.matchChanges, MATCH_CSV_COLUMNS))}>{fill(k.csvMatch, { n: acc.detail.matchChanges.length })}</button>
          </div>
        </div>
      )}
    </section>
  );
}
