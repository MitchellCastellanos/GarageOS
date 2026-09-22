import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendReminderEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { SYSTEM_ACTOR, recordAppointmentEvent } from "@/lib/appointment-events";

// Cron Job — corre diariamente a las 8am (configurado en vercel.json)
// Envía recordatorios de servicio con vencimiento en ≤7 días
// y recordatorios de citas según appointmentReminderHours de cada taller.
//
// SEGURIDAD: protegido con CRON_SECRET header.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const dueReminders = await db.serviceReminder.findMany({
    where: {
      status: "PENDING",
      sentAt: null,
      dueDate: {
        lte: sevenDaysFromNow,
        gte: new Date(),
      },
    },
    include: {
      vehicle: {
        include: { client: true },
      },
      shop: true,
    },
  });

  const results = {
    serviceReminders: { sent: 0, skipped: 0, errors: 0 },
    appointmentReminders: { sent: 0, skipped: 0, errors: 0 },
  };

  for (const reminder of dueReminders) {
    const client = reminder.vehicle.client;

    if (!client.email) {
      results.serviceReminders.skipped++;
      continue;
    }

    try {
      await sendReminderEmail({
        shop: shopToEmailConfig(reminder.shop),
        clientId: client.id,
        reminderId: reminder.id,
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
        where: { id: reminder.id },
        data: { status: "SENT", sentAt: new Date() },
      });

      results.serviceReminders.sent++;
    } catch (err) {
      console.error(`Error enviando recordatorio ${reminder.id}:`, err);
      results.serviceReminders.errors++;
    }
  }

  const shopsWithAppointments = await db.shop.findMany({
    where: { OR: [{ appointmentEmailsEnabled: true }, { appointmentSmsEnabled: true }] },
    select: { id: true, appointmentReminderHours: true },
  });

  const now = new Date();

  for (const shop of shopsWithAppointments) {
    const windowEnd = new Date(now.getTime() + shop.appointmentReminderHours * 60 * 60 * 1000);

    const dueAppointments = await db.appointment.findMany({
      where: {
        shopId: shop.id,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        reminderSentAt: null,
        startsAt: { gte: now, lte: windowEnd },
      },
      include: {
        client: true,
        shop: true,
      },
    });

    for (const appointment of dueAppointments) {
      if (!appointment.client.phone?.trim() && !appointment.client.email?.trim()) {
        results.appointmentReminders.skipped++;
        continue;
      }

      try {
        // Registra el recordatorio en el historial de la cita y marca
        // reminderSentAt si salió por algún canal (ver recordAppointmentEvent).
        const { notice } = await recordAppointmentEvent({
          appointment,
          type: "REMINDER_SENT",
          actor: SYSTEM_ACTOR,
          notice: "reminder",
        });

        if (!notice?.anySent) {
          results.appointmentReminders.errors++;
          continue;
        }

        results.appointmentReminders.sent++;
      } catch (err) {
        console.error(`Error enviando recordatorio de cita ${appointment.id}:`, err);
        results.appointmentReminders.errors++;
      }
    }
  }

  return NextResponse.json({
    ...results,
    message: `Servicios: ${results.serviceReminders.sent} enviados. Citas: ${results.appointmentReminders.sent} enviados.`,
  });
}
