"use client";

import { useState, useTransition, type FormEvent } from "react";
import { scheduleMeeting } from "@/actions/sales-calendar";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { fill, wsError, type Locale, type Toast } from "./shared";

/** Creates a CRM meeting (VIDEO by default). No Zoom integration exists: the seller may paste their own link as the location. */
export function MeetingPanel({ c, locale, profile, timezone, onDone, notify }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile; timezone: string; onDone: (created: boolean) => void; notify: (t: Toast) => void;
}) {
  const t = c.ws.meeting;
  const comms = commsCopy(locale);
  const crm = crmCopy(locale);
  const first = profile.contacts.find((x) => x.isDecisionMaker && !x.doNotContact) ?? profile.contacts.find((x) => !x.doNotContact) ?? null;
  const [v, setV] = useState({
    contactId: first?.id ?? "", date: "", time: "10:00", durationMinutes: "30", type: "VIDEO", attendeeName: "", attendeeEmail: "",
    language: (first?.language ?? (profile.language === "UNKNOWN" ? (profile.languageSuggested === "UNKNOWN" ? locale.toUpperCase() : profile.languageSuggested) : profile.language)) as string, locationDetail: "", agenda: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.date || !v.time) return setError(t.required);
    setError(null);
    const fd = new FormData();
    fd.set("prospectId", profile.id);
    for (const [k, val] of Object.entries(v)) if (val) fd.set(k, val);
    start(async () => {
      try {
        const r = await scheduleMeeting(fd);
        if (!r.ok) { setError(wsError(c, locale, r.error)); return; }
        notify({ kind: "ok", text: `${t.created} ${(r as { emailQueued?: boolean }).emailQueued ? t.emailQueued : t.noEmail}` });
        onDone(true);
      } catch {
        setError(c.unexpected);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3" aria-labelledby="meeting-title">
      <h3 id="meeting-title" className="text-sm font-semibold text-slate-900">{t.title}</h3>
      <p className="text-xs text-slate-500">{fill(t.timezone, { zone: timezone })}</p>
      <label className={labelCls}>{t.contact}
        <select className={inputCls} value={v.contactId} onChange={(e) => set("contactId", e.target.value)}>
          <option value="">{t.noContact}</option>
          {profile.contacts.filter((x) => !x.doNotContact).map((x) => <option key={x.id} value={x.id}>{x.name}{x.email ? ` (${x.email})` : ""}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>{t.date}<input type="date" className={inputCls} required value={v.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className={labelCls}>{t.time}<input type="time" className={inputCls} required value={v.time} onChange={(e) => set("time", e.target.value)} /></label>
        <label className={labelCls}>{t.duration}
          <select className={inputCls} value={v.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)}>
            {["15", "30", "45", "60"].map((m) => <option key={m} value={m}>{fill(t.minutes, { n: m })}</option>)}
          </select>
        </label>
        <label className={labelCls}>{t.type}
          <select className={inputCls} value={v.type} onChange={(e) => set("type", e.target.value)}>
            {["VIDEO", "PHONE", "ON_SITE"].map((x) => <option key={x} value={x}>{comms.calendar.types[x]}</option>)}
          </select>
        </label>
      </div>
      {!v.contactId && (
        <div className="grid gap-2">
          <label className={labelCls}>{t.attendeeName}<input className={inputCls} value={v.attendeeName} maxLength={100} onChange={(e) => set("attendeeName", e.target.value)} /></label>
          <label className={labelCls}>{t.attendeeEmail}<input type="email" className={inputCls} value={v.attendeeEmail} onChange={(e) => set("attendeeEmail", e.target.value)} /></label>
        </div>
      )}
      <label className={labelCls}>{t.language}
        <select className={inputCls} value={v.language} onChange={(e) => set("language", e.target.value)}>
          <option value="FR">{crm.languages.FR}</option><option value="EN">{crm.languages.EN}</option>
        </select>
      </label>
      <label className={labelCls}>{t.location}
        <input className={inputCls} value={v.locationDetail} maxLength={500} onChange={(e) => set("locationDetail", e.target.value)} aria-describedby="meeting-location-hint" />
        <span id="meeting-location-hint" className="text-xs font-normal text-slate-500">{t.locationHint}</span>
      </label>
      <label className={labelCls}>{t.agenda}<textarea className={`${inputCls} py-2`} rows={2} maxLength={2000} value={v.agenda} onChange={(e) => set("agenda", e.target.value)} /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.saving : t.save}</button>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => onDone(false)}>{c.ws.profile.cancel}</button>
      </div>
    </form>
  );
}
