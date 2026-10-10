"use client";

import { useState } from "react";
import { logFieldVisit } from "@/actions/sales-platform-settings";
import { OUTCOME_RULES, ROUTE_VISIT_OUTCOMES, type FieldVisitOutcome } from "@/domain/sales-crm/field-visit";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");

/** Ad-hoc visit log from a prospect page. A structured outcome is chosen; "note only" never counts as engagement. */
export function FieldVisitForm({ locale, prospectId }: { locale: "en" | "fr"; prospectId: string }) {
  const c = identityCopy(locale).visit, f = fieldCopy(locale);
  const { pending, error, notice, run } = useCrmAction(locale);
  const [submissionId, setSubmissionId] = useState(newId);
  const [outcome, setOutcome] = useState<FieldVisitOutcome>("NOTE_ONLY");
  const needsDate = OUTCOME_RULES[outcome].needsDate;
  return (
    <form className="grid gap-2" action={(fd) => run(() => logFieldVisit(prospectId, String(fd.get("note") ?? ""), { outcome, submissionId, followUpDate: String(fd.get("followUpDate") ?? "") || undefined }), () => setSubmissionId(newId()), c.done)}>
      <p className="text-xs text-slate-500">{f.visit.legacyHelp}</p>
      <label className={labelCls}>{f.visit.outcome}
        <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value as FieldVisitOutcome)} disabled={pending}>
          <option value="NOTE_ONLY">{f.visit.noteOnly}</option>
          {ROUTE_VISIT_OUTCOMES.map((o) => <option key={o} value={o}>{f.outcomes[o]}</option>)}
        </select>
      </label>
      {needsDate && <label className={labelCls}>{f.run.followUpRequired}<input className={inputCls} type="date" name="followUpDate" required disabled={pending} /></label>}
      <label className={labelCls}>{c.note}<textarea className={`${inputCls} py-2`} name="note" rows={2} required={outcome === "NOTE_ONLY"} minLength={outcome === "NOTE_ONLY" ? 3 : undefined} maxLength={2000} disabled={pending} /></label>
      <FormMessage error={error} notice={notice ?? null} />
      <div><button className={btnSecondary} disabled={pending}>{c.log}</button></div>
    </form>
  );
}
