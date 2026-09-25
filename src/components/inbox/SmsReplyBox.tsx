"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, MessageSquare, AlertTriangle } from "lucide-react";
import { archiveThreadAction, replyToThreadAction } from "@/actions/inbox";
import { SmsBodyField } from "@/components/inbox/SmsBodyField";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INBOX_DICT } from "@/lib/admin-locale/inbox";

interface SmsReplyBoxProps {
  threadId: string;
  dedicated: boolean;
  optedOut: boolean;
}

export function SmsReplyBox({ threadId, dedicated, optedOut }: SmsReplyBoxProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INBOX_DICT[locale].sms;
  const tReply = INBOX_DICT[locale].reply;
  const [pending, startTransition] = useTransition();
  const [archiving, startArchive] = useTransition();

  function handleArchive() {
    startArchive(async () => {
      await archiveThreadAction(threadId);
      toast.success(tReply.toastArchived);
      router.refresh();
    });
  }
  const [resetKey, setResetKey] = useState(0);

  const blockedReason = !dedicated ? t.noDedicatedNumber : optedOut ? t.optedOut : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await replyToThreadAction(threadId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toastSent);
      setResetKey((k) => k + 1);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-500" /> {t.replyTitle}
        </h3>
        <button
          type="button"
          onClick={handleArchive}
          disabled={archiving}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
          {tReply.archiveButton}
        </button>
      </div>
      {blockedReason ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {blockedReason}
        </p>
      ) : (
        <>
          <SmsBodyField disabled={pending} resetKey={resetKey} />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {pending ? t.sending : t.send}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
