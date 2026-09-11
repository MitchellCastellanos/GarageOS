"use client";

import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { LanguageToggle } from "@/components/marketing/LanguageToggle";
import { GarageOSLogo } from "@/components/marketing/GarageOSLogo";
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "@/components/marketing/SocialIcons";

export function MarketingFooter() {
  const { t } = useMarketingLocale();
  const columns = [t.footer.columns.product, t.footer.columns.resources, t.footer.columns.company];

  return (
    <footer className="bg-brand-navy">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-10">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <GarageOSLogo className="h-7 w-7" />
            <span className="font-semibold text-white">GarageOS</span>
          </div>
          <p className="mt-3 text-sm text-slate-400 max-w-xs leading-relaxed">{t.footer.tagline}</p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link}>
                  <span className="text-sm text-slate-300 hover:text-white transition-colors cursor-default">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 order-2 sm:order-1">
            <LanguageToggle variant="dark" />
            <div className="flex items-center gap-3 text-slate-500">
              <FacebookIcon className="w-4 h-4 hover:text-white transition-colors cursor-default" />
              <InstagramIcon className="w-4 h-4 hover:text-white transition-colors cursor-default" />
              <YoutubeIcon className="w-4 h-4 hover:text-white transition-colors cursor-default" />
            </div>
          </div>
          <p className="text-xs text-slate-500 order-1 sm:order-2">
            © {new Date().getFullYear()} {t.footer.copyright}
          </p>
          <Link
            href="/admin/login"
            className="text-xs text-brand-blue hover:text-blue-400 transition-colors order-3"
          >
            {t.footer.madeFor}
          </Link>
        </div>
      </div>
    </footer>
  );
}
