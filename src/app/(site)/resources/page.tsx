import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { HelpCategoryGrid } from "@/components/help/HelpViews";
import { FEATURE_PAGES, featurePath } from "@/lib/feature-pages";
import { BLOG_POSTS } from "@/lib/marketing-resources";
import { getWebsiteVideos } from "@/lib/sales-video";
import { pageMetadata } from "@/lib/seo/metadata";

// Same cache window as the home page (the published video list changes rarely).
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  path: "/resources",
  title: "Resources",
  description: "Help Center, quick start, feature guides, videos, the blog and the changelog: everything to set up and run your shop with GarageOS.",
});

const CARD = "block rounded-2xl border border-slate-200 p-5 transition-colors hover:border-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue";

/**
 * Hub de Resources (solo inglés por ahora: no hay contenido francés suficiente para un equivalente; ver el backlog).
 * Solo enlaza a lo que existe; los videos aparecen únicamente si hay videos publicados (sin placeholders).
 */
export default async function ResourcesPage() {
  const videos = await getWebsiteVideos().catch(() => []);
  const watch = (kind: string, language: string) => videos.some((v) => v.kind === kind && v.language === language);
  const videoLinks = [
    watch("commercial", "en") && { href: "/watch/en", label: "Product video (English)", note: "A short overview of the shop workflow." },
    watch("teaser", "en") && { href: "/watch/en/teaser", label: "15-second preview (English)", note: "The quick version." },
    watch("commercial", "fr") && { href: "/watch/fr", label: "Vidéo du produit (français)", note: "Aperçu du flux de travail de l'atelier." },
    watch("teaser", "fr") && { href: "/watch/fr/teaser", label: "Aperçu de 15 secondes (français)", note: "La version courte." },
  ].filter(Boolean) as { href: string; label: string; note: string }[];

  return (
    <MarketingPageShell>
      <div lang="en">
        <PageHero eyebrow="Resources" heading="Everything to set up and run your shop" description="Start with the Quick Start checklist, look things up in the Help Center, or explore the features in depth." />
        <div className="mx-auto max-w-5xl space-y-16 px-4 py-16 sm:px-6">
          <section aria-labelledby="res-help">
            <h2 id="res-help" className="text-2xl font-bold text-slate-900">Help Center</h2>
            <p className="mt-2 text-sm text-slate-600">Step-by-step articles with search. <Link href="/help" className="font-semibold text-brand-blue hover:underline">Open the Help Center →</Link></p>
            <div className="mt-6"><HelpCategoryGrid locale="en" showHeading={false} /></div>
          </section>

          <section aria-labelledby="res-start">
            <h2 id="res-start" className="text-2xl font-bold text-slate-900">Get started</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              <li><Link href="/quick-start" className={CARD}><span className="font-semibold text-slate-900">Quick Start checklist</span><span className="mt-1 block text-sm text-slate-600">A practical checklist for running your first job end to end.</span></Link></li>
              <li><Link href="/demo" className={CARD}><span className="font-semibold text-slate-900">Interactive demo</span><span className="mt-1 block text-sm text-slate-600">Follow a sample shop from booking to the next visit.</span></Link></li>
            </ul>
          </section>

          <section aria-labelledby="res-features">
            <h2 id="res-features" className="text-2xl font-bold text-slate-900">Features in depth</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {FEATURE_PAGES.map((page) => (
                <li key={page.id}><Link href={featurePath("en", page)} className={CARD}><span className="font-semibold text-slate-900">{page.hero.en.h1}</span><span className="mt-1 block text-sm text-slate-600">{page.hero.en.intro}</span></Link></li>
              ))}
            </ul>
          </section>

          {videoLinks.length > 0 && (
            <section aria-labelledby="res-video">
              <h2 id="res-video" className="text-2xl font-bold text-slate-900">Videos</h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {videoLinks.map((v) => (
                  <li key={v.href}><Link href={v.href} className={CARD}><span className="font-semibold text-slate-900">{v.label}</span><span className="mt-1 block text-sm text-slate-600">{v.note}</span></Link></li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="res-blog">
            <h2 id="res-blog" className="text-2xl font-bold text-slate-900">From the blog</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {BLOG_POSTS.map((post) => (
                <li key={post.slug}><Link href={`/blog/${post.slug}`} className={CARD}><span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{post.category}</span><span className="mt-1 block font-semibold text-slate-900">{post.title}</span><span className="mt-1 block text-sm text-slate-600">{post.summary}</span></Link></li>
              ))}
            </ul>
            <p className="mt-4 text-sm"><Link href="/blog" className="font-semibold text-brand-blue hover:underline">All blog posts →</Link></p>
          </section>

          <section aria-labelledby="res-news">
            <h2 id="res-news" className="text-2xl font-bold text-slate-900">What&apos;s new</h2>
            <p className="mt-2 text-sm text-slate-600"><Link href="/changelog" className="font-semibold text-brand-blue hover:underline">Read the changelog →</Link></p>
          </section>
        </div>
      </div>
    </MarketingPageShell>
  );
}
