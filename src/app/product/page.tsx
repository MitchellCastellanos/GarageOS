import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  ClipboardCheck,
  FileCheck2,
  Wrench,
  Receipt,
  CalendarClock,
  Smartphone,
  PackageSearch,
  Layers,
  Building2,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";

export const metadata: Metadata = {
  title: "Product",
  description:
    "GarageOS connects the customer, vehicle, estimate, approval, work and payment in one workflow — from booking to the next visit.",
};

const WORKFLOW = [
  {
    icon: Calendar,
    title: "Book",
    description:
      "Customers request an appointment on your branded booking page, or your front desk schedules it directly. The customer, vehicle and service are captured from the start.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspect",
    description:
      "Note the vehicle's condition, mileage and the customer's concern while you scope the job — the starting point for a clear estimate.",
  },
  {
    icon: FileCheck2,
    title: "Approve",
    description:
      "Send a clear, itemized estimate and record the customer's decision. Every approval keeps a traceable record of what was agreed to and when.",
  },
  {
    icon: Wrench,
    title: "Repair",
    description:
      "Approved work moves forward in the shop. The front desk stays aligned on what's confirmed without needing the whole team in the software all day.",
  },
  {
    icon: Receipt,
    title: "Pay",
    description:
      "Convert the approved work into an invoice, share it with the customer and record the payment your shop collected.",
  },
  {
    icon: CalendarClock,
    title: "Return",
    description:
      "Set a maintenance reminder tied to the vehicle so the next service doesn't get forgotten — and the customer comes back.",
  },
];

const CUSTOMER_EXPERIENCE = [
  {
    icon: Calendar,
    title: "Branded booking",
    description: "Customers book on a page styled with your shop's logo, colors and contact information.",
  },
  {
    icon: FileCheck2,
    title: "Estimates & approvals",
    description: "Customers see a clear, itemized estimate and their decision is captured and kept on record.",
  },
  {
    icon: MessageCircle,
    title: "Status updates",
    description: "Keep customers informed by email or text, including when their vehicle is ready for pickup.",
  },
  {
    icon: Receipt,
    title: "Invoices & documents",
    description: "Professional, branded invoices and receipts — your shop's identity front and center.",
  },
];

const MANAGEMENT = [
  { icon: PackageSearch, title: "Inventory", description: "Track stock and parts movement history." },
  { icon: Layers, title: "Reports", description: "See shop activity and revenue without rebuilding it in spreadsheets." },
  { icon: Building2, title: "Multi-location", description: "Operate multiple shop locations with shared access where configured." },
  { icon: MessageCircle, title: "Communications", description: "Manage customer messaging and keep your brand consistent." },
];

export default function ProductPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Product"
        heading="One system from booking to the next visit."
        description="GarageOS connects the customer, vehicle, estimate, approval, work and payment in one workflow."
      />

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">The main workflow</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">
            Every job follows the same connected path — so nothing gets lost between the front desk, the shop floor and the customer.
          </p>

          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WORKFLOW.map(({ icon: Icon, title, description }, i) => (
              <li key={title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-brand-blue" />
                  </div>
                  <p className="text-xs font-semibold text-brand-blue">
                    Step {i + 1} · {title}
                  </p>
                </div>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">The customer-facing experience</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">
            Customers experience your shop, not GarageOS. Every touchpoint carries your brand.
          </p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CUSTOMER_EXPERIENCE.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
                Front-desk-first
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                Built to run from the front desk.
              </h2>
              <p className="mt-4 text-slate-600 leading-relaxed">
                GarageOS is designed around the owner and front desk running the day-to-day — scheduling, estimates,
                approvals, invoicing and customer updates — without requiring every mechanic to operate complex
                software on the shop floor.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Simple where it needs to be</p>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Give each team member the access their role requires — front desk and owners get the full workflow,
                  technicians get what&apos;s relevant to the job in front of them.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">The management layer</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">
            Around the job, GarageOS gives owners visibility into the whole business.
          </p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {MANAGEMENT.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white border border-slate-100 rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
              See all features <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/demo" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
              Walk through a sample visit <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <CTASection />
    </MarketingPageShell>
  );
}
