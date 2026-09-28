"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { isTransactionConflictError } from "@/lib/db-errors";
import { getShopId } from "@/lib/shop-context";
import { appointmentSchema, appointmentEditSchema, type AppointmentEditFormData, type AppointmentFormData } from "@/lib/validations";
import { generateAppointmentManageToken, ensureAppointmentManageToken } from "@/lib/appointment-token";
import { buildAppointmentManageUrl, type NotifyAppointmentEventResult } from "@/lib/appointment-notify";
import { decideAppointmentEditEvent, isActiveAppointmentStatus } from "@/domain/appointment-events";
import {
  diffAppointmentFields,
  getAppointmentHistory,
  recordAppointmentEvent,
  type AppointmentActor,
} from "@/lib/appointment-events";
import { requireShopSession } from "@/lib/permissions";
import { DEFAULT_TIMEZONE } from "@/config/app";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
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

const MECHANIC_CONFLICT: Record<AdminLocale, string> = {
  es: "El mecánico ya tiene otra cita en ese horario",
  en: "The mechanic already has another appointment at that time",
  fr: "Le mécanicien a déjà un autre rendez-vous à cette heure",
};

const APPOINTMENT_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Cita no encontrada",
  en: "Appointment not found",
  fr: "Rendez-vous introuvable",
};

const INVALID_STATUS: Record<AdminLocale, string> = {
  es: "Estado inválido",
  en: "Invalid status",
  fr: "Statut invalide",
};

const ALREADY_CANCELLED: Record<AdminLocale, string> = {
  es: "La cita ya está cancelada",
  en: "The appointment is already cancelled",
  fr: "Le rendez-vous est déjà annulé",
};

const NO_CONTACT_INFO: Record<AdminLocale, string> = {
  es: "El cliente no tiene teléfono ni email configurado",
  en: "The client has no phone or email on file",
  fr: "Le client n'a ni téléphone ni courriel enregistré",
};

const CONFIRMATION_SEND_FAILED: Record<AdminLocale, string> = {
  es: "No se pudo enviar la confirmación (revisa la configuración de SMS/email)",
  en: "Could not send the confirmation (check your SMS/email setup)",
  fr: "Impossible d'envoyer la confirmation (vérifiez la configuration SMS/courriel)",
};

const REMINDER_SEND_FAILED: Record<AdminLocale, string> = {
  es: "No se pudo enviar el recordatorio",
  en: "Could not send the reminder",
  fr: "Impossible d'envoyer le rappel",
};

const CHANNEL_LABEL: Record<AdminLocale, { sms: string; email: string }> = {
  es: { sms: "SMS", email: "email" },
  en: { sms: "SMS", email: "email" },
  fr: { sms: "SMS", email: "courriel" },
};

/** Traduce el resultado de notifyAppointmentEvent a etiquetas legibles para la UI admin. */
function describeChannels(result: NotifyAppointmentEventResult, locale: AdminLocale): string[] {
  const channels: string[] = [];
  if (result.smsSent) channels.push(CHANNEL_LABEL[locale].sms);
  if (result.emailSent) channels.push(CHANNEL_LABEL[locale].email);
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

// ── Conflict check ──────────────────────────────────────────

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

// ── Historial + avisos ──────────────────────────────────────
// Toda mutación de una cita queda en AppointmentEvent (quién, cuándo, qué cambió)
// y, cuando corresponde, dispara el aviso al cliente atado a ese evento — ver
// src/lib/appointment-events.ts. Creación, reprogramación, cambio de servicio,
// cancelación y reapertura avisan siempre de forma automática.

async function getStaffActor(): Promise<AppointmentActor> {
  const session = await requireShopSession();
  return { type: "STAFF", userId: session.user.id, name: session.user.name ?? session.user.email ?? null };
}

function loadAppointmentForEvent(id: string, shopId: string) {
  return db.appointment.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });
}


// ── CREATE / UPDATE ─────────────────────────────────────────

