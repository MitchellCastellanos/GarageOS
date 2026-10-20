"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  voiceAuthorizeLiveCalling, voiceClearDnclRegistration, voiceRecordDnclRegistration, voiceSetAllowOutOfHours, voiceSetEnabled, voiceSetHoldEnabled, voiceSetHeldProvinces, voiceSetLimits, voiceSetTestNumbers,
  type getVoiceSettingsView,
} from "@/actions/sales-voice-settings";
import { callingCopy } from "@/lib/admin-locale/sales-calling";
import { Badge, btnDanger, btnPrimary, cardCls, formatDate, inputCls, labelCls } from "@/components/sales-crm/ui";

type View = Awaited<ReturnType<typeof getVoiceSettingsView>>;
type Outcome = { ok: boolean; code?: string };
type Msg = { key: string; error?: string; ok?: string } | null;

export function VoiceSettingsPanel({ view, locale }: { view: View; locale: "en" | "fr" }) {
  const c = callingCopy(locale).voice;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [ref, setRef] = useState(view.dnclRegistrationRef ?? "");
  const [regDate, setRegDate] = useState(view.dnclRegisteredAt ?? "");
  const [confirm, setConfirm] = useState("");
  const [held, setHeld] = useState(view.gates.heldProvinces.join(", "));
  const [tests, setTests] = useState(view.testDestinations.join("\n"));
  const [limits, setLimits] = useState({ dailyCallCapPerSeller: String(view.limits.dailyCallCapPerSeller), cooldownMinutes: String(view.limits.cooldownMinutes), maxCallSeconds: String(view.limits.maxCallSeconds) });
  const g = view.gates;

  function run(key: string, fn: () => Promise<Outcome>, after?: () => void) {
    setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setMsg({ key, error: c.errors[r.code ?? ""] ?? c.errors.unexpected }); return; }
        setMsg({ key, ok: c.saved });
        after?.();
        router.refresh();
      } catch {
        setMsg({ key, error: c.errors.unexpected });
      }
    });
  }
  const submit = (key: string, fn: () => Promise<Outcome>, after?: () => void) => (e: FormEvent) => { e.preventDefault(); run(key, fn, after); };
  const note = (key: string) => msg?.key === key && (msg.error
    ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{msg.error}</p>
    : <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>);
  const yn = (v: boolean) => <Badge tone={v ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>{v ? c.status.yes : c.status.no}</Badge>;
  const section = (title: string, body: string, children: ReactNode) => (
    <section className={`${cardCls} space-y-3`}>
      <div><h2 className="text-base font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-600">{body}</p></div>
      {children}
    </section>
  );

  const rows: [string, ReactNode][] = [
    [c.status.enabled, yn(g.enabled)], [c.status.provisioned, yn(g.provisioned)], [c.status.callerId, yn(view.callerIdSet)], [c.status.dncl, yn(g.dnclRegistered)],
    [c.status.authorized, yn(g.liveCallingAuthorized)], [c.status.open, yn(g.commercialCallingOpen)], [c.status.sellers, view.activeSellers], [c.status.provisionedAt, formatDate(view.provisionedAt, locale, true)],
  ];
  const limitFields: [keyof typeof limits, string][] = [["dailyCallCapPerSeller", c.limits.daily], ["cooldownMinutes", c.limits.cooldown], ["maxCallSeconds", c.limits.maxSeconds]];

  return (
    <div className="space-y-5">
      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">{c.warning}</p>

      <section className={cardCls} aria-labelledby="voice-status">
        <h2 id="voice-status" className="text-base font-semibold text-slate-900">{c.status.title}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k} className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-100 text-sm"><dt className="text-slate-600">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-slate-500">{c.status.secrets}</p>
      </section>

      {section(c.kill.title, c.kill.body, (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">{g.enabled ? c.status.on : c.status.off}</p>
          <button type="button" disabled={pending} className={g.enabled ? btnDanger : btnPrimary} onClick={() => run("kill", () => voiceSetEnabled(!g.enabled))}>{g.enabled ? c.kill.turnOff : c.kill.turnOn}</button>
          {note("kill")}
        </div>
      ))}

      {section(c.dncl.title, c.dncl.body, (
        <form className="space-y-3" onSubmit={submit("dncl", () => voiceRecordDnclRegistration(ref, regDate))}>
          <p className="text-sm text-slate-700">{c.dncl.current}: {view.dnclRegisteredAt ? `${view.dnclRegistrationRef ?? ""} · ${view.dnclRegisteredAt}` : c.dncl.none}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>{c.dncl.reference}<input className={inputCls} value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} required /></label>
            <label className={labelCls}>{c.dncl.date}<input className={inputCls} type="date" value={regDate} onChange={(e) => setRegDate(e.target.value)} required /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={pending}>{c.dncl.save}</button>
            {g.dnclRegistered && <button type="button" className={btnDanger} disabled={pending} onClick={() => run("dncl", voiceClearDnclRegistration, () => { setRef(""); setRegDate(""); })}>{c.dncl.clear}</button>}
          </div>
          {note("dncl")}
        </form>
      ))}

      {section(c.authorize.title, c.authorize.body, (
        <form className="space-y-3" onSubmit={submit("auth", () => voiceAuthorizeLiveCalling(true, confirm), () => setConfirm(""))}>
          {g.liveCallingAuthorized
            ? <p className="text-sm font-medium text-emerald-800">{c.authorize.authorizedNow}</p>
            : !g.dnclRegistered && <p className="text-sm font-medium text-amber-800">{c.authorize.needsDncl}</p>}
          {!g.liveCallingAuthorized && (
            <label className={labelCls}>{c.authorize.confirmLabel}<input className={inputCls} value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} /></label>
          )}
          <div className="flex flex-wrap gap-2">
            {!g.liveCallingAuthorized && <button className={btnPrimary} disabled={pending || !g.dnclRegistered || confirm.trim().toUpperCase() !== c.authorize.confirmWord}>{c.authorize.authorize}</button>}
            {g.liveCallingAuthorized && <button type="button" className={btnDanger} disabled={pending} onClick={() => run("auth", () => voiceAuthorizeLiveCalling(false, ""))}>{c.authorize.revoke}</button>}
          </div>
          {note("auth")}
        </form>
      ))}

      {section(c.hold.title, c.hold.body, (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">{g.holdEnabled ? c.hold.on : c.hold.off}</p>
          <button type="button" disabled={pending} className={g.holdEnabled ? btnDanger : btnPrimary} onClick={() => run("hold", () => voiceSetHoldEnabled(!g.holdEnabled))}>{g.holdEnabled ? c.hold.disable : c.hold.enable}</button>
          {note("hold")}
        </div>
      ))}

      {section(c.outOfHours.title, c.outOfHours.body, (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">{g.allowOutOfHours ? c.outOfHours.on : c.outOfHours.off}</p>
          <button type="button" disabled={pending} className={g.allowOutOfHours ? btnDanger : btnPrimary} onClick={() => run("ooh", () => voiceSetAllowOutOfHours(!g.allowOutOfHours))}>{g.allowOutOfHours ? c.outOfHours.disable : c.outOfHours.enable}</button>
          {note("ooh")}
        </div>
      ))}

      {section(c.held.title, c.held.body, (
        <form className="space-y-3" onSubmit={submit("held", () => voiceSetHeldProvinces(held.split(/[\s,;]+/).filter(Boolean)))}>
          <div className="flex flex-wrap gap-1.5">{g.heldProvinces.length ? g.heldProvinces.map((p) => <Badge key={p} tone="bg-amber-100 text-amber-800">{p}</Badge>) : <Badge>{c.held.none}</Badge>}</div>
          <label className={labelCls}>{c.held.label}<input className={inputCls} value={held} onChange={(e) => setHeld(e.target.value)} placeholder="BC, MB" autoCapitalize="characters" /></label>
          <button className={btnPrimary} disabled={pending}>{c.held.save}</button>
          {note("held")}
        </form>
      ))}

      {section(c.tests.title, c.tests.body, (
        <form className="space-y-3" onSubmit={submit("tests", () => voiceSetTestNumbers(tests.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean)))}>
          <label className={labelCls}>{c.tests.label}<textarea className={`${inputCls} py-2`} rows={4} value={tests} onChange={(e) => setTests(e.target.value)} inputMode="tel" /></label>
          <button className={btnPrimary} disabled={pending}>{c.tests.save}</button>
          {note("tests")}
        </form>
      ))}

      {section(c.limits.title, c.limits.body, (
        <form className="space-y-3" onSubmit={submit("limits", () => voiceSetLimits({ dailyCallCapPerSeller: Number(limits.dailyCallCapPerSeller), cooldownMinutes: Number(limits.cooldownMinutes), maxCallSeconds: Number(limits.maxCallSeconds) }))}>
          <div className="grid gap-3 sm:grid-cols-3">
            {limitFields.map(([k, label]) => <label key={k} className={labelCls}>{label}<input className={inputCls} type="number" min={0} max={100000} step={1} inputMode="numeric" value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} required /></label>)}
          </div>
          <button className={btnPrimary} disabled={pending}>{c.limits.save}</button>
          {note("limits")}
        </form>
      ))}
      <p className="sr-only" aria-live="polite">{pending ? c.saving : ""}</p>
    </div>
  );
}
