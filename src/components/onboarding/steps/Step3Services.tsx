"use client";

import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";
import { ServiceCatalogSettings } from "@/components/settings/ServiceCatalogSettings";

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

interface Step3ServicesProps {
  step: number;
  totalSteps: number;
  services: ServiceCatalogRow[];
  copiedFromShopName?: string;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Services({ step, totalSteps, services, copiedFromShopName, onNext, onBack }: Step3ServicesProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)];

  return (
    <StepShell
      step={step}
      totalSteps={totalSteps}
      title={t.step3.title}
      subtitle={copiedFromShopName ? t.additionalLocation.copyServices(copiedFromShopName) : t.step3.subtitle}
      onBack={onBack}
    >
      <ServiceCatalogSettings services={services} onSaved={onNext} />
    </StepShell>
  );
}
