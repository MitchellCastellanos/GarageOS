"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Call, Device } from "@twilio/voice-sdk";
import { cancelCall, reconcileCall, saveCallDisposition, startProspectCall, startTestCall, type CallingPageData } from "@/actions/sales-calling";
import { callingCopy, type CallingCopy } from "@/lib/admin-locale/sales-calling";
import { DISPOSITIONS, type Disposition, type StartCallResult } from "@/lib/voice/types";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, formatDate, inputCls, labelCls } from "@/components/sales-crm/ui";

type Phase = "idle" | "authorizing" | "dialing" | "ringing" | "connected" | "ended" | "failed";
type Item = CallingPageData["queue"][number];
type Target = { kind: "PROSPECT"; id: string; name: string } | { kind: "TEST"; number: string };
type Dispo = { sessionId: string; prospectId: string | null; name: string | null; settling: boolean };
interface Live { device: Device | null; call: Call | null; sessionId: string | null; prospectId: string | null; label: string | null; accepted: boolean; hungUp: boolean; done: boolean; startedAt: number }

const DEVICE_KEY = "garageos.softphone.inputDevice";
const LIVE_PHASES: Phase[] = ["dialing", "ringing", "connected"];
const idempotencyKey = () => crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const readStored = () => { try { return localStorage.getItem(DEVICE_KEY) ?? ""; } catch { return ""; } };
const writeStored = (v: string) => { try { localStorage.setItem(DEVICE_KEY, v); } catch { /* storage unavailable */ } };

async function requestMic(c: CallingCopy): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return c.softphone.mic.unsupported;
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return c.softphone.mic.denied;
    if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return c.softphone.mic.notFound;
    if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return c.softphone.mic.inUse;
    return c.softphone.mic.generic;
  }
}

