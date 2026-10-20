"use client";

import type { ReactNode } from "react";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { inputCls, labelCls } from "@/components/sales-crm/ui";
import { controlsFor, phaseTone, type DisplayMode, type Locks, type PhonePhase } from "./softphone-model";
import { AlertIcon, PauseIcon, CompactIcon, DotIcon, ExpandIcon, HangUpIcon, MicIcon, MicOffIcon, MinimizeIcon, PhoneIcon } from "./icons";
import { fill } from "./shared";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const TONE: Record<string, string> = { idle: "text-slate-400", busy: "text-amber-500", live: "text-emerald-500", ended: "text-slate-500", failed: "text-red-500" };
const iconBtn = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50";

export interface FloatingSoftphoneProps {
  c: CallingCopy; mode: DisplayMode; onMode: (m: DisplayMode) => void; dockedLeftOfDrawer: boolean;
  phase: PhonePhase; muted: boolean; seconds: number; label: string | null; number: string | null; locks: Locks; callBlockedText: string | null;
  error: string | null; notice: string | null; today: { placed: number; cap: number };
  mics: { deviceId: string; label: string }[]; micId: string; onPickMic: (id: string) => void;
  /** Real telephony hold. `reason` explains a disabled control; hold is never a microphone mute. */
  hold: { held: boolean; busy: boolean; enabled: boolean; reason: string | null; onToggle: () => void };
  onCall: () => void; onHangUp: () => void; onToggleMute: () => void; onDismiss: (() => void) | null;
  /** The mandatory outcome form. Always rendered at the same tree position (hidden unless expanded) so its fields survive every mode change. */
  outcome: ReactNode; saved: ReactNode; nav: ReactNode;
}

/** Floating softphone: pure props → markup. The single Twilio owner (useSoftphone) lives in CallingWorkspace; this only presents it. */
export function FloatingSoftphone(p: FloatingSoftphoneProps) {
  const { c, mode, locks } = p;
  const u = c.ws.phoneUi;
  const show = controlsFor(mode, locks);
  const tone = phaseTone(p.phase);
  const stateText = `${p.hold.held ? u.onHold : c.softphone.states[p.phase]}${p.muted && p.phase === "connected" ? ` · ${c.softphone.muted}` : ""}`;
  const timer = p.phase === "connected" || p.phase === "ended" ? clock(p.seconds) : null;
  const pos = p.dockedLeftOfDrawer ? "lg:right-[calc(min(62vw,60rem)_+_1rem)]" : "lg:right-4";
  const modes: [DisplayMode, string, ReactNode][] = [["expanded", u.expand, <ExpandIcon key="e" />], ["compact", u.compact, <CompactIcon key="c" />], ["minimized", u.minimize, <MinimizeIcon key="m" />]];

  const muteBtn = (
    <button type="button" className={`${iconBtn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`} disabled={p.phase !== "connected"} aria-pressed={p.muted} onClick={p.onToggleMute}>
      {p.muted ? <MicOffIcon /> : <MicIcon />}<span>{p.muted ? c.softphone.unmute : c.softphone.mute}</span>
    </button>
  );
  const holdBtn = (
    <span title={p.hold.reason ?? undefined}>
      <button type="button" className={`${iconBtn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`} disabled={p.phase !== "connected" || !p.hold.enabled || p.hold.busy} aria-pressed={p.hold.held} onClick={p.hold.onToggle}>
        <PauseIcon /><span>{p.hold.busy ? u.holdWorking : p.hold.held ? u.resume : u.hold}</span>
      </button>
    </span>
  );
  const hangBtn = (
    <button type="button" className={`${iconBtn} bg-red-600 px-3 text-white hover:bg-red-700`} onClick={p.onHangUp}>
      <HangUpIcon /><span>{c.softphone.hangUp}</span>
    </button>
  );

  return (
    <aside aria-label={u.region} data-mode={mode}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] motion-safe:transition-[right] lg:inset-x-auto lg:bottom-4 ${pos} lg:w-[22rem] lg:rounded-2xl lg:border lg:shadow-2xl`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <DotIcon className={`size-2.5 ${TONE[tone]}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{p.label ?? c.ws.phone.noProspect}</p>
          <p role="status" aria-live="polite" className="truncate text-xs text-slate-600">{stateText}{timer ? <span className="font-mono tabular-nums"> · <span className="sr-only">{c.softphone.timer} </span>{timer}</span> : null}</p>
        </div>
        {show.outcomeBadge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"><AlertIcon className="size-3.5" />{u.outcomeRequired}</span>
        )}
        {mode !== "expanded" && show.mute && muteBtn}
        {mode !== "expanded" && show.hold && holdBtn}
        {mode !== "expanded" && show.hangUp && hangBtn}
        <div className="flex shrink-0">
          {modes.filter(([m]) => m !== mode).map(([m, label, icon]) => (
            <button key={m} type="button" className={`${iconBtn} text-slate-600 hover:bg-slate-100`} onClick={() => p.onMode(m)} title={label}>{icon}<span className="sr-only">{label}</span></button>
          ))}
        </div>
      </div>

      <div className={mode === "expanded" ? "max-h-[75vh] space-y-3 overflow-y-auto border-t border-slate-100 px-3 pb-3 pt-2 lg:max-h-[calc(100vh_-_8rem)]" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-600">
          <span>{u.number}: <b className="font-medium text-slate-800">{p.number ?? "—"}</b></span>
          <span>{fill(c.ws.today, { placed: p.today.placed, cap: p.today.cap })}</span>
        </div>
        {show.outcomeForm && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"><AlertIcon className="mt-0.5" />{u.outcomeBanner}</p>
        )}
        <div className="flex flex-wrap gap-2" data-softphone-controls="">
          {show.call && (
            <span title={p.callBlockedText ?? undefined} className="block flex-1">
              <button type="button" className={`${iconBtn} w-full bg-emerald-600 px-4 text-white hover:bg-emerald-700`} disabled={locks.callLocked} onClick={p.onCall} aria-describedby={p.callBlockedText ? "phone-call-blocked" : undefined}>
                <PhoneIcon /><span>{c.softphone.call}</span>
              </button>
            </span>
          )}
          {show.mute && muteBtn}
          {show.hold && holdBtn}
          {show.hangUp && hangBtn}
        </div>
        {p.hold.held && <p role="status" className="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900"><PauseIcon className="mt-0.5" />{u.holdingHint}</p>}
        {show.hold && !p.hold.enabled && p.hold.reason && p.phase === "connected" && <p className="text-xs text-slate-500">{p.hold.reason}</p>}
        {show.call && p.callBlockedText && <p id="phone-call-blocked" className="text-xs text-amber-800">{p.callBlockedText}</p>}
        {p.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{p.error}</p>}
        {p.notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{p.notice}</p>}
        {p.onDismiss && <button type="button" className={`${iconBtn} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={p.onDismiss}>{c.softphone.dismiss}</button>}
        {show.mic && p.mics.length > 0 && (
          <label className={labelCls}>{c.softphone.microphone}
            <select className={inputCls} value={p.micId} onChange={(e) => p.onPickMic(e.target.value)}>
              <option value="">{c.softphone.defaultDevice}</option>
              {p.mics.map((d, n) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${c.softphone.microphone} ${n + 1}`}</option>)}
            </select>
          </label>
        )}
        <div>{p.outcome}</div>
        <div>{p.saved}</div>
        <div>{p.nav}</div>
      </div>
    </aside>
  );
}
