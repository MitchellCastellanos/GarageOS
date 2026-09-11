import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How GarageOS collects, uses and protects your data.",
};

export default function PrivacyPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Company" heading="Privacy Policy" description="Last updated September 2026" />

      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Information we collect</h2>
            <p>
              When you use GarageOS, we collect the information your shop provides to run the product — account
              details, shop information, and the client, vehicle, appointment and invoice records your shop enters.
              We also collect basic technical information (such as browser and device data) to keep the service
              secure and reliable.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">How we use it</h2>
            <p>
              We use this information to provide and improve GarageOS, to communicate with you about your account,
              and to send the appointment confirmations, estimates, invoices and reminders your shop sends to its
              own customers.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Data separation between shops</h2>
            <p>
              Each shop&apos;s data is kept separate from every other shop using GarageOS. We do not share one
              shop&apos;s client or business data with another shop.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Third parties</h2>
            <p>
              We use third-party providers for things like email delivery, SMS and hosting, solely to operate
              GarageOS. We do not sell your data.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Your choices</h2>
            <p>
              You can request access to, correction of, or deletion of your account&apos;s data at any time by
              contacting us.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Changes to this policy</h2>
            <p>We may update this policy as GarageOS evolves. We&apos;ll post changes on this page.</p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Questions</h2>
            <p>Reach out through our <Link href="/contact" className="font-semibold text-brand-blue hover:underline">contact page</Link> for anything related to this policy.</p>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
