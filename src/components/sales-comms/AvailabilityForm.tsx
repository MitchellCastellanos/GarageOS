"use client";

import { useState } from "react";
import { addAvailabilityException, getMyBookingLink, removeAvailabilityException, rotateMyBookingLink, saveAvailability } from "@/actions/sales-calendar";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";
import type { WeeklyHours } from "@/domain/sales-comms/availability";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIMEZONES = ["America/Toronto", "America/Montreal", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "UTC"];

export function AvailabilityForm({ locale, initial }: {
  locale: "en" | "fr";
  initial: { timezone: string; weekly: WeeklyHours; buffer: number; durations: number[]; types: string[]; joinUrl: string; bookingEnabled: boolean };
}) {
  const { t, pending, error, notice, run } = useComms(locale);
  const c = t.calendar;
  const [tz, setTz] = useState(initial.timezone);
  const [buffer, setBuffer] = useState(String(initial.buffer));
  const [durations, setDurations] = useState(initial.durations);
  const [types, setTypes] = useState(initial.types);
  const [join, setJoin] = useState(initial.joinUrl);
  const [booking, setBooking] = useState(initial.bookingEnabled);
  const [week, setWeek] = useState(() => Object.fromEntries(DAYS.map((d) => [d, { on: !!initial.weekly[d]?.length, r1: initial.weekly[d]?.[0] ?? ["09:00", "17:00"], r2: initial.weekly[d]?.[1] ?? ["", ""] }])) as Record<string, { on: boolean; r1: string[]; r2: string[] }>);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.set("timezone", tz); fd.set("bufferMinutes", buffer); fd.set("joinUrl", join); if (booking) fd.set("bookingEnabled", "on");
      durations.forEach((d) => fd.append("durations", String(d))); types.forEach((x) => fd.append("types", x));
      DAYS.forEach((d) => { const w = week[d]; if (!w.on) return; fd.set(`${d}_on`, "on"); fd.set(`${d}_1_start`, w.r1[0]); fd.set(`${d}_1_end`, w.r1[1]); fd.set(`${d}_2_start`, w.r2[0]); fd.set(`${d}_2_end`, w.r2[1]); });
      run(() => saveAvailability(fd), undefined, c.saved);
    }}>
      <fieldset className="space-y-2"><legend className="font-semibold text-slate-900">{c.workingHours}</legend>
        <p className="text-xs text-slate-500">{c.hoursHelp}</p>
        {DAYS.map((d) => {
          const w = week[d];
          const set = (patch: Partial<typeof w>) => setWeek((s) => ({ ...s, [d]: { ...s[d], ...patch } }));
          return (
            <div key={d} className="grid items-center gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[9rem_1fr]">
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={w.on} onChange={(e) => set({ on: e.target.checked })} />{c.weekdays[d]}</label>
              {w.on ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="time" aria-label={`${c.weekdays[d]} ${c.from}`} className={`${inputCls} w-auto`} value={w.r1[0]} onChange={(e) => set({ r1: [e.target.value, w.r1[1]] })} />–
                  <input type="time" aria-label={`${c.weekdays[d]} ${c.to}`} className={`${inputCls} w-auto`} value={w.r1[1]} onChange={(e) => set({ r1: [w.r1[0], e.target.value] })} />
                  <span className="text-slate-400">+</span>
                  <input type="time" aria-label={`${c.weekdays[d]} 2 ${c.from}`} className={`${inputCls} w-auto`} value={w.r2[0]} onChange={(e) => set({ r2: [e.target.value, w.r2[1]] })} />–
                  <input type="time" aria-label={`${c.weekdays[d]} 2 ${c.to}`} className={`${inputCls} w-auto`} value={w.r2[1]} onChange={(e) => set({ r2: [w.r2[0], e.target.value] })} />
                </div>
              ) : <span className="text-sm text-slate-400">{c.closed}</span>}
            </div>
          );
        })}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>{c.timezone}<select className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)}>{[...new Set([initial.timezone, ...TIMEZONES])].map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className={labelCls}>{c.buffer}<input type="number" min={0} max={120} className={inputCls} value={buffer} onChange={(e) => setBuffer(e.target.value)} /></label>
      </div>
      <fieldset><legend className="mb-1 text-sm font-medium text-slate-700">{c.offeredDurations}</legend><div className="flex flex-wrap gap-3">{[15, 30, 45, 60].map((d) => <label key={d} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={durations.includes(d)} onChange={() => setDurations((x) => toggle(x, d))} />{d} {c.minutes}</label>)}</div></fieldset>
      <fieldset><legend className="mb-1 text-sm font-medium text-slate-700">{c.offeredTypes}</legend><div className="flex flex-wrap gap-3">{["VIDEO", "PHONE", "ON_SITE"].map((k) => <label key={k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={types.includes(k)} onChange={() => setTypes((x) => toggle(x, k))} />{c.types[k]}</label>)}</div></fieldset>
      <label className={labelCls}>{c.joinUrl}<input type="url" className={inputCls} value={join} onChange={(e) => setJoin(e.target.value)} placeholder="https://" maxLength={300} /><span className="text-xs font-normal text-slate-500">{c.joinUrlHint}</span></label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={booking} onChange={(e) => setBooking(e.target.checked)} />{c.bookingEnabled}</label>
      <Msg error={error} notice={notice} />
      <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.common.save}</button>
    </form>
  );
}

