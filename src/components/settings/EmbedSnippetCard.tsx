"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

interface EmbedSnippetCardProps {
  bookingUrl: string | null;
}

export function EmbedSnippetCard({ bookingUrl }: EmbedSnippetCardProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].embed;
  if (!bookingUrl) return null;

  const embedUrl = `${bookingUrl}?embed=1`;
  const snippet = `<iframe src="${embedUrl}" style="width:100%;max-width:480px;height:720px;border:0" loading="lazy" title="${t.iframeTitle}"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyError);
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{t.title}</h3>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
        >
          <Copy className="w-3.5 h-3.5" />
          {t.copy}
        </button>
      </div>

      <p className="text-sm text-slate-500">{t.description}</p>
      <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto">
        <code>{snippet}</code>
      </pre>
      <p className="text-xs text-slate-500">{t.hint}</p>
    </div>
  );
}
