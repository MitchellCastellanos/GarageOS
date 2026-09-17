import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { getWorkOrderById } from "@/actions/work-orders";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { WorkOrderActions } from "@/components/work-orders/WorkOrderActions";
import Decimal from "decimal.js";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  INVOICED: "bg-teal-100 text-teal-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

const EDITABLE_STATUSES = new Set(["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"]);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const workOrder = await getWorkOrderById(id);
  const locale = await getAdminLocale();
  const t = WORK_ORDERS_DICT[locale];

  const subtotal = workOrder.lines.reduce(
    (sum, item) => sum.plus(new Decimal(item.quantity.toString()).times(item.unitPrice.toString())),
    new Decimal(0)
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={ADMIN.workOrders}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{workOrder.orderNumber}</h1>
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[workOrder.status] ?? "bg-slate-100 text-slate-500"}`}
              >
                {t.status[workOrder.status as keyof typeof t.status] ?? workOrder.status}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {t.detail.openedOn(formatDate(workOrder.createdAt))}
              {workOrder.quote && ` · ${t.detail.fromQuote(workOrder.quote.quoteNumber)}`}
              {workOrder.invoice && ` · ${t.detail.linkedInvoice(workOrder.invoice.invoiceNumber)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {EDITABLE_STATUSES.has(workOrder.status) && (
            <Link
              href={adminPath(`/work-orders/${workOrder.id}/edit`)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">{t.detail.editButton}</span>
            </Link>
          )}
          <WorkOrderActions
            workOrderId={workOrder.id}
            orderNumber={workOrder.orderNumber}
            status={workOrder.status}
            invoiceId={workOrder.invoiceId}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t.detail.client}</p>
          <p className="font-semibold text-slate-900">{formatClientName(workOrder.client)}</p>
          {workOrder.client.email && <p className="text-sm text-slate-600 mt-1">{workOrder.client.email}</p>}
          {workOrder.client.phone && <p className="text-sm text-slate-600">{workOrder.client.phone}</p>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t.detail.vehicle}</p>
          <p className="font-semibold text-slate-900">
            {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
          </p>
          <p className="text-sm text-slate-600 mt-1">{t.detail.plate(workOrder.vehicle.licensePlate)}</p>
          {(workOrder.mileageIn || workOrder.mileageOut) && (
            <div className="flex gap-4 mt-2">
              {workOrder.mileageIn && (
                <p className="text-xs text-slate-500">
                  {t.detail.mileageIn(workOrder.mileageIn.toLocaleString(), workOrder.vehicle.mileageUnit)}
                </p>
              )}
              {workOrder.mileageOut && (
                <p className="text-xs text-slate-500">
                  {t.detail.mileageOut(workOrder.mileageOut.toLocaleString(), workOrder.vehicle.mileageUnit)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t.detail.mechanic}</p>
        <p className="text-sm text-slate-900">{workOrder.mechanic?.name ?? t.detail.unassigned}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t.detail.concernTitle}</p>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{workOrder.concern}</p>
      </div>

      {workOrder.diagnosis && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t.detail.diagnosisTitle}</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{workOrder.diagnosis}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{t.detail.lineItemsTitle}</h2>
        </div>

        {workOrder.lines.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400 text-center">{t.detail.noLineItems}</p>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase">
              <span>{t.detail.colDescription}</span>
              <span>{t.detail.colType}</span>
              <span className="text-right">{t.detail.colQty}</span>
              <span className="text-right">{t.detail.colUnitPrice}</span>
              <span className="text-right">{t.detail.colTotal}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {workOrder.lines.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_80px_110px_110px] gap-3 px-5 py-3 items-center"
                >
                  <p className="text-sm text-slate-900 font-medium">{item.description}</p>
                  <p className="hidden sm:block text-sm text-slate-500">
                    {t.itemTypes[item.itemType as keyof typeof t.itemTypes] ?? item.itemType}
                  </p>
                  <p className="hidden sm:block text-sm text-slate-700 text-right">{Number(item.quantity)}</p>
                  <p className="hidden sm:block text-sm text-slate-700 text-right">
                    {formatCurrency(Number(item.unitPrice))}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 text-right">
                    {formatCurrency(Number(item.quantity) * Number(item.unitPrice))}
                  </p>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <p className="text-sm font-semibold text-slate-900">
                {t.detail.subtotal}: {formatCurrency(Number(subtotal))}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
