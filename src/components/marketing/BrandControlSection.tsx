"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Mail, MessageSquareText } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";

export function BrandControlSection() {
  const { t, locale } = useMarketingLocale();
  const { phone, invoice } = t.brandControl;
  const copy = locale === "fr"
    ? {
        eyebrow: "Votre atelier. Votre marque.",
        heading: "Vos clients voient votre atelier, pas notre logiciel.",
        description: "GarageOS donne à votre atelier une présence client cohérente : une page publique de réservation à votre image, puis des confirmations, estimations, approbations, mises à jour, factures et rappels envoyés directement par courriel ou SMS. Aucun portail compliqué ni application à faire télécharger à vos clients.",
        domain: "Commencez avec votre page GarageOS et utilisez votre propre domaine et identité d’envoi lorsque votre configuration le permet.",
        booking: "Réserver un rendez-vous",
        available: "Prochaine disponibilité",
        noApp: "Aucune application client requise",
        direct: "Courriel + SMS",
      }
    : {
        eyebrow: "Your shop. Your brand.",
        heading: "Your customers see your shop, not our software.",
        description: "GarageOS gives your shop one consistent customer-facing presence: a branded public booking page, then confirmations, estimates, approvals, updates, invoices and reminders delivered directly by email or SMS. No complicated portal and no customer app to download.",
        domain: "Start with your GarageOS page, then use your own domain and sending identity when your shop’s configuration supports it.",
        booking: "Book an appointment",
        available: "Next availability",
        noApp: "No customer app required",
        direct: "Email + SMS",
      };

  return (
    <section className="bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">{copy.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">{copy.heading}</h2>
            <p className="mt-4 text-slate-600 leading-relaxed max-w-lg">{copy.description}</p>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-lg">{copy.domain}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"><Mail className="w-3.5 h-3.5 text-brand-blue" />{copy.direct}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"><MessageSquareText className="w-3.5 h-3.5 text-brand-blue" />{copy.noApp}</span>
            </div>
            <Link href="/features#branding" className="mt-8 inline-flex items-center gap-1.5 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-md shadow-blue-600/20">
              {t.brandControl.cta}<ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative py-6">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden max-w-md mx-auto lg:mr-0">
              <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 px-3">
                <span className="w-2 h-2 rounded-full bg-slate-300" /><span className="w-2 h-2 rounded-full bg-slate-300" /><span className="w-2 h-2 rounded-full bg-slate-300" />
                <div className="ml-2 flex-1 rounded bg-white border border-slate-200 px-2 py-0.5 text-[8px] text-slate-400">riverside-auto.garageos.app</div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-brand-navy text-white flex items-center justify-center text-xs font-bold">RA</div><div><p className="text-sm font-bold text-slate-900">Riverside Auto</p><p className="text-[9px] text-slate-400">Montréal, QC</p></div></div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{copy.booking}</h3>
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-3"><CalendarDays className="w-5 h-5 text-brand-blue" /><div><p className="text-[9px] text-slate-400">{copy.available}</p><p className="text-xs font-semibold text-slate-800">Tomorrow · 9:30 AM</p></div></div>
                <button type="button" className="mt-3 w-full rounded-lg bg-brand-blue text-white text-xs font-semibold py-2.5">{copy.booking}</button>
              </div>
            </div>

            <div className="absolute -bottom-2 left-0 sm:left-2 w-40 sm:w-48 rounded-[1.5rem] border-4 border-slate-900 bg-white shadow-xl overflow-hidden">
              <div className="bg-brand-navy text-white text-center py-2"><p className="text-[9px] font-semibold tracking-wide">{phone.shopName}</p></div>
              <div className="p-3"><p className="text-xs font-semibold text-slate-900">{phone.title}</p><p className="text-[10px] text-slate-500 mt-2">{phone.greeting}</p><p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{phone.body}</p><div className="mt-2 flex items-center gap-1 text-[8px] font-medium text-brand-blue"><MessageSquareText className="w-3 h-3" /> SMS</div></div>
            </div>

            <div className="absolute -bottom-4 right-0 w-28 sm:w-40 rounded-xl bg-white shadow-xl border border-slate-100 p-3 hidden sm:block">
              <div className="flex items-center gap-1.5"><GarageOSAppIcon className="w-3.5 h-3.5" /><p className="text-[8px] font-bold text-slate-900">{invoice.shopName}</p></div>
              <p className="mt-2 text-[8px] text-slate-500">{invoice.invoiceLabel}</p><p className="mt-1 text-[8px] text-slate-400">{invoice.vehicleLabel}</p><div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[8px] font-semibold"><span>Total</span><span>{invoice.total}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
