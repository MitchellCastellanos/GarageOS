"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveCallDisposition } from "@/actions/sales-calling";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { DISPOSITIONS, NEXT_ACTIONS, NOT_INTERESTED_REASONS, type Disposition, type DispositionInput, type NextAction, type NotInterestedReason } from "@/lib/voice/types";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";
import type { Dispo } from "./useSoftphone";

export type DispoPreset = { outcome: Disposition; note?: string; nonce: number } | null;
export interface CallFlags { demoSent: boolean; meetingScheduled: boolean }

const WITH_FOLLOW_UP: Disposition[] = ["CALL_BACK", "INTERESTED", "GATEKEEPER"];
const WITH_NEXT_ACTION: Disposition[] = ["INTERESTED", "GATEKEEPER"];

/** Mandatory outcome of an ended prospect call. Only the explicit Save records it; nothing here dials or loads another prospect. */
export function DispositionPanel({ c, dispo, liveNotes, flags, preset, onSaved }: { c: CallingCopy; dispo: Dispo; liveNotes: string; flags: CallFlags; preset: DispoPreset; onSaved: () => void }) {
  const d = c.disposition;
  const [outcome, setOutcome] = useState<Disposition | "">(preset?.outcome ?? "");
  const [appliedPreset, setAppliedPreset] = useState(preset?.nonce ?? 0);
  const [note, setNote] = useState<string | null>(preset?.note ?? null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [dnc, setDnc] = useState(false);
  const [reason, setReason] = useState<NotInterestedReason | "">("");
  const [nextAction, setNextAction] = useState<NextAction>("NONE");
  const [demoRequested, setDemoRequested] = useState(false);
  const [demoSent, setDemoSent] = useState<boolean | null>(null);
  const [meeting, setMeeting] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // A later "Mark interested" / "Do not call" from the actions panel preselects the outcome (adjusting state during render, no effect).
  if (preset && preset.nonce !== appliedPreset) {
    setAppliedPreset(preset.nonce);
    setOutcome(preset.outcome);
    if (preset.note && note === null) setNote(preset.note);
  }

  const noteValue = note ?? liveNotes;
  const isDnc = outcome === "DO_NOT_CALL";
  const sentChecked = demoSent ?? flags.demoSent;
  const meetingChecked = meeting ?? flags.meetingScheduled;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome) return setError(d.pickOutcome);
    if (outcome === "CALL_BACK" && !date) return setError(d.followUpRequired);
    if (outcome === "NOT_INTERESTED" && !reason) return setError(d.reasonRequired);
    if (isDnc && !noteValue.trim()) return setError(d.noteRequired);
    if (isDnc && !dnc) return setError(d.dncConfirm);
    setError(null);
    const input: DispositionInput = { outcome, note: noteValue.trim() || undefined };
    if (WITH_FOLLOW_UP.includes(outcome) && date) { input.followUpDate = date; if (time) input.followUpTime = time; }
    if (outcome === "NOT_INTERESTED" && reason) input.reason = reason;
    if (WITH_NEXT_ACTION.includes(outcome) && nextAction !== "NONE") input.nextAction = nextAction;
    if (outcome === "INTERESTED") { input.demoRequested = demoRequested; input.demoSent = sentChecked; input.meetingScheduled = meetingChecked; }
    start(async () => {
      try {
        const r = await saveCallDisposition(dispo.sessionId, input);
        if (r.ok || r.code === "ALREADY_RECORDED") return onSaved();
        setError(r.detail === "FOLLOW_UP_REQUIRED" ? d.followUpRequired : r.detail === "NOTE_REQUIRED" ? d.noteRequired : r.detail === "REASON_REQUIRED" ? d.reasonRequired : c.errors[r.code] ?? c.unexpected);
      } catch {
        setError(c.unexpected);
      }
    });
  }

  const quick = outcome === "NO_ANSWER" || outcome === "VOICEMAIL";
  return (
    <form onSubmit={submit} className="min-w-0 space-y-3 rounded-xl border-2 border-amber-400 bg-white p-3" aria-labelledby="dispo-title">
      <div>
        <h2 id="dispo-title" className="text-sm font-semibold text-slate-900">{d.title}{dispo.name ? ` · ${dispo.name}` : ""}</h2>
        <p className="mt-0.5 text-xs text-slate-600">{d.subtitle}</p>
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium text-slate-700">{d.outcome} <span className="font-normal text-slate-500">({d.required})</span></legend>
        {DISPOSITIONS.map((o) => (
          <label key={o} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 text-sm ${outcome === o ? "border-blue-500 bg-blue-50 font-medium" : "border-slate-200"}`}>
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => { setOutcome(o); setDnc(false); setError(null); }} className="size-4" />
            {d.outcomes[o]}
          </label>
        ))}
      </fieldset>

      {quick && <p className="text-sm text-slate-600">{d.quickSave}</p>}
      {outcome === "WRONG_NUMBER" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.wrongNumberInfo}</p>}
      {outcome === "NOT_A_REPAIR_SHOP" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.notRepairInfo}</p>}

      {outcome === "NOT_INTERESTED" && (
        <label className={labelCls}>{d.reason} <span className="sr-only">({d.required})</span>
          <select className={inputCls} value={reason} required onChange={(e) => setReason(e.target.value as NotInterestedReason | "")}>
            <option value="">{d.reasonPick}</option>
            {NOT_INTERESTED_REASONS.map((r) => <option key={r} value={r}>{d.reasons[r]}</option>)}
          </select>
        </label>
      )}

      {WITH_NEXT_ACTION.includes(outcome as Disposition) && (
        <label className={labelCls}>{d.nextAction}
          <select className={inputCls} value={nextAction} onChange={(e) => setNextAction(e.target.value as NextAction)}>
            {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{d.nextActions[a]}</option>)}
          </select>
        </label>
      )}

      {outcome === "INTERESTED" && (
        <fieldset className="space-y-1 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">{d.extras}</legend>
          <p className="text-xs text-slate-500">{d.extrasHint}</p>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={demoRequested} onChange={(e) => setDemoRequested(e.target.checked)} />{d.demoRequested}</label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={sentChecked} onChange={(e) => setDemoSent(e.target.checked)} />{d.demoSent}</label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={meetingChecked} onChange={(e) => setMeeting(e.target.checked)} />{d.meetingScheduled}</label>
        </fieldset>
      )}

      {isDnc && (
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="mt-0.5 size-4" />
          <span><span className="block font-medium">{d.dncLabel}</span>{d.dncConfirm}</span>
        </label>
      )}

      {WITH_FOLLOW_UP.includes(outcome as Disposition) && (
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>{d.followUpDate}{outcome === "CALL_BACK" && <span className="text-xs font-normal text-slate-500">({d.required})</span>}
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required={outcome === "CALL_BACK"} />
          </label>
          <label className={labelCls}>{d.followUpTime}<input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></label>
          <p className="col-span-2 text-xs text-slate-500">{outcome === "CALL_BACK" ? d.followUpHint : d.followUpOptional}</p>
        </div>
      )}

      <label className={labelCls}>{d.notes}
        <textarea className={`${inputCls} py-2`} rows={3} maxLength={2000} value={noteValue} onChange={(e) => setNote(e.target.value)} required={isDnc} />
        <span className="text-xs font-normal text-slate-500">{d.notesHint}{note === null && liveNotes ? ` ${d.notesPrefilled}` : ""}</span>
      </label>

      {dispo.settling && <p role="status" className="text-sm text-slate-600">{d.settling}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={pending || dispo.settling}>{pending ? d.saving : d.save}</button>
    </form>
  );
}
