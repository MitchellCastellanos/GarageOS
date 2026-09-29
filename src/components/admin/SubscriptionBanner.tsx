"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SUBSCRIPTION_BANNER_DICT } from "@/lib/admin-locale/subscription-banner";

/** Datos serializables para el banner — el importe y las fechas los resuelve el servidor (nunca hardcode). */
export type SubscriptionBannerData =
  | {
      kind: "trial";
      plan: Plan;
      daysLeft: number;
      /** ISO del primer cobro (fin del trial). */
      chargeDate: string;
      amountCad: number | null;
      interval: "MONTHLY" | "YEARLY" | null;
      /** false = trial heredado sin tarjeta: no se cobrará solo. */
      hasPaymentMethod: boolean;
    }
  | { kind: "pastDue"; plan: Plan }
  | { kind: "restricted"; hasPlan: boolean };

export function SubscriptionBanner({ data }: { data: SubscriptionBannerData }) {
  const locale = useAdminLocale();
  const t = SUBSCRIPTION_BANNER_DICT[locale];
  const intlLocale = locale === "fr" ? "fr-CA" : locale === "es" ? "es-CA" : "en-CA";

  let message: string;
  let cta = t.cta;
  let tone: "info" | "soon" | "urgent" | "danger";

  if (data.kind === "restricted") {
    message = data.hasPlan ? t.restricted : t.restrictedNoPlan;
    cta = t.ctaFix;
    tone = "danger";
  } else if (data.kind === "pastDue") {
    message = t.pastDue(PLAN_LABELS[data.plan]);
    cta = t.ctaFix;
    tone = "danger";
  } else {
    const plan = PLAN_LABELS[data.plan];
    const date = new Date(data.chargeDate).toLocaleDateString(intlLocale, { year: "numeric", month: "long", day: "numeric" });
    const days = t.trialLeft(data.daysLeft, plan);
    const lead = data.daysLeft <= 0 ? t.trialEndsToday(plan) : days;
    if (data.hasPaymentMethod && data.amountCad != null && data.interval) {
      const amount = new Intl.NumberFormat(intlLocale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(data.amountCad);
      message = `${lead} ${t.planStarts(plan, date, amount, data.interval)}`;
    } else {
      message = `${lead} ${t.addPaymentMethod(plan, date)}`;
      cta = t.ctaPayment;
    }
    tone = data.daysLeft <= 2 ? "urgent" : data.daysLeft <= 7 ? "soon" : "info";
  }

  const styles = {
    info: "bg-slate-50 border-slate-200 text-slate-700",
    soon: "bg-blue-50 border-blue-200 text-blue-900",
    urgent: "bg-amber-50 border-amber-200 text-amber-900",
    danger: "bg-red-50 border-red-200 text-red-900",
  }[tone];
  const iconStyle = tone === "danger" ? "text-red-600" : tone === "urgent" ? "text-amber-600" : "text-blue-600";
  const Icon = tone === "danger" || tone === "urgent" ? AlertTriangle : Clock;

  return (
    <div className={`no-print flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b px-3 sm:px-4 py-2 text-sm ${styles}`}>
      <span className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${iconStyle}`} />
        <span>{message}</span>
      </span>
      <Link href={ADMIN.billing} className="text-sm font-semibold underline underline-offset-2 whitespace-nowrap">
        {cta}
      </Link>
    </div>
  );
}
