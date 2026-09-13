import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Palette, Users, LayoutDashboard, ArrowRight } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { ADMIN } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Get Started",
  description: "Here's exactly what happens once you sign up for GarageOS.",
};

const STEPS = [
  {
    icon: UserPlus,
    title: "Create your account",
    time: "Under a minute",
    description:
      "Tell us your shop name, your name and an email — or continue with Google. No credit card required to get started.",
  },
  {
    icon: Palette,
    title: "Set up your shop",
    time: "A few minutes",
    description:
      "Add your logo, services and hours. Your booking page and every quote, invoice and email are branded with your shop's identity from the start.",
  },
  {
    icon: Users,
    title: "Invite your team",
    time: "Optional, anytime",
    description:
      "Bring in mechanics and front-desk staff with their own logins and access levels. You stay in control of what each person can see and do.",
  },
  {
    icon: LayoutDashboard,
    title: "Run your shop from one dashboard",
    time: "From day one",
    description:
      "Your booking page goes live right away. Manage appointments, quotes, invoices, customer messages and reminders — all in one place.",
  },
];

export default function GetStartedPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Get Started"
        heading="From sign-up to your first appointment in minutes."
        description="Here's exactly what happens once you create your GarageOS account — no surprises."
      />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <ol className="space-y-10">
            {STEPS.map(({ icon: Icon, title, time, description }, index) => (
              <li key={title} className="flex gap-5">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-11 h-11 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-brand-blue" />
                  </div>
                  {index < STEPS.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-2" />}
                </div>
                <div className="pb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand-blue mb-1">
                    Step {index + 1} · {time}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                  <p className="mt-1.5 text-slate-600 leading-relaxed text-sm">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Ready to see it in your shop?</h2>
          <p className="mt-3 text-slate-600">Create your account now — it takes less time than your next oil change.</p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={ADMIN.signup}
              className="inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-7 py-3.5 rounded-xl transition-colors shadow-md shadow-blue-600/20"
            >
              Create your account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={ADMIN.login}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
