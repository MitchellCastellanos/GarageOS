import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of GarageOS.",
};

export default function TermsPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Company" heading="Terms of Service" description="Last updated September 2026" />

      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Using GarageOS</h2>
            <p>
              GarageOS is provided to help independent auto shops manage appointments, work orders, invoicing and
              customer communication. By using GarageOS, your shop agrees to use it only for legitimate business
              purposes and to keep your account credentials secure.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Your data</h2>
            <p>
              Your shop owns the client, vehicle, appointment and invoice data it enters into GarageOS. We only use
              it to provide the service to you, as described in our Privacy Policy.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Accounts</h2>
            <p>
              Shop owners are responsible for the team members they invite and the access levels they grant. You&apos;re
              responsible for activity that happens under your account.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Availability</h2>
            <p>
              We work to keep GarageOS available and reliable, but the service is provided on an &quot;as is&quot;
              basis without guarantee of uninterrupted availability.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Changes to these terms</h2>
            <p>We may update these terms as GarageOS evolves. We&apos;ll post changes on this page.</p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Questions</h2>
            <p>Reach out through our contact page for anything related to these terms.</p>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
