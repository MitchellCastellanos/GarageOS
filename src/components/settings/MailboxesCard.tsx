"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateMailboxSettings } from "@/actions/settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { NOTIFICATIONS_DICT } from "@/lib/admin-locale/notifications";

interface MailboxesCardProps {
  shop: {
    billingEmail: string | null;
    infoEmail: string | null;
    providersEmail: string | null;
    newsletterEmail: string | null;
  };
}

export function MailboxesCard({ shop }: MailboxesCardProps) {
  const locale = useAdminLocale();
  const t = NOTIFICATIONS_DICT[locale].mailboxes;
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateMailboxSettings(formData);
      if (result.success) {
        toast.success(t.saved);
      } else if (result.error) {
        toast.error(Object.values(result.error).flat().join(" · "));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">{t.title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="billingEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.billingLabel}
          </label>
          <input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={shop.billingEmail ?? ""}
            placeholder="billing@tutaller.com"
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">{t.billingHint}</p>
        </div>
        <div>
          <label htmlFor="infoEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.infoLabel}
          </label>
          <input
            id="infoEmail"
            name="infoEmail"
            type="email"
            defaultValue={shop.infoEmail ?? ""}
            placeholder="info@tutaller.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="providersEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.providersLabel}
          </label>
          <input
            id="providersEmail"
            name="providersEmail"
            type="email"
            defaultValue={shop.providersEmail ?? ""}
            placeholder="providers@tutaller.com"
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">{t.providersHint}</p>
        </div>
        <div>
          <label htmlFor="newsletterEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.newsletterLabel}
          </label>
          <input
            id="newsletterEmail"
            name="newsletterEmail"
            type="email"
            defaultValue={shop.newsletterEmail ?? ""}
            placeholder="newsletter@tutaller.com"
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">{t.newsletterHint}</p>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
