import { db } from "@/lib/db";
import { getShopBySlug } from "@/lib/booking-slots";

/** Estados en los que el cliente puede confirmar o cancelar en línea. */
const MANAGEABLE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

export async function getShopAndAppointmentByToken(slug: string, token: string) {
  const shop = await getShopBySlug(slug);
  if (!shop) return null;

  const appointment = await db.appointment.findFirst({
    where: { shopId: shop.id, manageToken: token },
    include: { client: true, vehicle: true, mechanic: { select: { id: true, name: true } } },
  });
  if (!appointment) return null;

  return { shop, appointment };
}

function isFutureAppointment(appointment: { startsAt: Date }): boolean {
  return appointment.startsAt.getTime() > Date.now();
}

function hasManageableStatus(appointment: { status: string }): boolean {
  return (MANAGEABLE_STATUSES as readonly string[]).includes(appointment.status);
}

/** El cliente puede ver acciones (confirmar/cancelar) en la página del link. */
export function isAppointmentManageable(appointment: { status: string; startsAt: Date }): boolean {
  return hasManageableStatus(appointment) && isFutureAppointment(appointment);
}

/** Confirmar solo aplica a citas programadas (p. ej. creadas por el admin). */
export function canClientConfirm(appointment: { status: string; startsAt: Date }): boolean {
  return appointment.status === "SCHEDULED" && isFutureAppointment(appointment);
}

/** Cancelar aplica a citas activas futuras. */
export function canClientCancel(appointment: { status: string; startsAt: Date }): boolean {
  return isAppointmentManageable(appointment);
}

/** @deprecated Usar isAppointmentManageable */
export const isAppointmentEditable = isAppointmentManageable;
