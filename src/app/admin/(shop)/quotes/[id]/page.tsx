import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import Link from "next/link";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { getQuoteById } from "@/actions/quotes";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { calculateTaxBreakdown, TPS_RATE, TVQ_RATE } from "@/lib/taxes";
import { INVOICE_LANGUAGES } from "@/lib/invoice-i18n";
import { QuoteActions } from "@/components/quotes/QuoteActions";
import Decimal from "decimal.js";
import { getAdminLocale } from "@/lib/admin-locale";
import { QUOTES_DICT } from "@/lib/admin-locale/quotes";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-orange-100 text-orange-700",
  EXPIRED: "bg-red-100 text-red-700",
  CONVERTED: "bg-teal-100 text-teal-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: PageProps) {
  const { id } = await params;
  const quote = await getQuoteById(id);
  const locale = await getAdminLocale();
  const t = QUOTES_DICT[locale];

  const { tpsAmount, tvqAmount } = calculateTaxBreakdown(
    quote.subtotal.toString(),
    quote.taxRate.toString()
  );
  const factor = new Decimal(quote.taxRate.toString()).div(TPS_RATE + TVQ_RATE);
  const tpsPct = new Decimal(TPS_RATE).times(factor).times(100).toFixed(2);
  const tvqPct = new Decimal(TVQ_RATE).times(factor).times(100).toFixed(2);
  const langLabel =
    INVOICE_LANGUAGES.find((l) => l.value === quote.language)?.label ?? quote.language;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={ADMIN.quotes}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{quote.quoteNumber}</h1>
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[quote.status] ?? "bg-slate-100 text-slate-500"}`}
              >
                {t.status[quote.status as keyof typeof t.status] ?? quote.status}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {t.detail.issuedOn(formatDate(quote.issuedAt))}
              {quote.validUntil && ` · ${t.detail.validUntil(formatDate(quote.validUntil))}`}
              {` · ${t.detail.languageLabel(langLabel)}`}
              {quote.emailSentAt &&
                ` · ${t.detail.emailSent(formatDate(quote.emailSentAt))}${quote.emailSendCount > 1 ? ` ${t.detail.emailSentCount(quote.emailSendCount)}` : ""}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {quote.status === "DRAFT" && (
            <Link
              href={adminPath(`/quotes/${quote.id}/edit`)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">{t.detail.editButton}</span>
            </Link>
          )}
          <a
            href={`/api/quotes/${quote.id}/pdf`}
            download={`${quote.quoteNumber}.pdf`}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t.detail.downloadPdf}</span>
          </a>
          <QuoteActions
            quoteId={quote.id}
            quoteNumber={quote.quoteNumber}
            status={quote.status}
            clientId={quote.clientId}
            clientEmail={quote.client.email}
            emailSendCount={quote.emailSendCount}
            convertedInvoiceId={quote.convertedInvoiceId}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          {t.detail.client}
        </p>
        <p className="font-semibold text-slate-900">{formatClientName(quote.client)}</p>
        {quote.client.email && (
          <p className="text-sm text-slate-600 mt-1">{quote.client.email}</p>
        )}
        {quote.client.phone && (
          <p className="text-sm text-slate-600">{quote.client.phone}</p>
        )}
      </div>

      {quote.vehicles.map((qv, vIndex) => (
        <div key={qv.id} className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {quote.vehicles.length > 1 ? t.detail.vehicleN(vIndex + 1) : t.detail.vehicle}
            </p>
            <p className="font-semibold text-slate-900">
              {qv.vehicle.year} {qv.vehicle.make} {qv.vehicle.model}
            </p>
            <p className="text-sm text-slate-600 mt-1">{t.detail.plate(qv.vehicle.licensePlate)}</p>
            {(qv.mileageIn || qv.mileageOut) && (
              <div className="flex gap-4 mt-2">
                {qv.mileageIn && (
                  <p className="text-xs text-slate-500">
                    {t.detail.mileageIn(qv.mileageIn.toLocaleString(), qv.vehicle.mileageUnit)}
                  </p>
                )}
                {qv.mileageOut && (
                  <p className="text-xs text-slate-500">
                    {t.detail.mileageOut(qv.mileageOut.toLocaleString(), qv.vehicle.mileageUnit)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{t.detail.lineItemsTitle}</h2>
            </div>

            <div className="hidden sm:grid grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase">
              <span>{t.detail.colDescription}</span>
              <span>{t.detail.colType}</span>
              <span className="text-right">{t.detail.colQty}</span>
              <span className="text-right">{t.detail.colUnitPrice}</span>
              <span className="text-right">{t.detail.colTotal}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {qv.lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-3 items-center"
                >
                  <p className="text-sm text-slate-900 font-medium">{item.description}</p>
                  <p className="hidden sm:block text-sm text-slate-500">
                    {t.itemType[item.itemType as keyof typeof t.itemType] ?? item.itemType}
                  </p>
                  <p className="hidden sm:block text-sm text-slate-700 text-right">
                    {Number(item.quantity)}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {quote.notes && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {t.detail.notes}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {quote.notes}
            </p>
          </div>
        )}

        <div className={`bg-white rounded-xl border border-slate-200 p-5 ${!quote.notes ? "lg:col-start-2" : ""}`}>
          <h2 className="font-semibold text-slate-900 mb-4">{t.detail.summary}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.subtotal}</span>
              <span className="text-slate-900">{formatCurrency(Number(quote.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.gstLabel(tpsPct)}</span>
              <span className="text-slate-900">{formatCurrency(Number(tpsAmount))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t.detail.qstLabel(tvqPct)}</span>
              <span className="text-slate-900">{formatCurrency(Number(tvqAmount))}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-3">
              <span className="font-semibold text-slate-900">{t.detail.totalCad}</span>
              <span className="text-xl font-bold text-blue-600">
                {formatCurrency(Number(quote.total))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
