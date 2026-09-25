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

const NOTIFY_CHANNELS = new Set(["AUTO", "SMS", "EMAIL", "BOTH"]);

/** El cliente cambia cómo quiere que le avisemos (desde su propio link, sin login). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  const found = await getShopAndAppointmentByToken(slug, token);
  if (!found) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const notifyChannel = body?.notifyChannel;
  if (typeof notifyChannel !== "string" || !NOTIFY_CHANNELS.has(notifyChannel)) {
    return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
  }
  // BOTH y EMAIL exigen tener un email en el archivo — si no, no hay a dónde mandarlo.
  if (notifyChannel !== "SMS" && !found.appointment.client.email) {
    return NextResponse.json({ error: "Agrega un email para elegir esta opción" }, { status: 422 });
  }

  await db.client.update({
    where: { id: found.appointment.clientId },
    data: { notifyChannel: notifyChannel as "AUTO" | "SMS" | "EMAIL" | "BOTH" },
  });

  return NextResponse.json({ ok: true, notifyChannel });
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
