"use client";

import { useEffect, useMemo, useState } from "react";
import { publicBookAction, publicSlotsAction } from "@/actions/sales-booking-public";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";

export interface BookingPageProps {
  token: string; sellerName: string; sellerTitle: string | null; types: string[]; durations: number[]; defaultDuration: number; defaultLanguage: "EN" | "FR"; initialLanguage: "EN" | "FR";
}

/** The visitor's IANA zone. Only used after client-side data has loaded, so SSR/hydration never renders it. */
export function useViewerZone() {
  const [tz] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"; } catch { return "America/Toronto"; } });
  return tz;
}

export function groupSlotsByDay(slots: string[], tz: string): Map<string, string[]> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const map = new Map<string, string[]>();
  for (const s of slots) { const k = fmt.format(new Date(s)); map.set(k, [...(map.get(k) ?? []), s]); }
  return map;
}

export function SlotPicker({ lang, tz, slots, value, onChange }: { lang: "EN" | "FR"; tz: string; slots: string[]; value: string; onChange: (iso: string) => void }) {
  const t = commsCopy(lang === "FR" ? "fr" : "en").pub;
  const days = useMemo(() => groupSlotsByDay(slots, tz), [slots, tz]);
  const keys = [...days.keys()];
  const [day, setDay] = useState(keys[0] ?? "");
  const loc = lang === "FR" ? "fr-CA" : "en-CA";
  const current = days.has(day) ? day : keys[0] ?? "";
  if (slots.length === 0) return <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.noSlots}</p>;
  return (
    <div className="space-y-3">
      <div role="group" aria-label={t.chooseDay} className="flex gap-2 overflow-x-auto pb-1">
        {keys.map((k) => (
          <button key={k} type="button" aria-pressed={k === current} onClick={() => setDay(k)} className={`${k === current ? btnPrimary : btnSecondary} shrink-0`}>
            {new Intl.DateTimeFormat(loc, { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(days.get(k)![0]))}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t.chooseTime} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {(days.get(current) ?? []).map((iso) => (
          <button key={iso} type="button" aria-pressed={iso === value} onClick={() => onChange(iso)} className={iso === value ? btnPrimary : btnSecondary}>
            {new Intl.DateTimeFormat(loc, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso))}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{t.timesIn} {tz}</p>
    </div>
  );
}

export function BookingClient(p: BookingPageProps) {
  const [lang, setLang] = useState<"EN" | "FR">(p.initialLanguage);
  const t = commsCopy(lang === "FR" ? "fr" : "en").pub;
  const tz = useViewerZone();
  const [duration, setDuration] = useState(p.defaultDuration);
  const [type, setType] = useState(p.types[0] ?? "VIDEO");
  const [loaded, setLoaded] = useState<{ duration: number; slots: string[] } | null>(null);
  const slots = loaded && loaded.duration === duration ? loaded.slots : null;
  const [slot, setSlot] = useState("");
  const [f, setF] = useState({ name: "", email: "", phone: "", address: "", notes: "", website: "" });
  const [renderedAt] = useState(() => Date.now());
  const [state, setState] = useState<{ kind: "form" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "done"; manageToken: string; emailQueued: boolean }>({ kind: "form" });

  useEffect(() => {
    let live = true;
    publicSlotsAction(p.token, duration).then((r) => { if (live) setLoaded({ duration, slots: r.ok ? r.slots : [] }); }).catch(() => { if (live) setLoaded({ duration, slots: [] }); });
    return () => { live = false; };
  }, [p.token, duration]);

  function switchLang(l: "EN" | "FR") { setLang(l); try { const u = new URL(window.location.href); u.searchParams.set("lang", l.toLowerCase()); window.history.replaceState(null, "", u); } catch { /* ignore */ } }
  const need = { phone: type === "PHONE", address: type === "ON_SITE" };
  const ready = slot && f.name.trim() && /.+@.+\..+/.test(f.email) && (!need.phone || f.phone.trim()) && (!need.address || f.address.trim());

  async function submit() {
    setState({ kind: "busy" });
    try {
      const r = await publicBookAction({ token: p.token, startsAt: slot, durationMinutes: duration, type: type as "VIDEO", name: f.name, email: f.email, phone: f.phone || undefined, address: f.address || undefined, notes: f.notes || undefined, timezone: tz, language: lang, website: f.website, renderedAt });
      if (r.ok) setState({ kind: "done", manageToken: r.manageToken, emailQueued: r.emailQueued });
      else {
        const map: Record<string, string> = { SLOT_TAKEN: t.slotTaken, TOO_MANY: t.tooMany, RATE_LIMITED: t.rateLimited, INVALID: t.invalid, NOT_FOUND: t.notFoundBody };
        setState({ kind: "error", msg: map[r.error] ?? t.invalid });
        if (r.error === "SLOT_TAKEN") publicSlotsAction(p.token, duration).then((x) => { if (x.ok) { setLoaded({ duration, slots: x.slots }); setSlot(""); } });
      }
    } catch { setState({ kind: "error", msg: t.invalid }); }
  }

  const header = (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{t.bookTitle}</h1>
        <p className="text-sm text-slate-600">{t.withSeller} <b>{p.sellerName}</b>{p.sellerTitle ? ` · ${p.sellerTitle}` : ""}</p>
      </div>
      <div role="group" aria-label={t.language} className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-sm">
        {(["EN", "FR"] as const).map((l) => <button key={l} type="button" onClick={() => switchLang(l)} aria-pressed={lang === l} className={`min-h-11 min-w-11 px-3 ${lang === l ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{l}</button>)}
      </div>
    </div>
  );

  if (state.kind === "done") {
    return (
      <div lang={lang.toLowerCase()}>
        {header}
        <div role="status" className="space-y-3 rounded-xl bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold text-emerald-900">{t.confirmedTitle}</h2>
          <p className="text-sm text-emerald-900">{t.confirmedBody}</p>
          <p className="text-sm font-medium">{new Intl.DateTimeFormat(lang === "FR" ? "fr-CA" : "en-CA", { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(new Date(slot))} ({tz})</p>
          <p className={`text-sm ${state.emailQueued ? "text-emerald-900" : "text-amber-900"}`}>{state.emailQueued ? t.emailSent : t.emailNotSent}</p>
          <div className="flex flex-wrap gap-2">
            <a className={btnPrimary} href={`/api/sales/meeting/${state.manageToken}/ics`}>{t.addToCalendar}</a>
            <a className={btnSecondary} href={`/sales/meeting/${state.manageToken}?lang=${lang.toLowerCase()}`}>{t.manageLink}</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div lang={lang.toLowerCase()}>
      {header}
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ready) void submit(); }}>
        {p.durations.length > 1 && (
          <fieldset><legend className="mb-1 text-sm font-medium text-slate-700">{t.chooseDuration}</legend>
            <div className="flex flex-wrap gap-2">{p.durations.map((d) => <button key={d} type="button" aria-pressed={d === duration} className={d === duration ? btnPrimary : btnSecondary} onClick={() => { setDuration(d); setSlot(""); }}>{d} {t.minutes}</button>)}</div>
          </fieldset>
        )}
        {p.types.length > 1 && (
          <fieldset><legend className="mb-1 text-sm font-medium text-slate-700">{t.chooseType}</legend>
            <div className="flex flex-wrap gap-2">{p.types.map((k) => <button key={k} type="button" aria-pressed={k === type} className={k === type ? btnPrimary : btnSecondary} onClick={() => setType(k)}>{t.types[k]}</button>)}</div>
            {type === "VIDEO" && <p className="mt-1 text-xs text-slate-500">{t.honestyVideo}</p>}
          </fieldset>
        )}
        <section aria-labelledby="slots-h">
          <h2 id="slots-h" className="mb-2 text-sm font-medium text-slate-700">{t.chooseDay}</h2>
          {slots === null ? <p className="text-sm text-slate-500" role="status">…</p> : <SlotPicker lang={lang} tz={tz} slots={slots} value={slot} onChange={setSlot} />}
        </section>
        {slot && (
          <section className="space-y-3" aria-labelledby="det-h">
            <h2 id="det-h" className="text-sm font-medium text-slate-700">{t.yourDetails}</h2>
            <label className={labelCls}>{t.name} *<input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required maxLength={120} /></label>
            <label className={labelCls}>{t.email} *<input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required /></label>
            <label className={labelCls}>{need.phone ? `${t.phoneNeeded} *` : t.phone}<input type="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" required={need.phone} maxLength={40} /></label>
            {need.address && <label className={labelCls}>{t.address} *<input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} required maxLength={300} /></label>}
            <label className={labelCls}>{t.notes}<textarea className={`${inputCls} min-h-20 py-2`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></label>
            {/* Honeypot: invisible to people and assistive tech, irresistible to form-filling bots. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label></div>
            <p className="text-xs text-slate-500">{t.privacy}</p>
            {state.kind === "error" && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.msg}</p>}
            <button className={`${btnPrimary} w-full`} disabled={!ready || state.kind === "busy"}>{state.kind === "busy" ? t.confirming : t.confirm}</button>
          </section>
        )}
      </form>
    </div>
  );
}
