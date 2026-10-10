"use client";

import { useState } from "react";
import { previewLegacyBasisReclassification, reclassifyLegacyBases, revertLegacyReclassification } from "@/actions/sales-casl-legacy";
import { btnDanger, btnPrimary, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

const KINDS = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "EXEMPT"] as const;
type Impact = Extract<Awaited<ReturnType<typeof previewLegacyBasisReclassification>>, { ok: true }>;

export function LegacyBasisPanel({ locale, runs }: { locale: "en" | "fr"; runs: { id: string; at: string; count: number }[] }) {
  const L = leadCopy(locale).evidence.legacy, C = commsCopy(locale);
  const { pending, error, notice, run } = useCrmAction(locale);
  const [kinds, setKinds] = useState<string[]>(["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const toggle = (k: string) => { setImpact(null); setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]); };
  const stat = (label: string, v: number, warn = false) => <div className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-2xl font-semibold ${warn && v > 0 ? "text-amber-700" : ""}`}>{v}</dd></div>;
  return (
    <section className={`${cardCls} space-y-4`}>
      <h2 className="font-semibold text-slate-900">{L.title}</h2>
      <p className="text-sm text-slate-600">{L.help}</p>
      <fieldset className="space-y-1"><legend className="text-sm font-medium text-slate-800">{L.kinds}</legend>
        {KINDS.map((k) => <label key={k} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4" checked={kinds.includes(k)} onChange={() => toggle(k)} /> {C.basis.kinds[k]}</label>)}
      </fieldset>
      <button className={btnSecondary} disabled={pending || kinds.length === 0} onClick={() => run(() => previewLegacyBasisReclassification(kinds), (r) => setImpact(r))}>{pending ? L.previewing : L.preview}</button>
      <FormMessage error={error} notice={notice} />
      {impact && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {stat(L.rows, impact.batchRows)}{stat(L.remaining, impact.remainingRows)}{stat(L.contacts, impact.contactsAffected)}
            {stat(L.losing, impact.contactsLosingSendability, true)}{stat(L.enrollments, impact.activeEnrollments, true)}{stat(L.queued, impact.queuedCommercialMessages, true)}
          </dl>
          {impact.sample.length > 0 && <p className="text-sm text-slate-700"><b>{L.sample}:</b> {impact.sample.map((s) => s.prospectName).join(" · ")}</p>}
          {impact.batchRows === 0 ? <p className="text-sm text-slate-600">{L.none}</p> : (
            <>
              <p className="text-xs text-slate-500">{L.staleHint}</p>
              <button className={btnPrimary} disabled={pending} onClick={() => run(() => reclassifyLegacyBases(impact.kinds, impact.token), () => setImpact(null), L.done.replace("{n}", String(impact.batchRows)))}>{pending ? L.applying : L.apply.replace("{n}", String(impact.batchRows))}</button>
            </>
          )}
        </div>
      )}
      {runs.length > 0 && (
        <div><h3 className="mb-1 text-sm font-medium text-slate-800">{L.runs}</h3>
          <ul className="space-y-2 text-sm">{runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2"><span>{formatDate(r.at, locale, true)} · {L.runRow.replace("{n}", String(r.count))}</span>
              <button className={btnDanger} disabled={pending} onClick={() => run(() => revertLegacyReclassification(r.id), () => setImpact(null), L.reverted.replace("{n}", String(r.count)))}>{L.revert}</button></li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
