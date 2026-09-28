// Historial (paper trail) de citas + disparo del aviso al cliente que corresponde
// a cada evento. Toda creación, reprogramación, cancelación, reapertura o reenvío
// pasa por recordAppointmentEvent: primero se guarda el evento (quién, cuándo, qué
// cambió) y después se manda el aviso con una idempotencyKey atada a ese evento,
// así cada cambio genera su propio mensaje y queda enlazado a él (el texto exacto
// y el estado de entrega viven en CommunicationMessage).

import type {
  Appointment,
  AppointmentActorType,
  AppointmentEventType,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { AppointmentChanges } from "@/domain/appointment-events";

export { diffAppointmentFields, type AppointmentChanges } from "@/domain/appointment-events";
import { ensureAppointmentManageToken } from "@/lib/appointment-token";
import {
  notifyAppointmentEvent,
  type AppointmentNotificationType,
  type AppointmentNotifyClient,
  type AppointmentNotifyShop,
  type NotifyAppointmentEventResult,
} from "@/lib/appointment-notify";

export interface AppointmentActor {
  type: AppointmentActorType;
  userId?: string | null;
  name?: string | null;
}

export const CLIENT_ACTOR: AppointmentActor = { type: "CLIENT" };
export const SYSTEM_ACTOR: AppointmentActor = { type: "SYSTEM" };

export type NoticeOutcome = "SENT" | "FAILED" | "SKIPPED_NO_CONTACT" | "SKIPPED_DISABLED" | "SKIPPED_PAST";


type AppointmentForEvent = Appointment & {
  client: AppointmentNotifyClient & { id: string };
  shop: AppointmentNotifyShop;
};

export interface RecordAppointmentEventResult {
  eventId: string | null;
  notice: NotifyAppointmentEventResult | null;
  noticeOutcome: NoticeOutcome | null;
}

function outcomeFrom(result: NotifyAppointmentEventResult): NoticeOutcome {
  if (result.anySent) return "SENT";
  if (result.skipped === "NO_CONTACT") return "SKIPPED_NO_CONTACT";
  if (result.skipped === "DISABLED") return "SKIPPED_DISABLED";
  return "FAILED";
}

const SENT_AT_FIELD: Record<AppointmentNotificationType, keyof Prisma.AppointmentUpdateInput> = {
  confirmation: "confirmationSentAt",
  update: "confirmationSentAt",
  reminder: "reminderSentAt",
  cancellation: "cancellationSentAt",
};

/**
 * Registra un evento de la cita y, si `notice` viene, avisa al cliente (SMS
 * primero, email de respaldo — ver notifyAppointmentEvent). Nunca lanza: un
 * fallo de envío queda en el evento (noticeOutcome) para que el taller lo vea
 * en el historial, y un fallo del historial no bloquea el aviso.
 */
export async function recordAppointmentEvent(params: {
  appointment: AppointmentForEvent;
  type: AppointmentEventType;
  actor: AppointmentActor;
  changes?: AppointmentChanges;
  notice?: AppointmentNotificationType | null;
}): Promise<RecordAppointmentEventResult> {
  const { appointment, actor } = params;
  const notice = params.notice ?? null;

  // Si guardar el evento falla, el aviso igual sale: al cliente le importa el
  // aviso, el historial es para el taller.
  let eventId: string | null = null;
  try {
    const event = await db.appointmentEvent.create({
      data: {
        shopId: appointment.shopId,
        appointmentId: appointment.id,
        type: params.type,
        actorType: actor.type,
        actorUserId: actor.userId ?? null,
        actorName: actor.name ?? null,
        changes: (params.changes ?? {}) as Prisma.InputJsonValue,
        notice,
      },
    });
    eventId = event.id;
  } catch (err) {
    console.error(`[appointment-events] no se pudo guardar ${params.type} (${appointment.id}):`, err);
  }

  const markEvent = async (data: Prisma.AppointmentEventUpdateInput) => {
    if (!eventId) return;
    await db.appointmentEvent
      .update({ where: { id: eventId }, data })
      .catch((err) => console.error(`[appointment-events] no se pudo actualizar ${eventId}:`, err));
  };

  if (!notice) return { eventId, notice: null, noticeOutcome: null };

  // Un aviso de "tu cita es / cambió a tal hora" no tiene sentido si esa hora ya
  // pasó (ej. el admin corrige una cita vieja). La cancelación sí se avisa siempre.
  if (notice !== "cancellation" && appointment.startsAt.getTime() <= Date.now()) {
    await markEvent({ noticeOutcome: "SKIPPED_PAST" });
    return { eventId, notice: null, noticeOutcome: "SKIPPED_PAST" };
  }

  let result: NotifyAppointmentEventResult;
  try {
    const manageToken =
      notice === "cancellation"
        ? appointment.manageToken
        : await ensureAppointmentManageToken(appointment.id, appointment.manageToken);

    result = await notifyAppointmentEvent({
      type: notice,
      shop: appointment.shop,
      client: appointment.client,
      appointmentId: appointment.id,
      title: appointment.title,
      startsAt: appointment.startsAt,
      manageToken,
      noticeKey: eventId ?? `untracked-${Date.now()}`,
    });
  } catch (err) {
    console.error(`[appointment-events] aviso ${notice} falló (${appointment.id}):`, err);
    result = {
      smsSent: false,
      emailSent: false,
      anySent: false,
      smsMessageId: null,
      emailMessageId: null,
      skipped: null,
    };
  }

  const noticeOutcome = outcomeFrom(result);
  await markEvent({ noticeOutcome, smsMessageId: result.smsMessageId, emailMessageId: result.emailMessageId });

  if (result.anySent) {
    await db.appointment
      .update({ where: { id: appointment.id }, data: { [SENT_AT_FIELD[notice]]: new Date() } })
      .catch((err) => console.error(`[appointment-events] no se pudo marcar ${notice} (${appointment.id}):`, err));
  }

  return { eventId, notice: result, noticeOutcome };
}

export interface AppointmentHistoryEntry {
  id: string;
  type: AppointmentEventType;
  actorType: AppointmentActorType;
  actorName: string | null;
  changes: AppointmentChanges;
  notice: string | null;
  noticeOutcome: NoticeOutcome | null;
  deliveries: { channel: "SMS" | "EMAIL"; to: string[]; status: string; error: string | null }[];
  createdAt: Date;
}

/** Historial de una cita, más reciente primero, con el estado de cada aviso enviado. */
export async function getAppointmentHistory(shopId: string, appointmentId: string): Promise<AppointmentHistoryEntry[]> {
  const events = await db.appointmentEvent.findMany({
    where: { shopId, appointmentId },
    orderBy: { createdAt: "desc" },
  });

  const messageIds = events.flatMap((e) => [e.smsMessageId, e.emailMessageId]).filter((id): id is string => Boolean(id));
  const messages = messageIds.length
    ? await db.communicationMessage.findMany({
        where: { id: { in: messageIds }, shopId },
        select: { id: true, channel: true, to: true, status: true, errorMessage: true },
      })
    : [];
  const byId = new Map(messages.map((m) => [m.id, m]));

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    actorType: e.actorType,
    actorName: e.actorName,
    changes: (e.changes ?? {}) as AppointmentChanges,
    notice: e.notice,
    noticeOutcome: (e.noticeOutcome as NoticeOutcome | null) ?? null,
    deliveries: [e.smsMessageId, e.emailMessageId]
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => ({ channel: m.channel, to: m.to, status: m.status, error: m.errorMessage })),
    createdAt: e.createdAt,
  }));
}
