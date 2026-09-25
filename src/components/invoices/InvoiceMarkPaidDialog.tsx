"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { markInvoiceAsPaid } from "@/actions/invoices";
import {
  labelPaymentEntries,
  paymentTargetAmount,
  type InvoicePaymentMode,
  type PaymentEntryInput,
} from "@/lib/invoice-payments";
import { formatCurrency } from "@/lib/utils";
import { FileAttachmentButtons } from "@/components/ui/FileAttachmentButtons";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVOICES_DICT } from "@/lib/admin-locale/invoices";
import { Loader2, X, CreditCard, Banknote, Split, Trash2 } from "lucide-react";

interface InvoiceMarkPaidDialogProps {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  disabled?: boolean;
}

type LocalEntry = PaymentEntryInput & {
  id: string;
  receiptFile?: File;
  // Para cobros con tarjeta: si el usuario ya decidió subir o no el recibo de
  // terminal. undefined = aún no responde la pregunta. El recibo es opcional.
  receiptChoice?: "yes" | "no";
};

export function InvoiceMarkPaidDialog({
  invoiceId,
  invoiceNumber,
  total,
  disabled,
}: InvoiceMarkPaidDialogProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = INVOICES_DICT[locale].markPaidDialog;
  const MODES: {
    value: InvoicePaymentMode;
    label: string;
    hint: string;
    icon: typeof CreditCard;
  }[] = [
    { value: "CARD", label: t.modes.card.label, hint: t.modes.card.hint, icon: CreditCard },
    { value: "CASH", label: t.modes.cash.label, hint: t.modes.cash.hint, icon: Banknote },
    { value: "MIXED", label: t.modes.mixed.label, hint: t.modes.mixed.hint, icon: Split },
  ];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InvoicePaymentMode>("CARD");
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [draftMethod, setDraftMethod] = useState<"CARD" | "CASH">("CARD");
  const [draftAmount, setDraftAmount] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  const target = useMemo(() => paymentTargetAmount(total), [total]);

  const paidSoFar = useMemo(
    () => entries.reduce((s, e) => s.plus(e.amount), new Decimal(0)),
    [entries]
  );

  const remaining = target.minus(paidSoFar);

  const entryLabels = useMemo(
    () => labelPaymentEntries(entries.map((e) => ({ method: e.method }))),
    [entries]
  );

  async function uploadPaymentFile(
    file: File,
    kind: "receipt" | "extra"
  ): Promise<string | null> {
    const uploadData = new FormData();
    uploadData.append("file", file);
    uploadData.append("kind", kind);
    const uploadRes = await fetch(`/api/invoices/${invoiceId}/payment-receipt`, {
      method: "POST",
      body: uploadData,
    });
    const uploadJson = (await uploadRes.json()) as {
      storagePath?: string;
      error?: string;
    };
    if (!uploadRes.ok || !uploadJson.storagePath) {
      toast.error(uploadJson.error ?? t.uploadError);
      return null;
    }
    return uploadJson.storagePath;
  }

  function resetDraftForMode(nextMode: InvoicePaymentMode) {
    setMode(nextMode);
    setEntries([]);
    setExtraFiles([]);
    setDraftMethod(nextMode === "CASH" ? "CASH" : "CARD");
    setDraftAmount("");
  }

  function addEntry() {
    const amount = parseFloat(draftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t.invalidAmount);
      return;
    }
    const method =
      mode === "CASH" ? "CASH" : mode === "CARD" ? "CARD" : draftMethod;

    const id = `${Date.now()}-${Math.random()}`;
    setEntries((prev) => [
      ...prev,
      {
        id,
        method,
        amount,
        receiptIndex: method === "CARD" ? prev.filter((e) => e.method === "CARD").length : undefined,
      },
    ]);
    setDraftAmount("");
  }

  function attachReceipt(entryId: string, files: File[]) {
    const file = files[0];
    if (!file) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, receiptFile: file, receiptChoice: "yes" } : e
      )
    );
  }

  // Responde la pregunta "¿deseas subir el recibo de la terminal?" por cada
  // cobro con tarjeta. "no" continúa sin recibo; "yes" muestra los botones de
  // subida. Al elegir "no" se descarta cualquier archivo ya adjuntado.
  function setReceiptChoice(entryId: string, choice: "yes" | "no") {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              receiptChoice: choice,
              receiptFile: choice === "no" ? undefined : e.receiptFile,
            }
          : e
      )
    );
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleSubmit() {
    if (!remaining.isZero()) {
      toast.error(t.missingAmount(formatCurrency(remaining.toNumber())));
      return;
    }

    // El comprobante de terminal es opcional — no bloqueamos si falta.

    startTransition(async () => {
      const payload: PaymentEntryInput[] = [];
      const cardUploads = entries.filter((e) => e.method === "CARD" && e.receiptFile);
      if (cardUploads.length > 0) {
        toast.info(t.uploadingReceipts);
      }

      const extraPaths: string[] = [];
      for (const file of extraFiles) {
        const path = await uploadPaymentFile(file, "extra");
        if (!path) return;
        extraPaths.push(path);
      }

      for (const e of entries) {
        let receiptPath: string | undefined;
        if (e.method === "CARD" && e.receiptFile) {
          const path = await uploadPaymentFile(e.receiptFile, "receipt");
          if (!path) return;
          receiptPath = path;
        }
        payload.push({
          method: e.method,
          amount: e.amount,
          receiptPath,
        });
      }

      const formData = new FormData();
      formData.append("paymentMode", mode);
      formData.append("entries", JSON.stringify(payload));
      formData.append("extraPaths", JSON.stringify(extraPaths));

      const result = await markInvoiceAsPaid(invoiceId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.markedPaidToast);
      setOpen(false);
      setEntries([]);
      setExtraFiles([]);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null}
        {t.button}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t.dialogTitle}</h2>
                <p className="text-sm text-slate-500 mt-1">{invoiceNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEntries([]);
                  setExtraFiles([]);
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                {t.pdfNote}
              </p>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">{t.totalToCover}</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(target.toNumber())}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-600">{t.registered}</span>
                  <span className="text-emerald-700 font-medium">
                    {formatCurrency(paidSoFar.toNumber())}
                  </span>
                </div>
                <div className="flex justify-between mt-1 border-t border-slate-200 pt-2">
                  <span className="font-medium text-slate-800">{t.missing}</span>
                  <span
                    className={
                      remaining.isZero()
                        ? "font-bold text-emerald-600"
                        : "font-bold text-amber-700"
                    }
                  >
                    {formatCurrency(Math.max(0, remaining.toNumber()))}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                  {t.paymentMethodTitle}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => resetDraftForMode(m.value)}
                        className={[
                          "text-left p-3 rounded-lg border text-sm transition-colors",
                          active
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 hover:border-slate-300",
                        ].join(" ")}
                      >
                        <Icon
                          className={`w-4 h-4 mb-1 ${active ? "text-emerald-600" : "text-slate-400"}`}
                        />
                        <p className="font-medium text-slate-900">{m.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{m.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode === "MIXED" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftMethod("CARD")}
                    className={`flex-1 py-2 rounded-lg text-sm border ${
                      draftMethod === "CARD"
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {t.modes.card.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftMethod("CASH")}
                    className={`flex-1 py-2 rounded-lg text-sm border ${
                      draftMethod === "CASH"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {t.modes.cash.label}
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    placeholder={t.amountPlaceholder}
                    className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={remaining.lte(0)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                >
                  {t.addButton}
                </button>
              </div>

              {entries.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {entries.map((e, i) => (
                    <li key={e.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {entryLabels[i]} · {formatCurrency(e.amount)}
                          </p>
                          {e.method === "CARD" && (
                            <p className="text-xs text-slate-500">
                              {e.receiptFile
                                ? t.receiptLabel(e.receiptFile.name)
                                : e.receiptChoice === "no"
                                ? t.noReceipt
                                : t.receiptOptional}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEntry(e.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Pago con tarjeta: preguntamos si desea subir el recibo
                          de terminal. El recibo es opcional — puede continuar
                          sin subirlo. */}
                      {e.method === "CARD" && !e.receiptFile && (
                        <div className="space-y-2">
                          {e.receiptChoice === undefined ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                              <p className="text-sm text-slate-700">
                                {t.askUploadReceipt}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReceiptChoice(e.id, "yes")}
                                  className="flex-1 py-1.5 rounded-lg text-sm border border-blue-500 bg-blue-50 text-blue-800 font-medium hover:bg-blue-100"
                                >
                                  {t.yesUpload}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReceiptChoice(e.id, "no")}
                                  className="flex-1 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-600 hover:bg-slate-100"
                                >
                                  {t.noContinue}
                                </button>
                              </div>
                            </div>
                          ) : e.receiptChoice === "yes" ? (
                            <FileAttachmentButtons
                              onFilesSelected={(files) => attachReceipt(e.id, files)}
                              multiple={false}
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              uploadLabel={t.uploadReceiptLabel}
                              cameraLabel={t.cameraReceiptLabel}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReceiptChoice(e.id, "yes")}
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                              {t.uploadReceiptLink}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">
                  {t.extraDocsTitle}
                </p>
                <p className="text-xs text-slate-500">
                  {t.extraDocsHint}
                </p>
                <FileAttachmentButtons
                  disabled={pending}
                  onFilesSelected={(files) =>
                    setExtraFiles((prev) => [...prev, ...files].slice(0, 8))
                  }
                />
                {extraFiles.length > 0 && (
                  <ul className="text-xs text-slate-600 space-y-1">
                    {extraFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          className="text-red-500 shrink-0"
                          onClick={() =>
                            setExtraFiles((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          {t.remove}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setEntries([]);
                  setExtraFiles([]);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={pending || !remaining.isZero() || entries.length === 0}
                onClick={handleSubmit}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.confirmPayment}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
