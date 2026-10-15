"use client";

import { useState } from "react";
import { activateLeadPolicy, createLeadPolicy, previewLeadPolicy } from "@/actions/lead-radar-automation";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/domain/lead-radar/geo";
import { DEFAULT_POLICY_RULES, REVIEWABLE_FLAGS } from "@/domain/lead-radar/policy-rules";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

interface PolicyView {
  id: string; version: number; name: string; status: string; previewedAt: string | null; activatedAt: string | null; rules: Record<string, unknown>;
  preview: null | { evaluated: number; lanes: Record<string, number>; truncated: boolean };
}
type Preview = { evaluated: number; lanes: Record<string, number>; reasons: Record<string, number>; changes: Record<string, number>; truncated: boolean };

export function PolicyPanel({ locale, policies }: { locale: "en" | "fr"; policies: PolicyView[] }) {
  const { c, pending, error, notice, run } = useRadarAction(locale);
  const p = c.automation.policy;
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string>(DEFAULT_POLICY_RULES.secondaryTier);
  const [chain, setChain] = useState<string>(DEFAULT_POLICY_RULES.chainSignal);
  const [existing, setExisting] = useState<string>(DEFAULT_POLICY_RULES.existingMatch);
  const [needLoc, setNeedLoc] = useState(DEFAULT_POLICY_RULES.requireLocation);
  const [needChan, setNeedChan] = useState(DEFAULT_POLICY_RULES.requireReachableChannel);
  const [flags, setFlags] = useState<string[]>([...DEFAULT_POLICY_RULES.reviewFlags]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const tone = (s: string) => (s === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : s === "DRAFT" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600");
  const label = (s: string) => (s === "ACTIVE" ? p.active : s === "DRAFT" ? p.draft : p.superseded);
  const sel = (value: string, set: (v: string) => void, opts: [string, string][]) => (
    <select className={inputCls} value={value} onChange={(e) => set(e.target.value)} disabled={pending}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <section className={`${cardCls} space-y-4`} aria-labelledby="au-pol">
      <h2 id="au-pol" className="font-semibold text-slate-900">{p.title}</h2>
      <p className="text-sm text-slate-600">{p.help}</p>
      <p className="text-xs text-slate-500">{p.alwaysHuman}</p>

      {policies.length === 0 ? <p className="text-sm text-slate-500">{p.none}</p> : (
        <ul className="space-y-3">
          {policies.map((pol) => {
            const pv = previews[pol.id];
            return (
              <li key={pol.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><strong>v{pol.version} · {pol.name}</strong><Badge tone={tone(pol.status)}>{label(pol.status)}</Badge>{pol.previewedAt && <span className="text-xs text-slate-500">{p.previewedAt}: {new Date(pol.previewedAt).toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</span>}</div>
                {(pv || pol.preview) && (() => {
                  const lanes = pv?.lanes ?? pol.preview!.lanes; const evaluated = pv?.evaluated ?? pol.preview!.evaluated; const truncated = pv?.truncated ?? pol.preview!.truncated;
                  return (
                    <div className="mt-2 space-y-1">
                      <p className="text-slate-700">{p.evaluated}: <strong className="tabular-nums">{evaluated.toLocaleString("en-CA")}</strong> · {Object.entries(lanes).map(([l, n]) => `${p.lanes[l] ?? l}: ${n.toLocaleString("en-CA")}`).join(" · ")}</p>
                      {truncated && <p className="text-xs text-amber-800">{p.truncated}</p>}
                      {pv && Object.keys(pv.changes).length > 0 && <p className="text-xs text-slate-500">{p.changes}: {Object.entries(pv.changes).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>}
                      {pv && Object.keys(pv.reasons).length > 0 && <ul className="text-xs text-slate-600">{Object.entries(pv.reasons).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, n]) => <li key={r}>{c.automation.qualification.reasons[r] ?? r}: {n}</li>)}</ul>}
                    </div>
                  );
                })()}
                {pol.status === "DRAFT" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => previewLeadPolicy(pol.id), (r) => setPreviews((m) => ({ ...m, [pol.id]: r.preview as Preview })))}>{pending ? p.previewing : p.preview}</button>
                    <button type="button" className={btnPrimary} disabled={pending || !pol.previewedAt} onClick={() => { if (window.confirm(p.activateConfirm)) run(() => activateLeadPolicy(pol.id), undefined, p.activated); }}>{pending ? p.activating : p.activate}</button>
                    {!pol.previewedAt && !pv && <span className="text-xs text-slate-500">{p.needsPreview}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3" disabled={pending}>
        <legend className="px-1 text-sm font-medium text-slate-700">{p.create}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>{p.name}<input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
          <label className={labelCls}>{p.note}<input className={inputCls} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} /></label>
          <label className={labelCls}>{p.secondary}{sel(secondary, setSecondary, [["REVIEW", p.review], ["AUTO", p.auto]])}</label>
          <label className={labelCls}>{p.chain}{sel(chain, setChain, [["REVIEW", p.review], ["AUTO", p.auto], ["BLOCK", p.block]])}</label>
          <label className={labelCls}>{p.existing}{sel(existing, setExisting, [["AUTO_LINK", p.autoLink], ["REVIEW", p.review]])}</label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={needLoc} onChange={(e) => setNeedLoc(e.target.checked)} />{p.requireLocation}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={needChan} onChange={(e) => setNeedChan(e.target.checked)} />{p.requireChannel}</label>
        <div><p className="text-sm font-medium text-slate-700">{p.flags}</p><div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{REVIEWABLE_FLAGS.map((f) => (
          <label key={f} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={flags.includes(f)} onChange={() => setFlags((l) => toggle(l, f))} />{p.flagLabels[f] ?? f}</label>))}</div></div>
        <div><p className="text-sm font-medium text-slate-700">{p.provinces}</p><div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">{PROVINCE_CODES.map((code) => (
          <label key={code} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={provinces.includes(code)} onChange={() => setProvinces((l) => toggle(l, code))} />{PROVINCE_NAMES[code][locale]} ({code})</label>))}</div></div>
        <button type="button" className={btnPrimary} disabled={pending || name.trim().length < 3}
          onClick={() => run(() => createLeadPolicy({ name, note, rules: { provinces, secondaryTier: secondary, chainSignal: chain, existingMatch: existing, requireLocation: needLoc, requireReachableChannel: needChan, reviewFlags: flags } }), undefined, p.saved)}>{p.saveDraft}</button>
      </fieldset>
      <FormMessage error={error} notice={notice} />
    </section>
  );
}
