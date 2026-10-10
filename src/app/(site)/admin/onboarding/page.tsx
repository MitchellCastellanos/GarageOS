import { bookingPublicPath, getAppUrl } from "@/config/app";
import { getOnboardingContext } from "@/actions/onboarding";
import { getServiceCatalogSettings, getAppointmentBookingSettings } from "@/actions/booking-settings";
import { getBillingOverview } from "@/actions/billing";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function OnboardingPage() {
  const [{ shop, isAdditionalLocation, suggestedServices, copiedFromShopName }, bookingSettings, { subscription }] = await Promise.all([
    getOnboardingContext(),
    getAppointmentBookingSettings(),
    getBillingOverview(),
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
        bookingCoverImageUrl: shop.bookingCoverImageUrl,
        bookingShopImageUrl: shop.bookingShopImageUrl,
        brandColor: shop.brandColor,
        taxLines: shop.taxLines,
      }}
      slugUrlPrefix={`${getAppUrl()}${bookingPublicPath("")}`}
      isAdditionalLocation={isAdditionalLocation}
      copiedFromShopName={copiedFromShopName}
      initialServices={initialServices ?? []}
      workingHours={bookingSettings?.workingHours ?? []}
      subscription={subscription}
    />
  );
}
