"use client";

import { useTransition } from "react";
import { Copy, ExternalLink, Loader2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { updateWebBookingEnabled } from "@/actions/booking-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { Switch } from "@/components/ui/Switch";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { EmbedSnippetCard } from "./EmbedSnippetCard";

interface OnlineBookingSettingsProps {
  shop: { name: string; bookingEnabled: boolean; bookingUrl: string | null };
}

export function OnlineBookingSettings({ shop }: OnlineBookingSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].booking;
  const tEmbed = SETTINGS_DICT[locale].embed;
  const [pending, startTransition] = useTransition();
  const caption = shop.bookingUrl ? t.shareCaption(shop.name) : "";
  const buttonSnippet = shop.bookingUrl
    ? `<a href="${shop.bookingUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#0d9488;color:#fff;font-family:sans-serif;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">${tEmbed.iframeTitle}</a>`
    : "";

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error(t.copyError);
    }
  }

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

  function copyLink() {
    copyText(shop.bookingUrl!, t.linkCopied);
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
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t.shareTitle}</h3>
            <p className="text-sm text-slate-500 mt-1">{t.shareSubtitle}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${caption}\n${shop.bookingUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shop.bookingUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Share2 className="w-3.5 h-3.5" />
                Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(shop.bookingUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                <Share2 className="w-3.5 h-3.5" />
                X
              </a>
              <button
                type="button"
                onClick={() => copyText(`${caption}\n${shop.bookingUrl}`, t.shareCaptionCopied)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg border border-slate-200"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {t.shareCopyCaption}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t.buttonSnippetTitle}</h3>
            <p className="text-sm text-slate-500 mt-1">{t.buttonSnippetHint}</p>
            <div className="relative mt-2">
              <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto">
                <code>{buttonSnippet}</code>
              </pre>
              <button
                type="button"
                onClick={() => copyText(buttonSnippet, tEmbed.copied)}
                className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                <Copy className="w-3.5 h-3.5" />
                {tEmbed.copy}
              </button>
            </div>
          </div>

          <EmbedSnippetCard bookingUrl={shop.bookingUrl} />
        </div>
      )}

      {!shop.bookingUrl && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-2">
          {t.missingSlugHint}
        </p>
      )}
    </div>
  );
}