export function CallingWorkspace({ data, locale }: { data: CallingPageData; locale: "en" | "fr" }) {
  const c = callingCopy(locale);
  const router = useRouter();
  const { gates, queue } = data;
  const pendingD = data.pendingDisposition;
  const [selectedId, setSelectedId] = useState<string | null>(pendingD?.prospectId ?? queue[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [session, setSession] = useState<string | null>(null);
  const [dispo, setDispo] = useState<Dispo | null>(pendingD ? { sessionId: pendingD.sessionId, prospectId: pendingD.prospectId, name: pendingD.prospectName, settling: false } : null);
  const [saved, setSaved] = useState<{ nextId: string | null } | null>(null);
  const [openCallShown, setOpenCallShown] = useState(!!data.openCall);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [testNumber, setTestNumber] = useState(data.testNumbers[0]?.value ?? "");
  const [reconciling, startReconcile] = useTransition();
  const live = useRef<Live>({ device: null, call: null, sessionId: null, prospectId: null, label: null, accepted: false, hungUp: false, done: true, startedAt: 0 });

  const selected = queue.find((q) => q.id === selectedId) ?? null;
  const callActive = phase === "authorizing" || LIVE_PHASES.includes(phase);
  const locked = callActive || (dispo !== null);
  const prospectGateOpen = gates.commercialCallingOpen;
  const testGateOpen = gates.enabled && gates.provisioned;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId);
      if (!alive) return;
      setMics(list);
      setMicId((prev) => { const id = prev || readStored(); return list.some((d) => d.deviceId === id) ? id : ""; });
    };
    void load().catch(() => undefined);
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => { alive = false; navigator.mediaDevices?.removeEventListener?.("devicechange", load); };
  }, []);

  useEffect(() => {
    if (phase !== "connected") return;
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - live.current.startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!LIVE_PHASES.includes(phase)) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  useEffect(() => {
    const l = live.current;
    return () => {
      if (!l.done && l.sessionId && !l.accepted) void cancelCall(l.sessionId).catch(() => undefined);
      l.done = true;
      l.device?.destroy();
      l.device = null;
    };
  }, []);

  function teardown() {
    const l = live.current;
    l.call = null;
    l.device?.destroy();
    l.device = null;
  }

  function finish(next: "ended" | "failed", sid: string) {
    const l = live.current;
    if (l.done) return;
    l.done = true;
    teardown();
    setPhase(next);
    setMuted(false);
    if (next === "failed") setError(c.softphone.callFailed);
    const track = l.prospectId !== null && (next === "ended" || l.accepted);
    if (track) setDispo({ sessionId: sid, prospectId: l.prospectId, name: l.label, settling: true });
    window.setTimeout(() => {
      void reconcileCall(sid).catch(() => undefined).finally(() => setDispo((d) => (d && d.sessionId === sid ? { ...d, settling: false } : d)));
    }, 4000);
  }

  function failBeforeConnect(sid: string) {
    const l = live.current;
    if (l.done) return;
    l.done = true;
    teardown();
    void cancelCall(sid).catch(() => undefined);
    setPhase("failed");
    setError(c.softphone.connectFailed);
  }

  async function start(target: Target) {
    if (locked) return;
    const l = live.current;
    setError(null); setNotice(null); setSaved(null); setPhase("authorizing"); setMuted(false); setSeconds(0);
    const key = idempotencyKey();
    const micError = await requestMic(c);
    if (micError) { setPhase("idle"); setError(micError); return; }
    let r: StartCallResult;
    try {
      r = target.kind === "PROSPECT" ? await startProspectCall(target.id, key) : await startTestCall(target.number, key);
    } catch {
      setPhase("idle"); setError(c.unexpected); return;
    }
    if (!r.ok) { setPhase("idle"); setError(c.errors[r.code] ?? c.unexpected); return; }
    const sid = r.sessionId;
    Object.assign(l, { call: null, sessionId: sid, prospectId: target.kind === "PROSPECT" ? target.id : null, label: target.kind === "PROSPECT" ? target.name : r.destinationMasked, accepted: false, hungUp: false, done: false, startedAt: 0 });
    setSession(l.label);
    setPhase("dialing");
    try {
      const { Device: TwilioDevice, Call: TwilioCall } = await import("@twilio/voice-sdk");
      const device = new TwilioDevice(r.accessToken, { codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU], closeProtection: true });
      l.device = device;
      device.on("error", () => { if (!l.call) failBeforeConnect(sid); });
      if (micId) await device.audio?.setInputDevice(micId).catch(() => undefined);
      const call = await device.connect({ params: { sessionId: sid, authToken: r.authToken } });
      if (l.done) { call.disconnect(); return; }
      l.call = call;
      call.on("ringing", () => setPhase("ringing"));
      call.on("accept", () => { l.accepted = true; l.startedAt = Date.now(); setPhase("connected"); });
      call.on("disconnect", () => finish("ended", sid));
      call.on("cancel", () => finish(l.hungUp ? "ended" : "failed", sid));
      call.on("reject", () => finish("failed", sid));
      call.on("error", () => finish("failed", sid));
    } catch {
      failBeforeConnect(sid);
    }
  }

  function hangUp() {
    const l = live.current;
    l.hungUp = true;
    if (l.call) { l.call.disconnect(); return; }
    if (l.done || !l.sessionId) return;
    l.done = true;
    teardown();
    void cancelCall(l.sessionId).catch(() => undefined);
    setPhase("idle");
  }

  function toggleMute() {
    const call = live.current.call;
    if (!call) return;
    call.mute(!call.isMuted());
    setMuted(call.isMuted());
  }

  function pickMic(id: string) {
    setMicId(id);
    writeStored(id);
    if (id) void live.current.device?.audio?.setInputDevice(id).catch(() => undefined);
  }

  function onSaved(d: Dispo) {
    const rest = queue.filter((q) => q.id !== d.prospectId);
    const idx = queue.findIndex((q) => q.id === d.prospectId);
    setSaved({ nextId: (idx >= 0 ? rest[idx] : rest[0])?.id ?? null });
    setDispo(null);
    setPhase("idle");
    setSession(null);
    router.refresh();
  }

  function reconcileOpen() {
    const open = data.openCall;
    if (!open) return;
    startReconcile(async () => {
      try { await reconcileCall(open.sessionId); setNotice(c.softphone.reconciled); setOpenCallShown(false); router.refresh(); } catch { setError(c.unexpected); }
    });
  }

  const isHeld = (i: Item) => !!i.province && gates.heldProvinces.includes(i.province.toUpperCase());
  const closedHint = (i: Item) => (isHeld(i) ? c.queue.held : i.windowOpen ? "" : i.localTime ? c.queue.closedHint.replace("{time}", i.localTime) : c.queue.closedUnknown);
  const gateLines = [!gates.enabled && c.gates.disabled, gates.enabled && !gates.provisioned && c.gates.notProvisioned, !gates.dnclRegistered && c.gates.dncl, !gates.liveCallingAuthorized && c.gates.notAuthorized].filter((x): x is string => !!x);
  const canCall = !!selected && prospectGateOpen && selected.windowOpen && !isHeld(selected) && !locked;

  return (
    <div className="space-y-4">
      {!prospectGateOpen && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{c.gates.lockedTitle}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{gateLines.map((l) => <li key={l}>{l}</li>)}</ul>
          {data.isSuperAdmin && <Link href={PLATFORM.salesVoiceSettings} className="mt-2 inline-flex min-h-11 items-center font-medium text-blue-700 underline">{c.gates.settingsLink}</Link>}
        </div>
      )}
      {data.openCall && openCallShown && !callActive && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <p>{c.softphone.openCall.replace("{state}", data.openCall.state)}</p>
          <button type="button" className={btnSecondary} disabled={reconciling} onClick={reconcileOpen}>{c.softphone.reconcile}</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-labelledby="queue-title" className="min-w-0 space-y-2">
          <h2 id="queue-title" className="text-base font-semibold text-slate-900">{c.queue.title} ({queue.length})</h2>
          {queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="font-medium text-slate-800">{c.queue.empty}</p>
              <p className="mt-1 text-sm text-slate-500">{c.queue.emptyHint}</p>
            </div>
          ) : (
            <ul aria-label={c.queue.list} className="space-y-2">
              {queue.map((i) => (
                <li key={i.id}>
                  <button type="button" aria-pressed={i.id === selectedId} disabled={callActive} onClick={() => { setSelectedId(i.id); setSaved(null); setError(null); }}
                    className={`min-h-11 w-full rounded-xl border p-3 text-left disabled:opacity-60 ${i.id === selectedId ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="break-words font-medium text-slate-900">{i.name}</span>
                      <Badge tone={i.language === "UNKNOWN" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-800"}>{c.queue.language[i.language] ?? i.language}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{[i.city, i.province].filter(Boolean).join(", ")}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{i.phoneMasked}</span>
                      {i.localTime && <span>{c.queue.localTime} {i.localTime}</span>}
                      <Badge tone={i.windowOpen && !isHeld(i) ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>{i.windowOpen ? c.queue.windowOpen : c.queue.windowClosed}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-4">
          <section className={`${cardCls} space-y-3`} aria-labelledby="prospect-title">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 id="prospect-title" className="break-words text-lg font-semibold text-slate-900">{selected.name}</h2>
                    <p className="text-sm text-slate-600">{[selected.city, selected.province].filter(Boolean).join(", ")}</p>
                  </div>
                  <Badge tone={selected.language === "UNKNOWN" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-800"}>{c.queue.language[selected.language] ?? selected.language}</Badge>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="text-slate-500">{c.queue.masked}</dt><dd className="font-medium text-slate-900">{selected.phoneMasked}</dd></div>
                  <div className="flex gap-2"><dt className="text-slate-500">{c.queue.localTime}</dt><dd className="font-medium text-slate-900">{selected.localTime || "—"}</dd></div>
                  <div className="flex gap-2"><dt className="text-slate-500">{c.queue.lastActivity}</dt><dd className="font-medium text-slate-900">{selected.lastActivityAt ? formatDate(selected.lastActivityAt, locale) : c.queue.never}</dd></div>
                </dl>
                {closedHint(selected) && <p className="text-sm text-amber-800">{closedHint(selected)}</p>}
                <button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={!canCall} aria-label={c.softphone.callTo.replace("{name}", selected.name)}
                  onClick={() => void start({ kind: "PROSPECT", id: selected.id, name: selected.name })}>{phase === "authorizing" ? c.softphone.calling : c.softphone.call}</button>
                <p className="text-xs text-slate-500">{c.softphone.tip}</p>
              </>
            ) : <p id="prospect-title" className="text-sm text-slate-600">{c.queue.pickOne}</p>}
          </section>

          <section className={`${cardCls} space-y-3`} aria-labelledby="softphone-title">
            <h2 id="softphone-title" className="text-base font-semibold text-slate-900">{c.softphone.title}</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p role="status" aria-live="polite" className="text-lg font-semibold text-slate-900">{c.softphone.states[phase]}{muted && phase === "connected" ? ` · ${c.softphone.muted}` : ""}</p>
                {session && phase !== "idle" && <p className="break-words text-sm text-slate-600">{c.softphone.destination} {session}</p>}
              </div>
              {(phase === "connected" || phase === "ended") && <p className="font-mono text-2xl tabular-nums text-slate-900"><span className="sr-only">{c.softphone.timer} </span>{clock(seconds)}</p>}
            </div>
            {LIVE_PHASES.includes(phase) && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${btnPrimary} bg-red-600 hover:bg-red-700`} onClick={hangUp}>{c.softphone.hangUp}</button>
                <button type="button" className={btnSecondary} disabled={phase !== "connected"} aria-pressed={muted} onClick={toggleMute}>{muted ? c.softphone.unmute : c.softphone.mute}</button>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
            {(phase === "failed" || phase === "ended") && !dispo && <button type="button" className={btnSecondary} onClick={() => { setPhase("idle"); setError(null); setSession(null); }}>{c.softphone.dismiss}</button>}
            {mics.length > 0 && (
              <label className={labelCls}>{c.softphone.microphone}
                <select className={inputCls} value={micId} onChange={(e) => pickMic(e.target.value)}>
                  <option value="">{c.softphone.defaultDevice}</option>
                  {mics.map((d, n) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${c.softphone.microphone} ${n + 1}`}</option>)}
                </select>
              </label>
            )}
          </section>

          {dispo && <DispositionPanel key={dispo.sessionId} c={c} dispo={dispo} onSaved={() => onSaved(dispo)} />}
          {saved && !dispo && (
            <section className={`${cardCls} space-y-3`}>
              <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{c.disposition.saved}</p>
              {saved.nextId
                ? <button type="button" className={btnPrimary} onClick={() => { setSelectedId(saved.nextId); setSaved(null); }}>{c.disposition.nextProspect}</button>
                : <p className="text-sm text-slate-600">{c.disposition.noNext}</p>}
            </section>
          )}

          {data.isSuperAdmin && (
            <section className={`${cardCls} space-y-3`} aria-labelledby="test-title">
              <div><h2 id="test-title" className="text-base font-semibold text-slate-900">{c.test.title}</h2><p className="mt-1 text-sm text-slate-600">{c.test.hint}</p></div>
              {!testGateOpen ? <p className="text-sm text-amber-800">{c.test.needsGates}</p> : data.testNumbers.length === 0 ? <p className="text-sm text-slate-600">{c.test.none}</p> : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className={`${labelCls} min-w-48 flex-1`}>{c.test.number}
                    <select className={inputCls} value={testNumber} onChange={(e) => setTestNumber(e.target.value)}>
                      {data.testNumbers.map((n) => <option key={n.value} value={n.value}>{n.masked}</option>)}
                    </select>
                  </label>
                  <button type="button" className={btnSecondary} disabled={locked || !testNumber} onClick={() => void start({ kind: "TEST", number: testNumber })}>{c.test.call}</button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DispositionPanel({ c, dispo, onSaved }: { c: CallingCopy; dispo: Dispo; onSaved: () => void }) {
  const d = c.disposition;
  const [outcome, setOutcome] = useState<Disposition | "">("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [dnc, setDnc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isDnc = outcome === "DO_NOT_CALL";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!outcome) return setError(d.pickOutcome);
    if (outcome === "CALL_BACK" && !date) return setError(d.followUpRequired);
    if (isDnc && !note.trim()) return setError(d.noteRequired);
    setError(null);
    start(async () => {
      try {
        const r = await saveCallDisposition(dispo.sessionId, { outcome, note: note.trim() || undefined, followUpDate: date || undefined, followUpTime: date && time ? time : undefined });
        if (r.ok || r.code === "ALREADY_RECORDED") return onSaved();
        setError(r.detail === "FOLLOW_UP_REQUIRED" ? d.followUpRequired : r.detail === "NOTE_REQUIRED" ? d.noteRequired : c.errors[r.code] ?? c.unexpected);
      } catch {
        setError(c.unexpected);
      }
    });
  }

  return (
    <form onSubmit={submit} className={`${cardCls} space-y-4`} aria-labelledby="dispo-title">
      <div>
        <h2 id="dispo-title" className="text-base font-semibold text-slate-900">{d.title}{dispo.name ? ` · ${dispo.name}` : ""}</h2>
        <p className="mt-1 text-sm text-slate-600">{d.subtitle}</p>
      </div>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-slate-700">{d.outcome}</legend>
        {DISPOSITIONS.map((o) => (
          <label key={o} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${outcome === o ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => { setOutcome(o); setDnc(false); }} className="size-4" />
            {d.outcomes[o]}
          </label>
        ))}
      </fieldset>
      {isDnc && (
        <label className="flex min-h-11 items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="mt-0.5 size-4" />
          <span><span className="block font-medium">{d.dncLabel}</span>{d.dncConfirm}</span>
        </label>
      )}
      <label className={labelCls}>{d.notes}
        <textarea className={`${inputCls} py-2`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="text-xs font-normal text-slate-500">{d.notesHint}</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>{d.followUpDate}<input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required={outcome === "CALL_BACK"} /></label>
        <label className={labelCls}>{d.followUpTime}<input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></label>
      </div>
      <p className="-mt-2 text-xs text-slate-500">{d.followUpHint}</p>
      {dispo.settling && <p role="status" className="text-sm text-slate-600">{d.settling}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button className={btnPrimary} disabled={pending || dispo.settling || !outcome || (isDnc && !dnc)}>{pending ? d.saving : d.save}</button>
    </form>
  );
}
