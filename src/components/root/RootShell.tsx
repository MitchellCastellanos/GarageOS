import { Suspense } from "react";
import { oswald } from "@/components/root/fonts";
import AnalyticsBeacon from "@/components/AnalyticsBeacon";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { HTML_LANG } from "@/lib/seo/html-lang";

/**
 * Cuerpo común de los dos layouts raíz. Cada grupo de rutas ((site) para EN y la app, (fr) para el francés público)
 * tiene su propio layout raíz porque `<html lang>` solo puede fijarse en un layout raíz sin volver dinámicas todas las
 * páginas estáticas. Ver docs/seo-i18n-architecture-decision.md.
 */
export function RootShell({ locale, children }: { locale: MarketingLocale; children: React.ReactNode }) {
  return (
    <html lang={HTML_LANG[locale]} className={`h-full ${oswald.variable}`}>
      <body className="min-h-full font-sans antialiased">
        {children}
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>
      </body>
    </html>
  );
}
