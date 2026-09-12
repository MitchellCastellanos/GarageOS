"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  markQuoteAsSent,
  markQuoteAsAccepted,
  markQuoteAsRejected,
  convertQuoteToInvoice,
  cancelQuote,
  deleteQuote,
} from "@/actions/quotes";
import { QuoteSendDialog } from "@/components/quotes/QuoteSendDialog";
import { adminPath } from "@/lib/routes";
import { FileText, Loader2, Ban, Trash2, Mail, Check, X, ArrowRightLeft } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { QUOTES_DICT } from "@/lib/admin-locale/quotes";

interface QuoteActionsProps {
  quoteId: string;
  quoteNumber: string;
  status: string;
  clientId: string;
  clientEmail?: string | null;
  emailSendCount?: number;
  convertedInvoiceId?: string | null;
}

const EMAILABLE = new Set(["DRAFT", "SENT", "ACCEPTED"]);
const VOIDABLE = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]);
const CONVERTIBLE = new Set(["DRAFT", "SENT", "ACCEPTED"]);

export function QuoteActions({
  quoteId,
  quoteNumber,
  status,
  clientId,
  clientEmail,
  emailSendCount = 0,
  convertedInvoiceId,
}: QuoteActionsProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = QUOTES_DICT[locale];
  const [sentPending, startSent] = useTransition();
  const [acceptPending, startAccept] = useTransition();
  const [rejectPending, startReject] = useTransition();
  const [convertPending, startConvert] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const isAnyPending =
    sentPending || acceptPending || rejectPending || convertPending || cancelPending || deletePending;

  const hasClientEmail = Boolean(clientEmail?.trim());
  const canEmail = EMAILABLE.has(status) && hasClientEmail;
  const isResend = emailSendCount > 0;

  function handleCancel() {
    if (!confirm(t.actions.confirmCancel(quoteNumber))) return;
    startCancel(async () => {
      const result = await cancelQuote(quoteId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.info(t.actions.cancelled);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(t.actions.confirmDelete(quoteNumber))) return;
    startDelete(async () => {
      const result = await deleteQuote(quoteId);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleConvert() {
    if (!confirm(t.actions.confirmConvert(quoteNumber))) return;
    startConvert(async () => {
      const result = await convertQuoteToInvoice(quoteId);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  if (status === "CONVERTED" && convertedInvoiceId) {
    return (
      <Link
        href={adminPath(`/invoices/${convertedInvoiceId}`)}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <ArrowRightLeft className="w-4 h-4" />
        {t.actions.viewInvoice}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      {EMAILABLE.has(status) && (
        <>
          {canEmail ? (
            <QuoteSendDialog
              quoteId={quoteId}
              quoteNumber={quoteNumber}
              clientEmail={clientEmail!.trim()}
              isResend={isResend}
              disabled={isAnyPending}
            />
          ) : (
            <Link
              href={adminPath(`/clients/${clientId}`)}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 text-slate-500 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">{t.actions.noClientEmail}</span>
            </Link>
          )}
        </>
      )}

      {status === "DRAFT" && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={() =>
            startSent(async () => {
              await markQuoteAsSent(quoteId);
              toast.success(t.actions.markedSent);
              router.refresh();
            })
          }
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {sentPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {t.actions.markSentNoEmail}
        </button>
      )}

      {status === "SENT" && (
        <>
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() =>
              startAccept(async () => {
                const result = await markQuoteAsAccepted(quoteId);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success(t.actions.accepted);
                router.refresh();
              })
            }
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {acceptPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t.status.ACCEPTED}
          </button>
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() =>
              startReject(async () => {
                const result = await markQuoteAsRejected(quoteId);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                toast.info(t.actions.rejected);
                router.refresh();
              })
            }
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {rejectPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            {t.status.REJECTED}
          </button>
        </>
      )}

      {CONVERTIBLE.has(status) && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={handleConvert}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {convertPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
          {t.actions.convertToInvoice}
        </button>
      )}

      {VOIDABLE.has(status) && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={handleCancel}
          className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {cancelPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
          {t.actions.cancel}
        </button>
      )}

      <button
        type="button"
        disabled={isAnyPending}
        onClick={handleDelete}
        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
      >
        {deletePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        {t.actions.delete}
      </button>
    </div>
  );
}
