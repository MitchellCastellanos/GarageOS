import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import Link from "next/link";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { getInvoiceById } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { calculateTaxBreakdown, TPS_RATE, TVQ_RATE } from "@/lib/taxes";
import { INVOICE_LANGUAGES } from "@/lib/invoice-i18n";
import { InvoiceActions } from "@/components/invoices/InvoiceActions";
import {
  InvoicePaymentReceipts,
  type PaymentReceiptView,
} from "@/components/invoices/InvoicePaymentReceipts";
import { INVOICE_STATUS_BADGE, invoiceStatusLabel, isInvoicePending } from "@/lib/invoice-status";
import { labelPaymentEntries } from "@/lib/invoice-payments";
import { cashDrawerEntryTypeLabel } from "@/lib/cash-drawer";
import { publicUrlForStoragePath } from "@/lib/storage";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVOICES_DICT } from "@/lib/admin-locale/invoices";
import Decimal from "decimal.js";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [invoice, locale] = await Promise.all([getInvoiceById(id), getAdminLocale()]);
  const t = INVOICES_DICT[locale];
  const ITEM_TYPE_LABEL = t.itemTypes;

  const { tpsAmount, tvqAmount } = calculateTaxBreakdown(
    invoice.subtotal.toString(),
    invoice.taxRate.toString()
  );
  const factor = new Decimal(invoice.taxRate.toString()).div(TPS_RATE + TVQ_RATE);
  const tpsPct = new Decimal(TPS_RATE).times(factor).times(100).toFixed(2);
  const tvqPct = new Decimal(TVQ_RATE).times(factor).times(100).toFixed(2);
  const langLabel =
    INVOICE_LANGUAGES.find((l) => l.value === invoice.language)?.label ?? invoice.language;

  const paymentLabels = labelPaymentEntries(invoice.paymentEntries);
  const linkedCashEntry = invoice.cashDrawerEntries[0] ?? null;

  const paymentModeLabel = invoice.paymentMode
    ? (t.detail.paymentModeLabels[invoice.paymentMode as "CARD" | "CASH" | "MIXED"] ?? null)
    : null;

  const paymentReceipts: PaymentReceiptView[] = invoice.paymentEntries
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => entry.method === "CARD" && entry.receiptPath)
    .map(({ entry, i }) => {
      const fileName = entry.receiptPath!.split("/").pop() ?? t.detail.receiptFallbackName;
      const isImage = /\.(jpe?g|png|webp)$/i.test(fileName);
      return {
        id: entry.id,
        label: `${paymentLabels[i]} · ${formatCurrency(Number(entry.amount))}`,
        url: publicUrlForStoragePath(entry.receiptPath!),
        fileName,
        isImage,
      };
    });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={ADMIN.invoices}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {invoice.invoiceNumber}
              </h1>
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${INVOICE_STATUS_BADGE[invoice.status] ?? "bg-slate-100 text-slate-500"}`}
              >
                {invoiceStatusLabel(invoice.status, locale)}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {t.detail.issuedOn(formatDate(invoice.issuedAt))}
              {invoice.dueAt && ` · ${t.detail.dueOn(formatDate(invoice.dueAt))}`}
              {` · ${t.detail.languageLabel(langLabel)}`}
              {invoice.emailSentAt &&
                ` · ${t.detail.emailSentLabel(formatDate(invoice.emailSentAt), invoice.emailSendCount)}`}
              {invoice.smsSentAt &&
                ` · ${t.detail.smsSentLabel(formatDate(invoice.smsSentAt), invoice.smsSendCount)}`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Edit — solo pendientes */}
          {isInvoicePending(invoice.status) && (
            <Link
              href={adminPath(`/invoices/${invoice.id}/edit`)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">{t.detail.editLabel}</span>
            </Link>
          )}
          {/* PDF download */}
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            download={
              invoice.status === "PAID"
                ? `${invoice.invoiceNumber}${t.detail.downloadFileSuffix}.pdf`
                : `${invoice.invoiceNumber}.pdf`
            }
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t.detail.downloadPdf}</span>
          </a>
          {/* Status transitions con toast */}
          <InvoiceActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            status={invoice.status}
            clientId={invoice.clientId}
            clientEmail={invoice.client.email}
            clientPhone={invoice.client.phone}
            emailSendCount={invoice.emailSendCount}
            smsSendCount={invoice.smsSendCount}
            total={Number(invoice.total)}
            isPaid={invoice.status === "PAID"}
          />
        </div>
      </div>

      {/* Accounting visibility + payment info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          {t.detail.accounting.title}
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">{t.detail.accounting.exportLabel}</dt>
            <dd className="mt-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                {t.detail.accounting.exportIncluded}
              </span>
            </dd>
          </div>
          {paymentModeLabel && (
            <div>
              <dt className="text-slate-500">{t.detail.accounting.paymentMethodLabel}</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{paymentModeLabel}</dd>
            </div>
          )}
          {linkedCashEntry && (
            <div>
              <dt className="text-slate-500">{t.detail.accounting.cashMovementLabel}</dt>
              <dd className="mt-0.5">
                <Link
                  href={ADMIN.caja}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {cashDrawerEntryTypeLabel(linkedCashEntry.type)} ·{" "}
                  {formatCurrency(Number(linkedCashEntry.amount))}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Client info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          {t.detail.clientTitle}
        </p>
        <p className="font-semibold text-slate-900">{formatClientName(invoice.client)}</p>
        {invoice.client.email && (
          <p className="text-sm text-slate-600 mt-1">{invoice.client.email}</p>
        )}
        {invoice.client.phone && (
          <p className="text-sm text-slate-600">{invoice.client.phone}</p>
        )}
        {invoice.client.address && (
          <p className="text-sm text-slate-500 mt-1">{invoice.client.address}</p>
        )}
      </div>

      {/* Vehicles + their line items */}
      {invoice.vehicles.map((iv, vIndex) => (
        <div key={iv.id} className="space-y-4">
          {/* Vehicle */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {invoice.vehicles.length > 1 ? t.detail.vehicleNumbered(vIndex + 1) : t.detail.vehicleTitle}
            </p>
            <p className="font-semibold text-slate-900">
              {iv.vehicle.year} {iv.vehicle.make} {iv.vehicle.model}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              {t.detail.plateLabel}{iv.vehicle.licensePlate}
            </p>
            {(iv.mileageIn || iv.mileageOut) && (
              <div className="flex gap-4 mt-2">
                {iv.mileageIn && (
                  <p className="text-xs text-slate-500">
                    {t.detail.mileageIn(iv.mileageIn.toLocaleString(), iv.vehicle.mileageUnit)}
                  </p>
                )}
                {iv.mileageOut && (
                  <p className="text-xs text-slate-500">
                    {t.detail.mileageOut(iv.mileageOut.toLocaleString(), iv.vehicle.mileageUnit)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{t.detail.servicesTitle}</h2>
            </div>

            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase">
              <span>{t.detail.tableHeaders.description}</span>
              <span>{t.detail.tableHeaders.type}</span>
              <span className="text-right">{t.detail.tableHeaders.qty}</span>
              <span className="text-right">{t.detail.tableHeaders.unitPrice}</span>
              <span className="text-right">{t.detail.tableHeaders.total}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {iv.lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-3 items-center"
                >
                  <p className="text-sm text-slate-900 font-medium">{item.description}</p>
                  {item.warrantyTerm && (
                    <p className="text-xs text-slate-500 mt-0.5">{t.detail.warrantyLabel}{item.warrantyTerm}</p>
                  )}
                  <p className="hidden sm:block text-sm text-slate-500">
                    {ITEM_TYPE_LABEL[item.itemType] ?? item.itemType}
                  </p>
                  <p className="hidden sm:block text-sm text-slate-700 text-right">
                    {Number(item.quantity) % 1 === 0
                      ? Number(item.quantity)
                      : Number(item.quantity).toFixed(2)}
                  </p>
                  <p className="hidden sm:block text-sm text-slate-700 text-right">
                    {formatCurrency(Number(item.unitPrice))}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 text-right">
                    {formatCurrency(Number(item.lineTotal))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Totals + Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {t.detail.notesTitle}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        )}

        {/* Totals */}
        <div className={`bg-white rounded-xl border border-slate-200 p-5 ${!invoice.notes ? "lg:col-start-2" : ""}`}>
          <h2 className="font-semibold text-slate-900 mb-4">{t.detail.summary.title}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.summary.subtotal}</span>
              <span className="text-slate-900">{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.summary.tps(tpsPct)}</span>
              <span className="text-slate-900">{formatCurrency(Number(tpsAmount))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.summary.tvq(tvqPct)}</span>
              <span className="text-slate-900">{formatCurrency(Number(tvqAmount))}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span className="text-xs">{t.detail.summary.totalTaxes}</span>
              <span className="text-xs">{formatCurrency(Number(invoice.taxAmount))}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-3">
              <span className="font-semibold text-slate-900">{t.detail.summary.totalCad}</span>
              <span className="text-xl font-bold text-blue-600">
                {formatCurrency(Number(invoice.total))}
              </span>
            </div>
            {invoice.paidAt && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-emerald-600">
                  {t.detail.paidOn(formatDate(invoice.paidAt))}
                  {invoice.paymentMode && (
                    <>
                      {" "}
                      ·{" "}
                      {t.detail.paymentModeLabels[invoice.paymentMode as "CARD" | "CASH" | "MIXED"]}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {invoice.status === "PAID" && invoice.paymentEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {t.detail.paymentBreakdownTitle}
            </p>
            <ul className="space-y-2">
              {invoice.paymentEntries.map((entry, i) => (
                <li
                  key={entry.id}
                  className="flex justify-between text-sm text-slate-700"
                >
                  <span>{paymentLabels[i]}</span>
                  <span className="font-medium">{formatCurrency(Number(entry.amount))}</span>
                </li>
              ))}
            </ul>
          </div>

          {paymentReceipts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                {t.detail.terminalReceiptsTitle}
              </p>
              <InvoicePaymentReceipts receipts={paymentReceipts} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
