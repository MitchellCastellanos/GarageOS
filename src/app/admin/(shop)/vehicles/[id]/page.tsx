import { getVehicleById, deleteVehicle } from "@/actions/vehicles";
import { formatDate, formatCurrency } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { INVOICE_STATUS_BADGE, INVOICE_STATUS_LABEL } from "@/lib/invoice-status";
import Link from "next/link";
import { ChevronLeft, Pencil, Car, FileText, Bell, Plus } from "lucide-react";
import { DeleteVehicleButton } from "@/components/clients/DeleteVehicleButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VehicleDetailPage({ params }: Props) {
  const { id } = await params;
  const vehicle = await getVehicleById(id);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/clients/${vehicle.clientId}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {formatClientName(vehicle.client)}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Placa: {vehicle.licensePlate}
            {vehicle.color ? ` · ${vehicle.color}` : ""}
            {vehicle.vin ? ` · VIN: ${vehicle.vin}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/vehicles/${id}/edit`}
            className="flex items-center gap-1.5 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
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
            <h2 className="font-semibold text-slate-900">Historial de servicio</h2>
          </div>
          <Link
            href={`/invoices/new?vehicleId=${id}&clientId=${vehicle.clientId}`}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva factura
          </Link>
        </div>

        {vehicle.invoiceVehicles.length === 0 ? (
          <div className="p-8 text-center">
            <Car className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Sin historial de servicio</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {vehicle.invoiceVehicles.map((iv) => (
              <Link
                key={iv.id}
                href={`/invoices/${iv.invoice.id}`}
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
                  <StatusBadge status={iv.invoice.status} />
                </div>
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
            <h2 className="font-semibold text-slate-900">Recordatorios activos</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {vehicle.reminders.map((reminder) => (
              <div key={reminder.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{reminder.serviceType}</p>
                  <p className="text-xs text-slate-500">
                    {reminder.dueDate ? `Fecha: ${formatDate(reminder.dueDate)}` : ""}
                    {reminder.dueMileage ? ` · ${reminder.dueMileage.toLocaleString()} ${vehicle.mileageUnit}` : ""}
                  </p>
                </div>
                <ReminderStatusBadge status={reminder.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${INVOICE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {INVOICE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ReminderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    SENT: "bg-blue-100 text-blue-700",
    ACKNOWLEDGED: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<string, string> = {
    PENDING: "Pendiente", SENT: "Enviado", ACKNOWLEDGED: "Confirmado",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${styles[status] ?? styles.PENDING}`}>
      {labels[status] ?? status}
    </span>
  );
}