export async function createAppointment(formData: AppointmentFormData) {
  const shopId = await getShopId();
  const timeZone = await getShopTimezone(shopId);
  const locale = await getAdminLocale();
  const actor = await getStaffActor();

  const parsed = appointmentSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, title, date, time, durationMinutes, notes } =
    parsed.data;

  const startsAt = parseStartsAt(date, time, timeZone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  let createdId: string;
  try {
    createdId = await db.$transaction(
      async (tx) => {
        if (mechanicId) {
          const conflict = await tx.appointment.findFirst({
            where: {
              shopId,
              mechanicId,
              status: { notIn: ["CANCELLED", "NO_SHOW"] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });
          if (conflict) throw new Error("MECHANIC_CONFLICT");
        }

        const created = await tx.appointment.create({
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
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if ((err instanceof Error && err.message === "MECHANIC_CONFLICT") || isTransactionConflictError(err)) {
      return { error: { mechanicId: [MECHANIC_CONFLICT[locale]] } };
    }
    throw err;
  }

  // Confirmación automática al cliente — igual que la reserva web. Best-effort:
  // el resultado (enviado / falló / sin contacto) queda en el historial de la cita.
  const created = await loadAppointmentForEvent(createdId, shopId);
  if (created) {
    await recordAppointmentEvent({
      appointment: created,
      type: "CREATED",
      actor,
      notice: "confirmation",
    });
  }

  revalidatePath(ADMIN.appointments);
  redirect(`${ADMIN.appointments}?view=day&date=${date}`);
}

export async function updateAppointment(id: string, formData: AppointmentEditFormData) {
  const shopId = await getShopId();
  const timeZone = await getShopTimezone(shopId);
  const locale = await getAdminLocale();
  const actor = await getStaffActor();

  const existing = await db.appointment.findFirst({
    where: { id, shopId },
  });

  if (!existing) {
    return { error: { _form: [APPOINTMENT_NOT_FOUND[locale]] } };
  }

  const parsed = appointmentEditSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, title, date, time, durationMinutes, notes, status } =
    parsed.data;

  const startsAt = parseStartsAt(date, time, timeZone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const timeChanged = startsAt.getTime() !== existing.startsAt.getTime();
  const reopening = existing.status === "CANCELLED" && isActiveAppointmentStatus(status);

  const nextValues = {
    clientId,
    vehicleId: vehicleId || null,
    mechanicId: mechanicId || null,
    title,
    startsAt,
    endsAt,
    durationMinutes,
    notes: notes || null,
    status,
  };

  try {
    await db.$transaction(
      async (tx) => {
        if (mechanicId && status !== "CANCELLED" && status !== "NO_SHOW") {
          const conflict = await tx.appointment.findFirst({
            where: {
              shopId,
              mechanicId,
              id: { not: id },
              status: { notIn: ["CANCELLED", "NO_SHOW"] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });
          if (conflict) throw new Error("MECHANIC_CONFLICT");
        }

        await tx.appointment.update({
          where: { id },
          data: {
            ...nextValues,
            // Nueva fecha o cita reabierta → el recordatorio anterior ya no
            // cuenta; el cron vuelve a mandarlo.
            ...(timeChanged || reopening ? { reminderSentAt: null } : {}),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if ((err instanceof Error && err.message === "MECHANIC_CONFLICT") || isTransactionConflictError(err)) {
      return { error: { mechanicId: [MECHANIC_CONFLICT[locale]] } };
    }
    throw err;
  }

  const changes = diffAppointmentFields(
    {
      clientId: existing.clientId,
      vehicleId: existing.vehicleId,
      mechanicId: existing.mechanicId,
      title: existing.title,
      startsAt: existing.startsAt,
      durationMinutes: existing.durationMinutes,
      notes: existing.notes,
      status: existing.status,
    },
    {
      clientId: nextValues.clientId,
      vehicleId: nextValues.vehicleId,
      mechanicId: nextValues.mechanicId,
      title: nextValues.title,
      startsAt: nextValues.startsAt,
      durationMinutes: nextValues.durationMinutes,
      notes: nextValues.notes,
      status: nextValues.status,
    }
  );

  if (Object.keys(changes).length > 0) {
    const updated = await loadAppointmentForEvent(id, shopId);
    if (updated) {
      const { type, notice } = decideAppointmentEditEvent(existing.status, status, changes);
      await recordAppointmentEvent({ appointment: updated, type, actor, changes, notice });
    }
  }

  revalidatePath(ADMIN.appointments);
  redirect(`${ADMIN.appointments}?view=day&date=${date}`);
}

export async function updateAppointmentStatus(id: string, status: AppointmentEditFormData["status"]) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const existing = await db.appointment.findFirst({
    where: { id, shopId },
  });

  if (!existing) {
    return { error: APPOINTMENT_NOT_FOUND[locale] };
  }

  const parsed = appointmentEditSchema.shape.status.safeParse(status);
  if (!parsed.success) {
    return { error: INVALID_STATUS[locale] };
  }

  if (parsed.data === existing.status) return { success: true };
  if (parsed.data === "CANCELLED") return cancelAppointment(id);

  const actor = await getStaffActor();
  const reopening = existing.status === "CANCELLED" && isActiveAppointmentStatus(parsed.data);

  await db.appointment.update({
    where: { id },
    data: {
      status: parsed.data,
      // Reabrir una cita cancelada: el recordatorio vuelve a corresponder.
      ...(reopening ? { reminderSentAt: null } : {}),
    },
  });

  const updated = await loadAppointmentForEvent(id, shopId);
  if (updated) {
    await recordAppointmentEvent({
      appointment: updated,
      type: reopening ? "REOPENED" : "STATUS_CHANGED",
      actor,
      changes: { status: { from: existing.status, to: parsed.data } },
      notice: reopening ? "confirmation" : null,
    });
  }

  revalidatePath(ADMIN.appointments);
  return { success: true };
}

export async function cancelAppointment(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const actor = await getStaffActor();

  const appointment = await loadAppointmentForEvent(id, shopId);

  if (!appointment) {
    return { error: APPOINTMENT_NOT_FOUND[locale] };
  }

  if (appointment.status === "CANCELLED") {
    return { error: ALREADY_CANCELLED[locale] };
  }

  await db.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await recordAppointmentEvent({
    appointment: { ...appointment, status: "CANCELLED" },
    type: "CANCELLED",
    actor,
    changes: { status: { from: appointment.status, to: "CANCELLED" } },
    notice: "cancellation",
  });

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


export async function getAppointmentHistoryForAdmin(id: string) {
  const shopId = await getShopId();
  return getAppointmentHistory(shopId, id);
}

// ── Reenvíos manuales (SMS principal, email de respaldo) ──────

export async function sendAppointmentConfirmation(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const actor = await getStaffActor();

  const appointment = await loadAppointmentForEvent(id, shopId);

  if (!appointment) {
    return { error: APPOINTMENT_NOT_FOUND[locale] };
  }

  if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
    return { error: NO_CONTACT_INFO[locale] };
  }

  const { notice } = await recordAppointmentEvent({
    appointment,
    type: "NOTICE_RESENT",
    actor,
    notice: "confirmation",
  });

  if (!notice?.anySent) {
    return { error: CONFIRMATION_SEND_FAILED[locale] };
  }

  if (appointment.status === "SCHEDULED") {
    await db.appointment.update({ where: { id }, data: { status: "CONFIRMED" } });
  }

  revalidatePath(ADMIN.appointments);
  return { success: true, sentVia: describeChannels(notice, locale) };
}

export async function sendAppointmentReminder(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const actor = await getStaffActor();

  const appointment = await loadAppointmentForEvent(id, shopId);

  if (!appointment) {
    return { error: APPOINTMENT_NOT_FOUND[locale] };
  }

  if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
    return { error: NO_CONTACT_INFO[locale] };
  }

  const { notice } = await recordAppointmentEvent({
    appointment,
    type: "REMINDER_SENT",
    actor,
    notice: "reminder",
  });

  if (!notice?.anySent) {
    return { error: REMINDER_SEND_FAILED[locale] };
  }

  return { success: true, sentVia: describeChannels(notice, locale) };
}

/** Para formulario de edición: fecha y hora en zona del taller */
export async function appointmentToFormValues(startsAt: Date, shopTimezone: string) {
  return {
    date: formatShopDate(startsAt, shopTimezone),
    time: formatShopTime(startsAt, shopTimezone),
  };
}

export { shiftMonth, addShopDays };
