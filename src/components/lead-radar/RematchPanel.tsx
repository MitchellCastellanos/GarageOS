"use client";

import { useState } from "react";
import { rematchProvinceCandidates } from "@/actions/lead-radar";
import { PROVINCE_CODES, PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { fill } from "@/lib/admin-locale/lead-radar";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";

interface Res { applied: boolean; examined: number; changed: number; transitions: Record<string, number>; nextCursor: string | null }

/** Owner tool: preview/apply a re-check of staged candidates' CRM matches for one province. Candidate match columns only; no prospect is touched. */
export function RematchPanel({ locale }: { locale: "en" | "fr" }) {
  const { error, notice, pending, run } = useRadarAction(locale);
  const k = nationalCopy(locale).dash.rematch;
  const [province, setProvince] = useState<ProvinceCode>("AB");
  const [res, setRes] = useState<Res | null>(null);
  const go = (apply: boolean) => {
    if (apply && !window.confirm(fill(k.confirm, { province: PROVINCE_NAMES[province][locale] }))) return;
    run(() => rematchProvinceCandidates({ province, apply }), (r) => setRes((r as unknown as { result: Res }).result));
  };
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="nat-rematch">
      <h2 id="nat-rematch" className="font-semibold text-slate-900">{k.title}</h2>
      <p className="text-xs text-slate-600">{k.help}</p>
      <label className={labelCls}>{k.province}<select className={inputCls} value={province} onChange={(e) => { setProvince(e.target.value as ProvinceCode); setRes(null); }}>{PROVINCE_CODES.map((p) => <option key={p} value={p}>{PROVINCE_NAMES[p][locale]} ({p})</option>)}</select></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => go(false)}>{k.preview}</button>
        <button type="button" className={btnPrimary} disabled={pending || !res || res.applied || res.changed === 0} onClick={() => go(true)}>{k.apply}</button>
      </div>
      <FormMessage error={error} notice={notice} />
      {res && (
        <div className="space-y-1 text-sm text-slate-700" aria-live="polite">
          <p>{k.examined}: <strong>{res.examined}</strong> · {k.changed}: <strong>{res.changed}</strong></p>
          {res.changed === 0 ? <p>{k.none}</p> : <ul className="list-disc pl-5 text-xs">{Object.entries(res.transitions).map(([t, n]) => <li key={t}>{t.replace("->", " → ").replace("match:", "match · ").replace("fit:", "fit · ")}: {n}</li>)}</ul>}
          {res.nextCursor && <p className="text-xs text-amber-800">{k.more}</p>}
        </div>
      )}
    </section>
  );
}
