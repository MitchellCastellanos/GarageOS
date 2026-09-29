"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, X } from "lucide-react";
import { refundInvoice } from "@/actions/invoices";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ACCOUNTING_DICT } from "@/lib/admin-locale/accounting";
import { PAYMENT_METHODS } from "@/domain/fiscal";
import { formatCurrency } from "@/lib/utils";

export function InvoiceRefundDialog({ invoiceId, invoiceNumber, balance, disabled }: { invoiceId: string; invoiceNumber: string; balance: number; disabled?: boolean }) {
  const t = ACCOUNTING_DICT[useAdminLocale()];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CARD");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const field = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm";

  function submit() {
    start(async () => {
      const res = await refundInvoice(invoiceId, { amount, method, reason });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t.refund.done);
      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    });
  }

  if (balance <= 0) return null;
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm font-medium">
        <RotateCcw className="w-3.5 h-3.5" />
        {t.refund.button}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t.refund.title}</h2>
                <p className="text-sm text-slate-500 mt-1">{invoiceNumber} · {t.refund.balance(formatCurrency(balance))}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.refund.cancel} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-medium text-slate-600 space-y-1">
                <span>{t.refund.amount}</span>
                <div className="flex gap-2">
                  <input type="number" min="0.01" step="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
                  <button type="button" onClick={() => setAmount(balance.toFixed(2))} className="px-3 text-xs border border-slate-200 rounded-lg whitespace-nowrap hover:bg-slate-50">{t.refund.fullBalance}</button>
                </div>
              </label>
              <label className="block text-xs font-medium text-slate-600 space-y-1">
                <span>{t.refund.method}</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={field}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
                </select>
              </label>
              {method === "CASH" && <p className="text-xs text-slate-500">{t.refund.cashNote}</p>}
              <label className="block text-xs font-medium text-slate-600 space-y-1">
                <span>{t.refund.reason}</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder={t.refund.reasonPlaceholder} className={field} />
              </label>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">{t.refund.cancel}</button>
              <button type="button" disabled={pending || !amount || reason.trim().length < 3} onClick={submit} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.refund.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
