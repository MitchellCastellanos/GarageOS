"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { GarageOSLogo } from "@/components/marketing/GarageOSLogo";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { WATCH_COPY, type VideoCopyLang } from "@/lib/video-copy";
import { VIDEO_KINDS, watchPath, type VideoKind } from "@/domain/sales-video";

export interface WatchClientProps {
  lang: VideoCopyLang; kind: VideoKind;
  video: { title: string; url: string } | null;
  /** Present only for a valid, unexpired sales link (a stale or invalid token behaves exactly like no token). */
  token: string | null;
  startAt: number;
}

const btnPrimary = "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-blue px-6 py-3 text-base font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-brand-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";
const btnSecondary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/** The shareable video page: language by URL, the commercial front and centre, one clear demo CTA, and a short value summary. */
export function WatchClient({ lang, kind, video, token, startAt }: WatchClientProps) {
  const c = WATCH_COPY[lang];
  const router = useRouter();
  const time = useRef(0);
  const other: VideoCopyLang = lang === "en" ? "fr" : "en";

  // Keep the site language in step with the page language (the marketing pages read this same preference).
  useEffect(() => { try { window.localStorage.setItem("marketing-locale", lang); document.documentElement.lang = lang; } catch { /* ignore */ } }, [lang]);

  const q = (extra: Record<string, string>) => { const p = new URLSearchParams(); if (token) p.set("t", token); for (const [k, v] of Object.entries(extra)) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ""; };
  const cta = (which: "demo" | "trial") => (token ? `/api/video/cta?cta=${which}&t=${encodeURIComponent(token)}&lang=${lang}` : which === "demo" ? "/contact" : "/get-started");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="GarageOS">
            <GarageOSLogo className="h-7 w-auto" /><span className="text-lg">Garage<span className="text-brand-blue">OS</span></span>
          </Link>
          <button type="button" lang={other} onClick={() => router.push(`${watchPath(other.toUpperCase() as "EN" | "FR", kind)}${q(time.current > 2 ? { at: String(Math.floor(time.current)) } : {})}`)}
            className="min-h-11 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-slate-400" aria-label={`${c.switchTo}`}>{c.switchTo}</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{c.eyebrow(kind)}</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{c.heading}</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{c.sub}</p>
        </div>

        <div className="mx-auto mt-8 max-w-4xl sm:mt-10">
          {video ? (
            <VideoPlayer src={video.url} poster={`/video/thumb-${lang}.jpg`} title={video.title} lang={lang} seconds={VIDEO_KINDS[kind].seconds} token={token} reportPageView={!!token} startAt={startAt} priority onTime={(t) => { time.current = t; }} />
          ) : (
            <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
              <PlayCircle className="mx-auto size-10 text-brand-blue" aria-hidden />
              <h2 className="mt-3 text-xl font-semibold">{c.unavailableTitle}</h2>
              <p className="mt-2 text-slate-600">{c.unavailableBody}</p>
            </div>
          )}
          <p className="mt-2 text-center text-xs text-slate-500">{c.sample}</p>
        </div>

        <div className="mx-auto mt-8 flex max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <a href={cta("demo")} className={btnPrimary}>{c.ctaDemo}</a>
          <a href="/demo" className={btnSecondary}><PlayCircle className="size-5 text-brand-blue" aria-hidden />{c.ctaInteractive}</a>
        </div>
        <p className="mt-3 text-center text-sm text-slate-500">{c.noCardNote} <a href={cta("trial")} className="font-medium text-brand-blue hover:underline">{c.ctaTrial}</a> · {c.trialNote}</p>
        {kind === "teaser" && <p className="mt-4 text-center"><a href={`${watchPath(lang.toUpperCase() as "EN" | "FR", "commercial")}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-blue hover:underline">{c.fullVersion}</a></p>}

        <ul className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-2">
          {c.bullets.map((b) => (
            <li key={b} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-blue" aria-hidden />{b}</li>
          ))}
        </ul>

        {token && (
          <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-slate-500">{c.measuring} <a href="/privacy" className="underline">{c.privacy}</a>.</p>
        )}
      </main>
    </div>
  );
}
