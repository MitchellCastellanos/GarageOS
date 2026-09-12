"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ADMIN_LOCALES, type AdminLocale } from "@/lib/admin-locale";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { updatePreferredLocale } from "@/actions/settings";

export function LanguageSettings() {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSelect(next: AdminLocale) {
    if (next === locale) return;
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
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 max-w-2xl">
      <div>
        <h2 className="font-semibold text-slate-900">{t.language.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.language.hint}</p>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {ADMIN_LOCALES.map((l) => (
          <button
            key={l.value}
            type="button"
            disabled={pending}
            onClick={() => handleSelect(l.value)}
            className={[
              "px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50",
              locale === l.value
                ? "bg-teal-600 text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            ].join(" ")}
          >
            {l.label}
          </button>
        ))}
        {pending && <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-1" />}
      </div>
    </div>
  );
}
