"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendQuoteBySms } from "@/actions/quotes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { QUOTES_DICT } from "@/lib/admin-locale/quotes";

export function QuoteSmsButton({ quoteId, phone, isResend, disabled }: { quoteId: string; phone: string; isResend: boolean; disabled?: boolean }) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = QUOTES_DICT[locale];
  const [pending, startTransition] = useTransition();

  function handleSend() {
    startTransition(async () => {
      const result = await sendQuoteBySms(quoteId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isResend ? t.actions.smsResent(phone) : t.actions.smsSent(phone));
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={handleSend}
      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
      {isResend ? t.actions.smsResendButton : t.actions.smsSendButton}
    </button>
  );
}
