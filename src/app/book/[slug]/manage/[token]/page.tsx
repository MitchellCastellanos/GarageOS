import { notFound } from "next/navigation";
import {
  canClientCancel,
  canClientConfirm,
  getShopAndAppointmentByToken,
  isAppointmentManageable,
} from "@/lib/appointment-manage";
import { LocaleProvider } from "@/components/booking/LocaleProvider";
import { ManageAppointmentView } from "@/components/booking/ManageAppointmentView";
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

  return (
    <LocaleProvider>
      <ManageAppointmentView
        slug={slug}
        token={token}
        shop={{ name: shop.name, logoUrl: shop.logoUrl, phone: shop.phone }}
        manageable={manageable}
        canConfirm={canConfirm}
        canCancel={canCancel}
        clientName={formatClientName(appointment.client)}
        title={appointment.title}
        startsAtFormatted={formatShopDateTime(appointment.startsAt, shop.timezone)}
        status={appointment.status}
        vehicleLabel={vehicleLabel}
        mechanicName={appointment.mechanic?.name ?? null}
        clientHasEmail={Boolean(appointment.client.email)}
        notifyChannel={appointment.client.notifyChannel}
      />
    </LocaleProvider>
  );
}
