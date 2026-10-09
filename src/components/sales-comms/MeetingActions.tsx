"use client";

import { useState } from "react";
import { cancelMeetingAction, linkMeeting, rescheduleMeetingAction, saveMeetingOutcome, scheduleMeeting } from "@/actions/sales-calendar";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";

export function MeetingActions({ locale, id, status, started, linked, prospects, timezone }: {
  locale: "en" | "fr"; id: string; status: string; started: boolean; linked: boolean; prospects: { id: string; name: string }[]; timezone: string;
}) {
  const { t, pending, error, notice, run } = useComms(locale);
  const c = t.calendar;
  const [open, setOpen] = useState<"" | "resched" | "cancel" | "outcome" | "link">("");
  const [d, setD] = useState({ date: "", time: "10:00", reason: "", prospect: "" });
  const [out, setOut] = useState({ status: "COMPLETED", outcome: "HELD_INTERESTED", notes: "", fuTitle: "", fuDate: "" });
  const scheduled = status === "SCHEDULED";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {scheduled && <button type="button" className={btnSecondary} onClick={() => setOpen(open === "resched" ? "" : "resched")}>{c.reschedule}</button>}
        {scheduled && <button type="button" className={btnDanger} onClick={() => setOpen(open === "cancel" ? "" : "cancel")}>{c.cancelMeeting}</button>}
        {scheduled && started && <button type="button" className={btnPrimary} onClick={() => setOpen(open === "outcome" ? "" : "outcome")}>{c.recordOutcome}</button>}
        {!linked && prospects.length > 0 && <button type="button" className={btnSecondary} onClick={() => setOpen(open === "link" ? "" : "link")}>{c.linkMeeting}</button>}
      </div>
      <Msg error={error} notice={notice} />
      {open === "resched" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className={labelCls}>{t.common.date}<input type="date" className={inputCls} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
          <label className={labelCls}>{t.common.time} ({timezone})<input type="time" className={inputCls} value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} /></label>
          <button type="button" className={`${btnPrimary} self-end`} disabled={pending || !d.date} onClick={() => run(() => rescheduleMeetingAction(id, d.date, d.time), () => setOpen(""))}>{c.reschedule}</button>
        </div>
      )}
      {open === "cancel" && (
        <div className="space-y-2">
          <label className={labelCls}>{c.cancelReason}<input className={inputCls} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} maxLength={300} /></label>
          <button type="button" className={btnDanger} disabled={pending} onClick={() => { if (confirm(c.cancelConfirm)) run(() => cancelMeetingAction(id, d.reason), () => setOpen("")); }}>{c.cancelMeeting}</button>
        </div>
      )}
      {open === "outcome" && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("meetingId", id); fd.set("status", out.status); fd.set("outcome", out.status === "NO_SHOW" ? "NO_SHOW" : out.outcome); fd.set("notes", out.notes); fd.set("followUpTitle", out.fuTitle); fd.set("followUpDate", out.fuDate); run(() => saveMeetingOutcome(fd), () => setOpen("")); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={labelCls}>{t.common.status}<select className={inputCls} value={out.status} onChange={(e) => setOut({ ...out, status: e.target.value })}><option value="COMPLETED">{c.held}</option><option value="NO_SHOW">{c.noShow}</option></select></label>
            {out.status === "COMPLETED" && <label className={labelCls}>{c.outcome}<select className={inputCls} value={out.outcome} onChange={(e) => setOut({ ...out, outcome: e.target.value })}>{["HELD_INTERESTED", "HELD_NEEDS_FOLLOW_UP", "HELD_NOT_INTERESTED", "RESCHEDULE_REQUESTED"].map((k) => <option key={k} value={k}>{c.outcomes[k]}</option>)}</select></label>}
          </div>
          <textarea className={`${inputCls} min-h-20 py-2`} value={out.notes} onChange={(e) => setOut({ ...out, notes: e.target.value })} placeholder={c.notesPlaceholder} maxLength={2000} aria-label={t.common.notes} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={labelCls}>{c.followUpTitle}<input className={inputCls} value={out.fuTitle} onChange={(e) => setOut({ ...out, fuTitle: e.target.value })} maxLength={200} /></label>
            <label className={labelCls}>{c.followUpDue}<input type="date" className={inputCls} value={out.fuDate} onChange={(e) => setOut({ ...out, fuDate: e.target.value })} /></label>
          </div>
          <button className={btnPrimary} disabled={pending}>{c.recordOutcome}</button>
        </form>
      )}
      {open === "link" && (
        <div className="flex flex-wrap gap-2">
          <select className={`${inputCls} w-auto max-w-full`} value={d.prospect} onChange={(e) => setD({ ...d, prospect: e.target.value })} aria-label={c.prospect}><option value="">{c.prospect}</option>{prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button type="button" className={btnSecondary} disabled={pending || !d.prospect} onClick={() => run(() => linkMeeting(id, d.prospect, null), () => setOpen(""))}>{c.linkMeeting}</button>
        </div>
      )}
    </div>
  );
}

