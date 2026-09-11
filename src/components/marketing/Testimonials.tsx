"use client";

import { Star } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = ["bg-blue-100 text-brand-blue", "bg-amber-100 text-amber-600", "bg-emerald-100 text-emerald-600"];

export function Testimonials() {
  const { t } = useMarketingLocale();

  return (
    <section className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center max-w-xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
            {t.testimonials.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            {t.testimonials.heading}
          </h2>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-5">
          {t.testimonials.items.map((item, i) => (
            <div key={item.name} className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star key={idx} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">&ldquo;{item.quote}&rdquo;</p>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                >
                  {initials(item.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.shop}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {t.testimonials.shopNames.map((name) => (
            <span key={name} className="text-slate-300 font-semibold text-sm sm:text-base tracking-wide select-none">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
