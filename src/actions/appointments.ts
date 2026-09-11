"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { appointmentSchema, appointmentEditSchema, type AppointmentEditFormData, type AppointmentFormData } from "@/lib/validations";
import { generateAppointmentManageToken, ensureAppointmentManageToken } from "@/lib/appointment-token";
import { notifyAppointmentEvent, type NotifyAppointmentEventResult } from "@/lib/appointment-notify";
import { buildAppointmentManageUrl } from "@/lib/appointment-notify";
import { DEFAULT_TIMEZONE } from "@/config/app";
import {
  type AppointmentView,
  addShopDays,
  currentShopDate,
  formatShopDate,
  formatShopTime,
  getDayRangeShop,
  getMonthRange,
  getWeekRangeShop,
  monthFromDate,
  parseShopDateTime,
  shiftMonth,
} from "@/lib/shop-timezone";

/** Traduce el resultado de notifyAppointmentEvent a etiquetas legibles para la UI admin. */
function describeChannels(result: NotifyAppointmentEventResult): string[] {
  const channels: string[] = [];
  if (result.smsSent) channels.push("SMS");
  if (result.emailSent) channels.push("email");
  return channels;
}

async function getShopTimezone(shopId: string): Promise<string> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { timezone: true },
  });
  return shop?.timezone ?? DEFAULT_TIMEZONE;
}

function parseStartsAt(date: string, time: string, timeZone: string): Date {
  return parseShopDateTime(date, time, timeZone);
}

function resolveRange(
  view: AppointmentView,
  date: string | undefined,
  timeZone: string
) {
  const today = currentShopDate(timeZone);

  if (view === "day") {
    const day = date ?? today;
    return { ...getDayRangeShop(day, timeZone), anchor: day, view };
  }

  if (view === "week") {
    const anchor = date ?? today;
    const range = getWeekRangeShop(anchor, timeZone);
    return { ...range, anchor: range.weekStart, view };
  }

  const month = date ? monthFromDate(date.length === 7 ? `${date}-01` : date) : monthFromDate(today);
  const range = getMonthRange(month, timeZone);
  return { ...range, anchor: range.month, view };
}

// ── READ ────────────────────────────────────────────────────

