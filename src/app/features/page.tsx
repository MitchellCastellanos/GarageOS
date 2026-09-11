import type { Metadata } from "next";
import {
  Calendar,
  ClipboardList,
  Receipt,
  MessageCircle,
  Wrench,
  PackageSearch,
  Layers,
  Palette,
  Check,
} from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything GarageOS gives your shop — appointments, work orders, invoicing, branding and more.",
};

const FEATURES = [
  {
    icon: Calendar,
    title: "Appointments & scheduling",
    description: "Online and in-person booking, with a calendar your whole team can work from.",
  },
  {
    icon: ClipboardList,
    title: "Work orders & estimates",
    description: "Prepare estimates, record customer decisions and convert estimates into draft invoices.",
  },
  {
    icon: Receipt,
    title: "Invoicing & payments",
    description: "Professional invoices and records of card, cash and mixed payments collected by your shop.",
  },
  {
    icon: MessageCircle,
    title: "Customer communication",
    description: "Send appointment messages, estimates and invoices through configured email and SMS services.",
  },
  {
    icon: Wrench,
    title: "Vehicle history & records",
    description: "Every client and vehicle, with full service history in one place.",
  },
  {
    icon: PackageSearch,
    title: "Service & parts lines",
    description: "Itemize services and parts on estimates and invoices, with quantities and prices.",
  },
  {
    icon: Layers,
    title: "Reports & insights",
    description: "See how your shop is doing at a glance — revenue, jobs and top clients.",
  },
  {
    icon: Palette,
    title: "Your brand everywhere",
    description: "Emails, documents and your booking page — all styled with your logo and colors.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Product"
        heading="Every tool your shop actually uses."
        description="From the first appointment to the final invoice, GarageOS keeps your shop organized, professional and profitable."
      />

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>

          <div id="branding" className="mt-20 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
              Your brand. Your customers.
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
              Look professional. Stay in control.
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Appointment confirmations, estimates, invoices and follow-ups all go out under your own logo, colors
              and contact information. GarageOS works behind the scenes — your customers see your shop.
            </p>
            <ul className="mt-6 space-y-2.5">
              {["Branded emails and documents", "A booking page styled for your shop", "No GarageOS logo in front of your customers"].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingPageShell>
  );
}
