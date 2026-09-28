"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireShopSession } from "@/lib/permissions";
import {
  STAFF_EVENT_KEYS,
  getStaffNotificationPreferences,
  setStaffNotificationPreference,
  type StaffEventKey,
} from "@/lib/staff-notify";

const LIST_LIMIT = 30;

export interface StaffNotificationRow {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Últimas notificaciones del usuario en sesión + cuántas siguen sin leer. */
export async function getMyStaffNotifications(): Promise<{ notifications: StaffNotificationRow[]; unreadCount: number }> {
  const session = await requireShopSession();
  const [rows, unreadCount] = await Promise.all([
    db.staffNotification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    db.staffNotification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);

  return {
    notifications: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      href: r.href,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

export async function markStaffNotificationReadAction(id: string) {
  const session = await requireShopSession();
  await db.staffNotification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { success: true };
}

export async function markAllStaffNotificationsReadAction() {
  const session = await requireShopSession();
  await db.staffNotification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { success: true };
}

// ── Preferencias ─────────────────────────────────────────────

export async function getMyStaffNotificationPreferences() {
  const session = await requireShopSession();
  return getStaffNotificationPreferences(session.user.id);
}

export async function setMyStaffNotificationPreferenceAction(event: string, inApp: boolean, email: boolean) {
  const session = await requireShopSession();
  if (!(STAFF_EVENT_KEYS as readonly string[]).includes(event)) {
    return { error: "Invalid event" };
  }
  // En la app siempre queda al menos un canal encendido — si alguien apaga los
  // dos, el evento deja de existir para esa persona sin que quede ningún
  // registro de que pasó (ni siquiera en su propio historial).
  if (!inApp && !email) {
    return { error: "Choose at least one channel" };
  }
  await setStaffNotificationPreference(session.user.id, event as StaffEventKey, { inApp, email });
  revalidatePath("/admin/settings");
  return { success: true };
}
