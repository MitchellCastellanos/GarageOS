"use client";

import { useState } from "react";
import { rematchProvinceCandidates } from "@/actions/lead-radar";
import { PROVINCE_CODES, PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { fill } from "@/lib/admin-locale/lead-radar";
import { fitReasonLabel, nationalCopy } from "@/lib/admin-locale/lead-radar-national";

interface Icp {
  newlyExcluded: number; newlyDomainOnlyReview: number; tombstonesToWrite: number; newlyExcludedByCategory: Record<string, number>; newlyExcludedByBrand: Record<string, number>; newlyExcludedExamples: { name: string; city: string | null; brand: string | null }[];
  newlyEligible: number; remainingHumanReview: number; remainingReviewByReason: Record<string, number>; verifiedAfter: number; excludedAfter: number; registryVersion: number;
  crmMatchImpact: { newlyExcludedWithCrmMatch: number; newlyExcludedAmbiguousOrBranch: number };
  protectedDecisions: { examined: number; fitWouldChange: number; approvedNowBlockedAtImport: number };
}
interface Res { applied: boolean; examined: number; changed: number; transitions: Record<string, number>; nextCursor: string | null; icp: Icp }

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
          <div className="space-y-1 border-t border-slate-200 pt-2 text-xs">
            <p className="font-semibold text-slate-900">{k.icp.title} · {k.icp.registry} {res.icp.registryVersion}</p>
            <p>{k.icp.newlyExcluded}: <strong>{res.icp.newlyExcluded}</strong> ({k.icp.domainOnly}: {res.icp.newlyDomainOnlyReview} · {k.icp.tombstones}: {res.icp.tombstonesToWrite}) · {k.icp.newlyEligible}: <strong>{res.icp.newlyEligible}</strong> · {k.icp.remaining}: <strong>{res.icp.remainingHumanReview}</strong></p>
            {res.icp.remainingHumanReview > 0 && <p>{k.icp.remaining}: {Object.entries(res.icp.remainingReviewByReason).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${fitReasonLabel(locale, c)} ${n}`).join(" · ")}</p>}
            <p>{k.icp.after}: <strong>{res.icp.verifiedAfter}</strong> / <strong>{res.icp.excludedAfter}</strong></p>
            <p>{k.icp.crm}: <strong>{res.icp.crmMatchImpact.newlyExcludedWithCrmMatch}</strong> / <strong>{res.icp.crmMatchImpact.newlyExcludedAmbiguousOrBranch}</strong></p>
            {res.icp.newlyExcluded > 0 && <p>{k.icp.byCategory}: {Object.entries(res.icp.newlyExcludedByCategory).map(([c, n]) => `${c} ${n}`).join(" · ")}</p>}
            {res.icp.newlyExcluded > 0 && <p>{k.icp.byBrand}: {Object.entries(res.icp.newlyExcludedByBrand).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(" · ")}</p>}
            <p>{k.icp.protectedTitle}: {fill(k.icp.protectedLine, { n: String(res.icp.protectedDecisions.examined), m: String(res.icp.protectedDecisions.fitWouldChange), k: String(res.icp.protectedDecisions.approvedNowBlockedAtImport) })}</p>
          </div>
          {res.nextCursor && <p className="text-xs text-amber-800">{k.more}</p>}
        </div>
      )}
    </section>
  );
}
