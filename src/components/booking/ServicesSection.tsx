"use client";

import { motion } from "framer-motion";
import { BatteryCharging, CircleDashed, Disc3, Droplet, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SERVICE_KEYS } from "@/lib/site-locale";

const SERVICE_ICONS: Record<(typeof SERVICE_KEYS)[number], LucideIcon> = {
  general: Wrench,
  batteries: BatteryCharging,
  tires: CircleDashed,
  brakes: Disc3,
  oil: Droplet,
};

export function ServicesSection() {
  const { t } = useSiteLocale();

  return (
    <section id="servicios" className="bg-slate-50 py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-xl mb-12"
        >
          <span className="text-brand-red font-semibold text-sm uppercase tracking-widest">
            {t.services.eyebrow}
          </span>
          <h2 className="font-display font-bold uppercase text-3xl sm:text-4xl text-slate-900 mt-2">
            {t.services.heading}
          </h2>
          <p className="text-slate-500 mt-3">{t.services.subtitle}</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = SERVICE_ICONS[key];
            const item = t.services.items[key];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.07 }}
                whileHover={{ y: -6 }}
                className="group relative bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 hover:border-brand-red/30 transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-red/10 flex items-center justify-center mb-4 group-hover:bg-brand-red transition-colors">
                  <Icon className="w-6 h-6 text-brand-red group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-display font-semibold uppercase tracking-wide text-slate-900">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{item.description}</p>
              </motion.div>
            );
          })}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: SERVICE_KEYS.length * 0.07 }}
            className="rounded-2xl bg-brand-black text-white p-6 flex flex-col justify-center"
          >
            <p className="font-display font-bold uppercase text-lg leading-snug">
              {t.services.noServiceTitle}
            </p>
            <p className="text-slate-400 text-sm mt-2">{t.services.noServiceBody}</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
