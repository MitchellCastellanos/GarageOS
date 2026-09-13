"use client";

import {
  Calendar,
  CarFront,
  ClipboardCheck,
  Wrench,
  MessageCircle,
  Receipt,
  History,
  PackageSearch,
} from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ICONS = [Calendar, CarFront, ClipboardCheck, Wrench, MessageCircle, Receipt, History, PackageSearch];

export function FeatureStrip() {
  const { t } = useMarketingLocale();

  return (
    <section id="features" className="bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6 sm:gap-4">
          {t.featureStrip.map((label, i) => {
            const Icon = ICONS[i];
            return (
              <div key={label} className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <p className="text-[11px] font-medium text-slate-600 leading-tight">{label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
