import type { AppointmentEventType, AppointmentStatus } from "@prisma/client";

export type AppointmentNoticeType = "confirmation" | "update" | "reminder" | "cancellation";
export type AppointmentChanges = Record<string, { from: unknown; to: unknown }>;

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/** Arma el objeto `changes` solo con los campos que de verdad cambiaron. */
export function diffAppointmentFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AppointmentChanges {
  const changes: AppointmentChanges = {};
  for (const key of Object.keys(after)) {
    const from = serializeValue(before[key]);
    const to = serializeValue(after[key]);
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}

const ACTIVE: readonly AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];
export function isActiveAppointmentStatus(status: AppointmentStatus): boolean {
  return ACTIVE.includes(status);
}

/**
 * Qué evento registrar y qué aviso mandarle al cliente cuando el taller edita
 * una cita. Regla de producto: todo cambio que el cliente necesita saber
 * (fecha, servicio, cancelación, reapertura, cita reasignada a otro cliente)
 * se avisa automáticamente; los cambios internos (mecánico, notas, completar,
 * no-show) solo quedan en el historial.
 */
export function decideAppointmentEditEvent(
  previousStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
  changes: AppointmentChanges
): { type: AppointmentEventType; notice: AppointmentNoticeType | null } {
  const wasActive = isActiveAppointmentStatus(previousStatus);
  const isActive = isActiveAppointmentStatus(nextStatus);

  if (nextStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
    return { type: "CANCELLED", notice: "cancellation" };
  }
  if (previousStatus === "CANCELLED" && isActive) {
    return { type: "REOPENED", notice: "confirmation" };
  }
  if (isActive && changes.clientId) {
    // El cliente nuevo nunca recibió nada de esta cita.
    return { type: "UPDATED", notice: "confirmation" };
  }
  if (isActive && (changes.startsAt || changes.title)) {
    return { type: changes.startsAt ? "RESCHEDULED" : "UPDATED", notice: "update" };
  }
  if (changes.status && !(wasActive && isActive)) {
    return { type: "STATUS_CHANGED", notice: null };
  }
  return { type: "UPDATED", notice: null };
}
