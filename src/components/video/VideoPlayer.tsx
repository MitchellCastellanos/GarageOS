"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { WatchTracker, type ClientEventType } from "@/domain/sales-video";
import { PLAYER_LABELS, type VideoCopyLang } from "@/lib/video-copy";

export interface VideoPlayerProps {
  src: string;
  poster: string;
  title: string;
  lang: VideoCopyLang;
  seconds: number;
  /** Attribution token of a sales link. Without it nothing is ever reported. */
  token?: string | null;
  /** Report a page view (token only). */
  reportPageView?: boolean;
  startAt?: number;
  autoPlay?: boolean;
  /** Eager poster (above the fold on the video page) vs lazy (home section). */
  priority?: boolean;
  onTime?: (t: number, playing: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const newViewKey = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
/** DNT / Global Privacy Control: the video still plays; nothing is reported. */
const privacyOptOut = () => typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);

/**
 * Poster-first player. The MP4 is NOT requested until the visitor presses play (no <video> element exists before that), so a page
 * view costs only the poster image. No autoplay with sound. Custom controls (play/pause, seek, mute, volume, full screen) are
 * keyboard- and touch-friendly. Captions are burned into the video, so there is no separate caption track to toggle.
 * Reporting (only with a sales token) is fire-and-forget and can never affect playback.
 */
export function VideoPlayer({ src, poster, title, lang, seconds, token, reportPageView, startAt = 0, autoPlay = false, priority, onTime, onPlayingChange, className }: VideoPlayerProps) {
  const L = PLAYER_LABELS[lang];
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(autoPlay);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [cur, setCur] = useState(startAt);
  const [dur, setDur] = useState(seconds);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [full, setFull] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const viewKey = useRef<string | null>(null);
  const loaded = useRef(false);
  const tracker = useRef(new WatchTracker(seconds));

  const send = useCallback((type: ClientEventType) => {
    try {
      if (!token || privacyOptOut()) return;
      viewKey.current ??= newViewKey();
      const body = JSON.stringify({ t: token, v: viewKey.current, e: type });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/video/event", new Blob([body], { type: "application/json" }));
      else void fetch("/api/video/event", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    } catch { /* never affects playback */ }
  }, [token]);

  // Page view: only after the page has really been shown to a person (script ran, tab visible) — not at HTTP fetch time.
  useEffect(() => {
    if (!reportPageView) return;
    const id = window.setTimeout(() => { if (document.visibilityState === "visible") send("PAGE_VIEW"); }, 1500);
    return () => window.clearTimeout(id);
  }, [reportPageView, send]);

  // A CDN that never answers raises no media error: if nothing has loaded after 15 s, say so (with a retry) instead of a silent black box.
  useEffect(() => {
    if (!started) return;
    loaded.current = false;
    const id = window.setTimeout(() => { if (!loaded.current) setError(true); }, 15000);
    return () => window.clearTimeout(id);
  }, [started, attempt]);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function begin() { setStarted(true); setEnded(false); setError(false); }
  function toggle() {
    const v = vid.current; if (!v) { begin(); return; }
    if (v.paused || v.ended) void v.play().catch(() => setError(true)); else v.pause();
  }
  function emit(out: { events: ClientEventType[] }) { for (const e of out.events) send(e); }
  async function fullscreen() {
    const el = wrap.current, v = vid.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el?.requestFullscreen) await el.requestFullscreen();
      else v?.webkitEnterFullscreen?.(); // iOS Safari
    } catch { /* ignore */ }
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const v = vid.current;
    if (e.key === " " || e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); }
    else if (e.key.toLowerCase() === "m" && v) { v.muted = !v.muted; }
    else if (e.key.toLowerCase() === "f") { e.preventDefault(); void fullscreen(); }
    else if (e.key === "ArrowRight" && v) { v.currentTime = Math.min(v.duration || seconds, v.currentTime + 5); }
    else if (e.key === "ArrowLeft" && v) { v.currentTime = Math.max(0, v.currentTime - 5); }
  }

  const iconBtn = "inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white";

  return (
    <div ref={wrap} onKeyDown={onKey} className={`group relative isolate aspect-video w-full overflow-hidden rounded-2xl bg-brand-navy shadow-xl shadow-slate-900/20 ring-1 ring-slate-900/10 ${className ?? ""}`}>
      {!started ? (
        <button type="button" onClick={begin} aria-label={L.playVideo(title)} className="absolute inset-0 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- approved pre-optimized poster (≈55 KB); explicit dimensions, lazy unless above the fold */}
          <img src={poster} alt="" width={1280} height={720} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className="absolute inset-0 size-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-brand-navy/55 via-transparent to-transparent" />
          <span className="relative flex flex-col items-center gap-3">
            <span className="flex size-16 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg shadow-blue-900/40 transition-transform group-hover:scale-105 sm:size-20"><Play className="ml-1 size-7 fill-white sm:size-8" aria-hidden /></span>
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white sm:text-sm">{startAt > 1 ? L.resumeAt(fmt(startAt)) : L.seconds(seconds)}</span>
          </span>
        </button>
      ) : (
        <>
          <video
            key={attempt} ref={vid} src={src} poster={poster} playsInline preload="auto" autoPlay muted={false} aria-label={title} className="absolute inset-0 size-full bg-black object-contain"
            onClick={toggle}
            onLoadedData={() => { loaded.current = true; }}
            onLoadedMetadata={(e) => { const v = e.currentTarget; if (Number.isFinite(v.duration)) setDur(v.duration); if (startAt > 0 && startAt < v.duration - 1) v.currentTime = startAt; }}
            onCanPlay={(e) => { if (!e.currentTarget.dataset.started) { e.currentTarget.dataset.started = "1"; void e.currentTarget.play().catch(() => setPlaying(false)); } }}
            onPlay={() => { setPlaying(true); setEnded(false); onPlayingChange?.(true); emit(tracker.current.onPlay()); }}
            onPause={() => { setPlaying(false); onPlayingChange?.(false); tracker.current.onPause(); }}
            onSeeking={() => tracker.current.onSeek()}
            onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setCur(t); emit(tracker.current.onTime(t)); onTime?.(t, !e.currentTarget.paused); }}
            onEnded={() => { setEnded(true); setPlaying(false); emit(tracker.current.onEnded()); }}
            onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVol(e.currentTarget.volume); }}
            onError={() => setError(true)}
          />
          {ended && !error && (
            <button type="button" onClick={() => { const v = vid.current; if (v) { v.currentTime = 0; void v.play(); } }} className="absolute inset-0 flex items-center justify-center bg-brand-navy/70 text-white">
              <span className="flex flex-col items-center gap-2"><RotateCcw className="size-10" aria-hidden /><span className="text-sm font-semibold">{L.replay}</span></span>
            </button>
          )}
          {error && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-brand-navy/90 p-6 text-center text-white">
              <p className="text-sm sm:text-base">{L.unavailable}</p>
              <button type="button" onClick={() => { setError(false); setAttempt((a) => a + 1); }} className="rounded-full bg-brand-blue px-5 py-2 text-sm font-semibold hover:bg-brand-blue-dark">{L.retry}</button>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1 pt-8 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <input type="range" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.min(Math.floor(cur), Math.floor(dur))} aria-label={L.seek} aria-valuetext={`${fmt(cur)} / ${fmt(dur)}`}
              onChange={(e) => { const v = vid.current; if (v) v.currentTime = Number(e.target.value); setCur(Number(e.target.value)); }} className="mx-2 h-2 w-[calc(100%-1rem)] cursor-pointer accent-[#2583ff]" />
            <div className="flex items-center gap-1 text-white">
              <button type="button" className={iconBtn} onClick={toggle} aria-label={playing ? L.pause : L.play}>{playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}</button>
              <button type="button" className={iconBtn} onClick={() => { const v = vid.current; if (v) v.muted = !v.muted; }} aria-label={muted || vol === 0 ? L.unmute : L.mute}>{muted || vol === 0 ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label={L.volume} onChange={(e) => { const v = vid.current; if (v) { v.volume = Number(e.target.value); v.muted = Number(e.target.value) === 0; } }} className="hidden w-20 cursor-pointer accent-[#2583ff] sm:block" />
              <span className="ml-1 text-xs tabular-nums" aria-hidden>{fmt(cur)} / {fmt(dur)}</span>
              <span className="flex-1" />
              <button type="button" className={iconBtn} onClick={() => void fullscreen()} aria-label={full ? L.exitFullscreen : L.fullscreen}>{full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
