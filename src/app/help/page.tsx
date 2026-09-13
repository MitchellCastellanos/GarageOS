import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { GroupedResourceCards } from "@/components/marketing/ResourceArticles";
import { GUIDES } from "@/lib/marketing-resources";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Answers to common questions about GarageOS.",
};

const FAQS = [
  {
    q: "What is GarageOS?",
    a: "GarageOS is management software for independent auto shops — appointments, estimates, approvals, invoicing, reminders and customer communication, all in one place.",
  },
  {
    q: "How do I get started?",
    a: "Your shop owner or manager sets up your account and invites your team. From there you can log in and start managing appointments, clients and invoices. If your shop already has an account, the Quick Start checklist walks through setting it up.",
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
    q: "Why are there no times available on the booking page?",
    a: "Check that online booking is enabled, the shop is open that day and at least one mechanic is available for bookings. The service must fit within working hours and around existing appointments. Minimum advance notice and the booking window also limit the times customers can choose.",
  },
  {
    q: "Does recording a card payment charge the customer's card?",
    a: "No. Payment records track money received through your shop's payment process. Collect payment through your usual terminal or provider, then record the method and amounts on the invoice.",
  },
  {
    q: "Can I turn an estimate into an invoice?",
    a: "Yes. Open the estimate and use its conversion action, then review the resulting draft invoice before sending it. Record the customer's decision separately; sending an estimate does not mean it has been accepted.",
  },
  {
    q: "Why did an email or text message not arrive?",
    a: "Check the recipient details and the result of the send action. Email and SMS require delivery services to be configured for the installation. For email, also ask the recipient to check spam. If sending fails, keep the document and ask your administrator to check delivery configuration before retrying.",
  },
  {
    q: "Why is a setting or action missing from my account?",
    a: "Access depends on your role and shop assignment. Ask the shop administrator to review them. Each team member should use their own account rather than sharing another person's credentials.",
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
        description="Find a setup guide, solve a booking issue or get help with estimates and invoices."
      />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="mb-6 text-2xl font-bold text-slate-900">Start with a guide</h2>
          <p className="mb-6 text-sm text-slate-600">
            New to your shop&apos;s account?{" "}
            <Link href="/quick-start" className="text-brand-blue font-semibold hover:text-brand-blue-dark">
              Follow the Quick Start checklist
            </Link>
            .
          </p>
          <GroupedResourceCards articles={GUIDES} basePath="/guides" />
          <h2 className="mb-3 mt-16 text-2xl font-bold text-slate-900">Common questions</h2>
          <div className="divide-y divide-slate-100">
            {FAQS.map((item) => (
              <details key={item.q} className="py-6">
                <summary className="cursor-pointer font-semibold text-slate-900">{item.q}</summary>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
              </details>
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
