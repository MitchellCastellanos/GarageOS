import { ADMIN } from "@/lib/routes";
import { getShopSettings } from "@/actions/settings";
import { getAppointmentBookingSettings, getServiceCatalogSettings } from "@/actions/booking-settings";
import { getShopDomains } from "@/actions/domains";
import { getTeamMembers } from "@/actions/users";
import { ShopSettingsForm } from "@/components/settings/ShopSettingsForm";
import { AppointmentBookingSettings } from "@/components/settings/AppointmentBookingSettings";
import { AppointmentReminderSettings } from "@/components/settings/AppointmentReminderSettings";
import { ServiceCatalogSettings } from "@/components/settings/ServiceCatalogSettings";
import { DomainSettings } from "@/components/settings/DomainSettings";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { LocationsSettings } from "@/components/settings/LocationsSettings";
import { getOrganizationLocations, getOrganizationUsers } from "@/actions/locations";
import { SupportCard } from "@/components/settings/SupportCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
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
  const tabs: TabItem[] = [
    {
      id: "general",
      label: t.tabs.general,
      content: <ShopSettingsForm shop={shop} />,
    },
  ];

  if (isOwner && bookingSettings) {
    tabs.push({
      id: "calendar",
      label: t.tabs.calendar,
      content: (
        <div className="space-y-6 max-w-2xl">
          <AppointmentBookingSettings
            shop={bookingSettings.shop}
            workingHours={bookingSettings.workingHours}
            mechanics={bookingSettings.mechanics}
          />
          <AppointmentReminderSettings shop={shop} />
        </div>
      ),
    });
  }

  if (isOwner && serviceCatalog) {
    tabs.push({
      id: "services",
      label: t.tabs.services,
      content: <ServiceCatalogSettings services={serviceCatalog} />,
    });
  }

  if (isOwner) {
    tabs.push({
      id: "team",
      label: t.tabs.team,
      content: <TeamManagement members={team} currentUserId={session.user.id} />,
    });

    const [locations, orgUsers] = await Promise.all([
      getOrganizationLocations(),
      getOrganizationUsers(),
    ]);
    tabs.push({
      id: "locations",
      label: t.tabs.locations,
      content: (
        <LocationsSettings
          organizationId={locations.organizationId}
          shops={locations.shops}
          currentShopId={session.user.shopId!}
          orgUsers={orgUsers}
        />
      ),
    });
  }

  if (isOwner && domains) {
    tabs.push({
      id: "domain",
      label: t.tabs.domain,
      content: (
        <DomainSettings
          slug={domains.slug}
          bookingUrl={domains.bookingUrl}
          subdomainUrl={domains.subdomainUrl}
          rootDomainConfigured={domains.rootDomainConfigured}
          landing={domains.landing}
        />
      ),
    });
  }

  tabs.push({ id: "support", label: t.tabs.support, content: <SupportCard /> });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.page.subtitle}</p>
      </div>
      <Tabs tabs={tabs} basePath={ADMIN.settings} />
    </div>
  );
}
