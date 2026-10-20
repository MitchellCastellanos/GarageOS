"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { markInterested } from "@/actions/sales-workspace";
import { markDoNotContact } from "@/actions/sales-prospects";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import type { EmailComposeContext, WorkspaceProfile } from "@/lib/voice/workspace-types";
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { MeetingPanel } from "./MeetingPanel";
import { TaskPanel } from "./TaskPanel";
import type { InsertKind } from "./EmailDrawer";
import { ActionButton, wsError, type Locale, type Toast } from "./shared";

type Open = null | "meeting" | "task" | "dnc";

/** Every button performs a real action; unavailable ones stay visible, disabled, with the reason. */
export function ActionsPanel({ c, locale, profile, can, demoLinks, timezone, onEmail, onInterested, onDnc, onMeeting, onChanged, notify }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile | null; can: { email: boolean; editProspects: boolean; schedule: boolean };
  demoLinks: EmailComposeContext["demoLinks"] | null; timezone: string;
  onEmail: (kind: InsertKind | null) => void; onInterested: () => void; onDnc: (note: string) => void; onMeeting: () => void; onChanged: () => void; notify: (t: Toast) => void;
}) {
  const a = c.ws.actions;
  const [open, setOpen] = useState<Open>(null);
  const [pending, start] = useTransition();

  if (!profile) {
    return (
      <section aria-labelledby="actions-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="actions-title" className="text-base font-semibold text-slate-900">{a.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{a.noProspect}</p>
      </section>
    );
  }
  const dnc = profile.doNotContact ? a.isDnc : null;
  const emailOff = !can.email ? a.needEmail : dnc;
  const editOff = !can.editProspects ? a.needEdit : dnc;
  const scheduleOff = !can.schedule ? a.needSchedule : dnc;
  const demoUrl = demoLinks?.find((l) => l.key === "demo")?.url ?? null;

  function interested() {
    start(async () => {
      try {
        const r = await markInterested(profile!.id);
        if (!r.ok) { notify({ kind: "error", text: wsError(c, locale, r.error) }); return; }
        notify({ kind: "ok", text: (r as { moved?: boolean }).moved ? a.interestedMoved : a.interestedSame });
        onInterested();
        onChanged();
      } catch { notify({ kind: "error", text: c.unexpected }); }
    });
  }

  const sec = `${btnSecondary} justify-start px-3 text-left`;
  const group = (label: string, children: ReactNode) => (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      {children}
    </div>
  );

  return (
    <section aria-labelledby="actions-title" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <h2 id="actions-title" className="text-base font-semibold text-slate-900">{a.title}</h2>
      <ActionButton className={`${btnPrimary} w-full`} label={a.sendDemo} disabledReason={emailOff} onClick={() => onEmail("sendDemo")} />

      {group(a.emailGroup, <>
        <ActionButton className={sec} label={a.compose} disabledReason={emailOff} onClick={() => onEmail(null)} />
        <ActionButton className={sec} label={a.insertBooking} disabledReason={emailOff} onClick={() => onEmail("booking")} />
      </>)}

      {group(a.mediaGroup, <>
        <ActionButton className={sec} label={a.insertTeaser} disabledReason={emailOff} onClick={() => onEmail("teaser")} />
        <ActionButton className={sec} label={a.insertFull} disabledReason={emailOff} onClick={() => onEmail("commercial")} />
        <ActionButton className={sec} label={`${a.openDemo} ↗`} disabledReason={!can.email ? a.needEmail : !demoUrl ? a.noDemoLink : null}
          onClick={() => { if (demoUrl) window.open(demoUrl, "_blank", "noopener,noreferrer"); }} />
      </>)}

      {group(a.scheduleGroup, <>
        {open === "meeting" ? (
          <MeetingPanel c={c} locale={locale} profile={profile} timezone={timezone} notify={notify} onDone={(ok) => { setOpen(null); if (ok) { onMeeting(); onChanged(); } }} />
        ) : <ActionButton className={sec} label={a.schedule} disabledReason={scheduleOff} onClick={() => setOpen("meeting")} />}
        {open === "task" ? (
          <TaskPanel c={c} locale={locale} prospectId={profile.id} defaultTitle={`${c.disposition.outcomes.CALL_BACK} · ${profile.name}`.slice(0, 150)} notify={notify} onDone={(ok) => { setOpen(null); if (ok) onChanged(); }} />
        ) : <ActionButton className={sec} label={a.task} disabledReason={editOff} onClick={() => setOpen("task")} />}
      </>)}

      {group(a.statusGroup, <>
        <ActionButton className={sec} label={a.interested} disabledReason={editOff} busy={pending} onClick={interested} />
        {open === "dnc" ? (
          <DncForm c={c} locale={locale} prospectId={profile.id} notify={notify} onDone={(note) => { setOpen(null); if (note !== null) { onDnc(note); onChanged(); } }} />
        ) : <ActionButton className={`${btnDanger} justify-start px-3 text-left`} label={a.dnc} disabledReason={!can.editProspects ? a.needEdit : profile.doNotContact ? a.isDnc : null} onClick={() => setOpen("dnc")} />}
      </>)}
    </section>
  );
}

function DncForm({ c, locale, prospectId, onDone, notify }: { c: CallingCopy; locale: Locale; prospectId: string; onDone: (note: string | null) => void; notify: (t: Toast) => void }) {
  const t = c.ws.dncDialog;
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setError(t.required);
    setError(null);
    start(async () => {
      try {
        const r = await markDoNotContact(prospectId, note.trim());
        if (!r.ok) { setError(wsError(c, locale, r.error)); return; }
        notify({ kind: "ok", text: t.done });
        onDone(note.trim());
      } catch { setError(c.unexpected); }
    });
  }
  return (
    <form onSubmit={submit} role="alertdialog" aria-labelledby="dnc-title" aria-describedby="dnc-body" className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-3"
      onKeyDown={(e) => { if (e.key === "Escape" && !pending) onDone(null); }}>
      <h3 id="dnc-title" className="text-sm font-semibold text-red-900">{t.title}</h3>
      <p id="dnc-body" className="text-sm text-red-900">{t.body}</p>
      <label className={labelCls}>{t.note}
        <textarea autoFocus className={`${inputCls} py-2`} rows={2} maxLength={1000} required value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={`${btnPrimary} bg-red-600 hover:bg-red-700`} disabled={pending}>{pending ? t.saving : t.confirm}</button>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => onDone(null)}>{c.ws.profile.cancel}</button>
      </div>
    </form>
  );
}
