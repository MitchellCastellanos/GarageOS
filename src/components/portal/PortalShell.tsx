import Image from "next/image";
import type { ReactNode } from "react";
import { deriveBrandPalette } from "@/lib/brand-color";
import { PORTAL_STRINGS, type PortalLang } from "@/lib/portal-i18n";

interface PortalShopBrand {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

/** Marco del portal: hereda logo y color de marca del taller (misma derivación segura que /book). Mobile-first. */
export function PortalShell({ shop, lang, children, title, subtitle }: {
  shop: PortalShopBrand;
  lang: PortalLang;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const palette = deriveBrandPalette(shop.brandColor);
  const t = PORTAL_STRINGS[lang];
  return (
    <div
      lang={lang}
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{ "--portal-primary": palette.primary, "--portal-soft": palette.primarySoft, "--portal-hover": palette.primaryHover } as React.CSSProperties}
    >
      <header style={{ backgroundColor: palette.surface }} className="text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 sm:px-6">
          {shop.logoUrl ? (
            <Image src={shop.logoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 flex-shrink-0 rounded-lg bg-white/10 object-contain" />
          ) : (
            <span aria-hidden className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg font-bold" style={{ backgroundColor: palette.primary }}>
              {shop.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">{shop.name}</p>
            <p className="text-xs leading-tight" style={{ color: palette.accentOnDark }}>{t.metaTitle}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        {title && (
          <div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-10 text-center text-xs text-slate-400 sm:px-6">
        <p>{t.footer}</p>
      </footer>
    </div>
  );
}

export function PortalSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 id={id} className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">{title}</h2>
      {children}
    </section>
  );
}

export function PortalEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-4 text-sm text-slate-500 sm:px-5">{children}</p>;
}

export function StatusPill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "slate"; children: ReactNode }) {
  const cls = {
    green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", slate: "bg-slate-100 text-slate-700",
  }[tone];
  return <span className={`inline-flex flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/** Botón/enlace principal con el color de marca; alto objetivo táctil ≥ 44px. */
export const portalButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-[var(--portal-primary)]";
export const portalLinkClass = "text-sm font-medium text-[var(--portal-primary)] underline-offset-2 hover:underline";
