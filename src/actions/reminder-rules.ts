"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { canView, checkEntitlement } from "@/lib/subscription";
import { validateRule } from "@/domain/reminder-rules";

/** Reglas del taller (recordatorios avanzados, Pro+). Vacío si el plan no las incluye. */
export async function getReminderRules() {
  const shopId = await getShopId();
  if (!(await canView(shopId, "reminders.automation"))) return [];
  return db.reminderRule.findMany({ where: { shopId }, orderBy: { name: "asc" } });
}

export async function createReminderRule(input: {
  name: string;
  keyword: string;
  intervalMonths?: number | null;
  intervalKm?: number | null;
  leadDays?: number | null;
}) {
  const shopId = await getWritableShopId();
  const entitlementError = await checkEntitlement(shopId, "reminders.automation");
  if (entitlementError) return { error: entitlementError };

  const v = validateRule(input);
  if (!v.ok) return { error: v.error };

  await db.reminderRule.create({ data: { shopId, ...v.value } });
  revalidatePath(`${ADMIN.reminders}/rules`);
  return { success: true };
}

export async function setReminderRuleActive(id: string, isActive: boolean) {
  const shopId = await getWritableShopId();
  if (isActive) {
    const entitlementError = await checkEntitlement(shopId, "reminders.automation");
    if (entitlementError) return { error: entitlementError };
  }
  const res = await db.reminderRule.updateMany({ where: { id, shopId }, data: { isActive } });
  revalidatePath(`${ADMIN.reminders}/rules`);
  return res.count > 0 ? { success: true } : { error: "NOT_FOUND" };
}

export async function deleteReminderRule(id: string) {
  const shopId = await getWritableShopId();
  // Borrar una regla no borra los recordatorios ya creados (ruleId pasa a null).
  const res = await db.reminderRule.deleteMany({ where: { id, shopId } });
  revalidatePath(`${ADMIN.reminders}/rules`);
  return res.count > 0 ? { success: true } : { error: "NOT_FOUND" };
}
