"use client";

import { useState } from "react";
import { changeSequenceStatus, createDefaultSequenceAction, saveSequence } from "@/actions/sales-sequences";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls, cardCls, Badge } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";

export interface SeqView { id: string; name: string; description: string | null; status: string; businessDaysOnly: boolean; steps: { dayOffset: number; templateKey: string }[]; live: number }

export function SequenceAdmin({ locale, sequences, templateKeys }: { locale: "en" | "fr"; sequences: SeqView[]; templateKeys: string[] }) {
  const { t, pending, error, notice, run } = useComms(locale);
  const [editing, setEditing] = useState<SeqView | "new" | null>(null);
  return (
    <div className="space-y-4">
      <Msg error={error} notice={notice} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>{t.outreach.newSequence}</button>
        {sequences.length === 0 && <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => createDefaultSequenceAction())}>{t.outreach.createDefault}</button>}
      </div>
      {editing && <SequenceEditor key={editing === "new" ? "new" : editing.id} locale={locale} seq={editing === "new" ? null : editing} templateKeys={templateKeys} onDone={() => setEditing(null)} />}
      <ul className="space-y-3">
        {sequences.map((s) => (
          <li key={s.id} className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="break-words font-medium text-slate-900">{s.name}</p>{s.description && <p className="text-sm text-slate-600">{s.description}</p>}</div>
              <Badge tone={s.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : s.status === "ARCHIVED" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}>{t.outreach.seqState[s.status]}</Badge>
            </div>
            <ol className="mt-2 flex flex-wrap gap-2 text-sm">
              {s.steps.map((st, i) => <li key={i} className="rounded-full bg-slate-100 px-3 py-1">{t.outreach.day} {st.dayOffset + 1} · {t.templateNames[st.templateKey] ?? st.templateKey}</li>)}
            </ol>
            <p className="mt-1 text-xs text-slate-500">{s.businessDaysOnly ? t.outreach.businessDays : ""} · {s.live} {t.outreach.enrollments.toLowerCase()}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.status !== "ACTIVE" && s.status !== "ARCHIVED" && <button type="button" className={btnPrimary} disabled={pending} onClick={() => { if (confirm(t.outreach.activateConfirm)) run(() => changeSequenceStatus(s.id, "ACTIVE")); }}>{t.outreach.activate}</button>}
              {s.status === "ACTIVE" && <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => changeSequenceStatus(s.id, "PAUSED"))}>{t.outreach.pause}</button>}
              {s.status !== "ACTIVE" && s.status !== "ARCHIVED" && <button type="button" className={btnSecondary} onClick={() => setEditing(s)}>{t.common.edit}</button>}
              {s.status === "ACTIVE" && <span className="self-center text-xs text-slate-500">{t.outreach.pauseToEdit}</span>}
              {s.status !== "ARCHIVED" && <button type="button" className={btnDanger} disabled={pending} onClick={() => { if (confirm(t.outreach.archiveConfirm)) run(() => changeSequenceStatus(s.id, "ARCHIVED")); }}>{t.outreach.archive}</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SequenceEditor({ locale, seq, templateKeys, onDone }: { locale: "en" | "fr"; seq: SeqView | null; templateKeys: string[]; onDone: () => void }) {
  const { t, pending, error, run } = useComms(locale);
  const [name, setName] = useState(seq?.name ?? "");
  const [description, setDescription] = useState(seq?.description ?? "");
  const [business, setBusiness] = useState(seq?.businessDaysOnly ?? true);
  const [steps, setSteps] = useState(seq?.steps ?? [{ dayOffset: 0, templateKey: templateKeys[0] }]);
  return (
    <form className={`${cardCls} space-y-3`} aria-label={t.outreach.editor} onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      if (seq) fd.set("id", seq.id);
      fd.set("name", name); fd.set("description", description); if (business) fd.set("businessDaysOnly", "on"); fd.set("steps", JSON.stringify(steps));
      run(() => saveSequence(fd), onDone);
    }}>
      <h3 className="font-semibold text-slate-900">{t.outreach.editor}</h3>
      <label className={labelCls}>{t.outreach.name}<input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} /></label>
      <label className={labelCls}>{t.outreach.description}<input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} />{t.outreach.businessDays}</label>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[8rem_1fr_auto]">
            <label className={labelCls}>{t.outreach.dayOffset}<input type="number" min={0} max={120} className={inputCls} value={s.dayOffset} onChange={(e) => setSteps((x) => x.map((y, j) => (j === i ? { ...y, dayOffset: Number(e.target.value) } : y)))} /></label>
            <label className={labelCls}>{t.outreach.template}
              <select className={inputCls} value={s.templateKey} onChange={(e) => setSteps((x) => x.map((y, j) => (j === i ? { ...y, templateKey: e.target.value } : y)))}>{templateKeys.map((k) => <option key={k} value={k}>{t.templateNames[k]}</option>)}</select>
            </label>
            <button type="button" className={`${btnSecondary} self-end`} disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>{t.outreach.removeStep}</button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={steps.length >= 8} onClick={() => setSteps((x) => [...x, { dayOffset: (x[x.length - 1]?.dayOffset ?? 0) + 3, templateKey: templateKeys[0] }])}>{t.outreach.addStep}</button>
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.outreach.saveSequence}</button>
        <button type="button" className={btnSecondary} onClick={onDone}>{t.common.cancel}</button>
      </div>
      <Msg error={error} />
    </form>
  );
}
