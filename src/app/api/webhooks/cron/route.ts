import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendReminderEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { SYSTEM_ACTOR, recordAppointmentEvent } from "@/lib/appointment-events";
import { runSmsNumberLifecycle } from "@/lib/communications/sms-numbers";
import { retryPendingSmsOverage } from "@/lib/communications/sms-usage";
import { reconcileStaleSmsStatuses } from "@/lib/communications/sms-status";
import { createOperatingChecker } from "@/lib/subscription";
import { isTwilioConfigured } from "@/lib/communications/twilio";
import { deliverDueAutomatedReminders } from "@/lib/reminder-automation";

// Cron Job — corre diariamente a las 8am (configurado en vercel.json)
// Envía recordatorios de servicio con vencimiento en ≤7 días
// y recordatorios de citas según appointmentReminderHours de cada taller,
// y aplica el ciclo de vida de 30 días de los números SMS dedicados.
//
// SEGURIDAD: protegido con CRON_SECRET header.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Los recordatorios automáticos (con regla, Pro+) se envían aparte por deliverDueAutomatedReminders,
  // con su propia anticipación y canal; este envío básico es solo para los manuales.
  const dueReminders = await db.serviceReminder.findMany({
    where: {
      status: "PENDING",
      sentAt: null,
      ruleId: null,
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
    automatedReminders: { sent: 0, skipped: 0, errors: 0 },
    appointmentReminders: { sent: 0, skipped: 0, errors: 0 },
  };

  // Un taller restringido (sin pago vigente) no envía recordatorios automáticos.
  const canOperate = createOperatingChecker();

  for (const reminder of dueReminders) {
    const client = reminder.vehicle.client;

    if (!(await canOperate(reminder.shopId))) {
      results.serviceReminders.skipped++;
      continue;
    }

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

  results.automatedReminders = await deliverDueAutomatedReminders(new Date(), canOperate);

  const shopsWithAppointments = await db.shop.findMany({
    where: { OR: [{ appointmentEmailsEnabled: true }, { appointmentSmsEnabled: true }] },
    select: { id: true, appointmentReminderHours: true },
  });

  const now = new Date();

  for (const shop of shopsWithAppointments) {
    if (!(await canOperate(shop.id))) continue;
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

  // Números SMS dedicados: talleres que dejaron de pagar conservan el número 30
  // días; después se libera (ver runSmsNumberLifecycle).
  const smsNumbers = isTwilioConfigured()
    ? await runSmsNumberLifecycle().catch((err) => {
        console.error("[cron] ciclo de vida de números SMS falló:", err);
        return null;
      })
    : null;

  // Recuperación: excedentes de SMS que Stripe no aceptó y estados de entrega
  // cuyo callback se perdió. Independientes entre sí; un fallo no tumba el cron.
  const smsOverageRetry = await retryPendingSmsOverage().catch((err) => {
    console.error("[cron] reintento de excedente SMS falló:", err);
    return null;
  });
  const smsStatusReconcile = isTwilioConfigured()
    ? await reconcileStaleSmsStatuses().catch((err) => {
        console.error("[cron] conciliación de estados SMS falló:", err);
        return null;
      })
    : null;

  return NextResponse.json({
    ...results,
    smsNumbers,
    smsOverageRetry,
    smsStatusReconcile,
    message: `Servicios: ${results.serviceReminders.sent} enviados. Citas: ${results.appointmentReminders.sent} enviados.`,
  });
}