export function NewMeetingForm({ locale, prospects, timezone, durations, types, defaultProspect }: {
  locale: "en" | "fr"; timezone: string; durations: number[]; types: string[]; defaultProspect: string;
  prospects: { id: string; name: string; contacts: { id: string; name: string; email: string | null; language: "FR" | "EN" | null }[] }[];
}) {
  const { t, pending, error, notice, run, setNotice } = useComms(locale);
  const c = t.calendar;
  const [f, setF] = useState({ prospectId: defaultProspect, contactId: "", name: "", email: "", phone: "", date: "", time: "10:00", duration: String(durations[0] ?? 30), type: types[0] ?? "VIDEO", location: "", agenda: "", language: "" });
  const prospect = prospects.find((p) => p.id === f.prospectId);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      Object.entries({ prospectId: f.prospectId, contactId: f.contactId, attendeeName: f.name, attendeeEmail: f.email, attendeePhone: f.phone, date: f.date, time: f.time, durationMinutes: f.duration, type: f.type, locationDetail: f.location, agenda: f.agenda, language: f.language }).forEach(([k, v]) => fd.set(k, v));
      run(() => scheduleMeeting(fd), (r) => setNotice(r.emailQueued ? `${c.created} ${c.emailSent}` : `${c.created} ${c.noEmail}`));
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>{c.prospect}<select className={inputCls} value={f.prospectId} onChange={(e) => setF((s) => ({ ...s, prospectId: e.target.value, contactId: "" }))}><option value="">{c.unlinked}</option>{prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={labelCls}>{c.contact}<select className={inputCls} value={f.contactId} onChange={(e) => { const ct = prospect?.contacts.find((x) => x.id === e.target.value); setF((s) => ({ ...s, contactId: e.target.value, name: ct?.name ?? s.name, email: ct?.email ?? s.email, language: ct?.language ?? s.language })); }} disabled={!prospect}><option value="">{t.common.none}</option>{prospect?.contacts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className={labelCls}>{t.common.name}<input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} /></label>
        <label className={labelCls}>{t.common.email}<input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} required /></label>
        <label className={labelCls}>{t.common.phone}<input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} /></label>
        <label className={labelCls}>{t.composer.language}<select className={inputCls} value={f.language} onChange={(e) => set("language", e.target.value)}><option value="">{t.composer.languageAuto}</option><option value="EN">{t.common.english}</option><option value="FR">{t.common.french}</option></select></label>
        <label className={labelCls}>{t.common.date}<input type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} required /></label>
        <label className={labelCls}>{t.common.time} ({timezone})<input type="time" className={inputCls} value={f.time} onChange={(e) => set("time", e.target.value)} required /></label>
        <label className={labelCls}>{c.duration}<select className={inputCls} value={f.duration} onChange={(e) => set("duration", e.target.value)}>{[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} {c.minutes}</option>)}</select></label>
        <label className={labelCls}>{c.type}<select className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>{["VIDEO", "PHONE", "ON_SITE"].map((k) => <option key={k} value={k}>{c.types[k]}</option>)}</select></label>
      </div>
      <label className={labelCls}>{c.location}<input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} maxLength={300} /></label>
      <label className={labelCls}>{c.agenda}<input className={inputCls} value={f.agenda} onChange={(e) => set("agenda", e.target.value)} maxLength={1000} /></label>
      <Msg error={error} notice={notice} />
      <button className={btnPrimary} disabled={pending}>{c.newMeeting}</button>
    </form>
  );
}
