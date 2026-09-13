"use client";

import { Calendar, ClipboardCheck, FileCheck2, Wrench, Receipt, CalendarClock, Mail, MessageSquareText } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ICONS = [Calendar, ClipboardCheck, FileCheck2, Wrench, Receipt, CalendarClock];

export function WorkflowSection() {
  const { t, locale } = useMarketingLocale();
  const customerMessage = locale === "fr"
    ? {
        title: "Vos clients restent dans la boucle — sans nouvelle application à télécharger.",
        body: "Confirmations, estimations et approbations, mises à jour, factures et rappels arrivent directement par courriel ou SMS, selon la configuration du garage. Chaque communication garde le nom, l’identité et l’image de marque de votre atelier — GarageOS reste en arrière-plan.",
        email: "Courriel",
        sms: "SMS",
      }
    : {
        title: "Your customers stay in the loop — without another app to download.",
        body: "Confirmations, estimates and approvals, updates, invoices and reminders arrive directly by email or SMS, based on your shop’s setup. Every touchpoint keeps your shop name, identity and branding front and center — GarageOS stays behind the scenes.",
        email: "Email",
        sms: "SMS",
      };

  return (
    <section id="workflow" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
            {t.workflow.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            {t.workflow.heading}
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{t.workflow.description}</p>
        </div>

        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-4">
          {t.workflow.steps.map((step, i) => {
            const Icon = ICONS[i];
            return (
              <li key={step.title} className="relative flex gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-blue">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex gap-2 shrink-0">
            <span className="w-10 h-10 rounded-xl bg-white border border-blue-100 flex items-center justify-center">
              <Mail className="w-4.5 h-4.5 text-brand-blue" aria-label={customerMessage.email} />
            </span>
            <span className="w-10 h-10 rounded-xl bg-white border border-blue-100 flex items-center justify-center">
              <MessageSquareText className="w-4.5 h-4.5 text-brand-blue" aria-label={customerMessage.sms} />
            </span>
          </div>
          <div>
            <p className="font-semibold text-slate-900">{customerMessage.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{customerMessage.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
