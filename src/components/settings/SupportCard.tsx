"use client";

import { Mail, Globe, MessageCircle, Phone } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

const support = {
  name: process.env.NEXT_PUBLIC_SUPPORT_NAME ?? "GarageOS",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "",
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "",
  url: process.env.NEXT_PUBLIC_SUPPORT_URL ?? "",
  tagline: process.env.NEXT_PUBLIC_SUPPORT_TAGLINE ?? "Soporte técnico, actualizaciones y nuevas funciones",
};

export function SupportCard() {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const whatsappHref = support.whatsapp
    ? `https://wa.me/${support.whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white max-w-2xl">
      <p className="text-slate-400 text-xs uppercase tracking-wide font-medium mb-1">
        {t.support.needHelp}
      </p>
      <h2 className="font-semibold text-lg">{support.name}</h2>
      <p className="text-slate-300 text-sm mt-1">{support.tagline}</p>

      <div className="mt-4 flex flex-col gap-2">
        {support.url && (
          <a
            href={support.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors"
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            {support.url.replace(/^https?:\/\//, "")}
          </a>
        )}
        {support.email && (
          <a
            href={`mailto:${support.email}`}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <Mail className="w-4 h-4 flex-shrink-0" />
            {support.email}
          </a>
        )}
        {support.phone && (
          <a
            href={`tel:${support.phone}`}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <Phone className="w-4 h-4 flex-shrink-0" />
            {support.phone}
          </a>
        )}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <MessageCircle className="w-4 h-4 flex-shrink-0" />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
