import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findAvailableMechanic, getShopBySlug, getShopServiceDurations } from "@/lib/booking-slots";
import { resolveServiceDuration } from "@/lib/service-catalog";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { publicBookingSchema } from "@/lib/validations";
import { generateAppointmentManageToken } from "@/lib/appointment-token";
import {
  buildAppointmentManageUrl,
  notifyAppointmentEvent,
  notifyShopOfNewWebAppointment,
} from "@/lib/appointment-notify";

/** Solo dígitos — para emparejar el mismo teléfono aunque venga con distinto formato. */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);

  if (!shop) {
    return NextResponse.json({ error: "Reservas no disponibles" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = publicBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const serviceDurations = await getShopServiceDurations(shop.id);
  const durationMinutes = resolveServiceDuration(
    data.serviceValue,
    shop.bookingSlotMinutes,
    serviceDurations
  );
  const mechanic = await findAvailableMechanic(
    shop,
    data.date,
    data.time,
    data.mechanicId || undefined,
    undefined,
    durationMinutes
  );

  if (!mechanic) {
    return NextResponse.json(
      { error: { time: ["Ese horario ya no está disponible. Elige otro."] } },
      { status: 409 }
    );
  }

  const startsAt = parseShopDateTime(data.date, data.time, shop.timezone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  const email = data.email?.trim().toLowerCase() || null;
  const digits = phoneDigits(data.phone);

  const candidates = await db.client.findMany({
    where: { shopId: shop.id, phone: { not: null } },
  });
  let client = candidates.find((c) => c.phone && phoneDigits(c.phone) === digits) ?? null;

  if (!client) {
    client = await db.client.create({
      data: {
        shopId: shop.id,
        firstName: data.firstName,
        lastName: data.lastName || null,
        phone: data.phone,
        email,
        language: data.language,
        notes: "Cliente creado desde reserva web",
      },
    });
  } else {
    client = await db.client.update({
      where: { id: client.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: email ?? client.email,
        language: data.language,
      },
    });
  }

  const licensePlate = data.licensePlate?.trim() || "";

  let vehicle = licensePlate
    ? await db.vehicle.findFirst({
        where: {
          clientId: client.id,
          licensePlate: { equals: licensePlate, mode: "insensitive" },
        },
      })
    : null;

  if (!vehicle) {
    vehicle = await db.vehicle.create({
      data: {
        clientId: client.id,
        make: data.make,
        model: data.model,
        year: data.year,
        licensePlate: licensePlate.toUpperCase(),
      },
    });
  }

  const manageToken = generateAppointmentManageToken();

  const appointment = await db.appointment.create({
    data: {
      shopId: shop.id,
      clientId: client.id,
      vehicleId: vehicle.id,
      mechanicId: mechanic.id,
      title: data.title,
      startsAt,
      endsAt,
      durationMinutes,
      notes: data.notes || null,
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      manageToken,
    },
    include: { client: true, shop: true },
  });

  const manageUrl = buildAppointmentManageUrl(shop, manageToken);

  const notified = await notifyAppointmentEvent({
    type: "confirmation",
    shop,
    client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt,
    manageToken,
  });

  if (notified.anySent) {
    await db.appointment.update({
      where: { id: appointment.id },
      data: { confirmationSentAt: new Date() },
    });
  }

  await notifyShopOfNewWebAppointment({
    shop,
    client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt,
  });

  return NextResponse.json({
    ok: true,
    appointmentId: appointment.id,
    mechanicName: mechanic.name,
    startsAt: startsAt.toISOString(),
    manageUrl,
  });
}
