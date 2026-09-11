import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Answers to common questions about GarageOS.",
};

const FAQS = [
  {
    q: "What is GarageOS?",
    a: "GarageOS is management software for independent auto shops — appointments, work orders, estimates, invoicing and customer communication, all in one place.",
  },
  {
    q: "How do I get started?",
    a: "Your shop owner or manager sets up your account and invites your team. From there you can log in and start managing appointments, clients and invoices.",
  },
  {
    q: "Can customers book appointments online?",
    a: "Yes — each shop gets its own branded booking page where customers can request an appointment directly.",
  },
  {
    q: "Is my shop's data separated from other shops?",
    a: "Yes. Each shop's clients, vehicles, appointments and invoices are scoped to that shop only.",
  },
  {
    q: "Who do I contact if I run into a problem?",
    a: "Reach out through the contact page and we'll get back to you.",
  },
];

export default function HelpPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Resources"
        heading="Help Center"
        description="Common questions from shop owners and their teams."
      />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="divide-y divide-slate-100">
            {FAQS.map((item) => (
              <div key={item.q} className="py-6">
                <h2 className="font-semibold text-slate-900">{item.q}</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-slate-600">
            Didn&apos;t find what you were looking for?{" "}
            <Link href="/contact" className="text-brand-blue font-semibold hover:text-brand-blue-dark">
              Contact us
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