export function ExceptionForm({ locale, timezone }: { locale: "en" | "fr"; timezone: string }) {
  const { t, pending, error, run } = useComms(locale);
  const c = t.calendar;
  const [f, setF] = useState({ kind: "OFF", startDate: "", endDate: "", allDay: true, startTime: "09:00", endTime: "17:00", reason: "" });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      Object.entries({ kind: f.kind, startDate: f.startDate, endDate: f.endDate, startTime: f.startTime, endTime: f.endTime, reason: f.reason }).forEach(([k, v]) => fd.set(k, v));
      if (f.allDay) fd.set("allDay", "on");
      run(() => addAvailabilityException(fd), () => setF((s) => ({ ...s, startDate: "", endDate: "", reason: "" })));
    }}>
      <label className={labelCls}>{c.exceptionKind}<select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="OFF">{c.off}</option><option value="EXTRA">{c.extra}</option></select></label>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />{c.allDay}</label>
      <label className={labelCls}>{c.from}<input type="date" className={inputCls} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required /></label>
      <label className={labelCls}>{c.to}<input type="date" className={inputCls} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
      {!f.allDay && <><label className={labelCls}>{t.common.time} ({timezone})<input type="time" className={inputCls} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label><label className={labelCls}>{c.to}<input type="time" className={inputCls} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label></>}
      <label className={`${labelCls} sm:col-span-2`}>{c.reason}<input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} /></label>
      <Msg error={error} />
      <div className="sm:col-span-2"><button className={btnSecondary} disabled={pending}>{c.addException}</button></div>
    </form>
  );
}

export function RemoveException({ locale, id }: { locale: "en" | "fr"; id: string }) {
  const { t, pending, run } = useComms(locale);
  return <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => removeAvailabilityException(id))}>{t.common.delete}</button>;
}

export function BookingLinkPanel({ locale }: { locale: "en" | "fr" }) {
  const { t, pending, error, run } = useComms(locale);
  const c = t.calendar;
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">{c.linkHint}</p>
      {url && <div className="flex flex-wrap items-center gap-2"><input readOnly className={`${inputCls} flex-1`} value={url} aria-label={c.yourLink} onFocus={(e) => e.currentTarget.select()} /><button type="button" className={btnSecondary} onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)); }}>{copied ? t.common.copied : t.common.copy}</button></div>}
      <Msg error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => getMyBookingLink(), (r) => { setUrl(r.url); setCopied(false); }, undefined, false)}>{c.createLink}</button>
        <button type="button" className={btnDanger} disabled={pending} onClick={() => { if (confirm(c.rotateConfirm)) run(() => rotateMyBookingLink(), (r) => { setUrl(r.url); setCopied(false); }, undefined, false); }}>{c.rotateLink}</button>
      </div>
    </div>
  );
}
