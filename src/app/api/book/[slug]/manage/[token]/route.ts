import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import {
  canClientCancel,
  canClientConfirm,
  getShopAndAppointmentByToken,
} from "@/lib/appointment-manage";
import { notifyAppointmentEvent } from "@/lib/appointment-notify";

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

  const { appointment } = found;

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

  const notified = await notifyAppointmentEvent({
    type: "cancellation",
    shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken: token,
  });

  if (notified.anySent) {
    await db.appointment.update({
      where: { id: appointment.id },
      data: { cancellationSentAt: new Date() },
    });
  }

  revalidatePath(ADMIN.appointments);

  return NextResponse.json({ ok: true });
}
