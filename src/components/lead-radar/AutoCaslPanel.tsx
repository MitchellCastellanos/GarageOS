"use client";

import { useState } from "react";
import { setAutoCaslPolicyAction, setEvidenceEnabledAction } from "@/actions/lead-radar-automation";
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

/**
 * Owner-level controls for the automated CASL policy. Activation is a single, typed, audited, policy-wide decision (never per contact) and is OFF by default; deactivation is immediate.
 * The evidence stage switch controls only the bounded reading of each shop's own website. Neither control changes any send switch, cap or enrollment.
 */
export function AutoCaslPanel({ locale, view }: { locale: "en" | "fr"; view: { evidenceEnabled: boolean; autoCaslActive: boolean; ruleVersion: string; activatedAt: string | null } }) {
  const { c, pending, error, notice, run } = useRadarAction(locale);
  const k = c.automation.casl;
  const [phrase, setPhrase] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">{k.version}: <b>{view.ruleVersion}</b></p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">{view.evidenceEnabled ? k.stageOn : k.stageOff}</span>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => setEvidenceEnabledAction(!view.evidenceEnabled))}>{view.evidenceEnabled ? k.turnOff : k.turnOn}</button>
      </div>
      <p className="text-xs text-slate-500">{k.stage}</p>
      <div className={`rounded-lg border p-3 text-sm ${view.autoCaslActive ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        <b>{k.status}:</b> {view.autoCaslActive ? k.active : k.inactive}
        {view.autoCaslActive && view.activatedAt && <div className="mt-1 text-xs">{k.activatedAt}: {view.activatedAt.slice(0, 10)}</div>}
      </div>
      {view.autoCaslActive ? (
        <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => setAutoCaslPolicyAction({ active: false }))}>{k.deactivate}</button>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => setAutoCaslPolicyAction({ active: true, ruleVersion: view.ruleVersion, confirmation: phrase }), () => setPhrase("")); }}>
          <label className={labelCls}>{k.confirmLabel}: <code className="text-xs">{k.confirmPhrase}</code>
            <input className={inputCls} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <button className={btnPrimary} disabled={pending || phrase.trim() !== k.confirmPhrase}>{k.activate}</button>
        </form>
      )}
      <p className="text-xs text-slate-500">{k.nobody}</p>
      <FormMessage error={error} notice={notice} />
    </div>
  );
}
