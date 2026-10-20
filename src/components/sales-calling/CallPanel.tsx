"use client";

import { useState } from "react";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { clock, type Softphone } from "./useSoftphone";
import { fill, writeNotes } from "./shared";

/** Softphone controls. All state comes from the single top-level useSoftphone() owner; this component only renders it. */
export function CallPanel({ c, sp, profile, callBlockedReason, onCall, today }: {
  c: CallingCopy; sp: Softphone; profile: WorkspaceProfile | null; callBlockedReason: string | null; onCall: () => void; today: { placed: number; cap: number };
}) {
  const { phase } = sp;
  const live = sp.isLive;
  return (
    <section aria-labelledby="softphone-title" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="softphone-title" className="text-base font-semibold text-slate-900">{c.softphone.title}</h2>
        <p className="text-xs text-slate-500">{fill(c.ws.today, { placed: today.placed, cap: today.cap })}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p role="status" aria-live="polite" className="text-lg font-semibold text-slate-900">
            <span aria-hidden="true" className={live ? "text-emerald-600" : phase === "failed" ? "text-red-600" : "text-slate-400"}>● </span>
            {c.softphone.states[phase]}{sp.muted && phase === "connected" ? ` · ${c.softphone.muted}` : ""}
          </p>
          {sp.session && phase !== "idle" && <p className="break-words text-sm text-slate-600">{c.softphone.destination} {sp.session}</p>}
        </div>
        {(phase === "connected" || phase === "ended") && <p className="font-mono text-2xl tabular-nums text-slate-900"><span className="sr-only">{c.softphone.timer} </span>{clock(sp.seconds)}</p>}
      </div>

      {live || phase === "authorizing" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btnPrimary} min-w-32 bg-red-600 hover:bg-red-700`} onClick={sp.hangUp}>{c.softphone.hangUp}</button>
          <button type="button" className={btnSecondary} disabled={phase !== "connected"} aria-pressed={sp.muted} onClick={sp.toggleMute}>{sp.muted ? c.softphone.unmute : c.softphone.mute}</button>
        </div>
      ) : (
        <div className="space-y-1">
          <span title={callBlockedReason ?? undefined} className="block sm:inline-block">
            <button type="button" className={`${btnPrimary} w-full min-w-40 bg-emerald-600 hover:bg-emerald-700 sm:w-auto`} disabled={!!callBlockedReason} onClick={onCall}
              aria-describedby={callBlockedReason ? "call-blocked" : undefined} aria-label={profile ? fill(c.ws.phone.callName, { name: profile.name }) : c.softphone.call}>
              ☎ {c.softphone.call}
            </button>
          </span>
          {callBlockedReason && <p id="call-blocked" className="text-sm text-amber-800">{callBlockedReason}</p>}
          <p className="text-xs text-slate-500">{c.softphone.tip}</p>
        </div>
      )}

      {sp.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</p>}
      {sp.notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.notice}</p>}
      {(phase === "failed" || phase === "ended") && !sp.dispo && <button type="button" className={btnSecondary} onClick={sp.reset}>{c.softphone.dismiss}</button>}
      {sp.mics.length > 0 && (
        <label className={labelCls}>{c.softphone.microphone}
          <select className={inputCls} value={sp.micId} onChange={(e) => sp.pickMic(e.target.value)}>
            <option value="">{c.softphone.defaultDevice}</option>
            {sp.mics.map((d, n) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${c.softphone.microphone} ${n + 1}`}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}

export function CallScript({ c }: { c: CallingCopy }) {
  const s = c.ws.script;
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="script-title" className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <h2 id="script-title" className="m-0">
        <button type="button" aria-expanded={open} aria-controls="script-body" onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-4 py-2 text-left text-base font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300">
          <span>{s.title}</span><span className="text-sm font-normal text-blue-700">{open ? s.hide : s.show}</span>
        </button>
      </h2>
      <div id="script-body" hidden={!open} className="space-y-2 px-4 pb-4">
        <p className="text-xs text-slate-500">{s.note}</p>
        <ol className="space-y-2">
          {Object.entries(s.steps).map(([k, step]) => (
            <li key={k} className={`rounded-lg p-2.5 text-sm ${k === "dnc" ? "border border-red-200 bg-red-50 text-red-900" : "bg-slate-50 text-slate-800"}`}>
              <p className="font-semibold">{step.title}</p><p className="mt-0.5">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function LiveNotes({ c, prospectId, notes }: { c: CallingCopy; prospectId: string | null; notes: string }) {
  const n = c.ws.notes;
  const dirty = notes.trim().length > 0;
  return (
    <section aria-labelledby="notes-title" className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="text-base font-semibold text-slate-900">{n.title}</h2>
        {dirty && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"><span aria-hidden="true">● </span>{n.unsaved}</span>}
      </div>
      <label className={labelCls}><span className="sr-only">{n.label}</span>
        <textarea className={`${inputCls} min-h-32 py-2 leading-relaxed`} maxLength={2000} value={notes} disabled={!prospectId} placeholder={n.placeholder}
          onChange={(e) => { if (prospectId) writeNotes(prospectId, e.target.value); }} aria-describedby="notes-hint" />
      </label>
      <p id="notes-hint" className="text-xs text-slate-500">{prospectId ? n.local : c.ws.phone.noProspect}</p>
    </section>
  );
}
