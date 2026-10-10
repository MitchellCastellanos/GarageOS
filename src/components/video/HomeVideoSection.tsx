"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { HOME_VIDEO_COPY } from "@/lib/video-copy";
import { VIDEO_KINDS, watchPath, type VideoKind } from "@/domain/sales-video";

export interface HomeVideo { kind: VideoKind; language: "EN" | "FR"; title: string; url: string }

/**
 * Marketing-site video block: follows the site language (EN/FR). Switching the language swaps in the matching video AT THE SAME
 * POSITION (the two cuts share one timeline), so a visitor does not lose their place. Nothing is hidden if a language has no
 * published video: the whole block is, rather than showing the other language.
 */
export function HomeVideoSection({ videos }: { videos: HomeVideo[] }) {
  const { locale } = useMarketingLocale();
  const c = HOME_VIDEO_COPY[locale];
  const lang = locale === "fr" ? "FR" : "EN";
  const [kind, setKind] = useState<VideoKind>("commercial");
  // Playback position kept (to the second) so a language switch resumes where the visitor was.
  const [resume, setResume] = useState({ t: 0, playing: false, kind: "commercial" as VideoKind });
  const video = videos.find((v) => v.kind === kind && v.language === lang);
  if (!video) return null;
  const carry = resume.kind === kind && resume.t > 1 ? resume : null;

  return (
    <section id="video" aria-labelledby="home-video-heading" className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">{c.eyebrow}</p>
          <h2 id="home-video-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{kind === "teaser" ? c.heading.replace(/60/, "15") : c.heading}</h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">{c.description}</p>
        </div>
        <div className="mt-8 sm:mt-10 max-w-4xl mx-auto">
          <VideoPlayer
            key={`${lang}-${kind}`} src={video.url} poster={`/video/thumb-${locale}.jpg`} title={video.title} lang={locale} seconds={VIDEO_KINDS[kind].seconds}
            startAt={carry?.t ?? 0} autoPlay={!!carry?.playing}
            onTime={(t) => setResume((r) => (r.kind === kind && Math.abs(r.t - t) < 1 ? r : { ...r, t: Math.floor(t), kind }))} onPlayingChange={(p) => setResume((r) => (r.playing === p && r.kind === kind ? r : { ...r, playing: p, kind }))}
          />
          <div className="mt-4 flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-center sm:gap-6">
            <button type="button" onClick={() => { const next = kind === "teaser" ? "commercial" : "teaser"; setResume({ t: 0, playing: false, kind: next }); setKind(next); }} className="min-h-11 font-medium text-brand-blue hover:text-brand-blue-dark hover:underline">
              {kind === "teaser" ? c.fullLink : c.teaserLink}
            </button>
            <Link href={watchPath(lang, kind)} className="min-h-11 inline-flex items-center text-slate-500 hover:text-slate-800 hover:underline">{c.shareLink}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
