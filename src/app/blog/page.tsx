import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ResourceCards } from "@/components/marketing/ResourceArticles";
import { BLOG_POSTS } from "@/lib/marketing-resources";

export const metadata: Metadata = { title: "Blog", description: "Practical ideas for appointments, customer communication and vehicle records at independent shops." };
export default function BlogPage() {
  return <MarketingPageShell><div lang="en">
    <PageHero eyebrow="Resources" heading="Ideas for a better shop day" description="Practical reading for the people running independent garages. From the morning schedule to the final invoice." />
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><ResourceCards articles={BLOG_POSTS} basePath="/blog" /></section>
  </div></MarketingPageShell>;
}
