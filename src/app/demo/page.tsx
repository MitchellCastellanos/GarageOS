import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Demo",
  description: "Follow a customer visit from booking through inspection, approval, repair, payment and the next reminder.",
};

const STEPS = [
  {
    chip: "Booked",
    title: "Book the visit",
    example: "A returning customer requests a seasonal tire change.",
    body: "Find the client and vehicle, choose the service and review the available time with the assigned mechanic. Online bookings use the shop's configured hours and availability.",
    href: "/guides/configure-online-booking",
    label: "See booking setup",
  },
  {
    chip: "Checked in",
    title: "Check in the vehicle",
    example: "The vehicle arrives and the front desk confirms the job.",
    body: "Open the client and vehicle record, confirm the requested service and note the mileage and the customer's concern before pricing the work.",
    href: "/guides/clients-and-vehicles",
    label: "See client records",
  },
  {
    chip: "Estimating",
    title: "Prepare the estimate",
    example: "The shop lists the proposed service and any required parts.",
    body: "Review quantities, prices and totals before sharing the estimate with the customer.",
    href: "/guides/estimate-to-invoice",
    label: "See the estimate workflow",
  },
  {
    chip: "Awaiting approval",
    title: "Capture the approval",
    example: "The customer reviews the estimate and responds.",
    body: "After the customer responds through the shop's normal process, record their decision. GarageOS keeps a traceable record of what was approved and when.",
    href: "/guides/estimate-to-invoice",
    label: "See approval recording",
  },
  {
    chip: "In progress",
    title: "Do the approved work",
    example: "The mechanic starts on the approved job.",
    body: "The shop works from the approved estimate. The front desk stays aligned on what's confirmed without needing to re-explain the scope.",
    href: "/features",
    label: "See how the workflow connects",
  },
  {
    chip: "Ready for pickup",
    title: "Update the customer",
    example: "The job is finished and the vehicle is ready.",
    body: "Let the customer know their vehicle is ready using a branded email or text, when delivery is configured for your shop.",
    href: "/integrations",
    label: "See delivery requirements",
  },
  {
    chip: "Invoiced",
    title: "Invoice and record payment",
    example: "The completed job is ready to be invoiced.",
    body: "Convert the estimate to a draft invoice, review it and share it with the customer. After collecting payment through the shop's usual process, record it against the invoice.",
    href: "/guides/estimate-to-invoice",
    label: "See payment recording",
  },
  {
    chip: "Reminder set",
    title: "Keep the relationship going",
    example: "The service done today has a natural next visit.",
    body: "Attach a maintenance reminder to the vehicle so the next service — and the next visit — doesn't get forgotten.",
    href: "/get-started",
    label: "See the full lifecycle",
  },
];

export default function DemoPage() {
  return (
    <MarketingPageShell>
      <div lang="en">
        <PageHero
          eyebrow="Product walkthrough"
          heading="One vehicle. The whole workflow."
          description="Follow a customer visit from booking through inspection, approval, repair, payment and the next reminder. This walkthrough uses sample situations and does not create shop records."
        />
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <ol className="space-y-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-slate-200 p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">
                    Step {index + 1} of {STEPS.length}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-semibold text-brand-blue">
                    <CheckCircle2 className="w-3 h-3" />
                    {step.chip}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">{step.title}</h2>
                <p className="mt-3 font-medium text-slate-700">{step.example}</p>
                <p className="mt-3 text-sm leading-7 text-slate-600">{step.body}</p>
                <Link href={step.href} className="mt-5 inline-block text-sm font-semibold text-brand-blue">
                  {step.label} →
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-2xl bg-slate-50 p-8">
            <h2 className="text-xl font-semibold text-slate-900">Explore your shop&apos;s workflow</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Contact us with the areas you would like to review, or sign in if your shop already has an account.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-lg bg-brand-blue px-5 py-3 text-sm font-semibold text-white">
                Contact us
              </Link>
              <Link href="/admin/login" className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingPageShell>
  );
}
