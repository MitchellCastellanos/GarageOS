import type { Metadata } from "next";
import {
  Calendar,
  Users,
  Car,
  History,
  UserCog,
  ClipboardCheck,
  FileCheck2,
  ShieldCheck,
  Wrench,
  PackageSearch,
  MessageSquareText,
  CalendarClock,
  Megaphone,
  Palette,
  Receipt,
  CreditCard,
  FileText,
  Layers,
  Building2,
  Check,
} from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything GarageOS gives your shop — from booking and estimates to invoicing, communications and inventory.",
};

const GROUPS = [
  {
    title: "Schedule & customers",
    description: "Bring the job in and keep the customer and vehicle record straight from the start.",
    items: [
      { icon: Calendar, title: "Online booking", description: "A branded booking page where customers can request an appointment directly." },
      { icon: Calendar, title: "Front-desk appointments", description: "Schedule and manage appointments from the shop calendar." },
      { icon: Users, title: "Customer records", description: "Every client in one place, with contact details and communication preferences." },
      { icon: Car, title: "Vehicle records", description: "Vehicles linked to their owner, with the details your team needs." },
      { icon: History, title: "Vehicle & service history", description: "Appointments, estimates and invoices connected to the vehicle record." },
      { icon: UserCog, title: "Team assignment", description: "Assign mechanics to appointments and control what each role can access." },
    ],
  },
  {
    title: "Inspect & authorize",
    description: "Turn what the vehicle needs into a clear estimate and a documented customer decision.",
    items: [
      { icon: ClipboardCheck, title: "Vehicle condition notes", description: "Record mileage and the customer's concern while you scope the job." },
      { icon: FileCheck2, title: "Estimates", description: "Itemized estimates with services and parts, quantities and prices." },
      { icon: ShieldCheck, title: "Customer approval flow", description: "Send the estimate and record the customer's decision — accepted or rejected." },
      { icon: FileText, title: "Approval history", description: "Every approval keeps a traceable, time-stamped record of what was agreed to." },
    ],
  },
  {
    title: "Run the job",
    description: "Keep the front desk and the shop floor aligned on what's approved and what's next.",
    items: [
      { icon: Wrench, title: "Approved work tracking", description: "Approved estimates carry through to the job the shop actually does." },
      { icon: MessageSquareText, title: "Ready for pickup updates", description: "Let a customer know their vehicle is ready through a branded message." },
      { icon: PackageSearch, title: "Parts & labour lines", description: "Itemize services and parts on estimates and invoices." },
      { icon: PackageSearch, title: "Inventory", description: "Track stock levels and movement history for the parts you use." },
    ],
  },
  {
    title: "Communicate & retain",
    description: "Keep customers informed today, and bring them back for the next visit.",
    items: [
      { icon: MessageSquareText, title: "Email & SMS notifications", description: "Send appointment, estimate and invoice messages through configured delivery services." },
      { icon: CalendarClock, title: "Maintenance reminders", description: "Attach future service needs to the customer and vehicle so the next visit isn't forgotten." },
      { icon: Megaphone, title: "Campaigns", description: "Reach a group of customers with a shared message." },
      { icon: Palette, title: "Branded communications", description: "Emails, documents and your booking page all styled with your logo and colors." },
    ],
  },
  {
    title: "Invoice & manage",
    description: "Close out the job and see how the whole business is doing.",
    items: [
      { icon: Receipt, title: "Invoicing", description: "Professional invoices generated straight from the approved estimate." },
      { icon: CreditCard, title: "Payment recording", description: "Record card, cash and mixed payments collected by your shop." },
      { icon: FileText, title: "Receipts & documents", description: "Downloadable PDF documents for every invoice." },
      { icon: Layers, title: "Reports", description: "Revenue, jobs and top clients at a glance." },
      { icon: Building2, title: "Multi-location", description: "Operate multiple shop locations with shared access where configured." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Product"
        heading="Every tool your shop actually uses."
        description="From the first appointment to the next visit, GarageOS keeps your shop organized, professional and profitable."
      />

      {GROUPS.map((group) => (
        <section key={group.title} className="bg-white even:bg-slate-50/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{group.title}</h2>
            <p className="mt-2 text-slate-600 max-w-2xl leading-relaxed">{group.description}</p>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.items.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-slate-100 p-6 bg-white">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-brand-blue" />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          <div id="branding" className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
              Your brand. Your customers.
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
              Look professional. Stay in control.
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Appointment confirmations, estimates, invoices and status updates all go out under your own logo,
              colors and contact information. GarageOS works behind the scenes — your customers see your shop.
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
