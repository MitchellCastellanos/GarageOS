import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ADMIN } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Quick Start",
  description: "A practical setup checklist for running your first job end-to-end in GarageOS.",
};

const STEPS = [
  {
    title: "Set your shop identity",
    description: "Add your shop name, logo, contact details, timezone and language.",
    href: `${ADMIN.settings}?tab=general`,
    label: "Open shop settings",
  },
  {
    title: "Set your hours and online booking",
    description: "Configure opening hours, booking rules and which mechanics can receive appointments.",
    href: `${ADMIN.settings}?tab=calendar`,
    label: "Open booking settings",
  },
  {
    title: "Add your services",
    description: "List the services your shop offers so they're ready to use on appointments and estimates.",
    href: `${ADMIN.settings}?tab=services`,
    label: "Open service catalog",
  },
  {
    title: "Invite your team",
    description: "Add mechanics and front-desk staff with their own logins and access levels.",
    href: `${ADMIN.settings}?tab=team`,
    label: "Open team settings",
  },
  {
    title: "Add your first customer and vehicle",
    description: "Create a client record and attach their vehicle before booking a job for them.",
    href: ADMIN.clients,
    label: "Open clients",
  },
  {
    title: "Create your first appointment",
    description: "Schedule the visit from the front desk, or let the customer book it online.",
    href: ADMIN.appointments,
    label: "Open appointments",
  },
  {
    title: "Prepare an estimate and record approval",
    description: "Build a clear estimate for the client and vehicle, then record their decision when they respond.",
    href: ADMIN.quotes,
    label: "Open estimates",
  },
  {
    title: "Invoice and record payment",
    description: "Convert the approved estimate to a draft invoice, share it, then record the payment collected.",
    href: ADMIN.invoices,
    label: "Open invoices",
  },
  {
    title: "Set a maintenance reminder",
    description: "Attach a follow-up reminder to the vehicle so the next visit doesn't get forgotten.",
    href: ADMIN.reminders,
    label: "Open reminders",
  },
  {
    title: "Optional: set up inventory",
    description: "Track parts and stock movements as you use them on estimates and invoices.",
    href: ADMIN.inventory,
    label: "Open inventory",
  },
  {
    title: "Optional: configure communications and branding",
    description: "Set up mailboxes, your sending domain and communication routing.",
    href: `${ADMIN.settings}?tab=domain`,
    label: "Open communications",
  },
  {
    title: "Optional: add another location",
    description: "Operate multiple shop locations with shared team access.",
    href: `${ADMIN.settings}?tab=locations`,
    label: "Open locations",
  },
];

export default function QuickStartPage() {
  return (
    <MarketingPageShell>
      <div lang="en">
        <PageHero
          eyebrow="Resources"
          heading="Quick Start"
          description="Already have access to your shop? Follow this checklist to go from a fresh account to your first job, start to finish."
        />

        <section className="bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <ol className="space-y-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-slate-200 p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue text-sm font-semibold flex items-center justify-center">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">{step.title}</h2>
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{step.description}</p>
                      <Link
                        href={step.href}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark"
                      >
                        {step.label}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 rounded-2xl bg-slate-50 p-8">
              <h2 className="text-xl font-semibold text-slate-900">New to GarageOS?</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                This checklist assumes your shop already has an account. If you&apos;re deciding whether GarageOS is right
                for your shop, start with Get Started instead.
              </p>
              <Link href="/get-started" className="mt-5 inline-block text-sm font-semibold text-brand-blue">
                See Get Started →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingPageShell>
  );
}
