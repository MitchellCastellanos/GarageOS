import Link from "next/link";
import { PORTAL_STRINGS } from "@/lib/portal-i18n";
import { PortalShell, portalButtonClass } from "@/components/portal/PortalShell";

/** Enlace que existió pero ya no sirve (vencido/revocado). No muestra datos del cliente, solo cómo pedir otro. */
export function PortalLinkExpired({ shopName, shopSlug }: { shopName: string; shopSlug: string | null }) {
  // No conocemos el idioma del cliente sin cargar sus datos: mostramos ambos idiomas, breve.
  const en = PORTAL_STRINGS.en.linkExpired;
  const fr = PORTAL_STRINGS.fr.linkExpired;
  return (
    <PortalShell shop={{ name: shopName, logoUrl: null, brandColor: null }} lang="en">
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {[{ t: en, lang: "en" }, { t: fr, lang: "fr" }].map(({ t, lang }) => (
          <div key={lang} lang={lang} className="space-y-2">
            <h1 className="text-xl font-bold">{t.title}</h1>
            <p className="text-sm text-slate-600">{t.body}</p>
            {shopSlug && <Link href={`/portal/shop/${shopSlug}`} className={portalButtonClass}>{t.request}</Link>}
          </div>
        ))}
      </div>
    </PortalShell>
  );
}
