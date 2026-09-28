"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquare, X } from "lucide-react";
import { composeSmsAction } from "@/actions/inbox";
import { SmsBodyField } from "@/components/inbox/SmsBodyField";
import { adminPath } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INBOX_DICT } from "@/lib/admin-locale/inbox";

/** Nueva conversación SMS — solo se muestra si el taller tiene número dedicado. */
export function ComposeSmsButton() {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INBOX_DICT[locale].sms;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await composeSmsAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toastSent);
      setOpen(false);
      if (result?.threadId) router.push(adminPath(`/inbox/${result.threadId}`));
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        <MessageSquare className="w-4 h-4" /> {t.newSmsButton}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t.dialogTitle}</h2>
                <p className="text-xs text-slate-500 mt-1">{t.dialogSubtitle}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t.phoneLabel}</label>
                <input
                  name="to"
                  type="tel"
                  required
                  placeholder={t.phonePlaceholder}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <SmsBodyField disabled={pending} />
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                {pending ? t.sending : t.send}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
