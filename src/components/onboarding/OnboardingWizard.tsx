"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkingHoursRow } from "@/lib/working-hours";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { Step1Business } from "@/components/onboarding/steps/Step1Business";
import { Step2Fiscal } from "@/components/onboarding/steps/Step2Fiscal";
import { Step3Services } from "@/components/onboarding/steps/Step3Services";
import { Step4Hours } from "@/components/onboarding/steps/Step4Hours";
import { Step5Design } from "@/components/onboarding/steps/Step5Design";
import { Step6Share } from "@/components/onboarding/steps/Step6Share";

interface ServiceCatalogRow {
  id: string;
  labelFr: string;
  labelEn: string;
  labelEs: string;
  durationMinutes: number;
  isActive: boolean;
  iconKey: string | null;
  isFeatured: boolean;
}

interface OnboardingWizardProps {
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    slug: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    taxLines: unknown;
  };
  slugUrlPrefix: string;
  isAdditionalLocation: boolean;
  copiedFromShopName?: string;
  initialServices: ServiceCatalogRow[];
  workingHours: WorkingHoursRow[];
}

/** Pasos que corren siempre vs. los que se saltan en una ubicación adicional (fiscal/logo/diseño ya se copiaron al crearla, ver actions/locations.ts). */
const FULL_FLOW: readonly number[] = [1, 2, 3, 4, 5, 6];
const SHORT_FLOW: readonly number[] = [1, 3, 4, 6];

export function OnboardingWizard({
  shop,
  slugUrlPrefix,
  isAdditionalLocation,
  copiedFromShopName,
  initialServices,
  workingHours,
}: OnboardingWizardProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)];
  const router = useRouter();
  const searchParams = useSearchParams();

  const sequence = isAdditionalLocation ? SHORT_FLOW : FULL_FLOW;
  const stepParam = Number(searchParams.get("step"));
  const initialIndex = sequence.indexOf(stepParam);
  const [index, setIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);

  const currentStepId = sequence[index];
  const totalSteps = sequence.length;
  const displayStep = index + 1;

  function goToIndex(next: number) {
    setIndex(next);
    router.replace(`?step=${sequence[next]}`, { scroll: false });
  }

  const goNext = () => goToIndex(Math.min(index + 1, sequence.length - 1));
  const goBack = () => goToIndex(Math.max(index - 1, 0));

  const banner = isAdditionalLocation && currentStepId === 1 ? t.additionalLocation.banner : undefined;

  switch (currentStepId) {
    case 1:
      return (
        <Step1Business
          step={displayStep}
          totalSteps={totalSteps}
          banner={banner}
          shop={shop}
          slugUrlPrefix={slugUrlPrefix}
          onNext={goNext}
        />
      );
    case 2:
      return (
        <Step2Fiscal
          step={displayStep}
          totalSteps={totalSteps}
          shop={shop}
          onNext={(newLogoUrl) => {
            setLogoUrl(newLogoUrl);
            goNext();
          }}
          onBack={goBack}
        />
      );
    case 3:
      return (
        <Step3Services
          step={displayStep}
          totalSteps={totalSteps}
          services={initialServices}
          copiedFromShopName={copiedFromShopName}
          onNext={goNext}
          onBack={goBack}
        />
      );
    case 4:
      return (
        <Step4Hours
          step={displayStep}
          totalSteps={totalSteps}
          workingHours={workingHours}
          onNext={goNext}
          onBack={goBack}
        />
      );
    case 5:
      return (
        <Step5Design
          step={displayStep}
          totalSteps={totalSteps}
          shopName={shop.name}
          logoUrl={logoUrl}
          initialBrandColor={shop.brandColor}
          onNext={goNext}
          onBack={goBack}
        />
      );
    case 6:
      return <Step6Share step={displayStep} totalSteps={totalSteps} onBack={goBack} />;
    default:
      return null;
  }
}
