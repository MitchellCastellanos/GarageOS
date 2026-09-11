"use client";

import Link from "next/link";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";

export function BrandControlSection() {
  const { t } = useMarketingLocale();
  const { phone, invoice } = t.brandControl;

  return (
    <section className="bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
              {t.brandControl.eyebrow}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              {t.brandControl.heading}
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed max-w-md">{t.brandControl.description}</p>
            <Link
              href="/features#branding"
              className="mt-8 inline-flex items-center gap-1.5 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-md shadow-blue-600/20"
            >
              {t.brandControl.cta}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative flex items-center justify-center gap-4 sm:gap-6 py-6">
            {/* Phone confirmation mockup */}
            <div className="w-40 sm:w-48 shrink-0 rounded-[1.75rem] border-4 border-slate-900 bg-white shadow-2xl shadow-slate-900/20 overflow-hidden">
              <div className="bg-brand-navy text-white text-center py-2.5">
                <p className="text-[10px] font-semibold tracking-wide">{phone.shopName}</p>
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold text-slate-900 leading-snug">{phone.title}</p>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{phone.greeting}</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{phone.body}</p>
                <button className="mt-3 w-full flex items-center justify-center gap-1 bg-brand-blue text-white text-[10px] font-semibold py-2 rounded-lg">
                  <CalendarPlus className="w-3 h-3" />
                  {phone.button}
                </button>
              </div>
            </div>

            {/* Invoice mockup */}
            <div className="w-32 sm:w-52 shrink-0 -ml-8 sm:-ml-10 mt-10 rounded-xl bg-white shadow-2xl shadow-slate-900/20 border border-slate-100 p-3.5">
              <div className="flex items-center gap-1.5">
                <GarageOSAppIcon className="w-4 h-4" />
                <p className="text-[9px] font-bold tracking-wide text-slate-900">{invoice.shopName}</p>
              </div>
              <div className="flex items-center justify-between mt-2 text-[9px] text-slate-500">
                <span>{invoice.invoiceLabel}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100">
                <p className="text-[8px] text-slate-400">{invoice.billTo}</p>
                <p className="text-[9px] font-medium text-slate-800">{invoice.client}</p>
                <p className="text-[8px] text-slate-400">{invoice.vehicleLabel}</p>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                {invoice.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-[8px] text-slate-600">
                    <span className="truncate pr-1">{item.label}</span>
                    <span className="shrink-0">{item.price}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                <div className="flex items-center justify-between text-[8px] text-slate-500">
                  <span>Subtotal</span>
                  <span>{invoice.subtotal}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{invoice.total}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
