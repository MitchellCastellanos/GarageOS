"use client";

import { useState } from "react";
import { NEXT_ACTIONS, OUTCOME_RULES, ROUTE_VISIT_OUTCOMES, type FieldVisitOutcome, type NextAction } from "@/domain/sales-crm/field-visit";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import type { CrmResult } from "@/lib/sales-crm/result";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface VisitPayload { outcome: FieldVisitOutcome; submissionId: string; note: string; followUpDate: string; nextAction?: NextAction }

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");

/** The one visit-result form (same outcomes, rules and copy) used by the route runner AND by the map panel. The submission id makes retries exactly-once. */
export function VisitResultForm({ locale, idPrefix, submit: send, onDone }: { locale: "en" | "fr"; idPrefix: string; submit: (payload: VisitPayload) => Promise<CrmResult<object>>; onDone?: () => void }) {
  const t = fieldCopy(locale), r = t.run;
  const { pending, error, notice, run } = useCrmAction(locale);
  const [outcome, setOutcome] = useState<FieldVisitOutcome | null>(null);
  const [note, setNote] = useState(""), [date, setDate] = useState(""), [next, setNext] = useState<NextAction | "">("");
  const [submissionId, setSubmissionId] = useState(newId);
  const rule = outcome ? OUTCOME_RULES[outcome] : null;
  const showTask = !!rule && rule.task !== "FORBIDDEN";
  function submit() {
    if (!outcome) return;
    run(() => send({ outcome, submissionId, note, followUpDate: showTask ? date : "", nextAction: showTask && rule?.task === "OPTIONAL" && next ? next : undefined }), () => {
      setOutcome(null); setNote(""); setDate(""); setNext(""); setSubmissionId(newId()); onDone?.();
    }, r.recorded);
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-slate-900">{r.result}</legend>
        <p className="mb-2 text-xs text-slate-500">{r.resultHelp}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROUTE_VISIT_OUTCOMES.map((o) => (
            <label key={o} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-base font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-300 ${outcome === o ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-800"}`}>
              <input type="radio" name={`outcome-${idPrefix}`} className="h-5 w-5 shrink-0" checked={outcome === o} onChange={() => setOutcome(o)} disabled={pending} />
              <span className="min-w-0 break-words">{t.outcomes[o]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {outcome && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          {t.outcomeHints[outcome] && <p className="text-sm text-slate-700">{t.outcomeHints[outcome]}</p>}
          {showTask && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>{rule!.needsDate ? r.followUpRequired : r.followUp}<input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required={rule!.needsDate} disabled={pending} /></label>
              {rule!.task === "OPTIONAL" && (
                <label className={labelCls}>{r.nextAction}<select className={inputCls} value={next} onChange={(e) => setNext(e.target.value as NextAction | "")} disabled={pending}>
                  <option value="">{r.nextActions.NONE}</option>{NEXT_ACTIONS.filter((a) => a !== "NONE").map((a) => <option key={a} value={a}>{r.nextActions[a]}</option>)}
                </select></label>
              )}
            </div>
          )}
          <label className={labelCls}>{r.note}<textarea className={`${inputCls} py-2`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} /></label>
          <p className="text-xs text-slate-500">{r.noEmailNotice}</p>
        </div>
      )}
      <FormMessage error={error} notice={notice ?? null} />
      <button className={`${btnPrimary} w-full text-base sm:w-auto`} disabled={!outcome || pending}>{pending ? r.saving : r.submit}</button>
    </form>
  );
}

