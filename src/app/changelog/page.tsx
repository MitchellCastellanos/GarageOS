import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
export const metadata: Metadata = { title: "Changelog", description: "A summary of the workflows and public resources implemented in GarageOS." };
const ENTRIES = [
  { tag: "Product", title: "The complete shop workflow", items: ["Online booking and front-desk appointments, customers and vehicles with full service history.", "Digital inspections (photos, templates and shareable reports on Pro), estimates with a customer approval trail, and Work Orders with job status and Ready for Pickup.", "Inventory that follows Work Orders and tire storage (Pro), invoices with GST/QST kept per invoice, payments and refunds.", "A customer portal on every plan."], href: "/product", label: "See the Product page" },
  { tag: "Growth & control", title: "Reports, books and reminders", items: ["Overview reports on every plan; advanced reports with CSV export, Accounting Light and QuickBooks Online sync on Pro and Complete.", "Automated maintenance reminders and campaigns, branded email and two-way SMS.", "Roles and permissions, and data import from CSV or Excel."], href: "/features", label: "Explore features" },
  { tag: "Multi-Shop", title: "Several locations, one organization", items: ["Add locations, switch between them and manage who can access each one.", "Consolidated reports and a side-by-side location comparison on the Complete plan."], href: "/pricing", label: "Compare plans" },
  { tag: "Getting started", title: "A 14-day free trial", items: ["Choose your plan during setup and add a payment method — $0 today, with the exact first charge date and amount shown.", "Guides and a Quick Start checklist for setting up your shop."], href: "/get-started", label: "See how to start" },
];
export default function ChangelogPage() {
  return <MarketingPageShell><div lang="en">
    <PageHero eyebrow="Product" heading="What's in GarageOS" description="An overview of what GarageOS does today." />
    <section className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6">{ENTRIES.map((entry) => <article key={entry.title} className="border-l-2 border-brand-blue pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{entry.tag}</p>
      <h2 className="mt-3 text-xl font-bold text-slate-900">{entry.title}</h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-600">{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
      <Link href={entry.href} className="mt-5 inline-block text-sm font-semibold text-brand-blue">{entry.label} →</Link>
    </article>)}</section>
  </div></MarketingPageShell>;
}
