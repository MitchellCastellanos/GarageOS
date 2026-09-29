// Recordatorios avanzados (Block 7, Pro+): crea recordatorios a partir de reglas cuando una orden
// de trabajo se completa y los envía por el canal preferido del cliente.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/subscription";
import { matchRules, planReminder } from "@/domain/reminder-rules";
import { resolveNotifyChannelPlan } from "@/domain/sms";
import { isUniqueConstraintError } from "@/lib/invoice-number";
import { sendReminderEmail } from "@/lib/email";
import { sendServiceReminderSms } from "@/lib/sms";
import { shopToEmailConfig } from "@/lib/email-config";

export interface AutoReminderResult {
  created: number;
  replaced: number;
}

/**
 * Llamar después de que la orden pasó a COMPLETED. Idempotente: (regla, orden) es único, así que
 * volver a llamar no duplica. Un recordatorio nuevo de la misma regla para el mismo vehículo
 * reemplaza (DISMISSED) al pendiente anterior — el servicio ya se hizo.
 * Solo talleres con `reminders.automation` vigente (server-side).
 */
export async function createRemindersForCompletedWorkOrder(shopId: string, workOrderId: string): Promise<AutoReminderResult> {
  const result: AutoReminderResult = { created: 0, replaced: 0 };
  if (!(await can(shopId, "reminders.automation"))) return result;

  const rules = await db.reminderRule.findMany({ where: { shopId, isActive: true } });
  if (rules.length === 0) return result;

  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, shopId, status: "COMPLETED" },
    include: { lines: { select: { description: true } } },
  });
  if (!workOrder) return result;

  const matched = matchRules(rules, workOrder.lines.map((l) => l.description));
  const completedAt = new Date();
  const mileage = workOrder.mileageOut ?? workOrder.mileageIn;

  for (const rule of matched) {
    const plan = planReminder(rule, completedAt, mileage);
    if (!plan) continue;
    try {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const replaced = await tx.serviceReminder.updateMany({
          where: { shopId, vehicleId: workOrder.vehicleId, ruleId: rule.id, status: "PENDING" },
          data: { status: "DISMISSED" },
        });
        await tx.serviceReminder.create({
          data: {
            shopId,
            vehicleId: workOrder.vehicleId,
            serviceType: rule.name,
            dueDate: plan.dueDate,
            dueMileage: plan.dueMileage,
            remindAt: plan.remindAt,
            notes: `Auto: ${workOrder.orderNumber}`,
            status: "PENDING",
            ruleId: rule.id,
            workOrderId: workOrder.id,
          },
        });
        result.replaced += replaced.count;
      });
      result.created++;
    } catch (err) {
      // Ya existía el recordatorio de esta regla para esta orden: nada que hacer.
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  return result;
}

export interface DeliveryResult {
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Cron: envía los recordatorios automáticos cuyo `remindAt` ya llegó. Canal = preferencia del
 * cliente (SMS primero con respaldo por email, o ambos). Solo talleres con plan Pro+ vigente y
 * pago al día (`canOperate`). Un recordatorio se marca SENT si salió por algún canal.
 */
export async function deliverDueAutomatedReminders(
  now: Date,
  canOperate: (shopId: string) => Promise<boolean>
): Promise<DeliveryResult> {
  const out: DeliveryResult = { sent: 0, skipped: 0, errors: 0 };
  // Ventana: nada de recordatorios "viejos" (>45 días vencidos) que tras una caída del cron
  // se enviarían tarde y desorientarían al cliente.
  const stale = new Date(now.getTime() - 45 * 86_400_000);
  const due = await db.serviceReminder.findMany({
    where: { status: "PENDING", sentAt: null, ruleId: { not: null }, remindAt: { lte: now }, OR: [{ dueDate: null }, { dueDate: { gte: stale } }] },
    include: { vehicle: { include: { client: true } }, shop: true },
    take: 500,
  });

  for (const reminder of due) {
    const shopId = reminder.shopId;
    if (!(await canOperate(shopId)) || !(await can(shopId, "reminders.automation"))) {
      out.skipped++;
      continue;
    }
    const client = reminder.vehicle.client;
    const phone = client.phone?.trim();
    const email = client.email?.trim();
    if (!phone && !email) {
      out.skipped++;
      continue;
    }
    const vehicleDescription = `${reminder.vehicle.year} ${reminder.vehicle.make} ${reminder.vehicle.model}`;
    const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ");

    const trySms = async () => {
      if (!phone) return false;
      try {
        await sendServiceReminderSms({
          to: phone,
          shopId,
          clientId: client.id,
          reminderId: reminder.id,
          shopName: reminder.shop.name,
          shopPhone: reminder.shop.phone,
          serviceType: reminder.serviceType,
          vehicleDescription,
          dueDate: reminder.dueDate,
          language: client.language,
        });
        return true;
      } catch (err) {
        console.error(`[reminders] SMS falló (${reminder.id}):`, err);
        return false;
      }
    };
    const tryEmail = async () => {
      if (!email) return false;
      try {
        await sendReminderEmail({
          shop: shopToEmailConfig(reminder.shop),
          clientId: client.id,
          reminderId: reminder.id,
          clientName,
          clientEmail: email,
          vehicleDescription,
          licensePlate: reminder.vehicle.licensePlate,
          serviceType: reminder.serviceType,
          dueDate: reminder.dueDate,
          dueMileage: reminder.dueMileage,
          mileageUnit: reminder.vehicle.mileageUnit,
          shopPhone: reminder.shop.phone,
          language: client.language,
        });
        return true;
      } catch (err) {
        console.error(`[reminders] email falló (${reminder.id}):`, err);
        return false;
      }
    };

    const { order, sendBoth } = resolveNotifyChannelPlan(client.notifyChannel);
    const attempt = { SMS: trySms, EMAIL: tryEmail } as const;
    let delivered = false;
    if (sendBoth) {
      for (const channel of order) delivered = (await attempt[channel]()) || delivered;
    } else {
      for (const channel of order) {
        if (await attempt[channel]()) {
          delivered = true;
          break;
        }
      }
    }

    if (delivered) {
      // updateMany con status PENDING: si otra corrida ya lo marcó, no lo pisa.
      await db.serviceReminder.updateMany({ where: { id: reminder.id, status: "PENDING" }, data: { status: "SENT", sentAt: new Date() } });
      out.sent++;
    } else {
      out.errors++;
    }
  }
  return out;
}
