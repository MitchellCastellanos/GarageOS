import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Mail, MessageSquareText, CalendarDays } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Integrations",
  description: "What GarageOS connects to today, and what's on the way.",
};

const PLANNED = [
  { icon: CreditCard, title: "Payment processors", description: "Accept card payments directly on invoices." },
  { icon: Mail, title: "Email delivery", description: "Confirmations, estimates and invoices, sent automatically." },
  { icon: MessageSquareText, title: "SMS reminders", description: "Appointment reminders sent by text." },
  { icon: CalendarDays, title: "Calendar sync", description: "Keep your shop's schedule in sync with your team's calendars." },
];

export default function IntegrationsPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Product"
        heading="Integrations"
        description="GarageOS is built to connect with the tools your shop already relies on. Here's what's in progress."
      />

      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid sm:grid-cols-2 gap-6">
            {PLANNED.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-slate-600 leading-relaxed">
            Looking for a specific integration for your shop?{" "}
            <Link href="/contact" className="text-brand-blue font-semibold hover:text-brand-blue-dark">
              Let us know
            </Link>{" "}
            — it helps us prioritize what we build next.
          </p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
