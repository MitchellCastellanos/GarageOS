"use client";

import { useState } from "react";
import { changeOpportunityStage } from "@/actions/sales-pipeline";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

const SELECTABLE = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"];

/** Accessible (keyboard/touch friendly) stage mover: pick the target, add the reason when the stage needs one, confirm. WON is never offered. */
export function StageControl({ locale, opportunityId, stage, compact = false }: { locale: "en" | "fr"; opportunityId: string; stage: string; compact?: boolean }) {
  const { t, pending, error, run, setError } = useCrmAction(locale);
  const [target, setTarget] = useState("");
  const needsLoss = target === "LOST";
  const needsNote = target === "UNQUALIFIED" || target === "DO_NOT_CONTACT";
  const warn = target === "DO_NOT_CONTACT" ? t.prospects.detail.dncConfirm : null;
  return (
    <form className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2"} action={(form) => {
      if (!target) return;
      if (warn && !window.confirm(warn)) return;
      run(() => changeOpportunityStage(opportunityId, target, form), () => setTarget(""), t.opp.stageChanged);
    }}>
      <label className={labelCls}>
        <span className={compact ? "sr-only" : undefined}>{t.opp.moveTo}</span>
        <select className={inputCls} value={target} onChange={(e) => { setTarget(e.target.value); setError(null); }} disabled={pending} aria-label={t.opp.moveTo}>
          <option value="">{t.opp.moveTo}</option>
          {SELECTABLE.filter((s) => s !== stage).map((s) => <option key={s} value={s}>{t.stages[s]}</option>)}
        </select>
      </label>
      {needsLoss && (
        <label className={labelCls}>{t.opp.lossReason} *
          <select className={inputCls} name="lossReason" required disabled={pending}>
            <option value="">{t.common.select}</option>{Object.entries(t.lossReasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      {(needsLoss || needsNote) && (
        <label className={`${labelCls} sm:col-span-2`}>{t.opp.closeNote}{needsNote ? " *" : ""}
          <textarea className={`${inputCls} min-h-20 py-2`} name="note" maxLength={1000} required={needsNote} disabled={pending} />
        </label>
      )}
      <FormMessage error={error} />
      {target && (
        <div className="flex gap-2 sm:col-span-2">
          <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.opp.confirmMove}</button>
          <button type="button" className={btnSecondary} onClick={() => setTarget("")} disabled={pending}>{t.common.cancel}</button>
        </div>
      )}
    </form>
  );
}
