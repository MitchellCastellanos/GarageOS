"use client";

import { useState } from "react";
import { acknowledgeDiscoveryRunQuality } from "@/actions/lead-radar";
import { btnPrimary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import type { RunQuality } from "@/domain/lead-radar/run-quality";

/** Shows the gate verdict with explicit counters. A blocked run (FAILED + verdict) can be acknowledged by a Super Admin with a written reason. */
export function RunQualityPanel({ locale, runId, status, quality, ackNote }: { locale: "en" | "fr"; runId: string; status: string; quality: RunQuality | null; ackNote: string | null }) {
  const { error, notice, pending, run } = useRadarAction(locale);
  const [note, setNote] = useState("");
  const k = nationalCopy(locale).quality;
  if (!quality) return null;
  const blocked = status === "FAILED" && quality.blocking;
  const tone = blocked ? "border-red-300 bg-red-50 text-red-900" : quality.verdict === "OK" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900";
  const n = quality.counters;
  const pct = quality.rates.coverage === null ? "—" : `${Math.round(quality.rates.coverage * 100)} %`;
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="lr-quality">
      <h2 id="lr-quality" className="font-semibold text-slate-900">{k.title}</h2>
      <p role={blocked ? "alert" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium ${tone}`}>{k.verdicts[quality.verdict] ?? quality.verdict}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {([["received", n.received], ["withPoint", n.withPoint], ["valid", n.pointsAccepted], ["invalid", n.pointsInvalid], ["missing", n.pointsMissing], ["coverage", pct]] as const).map(([key, v]) => (
          <div key={key}><dt className="text-xs text-slate-500">{k.counters[key]}</dt><dd className="text-lg font-semibold">{v}</dd></div>
        ))}
      </dl>
      {ackNote && <p className="text-sm text-slate-700">{k.ackedBy}: {ackNote}</p>}
      {blocked && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-medium text-slate-800">{k.ackTitle}</h3>
          <p className="text-xs text-slate-600">{k.ackHelp}</p>
          <label className="grid gap-1 text-sm font-medium text-slate-700">{k.ackLabel}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label>
          <FormMessage error={error} notice={notice} />
          <button type="button" className={btnPrimary} disabled={pending || note.trim().length < 10} onClick={() => run(() => acknowledgeDiscoveryRunQuality(runId, note))}>{k.ackButton}</button>
        </div>
      )}
    </section>
  );
}
