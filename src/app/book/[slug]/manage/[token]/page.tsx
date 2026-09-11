import { notFound } from "next/navigation";
import Image from "next/image";
import {
  canClientCancel,
  canClientConfirm,
  getShopAndAppointmentByToken,
  isAppointmentManageable,
} from "@/lib/appointment-manage";
import { ClientAppointmentActions } from "@/components/booking/ClientAppointmentActions";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/appointment-status";
import { formatClientName } from "@/lib/client-name";
import { formatShopDateTime } from "@/lib/shop-timezone";

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

export default async function ManageAppointmentPage({ params }: PageProps) {
  const { slug, token } = await params;
  const found = await getShopAndAppointmentByToken(slug, token);

  if (!found) notFound();

  const { shop, appointment } = found;
  const manageable = isAppointmentManageable(appointment);
  const canConfirm = canClientConfirm(appointment);
  const canCancel = canClientCancel(appointment);

  const vehicleLabel = appointment.vehicle
    ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model} — ${appointment.vehicle.licensePlate}`
    : null;

  const statusLabel =
    APPOINTMENT_STATUS_LABEL[appointment.status as keyof typeof APPOINTMENT_STATUS_LABEL] ??
    appointment.status;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <header className="text-center mb-8">
          {shop.logoUrl && (
            <div className="flex justify-center mb-4">
              <Image
                src={shop.logoUrl}
                alt={shop.name}
                width={80}
                height={80}
                className="object-contain"
                unoptimized
              />
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{shop.name}</h1>
          <p className="text-slate-500 mt-1">
            {manageable ? "Confirma o cancela tu cita" : "Detalles de tu cita"}
          </p>
        </header>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {isAppointmentManageable(appointment) ? (
            <ClientAppointmentActions
              slug={slug}
              token={token}
              shop={{ phone: shop.phone }}
              clientName={formatClientName(appointment.client)}
              title={appointment.title}
              startsAtFormatted={formatShopDateTime(appointment.startsAt, shop.timezone)}
              status={appointment.status}
              vehicleLabel={vehicleLabel}
              mechanicName={appointment.mechanic?.name ?? null}
              canConfirm={canConfirm}
              canCancel={canCancel}
            />
          ) : (
            <div className="space-y-4 text-center py-6">
              <p className="text-slate-700">
                Hola {formatClientName(appointment.client)}, esta cita ya no admite cambios en
                línea.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-left space-y-1">
                <p className="font-medium text-slate-900">{appointment.title}</p>
                <p className="text-slate-600">
                  {formatShopDateTime(appointment.startsAt, shop.timezone)}
                </p>
                <p className="text-slate-500">Estado: {statusLabel}</p>
              </div>
              {shop.phone && (
                <p className="text-sm text-slate-500">
                  Para consultas, llama al{" "}
                  <a href={`tel:${shop.phone}`} className="text-teal-700 font-medium">
                    {shop.phone}
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">{shop.name}</p>
      </div>
    </div>
  );
}
