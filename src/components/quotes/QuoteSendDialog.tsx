"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendQuoteByEmail } from "@/actions/quotes";
import { Loader2, Mail, Send, X } from "lucide-react";
import { FileAttachmentButtons } from "@/components/ui/FileAttachmentButtons";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { QUOTES_DICT } from "@/lib/admin-locale/quotes";

interface QuoteSendDialogProps {
  quoteId: string;
  quoteNumber: string;
  clientEmail: string;
  isResend: boolean;
  disabled?: boolean;
}

export function QuoteSendDialog({
  quoteId,
  quoteNumber,
  clientEmail,
  isResend,
  disabled,
}: QuoteSendDialogProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = QUOTES_DICT[locale];
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  function addFiles(incoming: File[]) {
    const merged = [...files, ...incoming].slice(0, 5);
    if (files.length + incoming.length > 5) {
      toast.error(t.sendDialog.maxAttachments);
    }
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSend() {
    startTransition(async () => {
      const formData = new FormData();
      files.forEach((f) => formData.append("attachments", f));

      const result = await sendQuoteByEmail(quoteId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.isResend
          ? t.sendDialog.resentTo(clientEmail)
          : t.sendDialog.sentTo(clientEmail)
      );
      setOpen(false);
      setFiles([]);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {isResend ? <Send className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
        {isResend ? t.sendDialog.resend : t.sendDialog.send}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isResend ? t.sendDialog.resendTitle : t.sendDialog.sendTitle}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {quoteNumber} → {clientEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setFiles([]);
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                {t.sendDialog.attachInfo}
              </p>

              <div className="flex flex-wrap gap-2">
                <FileAttachmentButtons
                  disabled={pending}
                  onFilesSelected={addFiles}
                />
              </div>

              {files.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-700">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-slate-400 hover:text-red-500 ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-slate-400">
                {t.sendDialog.attachmentsHint}
              </p>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setFiles([]);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                {t.sendDialog.close}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleSend}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {pending ? t.sendDialog.sending : t.sendDialog.sendNow}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
