import { getVehicleById, deleteVehicle } from "@/actions/vehicles";
import { adminPath } from "@/lib/routes";
import { formatDate, formatCurrency } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { INVOICE_STATUS_BADGE, invoiceStatusLabel } from "@/lib/invoice-status";
import Link from "next/link";
import { ChevronLeft, Pencil, Car, FileText, Bell, Plus, Wrench } from "lucide-react";
import { DeleteVehicleButton } from "@/components/clients/DeleteVehicleButton";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { CLIENTS_DICT, type ClientsDictionary } from "@/lib/admin-locale/clients";
import { WORK_ORDERS_DICT, type WorkOrdersDictionary } from "@/lib/admin-locale/work-orders";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VehicleDetailPage({ params }: Props) {
  const { id } = await params;
  const [vehicle, locale] = await Promise.all([getVehicleById(id), getAdminLocale()]);
  const t = CLIENTS_DICT[locale];
  const woT = WORK_ORDERS_DICT[locale];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={adminPath(`/clients/${vehicle.clientId}`)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {formatClientName(vehicle.client)}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {t.common.plateLabel} {vehicle.licensePlate}
            {vehicle.color ? ` · ${vehicle.color}` : ""}
            {vehicle.vin ? ` · VIN: ${vehicle.vin}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={adminPath(`/vehicles/${id}/edit`)}
            className="flex items-center gap-1.5 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t.detail.edit}
          </Link>
          <DeleteVehicleButton
            vehicleId={id}
            clientId={vehicle.clientId}
            vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          />
        </div>
      </div>

      {/* Historial de servicio (facturas) */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">{t.vehicleDetail.historyTitle}</h2>
          </div>
          <Link
            href={adminPath(`/invoices/new?vehicleId=${id}&clientId=${vehicle.clientId}`)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.vehicleDetail.newInvoice}
          </Link>
        </div>

        {vehicle.invoiceVehicles.length === 0 ? (
          <div className="p-8 text-center">
            <Car className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">{t.vehicleDetail.noHistory}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {vehicle.invoiceVehicles.map((iv) => (
              <Link
                key={iv.id}
                href={adminPath(`/invoices/${iv.invoice.id}`)}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {iv.invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(iv.invoice.issuedAt)}
                    {iv.mileageIn ? ` · ${iv.mileageIn.toLocaleString()} ${vehicle.mileageUnit}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">
                    {formatCurrency(Number(iv.invoice.total))}
                  </p>
                  <StatusBadge status={iv.invoice.status} locale={locale} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Órdenes de trabajo */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">{t.vehicleDetail.workOrdersTitle}</h2>
          </div>
          <Link
            href={adminPath(`/work-orders/new?vehicleId=${id}&clientId=${vehicle.clientId}`)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.vehicleDetail.newWorkOrder}
          </Link>
        </div>

        {vehicle.workOrders.length === 0 ? (
          <div className="p-8 text-center">
            <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">{t.vehicleDetail.noWorkOrders}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {vehicle.workOrders.map((wo) => (
              <Link
                key={wo.id}
                href={adminPath(`/work-orders/${wo.id}`)}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{wo.orderNumber}</p>
                  <p className="text-xs text-slate-500">{formatDate(wo.createdAt)}</p>
                </div>
                <WorkOrderStatusBadge status={wo.status} t={woT} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recordatorios */}
      {vehicle.reminders.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">{t.vehicleDetail.remindersTitle}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {vehicle.reminders.map((reminder) => (
              <div key={reminder.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{reminder.serviceType}</p>
                  <p className="text-xs text-slate-500">
                    {reminder.dueDate ? `${t.common.dateLabel} ${formatDate(reminder.dueDate)}` : ""}
                    {reminder.dueMileage ? ` · ${reminder.dueMileage.toLocaleString()} ${vehicle.mileageUnit}` : ""}
                  </p>
                </div>
                <ReminderStatusBadge status={reminder.status} t={t} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, locale }: { status: string; locale: AdminLocale }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${INVOICE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {invoiceStatusLabel(status, locale)}
    </span>
  );
}

const WORK_ORDER_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  INVOICED: "bg-teal-100 text-teal-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

function WorkOrderStatusBadge({ status, t }: { status: string; t: WorkOrdersDictionary }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${WORK_ORDER_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {t.status[status as keyof typeof t.status] ?? status}
    </span>
  );
}

function ReminderStatusBadge({ status, t }: { status: string; t: ClientsDictionary }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    SENT: "bg-blue-100 text-blue-700",
    ACKNOWLEDGED: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<string, string> = {
    PENDING: t.vehicleDetail.reminderStatus.pending,
    SENT: t.vehicleDetail.reminderStatus.sent,
    ACKNOWLEDGED: t.vehicleDetail.reminderStatus.acknowledged,
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${styles[status] ?? styles.PENDING}`}>
      {labels[status] ?? status}
    </span>
  );
}
