"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";

interface ClientManageLinkProps {
  manageUrl: string | null;
  slugMissing?: boolean;
}

export function ClientManageLink({ manageUrl, slugMissing }: ClientManageLinkProps) {
  const locale = useAdminLocale();
  const t = APPOINTMENTS_DICT[locale].manageLink;
  const [copied, setCopied] = useState(false);

  if (slugMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-medium">{t.slugMissingTitle}</p>
        <p className="mt-1 text-amber-800">
          {t.slugMissingBody}
        </p>
      </div>
    );
  }

  if (!manageUrl) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(manageUrl!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
        <Link2 className="w-4 h-4" />
        {t.linkTitle}
      </div>
      <p className="text-xs text-teal-800">
        {t.linkBody}
      </p>
      <div className="flex items-center gap-2">
        <a
          href={manageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-xs text-teal-700 break-all underline underline-offset-2"
        >
          {manageUrl}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 border border-teal-300 text-teal-800 hover:bg-teal-100 rounded-lg text-xs font-medium shrink-0"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? t.copied : t.copy}
        </button>
      </div>
    </div>
  );
}
