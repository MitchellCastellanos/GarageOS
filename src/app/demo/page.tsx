import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = { title: "Demo", description: "Follow a sample shop visit from booking to a recorded payment in GarageOS." };
const STEPS = [
  { title: "Prepare the appointment", example: "A returning customer requests a seasonal tire change.", body: "Find the client and vehicle, choose the service and review the available time with the assigned mechanic. Online bookings use the shop's configured hours and availability.", href: "/guides/configure-online-booking", label: "See booking setup" },
  { title: "Check the client and vehicle", example: "The customer has two vehicles. The team checks which one is coming in.", body: "Open the client record, confirm the vehicle and update contact details if needed. Keep the appointment and later documents connected to that record.", href: "/guides/clients-and-vehicles", label: "See client records" },
  { title: "Prepare the estimate", example: "The shop lists the proposed service and any required parts.", body: "Review quantities, prices and totals before sharing the estimate. After the customer responds through the shop's normal process, record their decision.", href: "/guides/estimate-to-invoice", label: "See the estimate workflow" },
  { title: "Invoice and record payment", example: "The completed job is ready to be invoiced.", body: "Convert the estimate to a draft invoice and review it. Share the document using a configured delivery channel. After collecting payment through the shop's usual process, record the payment against the invoice.", href: "/guides/estimate-to-invoice#section-4", label: "See payment recording" },
];
export default function DemoPage() {
  return <MarketingPageShell><div lang="en">
    <PageHero eyebrow="Product walkthrough" heading="One visit, from booking to invoice" description="Follow an illustrative shop visit through the existing GarageOS workflows. This walkthrough uses sample situations and does not create shop records." />
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <ol className="space-y-6">{STEPS.map((step, index) => <li key={step.title} className="rounded-2xl border border-slate-200 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Step {index + 1} of {STEPS.length}</p>
        <h2 className="mt-3 text-xl font-semibold text-slate-900">{step.title}</h2>
        <p className="mt-3 font-medium text-slate-700">{step.example}</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">{step.body}</p>
        <Link href={step.href} className="mt-5 inline-block text-sm font-semibold text-brand-blue">{step.label} →</Link>
      </li>)}</ol>
      <div className="mt-10 rounded-2xl bg-slate-50 p-8">
        <h2 className="text-xl font-semibold text-slate-900">Explore your shop&apos;s workflow</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Contact us with the areas you would like to review, or sign in if your shop already has an account.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link href="/contact" className="rounded-lg bg-brand-blue px-5 py-3 text-sm font-semibold text-white">Contact us</Link><Link href="/admin/login" className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">Sign in</Link></div>
      </div>
    </section>
  </div></MarketingPageShell>;
}
