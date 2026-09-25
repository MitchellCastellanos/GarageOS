"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Phone, AlertTriangle } from "lucide-react";
import { requestDedicatedSmsNumber, type ShopSmsOverview } from "@/actions/sms-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

const DATE_LOCALE = { es: "es-CA", en: "en-CA", fr: "fr-CA" } as const;

export function SmsNumberCard({ overview }: { overview: ShopSmsOverview }) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].smsNumber;
  const [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState(false);

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString(DATE_LOCALE[locale], { year: "numeric", month: "long", day: "numeric" });

  const number = overview.number;
  const live = number && (number.status === "ACTIVE" || number.status === "RELEASE_SCHEDULED") && number.phoneNumber;
  const provisioning = number?.status === "PROVISIONING";
  const { usage } = overview;
  const full = usage.used >= usage.allowance;

  function handleRequest() {
    startTransition(async () => {
      const result = await requestDedicatedSmsNumber(t.requestMessage);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setRequested(true);
      toast.success(t.requestSent);
    });
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-600" /> {t.title}
        </h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
      </div>

      {live ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">{t.dedicatedLabel}</p>
          <p className="text-lg font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
            <Phone className="w-4 h-4 text-slate-400" /> {number.phoneNumber}
          </p>
          <p className="text-xs text-slate-500 mt-1">{t.twoWayHint}</p>
          {number.status === "RELEASE_SCHEDULED" && number.releaseScheduledAt && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {t.releaseScheduled(formatDate(number.releaseScheduledAt))}
            </p>
          )}
        </div>
      ) : provisioning ? (
        <p className="text-sm text-slate-600 rounded-lg border border-slate-200 p-4">{t.provisioningBody}</p>
      ) : (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <p className="text-xs font-medium text-slate-500">{overview.sharedNumberConfigured ? t.sharedLabel : ""}</p>
          <p className="text-sm text-slate-600">{overview.sharedNumberConfigured ? t.sharedBody : t.noSmsBody}</p>
          <button
            type="button"
            onClick={handleRequest}
            disabled={pending || requested}
            className="flex items-center gap-2 px-3 py-2 border border-teal-200 text-teal-700 hover:bg-teal-50 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {requested ? t.requestSent : t.requestButton}
          </button>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-slate-900">{t.usageTitle}</p>
        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={usage.percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full ${full ? "bg-red-500" : usage.percent >= 80 ? "bg-amber-500" : "bg-teal-500"}`}
            style={{ width: `${usage.percent}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-1.5">
          {t.usageLine(usage.used, usage.allowance)} · {t.usageRenews(formatDate(usage.periodEnd))}
        </p>
        {full && <p className="text-xs text-red-700 mt-1">{t.usageFullHint}</p>}
        <p className="text-xs text-slate-400 mt-1">{t.segmentsHint}</p>
        {overview.optedOutCount > 0 && <p className="text-xs text-slate-500 mt-1">{t.optedOut(overview.optedOutCount)}</p>}
      </div>
    </section>
  );
}