export async function getMechanics() {
  const shopId = await getShopId();

  return db.user.findMany({
    where: {
      shopId,
      role: { in: ["MECHANIC", "OWNER"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function getAppointments(options?: {
  view?: AppointmentView;
  date?: string;
  /** @deprecated use date + view=week */
  week?: string;
}) {
  const shopId = await getShopId();
  const timeZone = await getShopTimezone(shopId);

  const view: AppointmentView = options?.view ?? "month";
  const dateParam = options?.date ?? options?.week;
  const { start, end, anchor, view: resolvedView } = resolveRange(view, dateParam, timeZone);

  const appointments = await db.appointment.findMany({
    where: {
      shopId,
      startsAt: { gte: start, lt: end },
    },
    include: {
      client: true,
      vehicle: true,
      mechanic: { select: { id: true, name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return {
    appointments,
    view: resolvedView,
    anchor,
    timeZone,
  };
}

export async function getAppointmentById(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicle: true,
      mechanic: { select: { id: true, name: true } },
      shop: true,
    },
  });

  if (!appointment) redirect(ADMIN.appointments);
  return appointment;
}

export async function getAppointmentFormData() {
  const shopId = await getShopId();

  const [clients, mechanics] = await Promise.all([
    db.client.findMany({
      where: { shopId },
      include: { vehicles: true },
      orderBy: { lastName: "asc" },
    }),
    getMechanics(),
  ]);

  return { clients, mechanics };
}

// ── Conflict check ────────────────────────────────────

export async function checkMechanicConflict(
  mechanicId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string
): Promise<boolean> {
  const shopId = await getShopId();

  const conflict = await db.appointment.findFirst({
    where: {
      shopId,
      mechanicId,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });

  return Boolean(conflict);
}

// ── CREATE / UPDATE ───────────────────────────────────

export async function createAppointment(formData: AppointmentFormData) {
  const shopId = await getShopId();
  const timeZone = await getShopTimezone(shopId);

  const parsed = appointmentSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, title, date, time, durationMinutes, notes } =
    parsed.data;

  const startsAt = parseStartsAt(date, time, timeZone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  if (mechanicId) {
    const hasConflict = await checkMechanicConflict(mechanicId, startsAt, endsAt);
    if (hasConflict) {
      return { error: { mechanicId: ["El mecánico ya tiene otra cita en ese horario"] } };
    }
  }

  await db.appointment.create({
    data: {
      shopId,
      clientId,
      vehicleId: vehicleId || null,
      mechanicId: mechanicId || null,
      title,
      startsAt,
      endsAt,
      durationMinutes,
      notes: notes || null,
      status: "SCHEDULED",
      manageToken: generateAppointmentManageToken(),
    },
  });

  revalidatePath(ADMIN.appointments);
  redirect(`${ADMIN.appointments}?view=day&date=${date}`);
}

export async function updateAppointment(id: string, formData: AppointmentEditFormData) {
  const shopId = await getShopId();
  const timeZone = await getShopTimezone(shopId);

  const existing = await db.appointment.findFirst({
    where: { id, shopId },
  });

  if (!existing) {
    return { error: { _form: ["Cita no encontrada"] } };
  }

  const parsed = appointmentEditSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, title, date, time, durationMinutes, notes, status } =
    parsed.data;

  const startsAt = parseStartsAt(date, time, timeZone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  if (mechanicId && status !== "CANCELLED" && status !== "NO_SHOW") {
    const hasConflict = await checkMechanicConflict(mechanicId, startsAt, endsAt, id);
    if (hasConflict) {
      return { error: { mechanicId: ["El mecánico ya tiene otra cita en ese horario"] } };
    }
  }

  await db.appointment.update({
    where: { id },
    data: {
      clientId,
      vehicleId: vehicleId || null,
      mechanicId: mechanicId || null,
      title,
      startsAt,
      endsAt,
      durationMinutes,
      notes: notes || null,
      status,
    },
  });

  revalidatePath(ADMIN.appointments);
  redirect(`${ADMIN.appointments}?view=day&date=${date}`);
}

export async function updateAppointmentStatus(id: string, status: AppointmentEditFormData["status"]) {
  const shopId = await getShopId();

  const existing = await db.appointment.findFirst({
    where: { id, shopId },
  });

  if (!existing) {
    return { error: "Cita no encontrada" };
  }

  const parsed = appointmentEditSchema.shape.status.safeParse(status);
  if (!parsed.success) {
    return { error: "Estado inválido" };
  }

  await db.appointment.update({
    where: { id },
    data: { status: parsed.data },
  });

  revalidatePath(ADMIN.appointments);
  return { success: true };
}

export async function cancelAppointment(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });

  if (!appointment) {
    return { error: "Cita no encontrada" };
  }

  if (appointment.status === "CANCELLED") {
    return { error: "La cita ya está cancelada" };
  }

  await db.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  if (appointment.client.phone || appointment.client.email) {
    try {
      await sendAppointmentCancellation(id);
    } catch (err) {
      console.error(`Error enviando cancelación de cita ${id}:`, err);
    }
  }

  revalidatePath(ADMIN.appointments);
  return { success: true };
}

export async function getAppointmentManageUrl(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: { shop: { select: { slug: true } } },
  });

  if (!appointment) return null;

  const manageToken = await ensureAppointmentManageToken(
    appointment.id,
    appointment.manageToken
  );

  return buildAppointmentManageUrl(appointment.shop, manageToken);
}

// ── Notificaciones (SMS principal, email secundario) ────────────

export async function sendAppointmentConfirmation(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });

  if (!appointment) {
    return { error: "Cita no encontrada" };
  }

  if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
    return { error: "El cliente no tiene teléfono ni email configurado" };
  }

  const manageToken = await ensureAppointmentManageToken(appointment.id, appointment.manageToken);

  const result = await notifyAppointmentEvent({
    type: "confirmation",
    shop: appointment.shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken,
  });

  if (!result.anySent) {
    return { error: "No se pudo enviar la confirmación (revisa la configuración de SMS/email)" };
  }

  await db.appointment.update({
    where: { id },
    data: {
      confirmationSentAt: new Date(),
      status: appointment.status === "SCHEDULED" ? "CONFIRMED" : appointment.status,
    },
  });

  revalidatePath(ADMIN.appointments);
  return { success: true, sentVia: describeChannels(result) };
}

export async function sendAppointmentCancellation(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });

  if (!appointment) {
    return { error: "Cita no encontrada" };
  }

  if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
    return { error: "El cliente no tiene teléfono ni email configurado" };
  }

  const result = await notifyAppointmentEvent({
    type: "cancellation",
    shop: appointment.shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken: appointment.manageToken,
  });

  if (!result.anySent) {
    return { error: "No se pudo enviar el aviso de cancelación" };
  }

  await db.appointment.update({
    where: { id },
    data: { cancellationSentAt: new Date() },
  });

  revalidatePath(ADMIN.appointments);
  return { success: true, sentVia: describeChannels(result) };
}

export async function sendAppointmentReminder(id: string) {
  const shopId = await getShopId();

  const appointment = await db.appointment.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });

  if (!appointment) {
    return { error: "Cita no encontrada" };
  }

  if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
    return { error: "El cliente no tiene teléfono ni email configurado" };
  }

  const manageToken = await ensureAppointmentManageToken(appointment.id, appointment.manageToken);

  const result = await notifyAppointmentEvent({
    type: "reminder",
    shop: appointment.shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken,
  });

  if (!result.anySent) {
    return { error: "No se pudo enviar el recordatorio" };
  }

  await db.appointment.update({
    where: { id },
    data: { reminderSentAt: new Date() },
  });

  return { success: true, sentVia: describeChannels(result) };
}

/** Para formulario de edición: fecha y hora en zona del taller */
export async function appointmentToFormValues(startsAt: Date, shopTimezone: string) {
  return {
    date: formatShopDate(startsAt, shopTimezone),
    time: formatShopTime(startsAt, shopTimezone),
  };
}

export { shiftMonth, addShopDays };
