import { bookingPublicPath, getAppUrl } from "@/config/app";
import { getOnboardingContext } from "@/actions/onboarding";
import { getServiceCatalogSettings, getAppointmentBookingSettings } from "@/actions/booking-settings";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function OnboardingPage() {
  const [{ shop, isAdditionalLocation, suggestedServices, copiedFromShopName }, bookingSettings] = await Promise.all([
    getOnboardingContext(),
    getAppointmentBookingSettings(),
  ]);

  const initialServices = suggestedServices.length > 0 ? suggestedServices : await getServiceCatalogSettings();

  return (
    <OnboardingWizard
      shop={{
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        taxId: shop.taxId,
        slug: shop.slug,
        logoUrl: shop.logoUrl,
        brandColor: shop.brandColor,
        taxLines: shop.taxLines,
      }}
      slugUrlPrefix={`${getAppUrl()}${bookingPublicPath("")}`}
      isAdditionalLocation={isAdditionalLocation}
      copiedFromShopName={copiedFromShopName}
      initialServices={initialServices ?? []}
      workingHours={bookingSettings?.workingHours ?? []}
    />
  );
}
