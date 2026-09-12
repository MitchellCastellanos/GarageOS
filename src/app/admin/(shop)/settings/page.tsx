import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { getShopSettings } from "@/actions/settings";
import { getAppointmentBookingSettings, getServiceCatalogSettings } from "@/actions/booking-settings";
import { getShopDomains } from "@/actions/domains";
import { getTeamMembers } from "@/actions/users";
import { getCommunicationSettings } from "@/actions/communications-settings";
import { ShopSettingsForm } from "@/components/settings/ShopSettingsForm";
import { AppointmentBookingSettings } from "@/components/settings/AppointmentBookingSettings";
import { ServiceCatalogSettings } from "@/components/settings/ServiceCatalogSettings";
import { EmbedSnippetCard } from "@/components/settings/EmbedSnippetCard";
import { DomainSettings } from "@/components/settings/DomainSettings";
import { CommunicationRoutesCard } from "@/components/settings/CommunicationRoutesCard";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { SupportCard } from "@/components/settings/SupportCard";
import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect(ADMIN.login);

  const shop = await getShopSettings();
  if (!shop) redirect(ADMIN.dashboard);

  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const isOwner = session.user.role === "OWNER";
  const team = isOwner ? await getTeamMembers() : [];
  const bookingSettings = isOwner ? await getAppointmentBookingSettings() : null;
  const serviceCatalog = isOwner ? await getServiceCatalogSettings() : null;
  const domains = isOwner ? await getShopDomains() : null;
  const communications = isOwner ? await getCommunicationSettings() : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.page.subtitle}</p>
      </div>

      <LanguageSettings />

      <ShopSettingsForm shop={shop} />

      {isOwner && bookingSettings && (
        <AppointmentBookingSettings
          shop={bookingSettings.shop}
          workingHours={bookingSettings.workingHours}
          mechanics={bookingSettings.mechanics}
        />
      )}

      {isOwner && serviceCatalog && <ServiceCatalogSettings services={serviceCatalog} />}

      {isOwner && bookingSettings?.shop.bookingUrl && (
        <EmbedSnippetCard bookingUrl={bookingSettings.shop.bookingUrl} />
      )}

      {isOwner && domains && (
        <DomainSettings
          slug={domains.slug}
          bookingUrl={domains.bookingUrl}
          subdomainUrl={domains.subdomainUrl}
          rootDomainConfigured={domains.rootDomainConfigured}
          email={domains.email}
          landing={domains.landing}
        />
      )}

      {isOwner && communications && <CommunicationRoutesCard data={communications} />}

      {isOwner && (
        <TeamManagement members={team} currentUserId={session.user.id} />
      )}

      <SupportCard />
    </div>
  );
}
