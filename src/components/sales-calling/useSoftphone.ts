"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { cancelCall, reconcileCall, startProspectCall, startTestCall } from "@/actions/sales-calling";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import type { StartCallResult } from "@/lib/voice/types";

// The ONE owner of the Twilio Device/Call. It lives in the top-level workspace component, which is never unmounted while the seller
// moves between panels, tabs or the email drawer, so an active call survives every UI change. Only { sessionId, authToken } are ever sent to Twilio.

export type Phase = "idle" | "authorizing" | "dialing" | "ringing" | "connected" | "ended" | "failed";
export type Target = { kind: "PROSPECT"; id: string; name: string; confirmOutOfHours?: boolean } | { kind: "TEST"; number: string };
export type Dispo = { sessionId: string; prospectId: string | null; name: string | null; settling: boolean };
interface Live { device: Device | null; call: Call | null; sessionId: string | null; prospectId: string | null; label: string | null; accepted: boolean; hungUp: boolean; done: boolean; startedAt: number }

const DEVICE_KEY = "garageos.softphone.inputDevice";
export const LIVE_PHASES: Phase[] = ["dialing", "ringing", "connected"];
const idempotencyKey = () => crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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

export function useSoftphone(c: CallingCopy, initialDispo: Dispo | null) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [session, setSession] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dispo, setDispo] = useState<Dispo | null>(initialDispo);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const live = useRef<Live>({ device: null, call: null, sessionId: null, prospectId: null, label: null, accepted: false, hungUp: false, done: true, startedAt: 0 });

  const callActive = phase === "authorizing" || LIVE_PHASES.includes(phase);
  const isLive = LIVE_PHASES.includes(phase);
  const locked = callActive || dispo !== null;

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
    setError(null); setNotice(null); setPhase("authorizing"); setMuted(false); setSeconds(0);
    const key = idempotencyKey();
    const micError = await requestMic(c);
    if (micError) { setPhase("idle"); setError(micError); return; }
    let r: StartCallResult;
    try {
      r = target.kind === "PROSPECT" ? await startProspectCall(target.id, key, target.confirmOutOfHours === true) : await startTestCall(target.number, key);
    } catch {
      setPhase("idle"); setError(c.unexpected); return;
    }
    if (!r.ok) { setPhase("idle"); setError(c.errors[r.code] ?? c.unexpected); return; }
    const sid = r.sessionId;
    Object.assign(l, { call: null, sessionId: sid, prospectId: target.kind === "PROSPECT" ? target.id : null, label: target.kind === "PROSPECT" ? target.name : r.destinationMasked, accepted: false, hungUp: false, done: false, startedAt: 0 });
    setSession(l.label);
    setSessionId(sid);
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

  /** After the outcome is saved (or a failed/ended test call is dismissed): back to Ready. */
  function reset() {
    setDispo(null);
    setPhase("idle");
    setSession(null);
    setSessionId(null);
    setError(null);
  }

  return { phase, error, setError, notice, setNotice, muted, seconds, session, sessionId, dispo, setDispo, mics, micId, pickMic, start, hangUp, toggleMute, reset, callActive, isLive, locked };
}

export type Softphone = ReturnType<typeof useSoftphone>;
