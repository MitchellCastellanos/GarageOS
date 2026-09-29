"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { getBookingPageSettings } from "@/actions/booking-page";
import { completeOnboarding } from "@/actions/onboarding";
import { getBillingOverview } from "@/actions/billing";
import { OnlineBookingSettings } from "@/components/settings/OnlineBookingSettings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";
import { ADMIN } from "@/lib/routes";
import { ONBOARDING_PLAN_STEP } from "@/config/onboarding";
import { PLAN_LABELS } from "@/config/entitlements";

interface Step6ShareProps {
  step: number;
  totalSteps: number;
  onBack: () => void;
}

interface BookingPageShop {
  name: string;
  logoUrl: string | null;
  bookingEnabled: boolean;
  publicUrl: string | null;
}

export function Step6Share({ step, totalSteps, onBack }: Step6ShareProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].step6;
  const router = useRouter();
  const [shop, setShop] = useState<BookingPageShop | null>(null);
  const [finishing, startFinishing] = useTransition();
  const [trial, setTrial] = useState<{ plan: string; daysLeft: number; endsOn: string; amount: string | null } | null>(null);

  useEffect(() => {
    getBookingPageSettings().then((data) => {
      if (data) setShop({ name: data.shop.name, logoUrl: data.shop.logoUrl, bookingEnabled: data.shop.bookingEnabled, publicUrl: data.publicUrl });
    });
    getBillingOverview()
      .then(({ subscription }) => {
        if (!subscription.isTrialing || !subscription.trialEndsAt || !subscription.plan) return;
        const endsAt = new Date(subscription.trialEndsAt);
        const intl = locale === "fr" ? "fr-CA" : "en-CA";
        setTrial({
          plan: PLAN_LABELS[subscription.plan],
          daysLeft: Math.max(Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000), 0),
          endsOn: endsAt.toLocaleDateString(intl, { year: "numeric", month: "long", day: "numeric" }),
          amount: subscription.nextCharge
            ? new Intl.NumberFormat(intl, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(subscription.nextCharge.amountCad)
            : null,
        });
      })
      .catch(() => {});
  }, [locale]);

  function handleFinish() {
    startFinishing(async () => {
      const result = await completeOnboarding();
      if (result?.success) router.push(ADMIN.dashboard);
      else if (result?.error === "PLAN_REQUIRED") router.push(`${ADMIN.onboarding}?step=${ONBOARDING_PLAN_STEP}`);
      else toast.error("Error");
    });
  }

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} onBack={onBack}>
      <div className="space-y-4">
        {shop ? (
          <OnlineBookingSettings
            shop={{ name: shop.name, logoUrl: shop.logoUrl, bookingEnabled: shop.bookingEnabled, bookingUrl: shop.publicUrl }}
          />
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {trial && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">{t.planTitle}</p>
              <p className="text-sm text-slate-700">
                {t.planTrial(trial.plan, trial.daysLeft, trial.endsOn)}
              </p>
              {trial.amount && <p className="text-sm text-slate-700">{t.planCharge(trial.endsOn, trial.amount)}</p>}
              <p className="text-xs text-slate-500">{t.planBody}</p>
              <Link href={ADMIN.billing} target="_blank" className="inline-block text-sm font-medium text-blue-600 hover:underline">
                {t.planCta}
              </Link>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500">
          {t.supportHint}{" "}
          <a
            href={ADMIN.support}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            {t.supportLink}
          </a>
        </p>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {finishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {finishing ? t.finishing : t.finish}
          </button>
        </div>
      </div>
    </StepShell>
  );
}
