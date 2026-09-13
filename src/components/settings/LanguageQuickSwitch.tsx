"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ADMIN_LOCALES, type AdminLocale } from "@/lib/admin-locale";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { updatePreferredLocale } from "@/actions/settings";

export function LanguageQuickSwitch() {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSelect(next: AdminLocale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      try {
        await updatePreferredLocale(next);
        toast.success(SETTINGS_DICT[next].language.saved);
        router.refresh();
      } catch {
        toast.error(t.language.error);
      }
    });
  }

  return (
    <div className="px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1.5">
        {t.language.title}
      </p>
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {ADMIN_LOCALES.map((l) => (
          <button
            key={l.value}
            type="button"
            disabled={pending}
            aria-pressed={locale === l.value}
            onClick={() => handleSelect(l.value)}
            className={[
              "px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50",
              locale === l.value
                ? "bg-teal-600 text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            ].join(" ")}
          >
            {l.label}
          </button>
        ))}
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 mx-1" />}
      </div>
    </div>
  );
}
