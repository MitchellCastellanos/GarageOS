"use client";

import { motion } from "framer-motion";
import { BatteryCharging, CircleDashed, Disc3, Droplet, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SERVICE_KEYS } from "@/lib/site-locale";

const STRIP_ORDER: (typeof SERVICE_KEYS)[number][] = ["general", "brakes", "tires", "batteries", "oil"];

const SERVICE_ICONS: Record<(typeof SERVICE_KEYS)[number], LucideIcon> = {
  general: Wrench,
  batteries: BatteryCharging,
  tires: CircleDashed,
  brakes: Disc3,
  oil: Droplet,
};

export function QuickServicesStrip() {
  const { t } = useSiteLocale();

  return (
    <div className="relative z-10 -mt-8 sm:-mt-10 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl shadow-black/10 border border-slate-100 px-3 sm:px-6 py-4 flex items-center gap-2 sm:gap-4 overflow-x-auto"
      >
        {STRIP_ORDER.map((key) => {
          const Icon = SERVICE_ICONS[key];
          return (
            <button
              key={key}
              onClick={() =>
                document.querySelector("#servicios")?.scrollIntoView({ behavior: "smooth" })
              }
              className="group flex items-center gap-2.5 shrink-0 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
            >
              <span className="w-9 h-9 rounded-lg bg-brand-red/10 flex items-center justify-center group-hover:bg-brand-red transition-colors shrink-0">
                <Icon className="w-[18px] h-[18px] text-brand-red group-hover:text-white transition-colors" />
              </span>
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                {t.services.items[key].title}
              </span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
