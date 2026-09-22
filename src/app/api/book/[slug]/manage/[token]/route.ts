import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import {
  canClientCancel,
  canClientConfirm,
  getShopAndAppointmentByToken,
} from "@/lib/appointment-manage";
import { formatClientName } from "@/lib/client-name";
import { CLIENT_ACTOR, recordAppointmentEvent } from "@/lib/appointment-events";
import { alertStaffClientCancelledAppointment } from "@/lib/staff-alerts";

/** El cliente confirma su asistencia (SCHEDULED → CONFIRMED). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  const found = await getShopAndAppointmentByToken(slug, token);

  if (!found) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const { shop, appointment } = found;

  if (!canClientConfirm(appointment)) {
    return NextResponse.json(
      { error: "Esta cita no se puede confirmar" },
      { status: 409 }
    );
  }

  await db.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "CONFIRMED",
      confirmationSentAt: new Date(),
    },
  });

  await recordAppointmentEvent({
    appointment: { ...appointment, status: "CONFIRMED", shop },
    type: "CONFIRMED_BY_CLIENT",
    actor: { ...CLIENT_ACTOR, name: formatClientName(appointment.client) },
    changes: { status: { from: appointment.status, to: "CONFIRMED" } },
  });

  revalidatePath(ADMIN.appointments);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  const found = await getShopAndAppointmentByToken(slug, token);

  if (!found) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const { shop, appointment } = found;

  if (!canClientCancel(appointment)) {
    return NextResponse.json(
      { error: "Esta cita ya no se puede cancelar" },
      { status: 409 }
    );
  }

  await db.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  await recordAppointmentEvent({
    appointment: { ...appointment, status: "CANCELLED", shop },
    type: "CANCELLED",
    actor: { ...CLIENT_ACTOR, name: formatClientName(appointment.client) },
    changes: { status: { from: appointment.status, to: "CANCELLED" } },
    notice: "cancellation",
  });

  await alertStaffClientCancelledAppointment({
    shop,
    client: appointment.client,
    title: appointment.title,
    startsAt: appointment.startsAt,
  }).catch((err) => console.error(`[manage] alerta al taller falló (${appointment.id}):`, err));

  revalidatePath(ADMIN.appointments);

  return NextResponse.json({ ok: true });
}
