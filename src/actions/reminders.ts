"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { reminderSchema, type ReminderFormData } from "@/lib/validations";
import { sendReminderEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";

// ── READ ────────────────────────────────────────────────────

export async function getReminders(status?: string) {
  const shopId = await getShopId();

  return db.serviceReminder.findMany({
    where: {
      shopId,
      ...(status && status !== "ALL" ? { status: status as never } : {}),
    },
    include: {
      vehicle: {
        include: { client: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── CREATE ──────────────────────────────────────────────────

export async function createReminder(formData: ReminderFormData) {
  const shopId = await getShopId();

  const parsed = reminderSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { vehicleId, serviceType, dueDate, dueMileage, notes } = parsed.data;

  await db.serviceReminder.create({
    data: {
      shopId,
      vehicleId,
      serviceType,
      dueDate: dueDate ? new Date(dueDate) : null,
      dueMileage: dueMileage ?? null,
      notes: notes || null,
      status: "PENDING",
    },
  });

  revalidatePath(ADMIN.reminders);
  redirect(ADMIN.reminders);
}

// ── SEND MANUAL ─────────────────────────────────────────────

export async function sendReminderNow(reminderId: string) {
  const shopId = await getShopId();

  const reminder = await db.serviceReminder.findFirst({
    where: { id: reminderId, shopId },
    include: {
      vehicle: { include: { client: true } },
      shop: true,
    },
  });

  if (!reminder) return { error: "Recordatorio no encontrado" };

  // No reenviar si ya fue enviado
  if (reminder.sentAt) return { error: "Este recordatorio ya fue enviado" };

  const client = reminder.vehicle.client;
  if (!client.email) return { error: "El cliente no tiene email registrado" };

  await sendReminderEmail({
    shop: shopToEmailConfig(reminder.shop),
    clientName: [client.firstName, client.lastName].filter(Boolean).join(" "),
    clientEmail: client.email,
    vehicleDescription: `${reminder.vehicle.year} ${reminder.vehicle.make} ${reminder.vehicle.model}`,
    licensePlate: reminder.vehicle.licensePlate,
    serviceType: reminder.serviceType,
    dueDate: reminder.dueDate,
    dueMileage: reminder.dueMileage,
    mileageUnit: reminder.vehicle.mileageUnit,
    shopPhone: reminder.shop.phone,
  });

  await db.serviceReminder.update({
    where: { id: reminderId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath(ADMIN.reminders);
  return { success: true };
}

// ── DISMISS ─────────────────────────────────────────────────

export async function dismissReminder(reminderId: string) {
  const shopId = await getShopId();
  await db.serviceReminder.updateMany({
    where: { id: reminderId, shopId },
    data: { status: "DISMISSED" },
  });
  revalidatePath(ADMIN.reminders);
}

// ── Para formulario: vehículos con sus clientes ─────────────

export async function getReminderFormData() {
  const shopId = await getShopId();
  return db.vehicle.findMany({
    where: { client: { shopId } },
    include: { client: true },
    orderBy: [{ client: { lastName: "asc" } }, { make: "asc" }],
  });
}
