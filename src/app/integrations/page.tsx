import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Mail, MessageSquareText, CalendarDays, FolderOpen } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Integrations",
  description: "What GarageOS connects to today, and what's on the way.",
};

const INTEGRATIONS = [
  { icon: Mail, title: "Email delivery · Resend", status: "Requires configuration", description: "Send appointment messages, estimates and invoices using the configured email delivery service. Your administrator must configure the sender and delivery credentials before use." },
  { icon: MessageSquareText, title: "SMS · Twilio", status: "Requires configuration", description: "Send appointment notifications and invoice download links by text. A configured Twilio account and sender number are required; reminder delivery also depends on the scheduled reminder service." },
  { icon: FolderOpen, title: "Documents · Google Drive", status: "Requires configuration", description: "Upload accounting documents to the configured Drive folder. Access and destination folders must be set up by your administrator; this is not a personal Google account connection in the shop interface." },
  { icon: CreditCard, title: "Payment processing", status: "Not available in-app", description: "GarageOS records payments collected by your shop. It does not currently charge cards or connect invoices to a payment processor. Keep using your existing terminal or payment provider." },
  { icon: CalendarDays, title: "External calendar sync", status: "Not available", description: "Manage appointments in the GarageOS calendar. Synchronization with external calendars is not currently included." },
];

export default function IntegrationsPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Product"
        heading="Integrations"
        description="See which connections are implemented, what needs setup and where to keep using your existing tools."
      />

      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid sm:grid-cols-2 gap-6">
            {INTEGRATIONS.map(({ icon: Icon, title, status, description }) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-xs font-semibold text-brand-blue">{status}</p>
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
