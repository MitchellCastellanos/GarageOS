"use client";

import { useTransition } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateWebBookingEnabled } from "@/actions/booking-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { Switch } from "@/components/ui/Switch";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { EmbedSnippetCard } from "./EmbedSnippetCard";

interface OnlineBookingSettingsProps {
  shop: { bookingEnabled: boolean; bookingUrl: string | null };
}

export function OnlineBookingSettings({ shop }: OnlineBookingSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].booking;
  const [pending, startTransition] = useTransition();

  function toggle(enabled: boolean) {
    startTransition(async () => {
      try {
        const result = await updateWebBookingEnabled(enabled);
        if (result.success) {
          toast.success(result.bookingEnabled ? t.enabledStatus : t.disabledStatus);
        } else {
          toast.error(t.toggleError);
        }
      } catch {
        toast.error(t.toggleError);
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shop.bookingUrl!);
      toast.success(t.linkCopied);
    } catch {
      toast.error(t.copyError);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="web-booking-enabled" checked={shop.bookingEnabled} onChange={toggle} disabled={pending} />
        <label htmlFor="web-booking-enabled" className="text-sm font-medium text-slate-700">
          {t.enableLabel}
        </label>
        {pending && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-slate-500" />}
      </div>
      <p role="status" className="text-sm text-slate-600">
        {pending ? t.toggling : shop.bookingEnabled ? t.enabledStatus : t.disabledStatus}
      </p>
      <p className="text-xs text-slate-500">{t.toggleHint}</p>

      {shop.bookingUrl && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t.publicLink}</h3>
            <div className="mt-2 flex items-center gap-2 p-3 bg-teal-50 border border-teal-100 rounded-lg">
              <code className="min-w-0 text-xs text-teal-800 flex-1 break-all">{shop.bookingUrl}</code>
              <button type="button" onClick={copyLink} className="shrink-0 p-2 text-teal-700 hover:bg-teal-100 rounded-lg" aria-label={t.copyLink}>
                <Copy className="w-4 h-4" />
              </button>
              <a href={shop.bookingUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 text-teal-700 hover:bg-teal-100 rounded-lg" aria-label={t.openPage}>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
          <EmbedSnippetCard bookingUrl={shop.bookingUrl} />
        </div>
      )}
    </div>
  );
}
