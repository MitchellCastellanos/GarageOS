import type { Metadata } from "next";
import Link from "next/link";
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
              GarageOS is provided to help independent auto shops manage their operations, including appointments,
              customers and vehicles, estimates and approvals, work orders, inspections, invoicing, payments,
              communications, reminders and related shop-management workflows. By using GarageOS, your shop agrees
              to use it only for legitimate business purposes and to keep your account credentials secure.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Subscription plans and pricing</h2>
            <p>
              GarageOS is offered in subscription plans with different included features, usage allowances, support
              levels and organizational capabilities. Current public pricing is shown on our <Link href="/#pricing" className="font-semibold text-brand-blue hover:underline">pricing section</Link>. Unless stated otherwise, public prices are in Canadian dollars (CAD) and applicable taxes are additional.
            </p>
            <p className="mt-3">
              Monthly plans are billed monthly. Annual plans are billed upfront for the annual term at the price shown
              when you subscribe. Promotional or founding-customer pricing may be limited by time, eligibility,
              quantity or introductory period, and the regular renewal price will be disclosed with the offer.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Plan features and usage</h2>
            <p>
              Access to some GarageOS capabilities may depend on your subscription plan. Core business records such
              as customers, vehicles, estimates, work orders, invoices and inspections are not intended to be priced
              by transaction count. Services with direct usage costs — such as SMS, AI, storage or third-party
              services — may include plan allowances, fair-use limits or additional usage charges. Any applicable
              allowance or overage pricing will be disclosed before billing begins.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Locations, users and add-ons</h2>
            <p>
              Plans may include different numbers of users or shop locations. Multi-location functionality,
              additional locations, data migration, advanced integrations or other add-ons may carry separate fees
              as shown at the time of purchase. GarageOS will not charge a separate setup fee unless an optional paid
              onboarding, migration or custom service is clearly agreed to in advance.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Feature availability</h2>
            <p>
              GarageOS evolves over time. Features described as coming soon, in development, beta or otherwise not
              generally available are not guaranteed to be available on a specific date. We may improve, replace or
              retire functionality as the product changes, while aiming to preserve the overall value of the plan
              you purchased.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Your data</h2>
            <p>
              Your shop owns the client, vehicle, appointment, work and invoice data it enters into GarageOS. We only
              use it to provide the service to you, as described in our <Link href="/privacy" className="font-semibold text-brand-blue hover:underline">Privacy Policy</Link>.
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
            <p>Reach out through our <Link href="/contact" className="font-semibold text-brand-blue hover:underline">contact page</Link> for anything related to these terms.</p>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
