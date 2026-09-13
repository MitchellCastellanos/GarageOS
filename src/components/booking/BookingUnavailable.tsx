"use client";

import { CalendarOff } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

export function BookingUnavailable({ shopName, phone }: { shopName: string; phone: string | null }) {
  const { t } = useSiteLocale();

  return (
    <div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
      <CalendarOff className="mx-auto h-10 w-10 text-slate-400" />
      <p className="font-medium text-slate-600 break-words">{shopName}</p>
      <h2 className="text-xl font-semibold text-slate-900">{t.booking.pausedTitle}</h2>
      <p className="text-sm text-slate-600">{t.booking.pausedBody}</p>
      {phone && (
        <a href={`tel:${phone}`} className="inline-block text-sm font-medium text-brand-red-dark underline underline-offset-2">
          {t.booking.callShop}: {phone}
        </a>
      )}
    </div>
  );
}
