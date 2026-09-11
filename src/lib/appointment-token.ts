import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/** Token opaco para el link de auto-gestión de citas del cliente (sin login). */
export function generateAppointmentManageToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Genera y persiste el token si la cita todavía no tiene uno (citas creadas antes de esta feature). */
export async function ensureAppointmentManageToken(
  appointmentId: string,
  manageToken: string | null
): Promise<string> {
  if (manageToken) return manageToken;
  const token = generateAppointmentManageToken();
  await db.appointment.update({ where: { id: appointmentId }, data: { manageToken: token } });
  return token;
}
