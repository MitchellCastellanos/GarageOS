import Link from "next/link";
import { Mail } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { getShopSettings } from "@/actions/settings";
import { getShopDomains } from "@/actions/domains";
import { getCommunicationSettings } from "@/actions/communications-settings";
import { EmailDomainCard } from "@/components/settings/EmailDomainCard";
import { SenderSettingsSection } from "@/components/settings/SenderSettingsSection";
import { NOTIFICATIONS_DICT } from "@/lib/admin-locale/notifications";
import { getManagedEmailDomain } from "@/lib/email-config";
import { getEffectiveSubscription } from "@/lib/subscription";
import { planIncludes } from "@/config/entitlements";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect(ADMIN.login);
  if (session.user.role !== "OWNER") redirect(ADMIN.dashboard);

  const locale = await getAdminLocale();
  const t = NOTIFICATIONS_DICT[locale];
  const shop = await getShopSettings();
  if (!shop) redirect(ADMIN.dashboard);
  const domains = await getShopDomains();
  const communications = await getCommunicationSettings();
  const { plan } = await getEffectiveSubscription(session.user.shopId!);
  const canCustomDomain = planIncludes(plan, "branding.customDomain");
  const canCreateIdentity = planIncludes(plan, "branding.customSender");

  // Un taller sin dominio propio conectado ni identidades extra (plan Core) no tiene
  // nada que configurar aquí — solo mostramos un aviso de cuál es su remitente y a
  // dónde ir para cambiarlo (su slug vive en Configuración → Datos del taller).
  const showAdvanced = canCustomDomain || canCreateIdentity || Boolean(domains.email);

  const managedDomain = getManagedEmailDomain();
  const managedAddress = shop.slug && managedDomain ? `${shop.slug}@${managedDomain}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.page.subtitle}</p>
      </div>
      <div className="space-y-6 max-w-2xl">
        {!showAdvanced && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex gap-3">
            <Mail className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-slate-900">{t.banner.title}</h2>
              <p className="text-sm text-slate-600 mt-1">
                {managedAddress ? t.banner.bodyWithAddress(managedAddress) : t.banner.bodyNoSlug}
              </p>
              <Link
                href={ADMIN.settings}
                className="inline-block text-sm font-medium text-teal-700 hover:underline mt-2"
              >
                {t.banner.linkText}
              </Link>
              <p className="text-xs text-slate-500 mt-3">
                {t.banner.upgradeHint}{" "}
                <Link href={`${ADMIN.settings}?tab=billing`} className="font-medium text-teal-700 hover:underline">
                  {t.banner.upgradeLinkText}
                </Link>
              </p>
            </div>
          </div>
        )}

        {showAdvanced && (
          <>
            <EmailDomainCard email={domains.email} entitled={canCustomDomain} />
            <SenderSettingsSection
              key={JSON.stringify(communications)}
              data={communications}
              canCreateIdentity={canCreateIdentity}
            />
          </>
        )}
      </div>
    </div>
  );
}
