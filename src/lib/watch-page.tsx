import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppUrl } from "@/config/app";
import { WatchClient } from "@/components/video/WatchClient";
import { getWatchVideo, resolveVideoLink } from "@/lib/sales-video";
import { WATCH_COPY } from "@/lib/video-copy";
import { VIDEO_KINDS, watchPath, type VideoKind } from "@/domain/sales-video";

type Params = Promise<{ lang: string }>;
type Search = Promise<{ t?: string | string[]; at?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const parseLang = (l: string) => (l === "en" || l === "fr" ? l : null);

export async function watchMetadata({ params, searchParams }: { params: Params; searchParams: Search }, kind: VideoKind): Promise<Metadata> {
  const lang = parseLang((await params).lang);
  if (!lang) return {};
  const c = WATCH_COPY[lang];
  const token = first((await searchParams).t);
  const app = getAppUrl();
  const path = (l: "en" | "fr") => `${app}${watchPath(l === "fr" ? "FR" : "EN", kind)}`;
  const image = `${app}/video/thumb-${lang}.jpg`;
  return {
    title: c.metaTitle(kind), description: c.metaDescription,
    alternates: { canonical: path(lang), languages: { en: path("en"), fr: path("fr") } },
    // An attributed (tokenised) URL must never be indexed or shared by search engines; the clean URL is the public one.
    robots: token ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type: "website", url: path(lang), title: c.metaTitle(kind), description: c.metaDescription, locale: lang === "fr" ? "fr_CA" : "en_CA", images: [{ url: image, width: 1280, height: 720, alt: c.metaTitle(kind) }] },
    twitter: { card: "summary_large_image", title: c.metaTitle(kind), description: c.metaDescription, images: [image] },
  };
}

export async function WatchPage({ params, searchParams }: { params: Params; searchParams: Search }, kind: VideoKind) {
  const lang = parseLang((await params).lang);
  if (!lang) notFound();
  const sp = await searchParams;
  // The token is only handed to the browser when it is a real, current link. Resolving it here records nothing: a mail scanner
  // that fetches this page is not a viewer; only the browser-side beacon (after hydration, tab visible) reports a page view.
  const link = await resolveVideoLink(first(sp.t)).catch(() => null);
  const video = await getWatchVideo(kind, lang === "fr" ? "FR" : "EN");
  const at = Math.max(0, Math.min(Number.parseInt(first(sp.at) ?? "0", 10) || 0, VIDEO_KINDS[kind].seconds - 2));
  const c = WATCH_COPY[lang];
  const ld = !link && video ? {
    "@context": "https://schema.org", "@type": "VideoObject", name: c.metaTitle(kind), description: c.metaDescription, inLanguage: lang === "fr" ? "fr-CA" : "en-CA",
    thumbnailUrl: [`${getAppUrl()}/video/thumb-${lang}.jpg`], uploadDate: "2026-10-09", duration: `PT${VIDEO_KINDS[kind].seconds}S`, contentUrl: video.url,
  } : null;
  return (
    <>
      <WatchClient lang={lang} kind={kind} video={video ? { title: video.title, url: video.url } : null} token={link?.token ?? null} startAt={at} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
    </>
  );
}
