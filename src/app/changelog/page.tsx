import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
export const metadata: Metadata = { title: "Changelog", description: "A summary of the workflows and public resources implemented in GarageOS." };
const ENTRIES = [
  { tag: "Public site", title: "A clearer picture of the full workflow", items: ["A Product page explaining how booking, approval, work, payment and reminders connect.", "A Quick Start checklist for setting up a shop that already has access.", "Grouped guides and help topics across estimates, communications, inventory and locations.", "Removed unsupported claims and placeholder testimonials from the homepage."], href: "/product", label: "See the Product page" },
  { tag: "Resources", title: "Practical documentation for your shop", items: ["Blog articles about daily scheduling, estimates and vehicle history.", "Step-by-step guides for shop setup, booking, client records, invoicing, reminders and inventory.", "Help Center troubleshooting for availability, permissions and message delivery.", "A sample product walkthrough and integration availability details."], href: "/guides", label: "Read the guides" },
  { tag: "Product overview", title: "Core shop workflows", items: ["Shop appointments and a branded public booking page.", "Client and vehicle records linked to estimates and invoices.", "Estimate decisions and conversion to draft invoices.", "PDF documents and records of payments collected by the shop.", "Shop branding, team access and booking configuration."], href: "/features", label: "Explore features" },
  { tag: "Connections", title: "Delivery and document services", items: ["Email delivery through Resend when configured.", "Appointment and invoice messages through Twilio when configured.", "Accounting document uploads to a configured Google Drive destination."], href: "/integrations", label: "Review integration requirements" },
];
export default function ChangelogPage() {
  return <MarketingPageShell><div lang="en">
    <PageHero eyebrow="Product" heading="What's in GarageOS" description="An overview of the current product and documentation. Connection availability depends on your installation's configuration." />
    <section className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6">{ENTRIES.map((entry) => <article key={entry.title} className="border-l-2 border-brand-blue pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{entry.tag}</p>
      <h2 className="mt-3 text-xl font-bold text-slate-900">{entry.title}</h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-600">{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
      <Link href={entry.href} className="mt-5 inline-block text-sm font-semibold text-brand-blue">{entry.label} →</Link>
    </article>)}</section>
  </div></MarketingPageShell>;
}
