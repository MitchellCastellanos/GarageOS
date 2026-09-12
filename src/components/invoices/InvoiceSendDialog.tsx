"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendInvoiceByEmail, sendInvoiceBySms } from "@/actions/invoices";
import { emailPendingConfirmMessage } from "@/lib/invoice-status";
import { Loader2, Mail, MessageSquare, Send, X } from "lucide-react";
import { FileAttachmentButtons } from "@/components/ui/FileAttachmentButtons";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVOICES_DICT } from "@/lib/admin-locale/invoices";

type SendChannel = "email" | "sms";

interface InvoiceSendDialogProps {
  invoiceId: string;
  invoiceNumber: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  emailSendCount?: number;
  smsSendCount?: number;
  requiresPendingConfirm?: boolean;
  disabled?: boolean;
  /** Si la factura está pagada, comprobantes ya van dentro del PDF único. */
  isPaid?: boolean;
}

const MAX_EMAIL_EXTRAS = 8;

export function InvoiceSendDialog({
  invoiceId,
  invoiceNumber,
  clientEmail,
  clientPhone,
  emailSendCount = 0,
  smsSendCount = 0,
  requiresPendingConfirm = false,
  disabled,
  isPaid = false,
}: InvoiceSendDialogProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INVOICES_DICT[locale].sendDialog;
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  const hasEmail = Boolean(clientEmail?.trim());
  const hasPhone = Boolean(clientPhone?.trim());
  const defaultChannel: SendChannel = hasEmail ? "email" : "sms";
  const [channel, setChannel] = useState<SendChannel>(defaultChannel);

  const anySent = emailSendCount > 0 || smsSendCount > 0;
  const isResend =
    channel === "email" ? emailSendCount > 0 : smsSendCount > 0;

  function addFiles(incoming: File[]) {
    const merged = [...files, ...incoming].slice(0, MAX_EMAIL_EXTRAS);
    if (files.length + incoming.length > MAX_EMAIL_EXTRAS) {
      toast.error(t.maxExtraDocs(MAX_EMAIL_EXTRAS));
    }
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function openDialog() {
    if (requiresPendingConfirm && !confirm(emailPendingConfirmMessage(locale))) {
      return;
    }
    setChannel(defaultChannel);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setFiles([]);
  }

  function handleSend() {
    startTransition(async () => {
      const formData = new FormData();
      files.forEach((f) => formData.append("attachments", f));

      const result =
        channel === "email"
          ? await sendInvoiceByEmail(invoiceId, formData)
          : await sendInvoiceBySms(invoiceId, formData);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      const destination = result.sentTo ?? "";
      const channelLabel = channel === "email" ? t.channelEmail : t.channelSms;
      toast.success(
        result.isResend
          ? t.resentToast(channelLabel, destination)
          : t.sentToast(channelLabel, destination)
      );
      closeDialog();
      router.refresh();
    });
  }

  const destinationLabel =
    channel === "email" ? clientEmail?.trim() : clientPhone?.trim();

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={openDialog}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {anySent ? <Send className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
        {anySent ? t.resendInvoice : t.sendInvoice}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isResend ? t.resendInvoice : t.sendInvoice}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {invoiceNumber}
                  {destinationLabel ? ` → ${destinationLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {hasEmail && hasPhone && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setChannel("email")}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      channel === "email"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    {t.tabEmailLabel}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setChannel("sms")}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      channel === "sms"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {t.tabSmsLabel}
                  </button>
                </div>
              )}

              <p className="text-sm text-slate-600">
                {channel === "email"
                  ? t.emailDescription(isPaid)
                  : t.smsDescription(isPaid, files.length > 0)}
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
                {t.maxDocsHint(MAX_EMAIL_EXTRAS)}
                {channel === "email" ? t.emailAttachHint : t.smsAttachHint}
              </p>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                type="button"
                disabled={pending}
                onClick={closeDialog}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleSend}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : channel === "email" ? (
                  <Mail className="w-4 h-4" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
                {pending ? t.sending : channel === "email" ? t.sendByEmail : t.sendBySms}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
