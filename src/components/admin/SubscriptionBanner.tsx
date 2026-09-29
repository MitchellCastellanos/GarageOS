"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SUBSCRIPTION_BANNER_DICT } from "@/lib/admin-locale/subscription-banner";

export type SubscriptionBannerKind = "trialEnding" | "trialExpired" | "pastDue";

export function SubscriptionBanner({ kind, daysLeft }: { kind: SubscriptionBannerKind; daysLeft: number }) {
  const locale = useAdminLocale();
  const t = SUBSCRIPTION_BANNER_DICT[locale];
  const urgent = kind !== "trialEnding";
  const message =
    kind === "trialExpired"
      ? t.trialExpired
      : kind === "pastDue"
        ? t.pastDue
        : daysLeft <= 0
          ? t.trialEndsToday
          : t.trialEnding(daysLeft);
  const Icon = urgent ? AlertTriangle : Clock;

  return (
    <div
      className={`no-print flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b px-3 sm:px-4 py-2 text-sm ${
        urgent ? "bg-red-50 border-red-200 text-red-900" : "bg-blue-50 border-blue-200 text-blue-900"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${urgent ? "text-red-600" : "text-blue-600"}`} />
        <span>{message}</span>
      </span>
      <Link href={ADMIN.billing} className="text-sm font-semibold underline underline-offset-2 whitespace-nowrap">
        {t.cta}
      </Link>
    </div>
  );
}
