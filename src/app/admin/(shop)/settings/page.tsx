import { ADMIN } from "@/lib/routes";
import { bookingPublicPath, getAppUrl } from "@/config/app";
import { getShopSettings } from "@/actions/settings";
import { getAppointmentBookingSettings, getServiceCatalogSettings } from "@/actions/booking-settings";
import { getShopDomains } from "@/actions/domains";
import { getCommunicationSettings } from "@/actions/communications-settings";
import { getManagedEmailDomain } from "@/lib/email-config";
import { getBookingPageSettings } from "@/actions/booking-page";
import { BookingPageConfigurator } from "@/components/settings/booking-page/BookingPageConfigurator";
import { getTeamMembers } from "@/actions/users";
import { ShopSettingsForm } from "@/components/settings/ShopSettingsForm";
import { AppointmentBookingSettings } from "@/components/settings/AppointmentBookingSettings";
import { AppointmentReminderSettings } from "@/components/settings/AppointmentReminderSettings";
import { WorkOrderNotificationSettings } from "@/components/settings/WorkOrderNotificationSettings";
import { ServiceCatalogSettings } from "@/components/settings/ServiceCatalogSettings";
import { DomainSettings } from "@/components/settings/DomainSettings";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { LocationsSettings } from "@/components/settings/LocationsSettings";
import { getOrganizationLocations, getOrganizationUsers } from "@/actions/locations";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { BillingCard } from "@/components/billing/BillingCard";
import { getBillingOverview } from "@/actions/billing";
import { PLAN_LIMITS, planIncludes } from "@/config/entitlements";

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
  const bookingPage = isOwner ? await getBookingPageSettings() : null;
  const domains = isOwner ? await getShopDomains() : null;
  const communications = isOwner ? await getCommunicationSettings() : null;
  const billing = isOwner ? await getBillingOverview() : null;
  const plan = billing?.subscription.plan ?? "CORE";
  const seatLimit = PLAN_LIMITS[plan].users;
  const canAddLocation = planIncludes(plan, "organization.multiLocation");
  const canCustomDomain = planIncludes(plan, "branding.customDomain");
  const canCreateIdentity = planIncludes(plan, "branding.customSender");
  const managedEmailDomain = getManagedEmailDomain();
  const managedAddress = shop.slug && managedEmailDomain ? `${shop.slug}@${managedEmailDomain}` : null;
  const tabs: TabItem[] = [
    {
      id: "general",
      label: t.tabs.general,
      content: (
        <ShopSettingsForm
          shop={shop}
          slugUrlPrefix={`${getAppUrl()}${bookingPublicPath("")}`}
          canUseLoginEmail={isOwner}
          loginEmail={session.user.email ?? ""}
        />
      ),
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
        </div>
      ),
    });
  }

  if (isOwner) {
    tabs.push({
      id: "notifications",
      label: t.tabs.notifications,
      content: (
        <div className="space-y-6 max-w-2xl">
          <AppointmentReminderSettings shop={shop} />
          <WorkOrderNotificationSettings shop={shop} />
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

  if (isOwner && bookingPage) {
    tabs.push({
      id: "booking-page",
      label: t.tabs.bookingPage,
      content: <BookingPageConfigurator settings={bookingPage} />,
    });
  }

  if (isOwner) {
    tabs.push({
      id: "team",
      label: t.tabs.team,
      content: <TeamManagement members={team} currentUserId={session.user.id} seatLimit={seatLimit} />,
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
          canAddLocation={canAddLocation}
        />
      ),
    });
  }

  if (isOwner && domains && communications) {
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
          entitled={canCustomDomain}
          email={domains.email}
          canCreateIdentity={canCreateIdentity}
          managedAddress={managedAddress}
          communications={communications}
        />
      ),
    });
  }

  if (isOwner && billing) {
    tabs.push({
      id: "billing",
      label: t.tabs.billing,
      content: <BillingCard subscription={billing.subscription} />,
    });
  }

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
