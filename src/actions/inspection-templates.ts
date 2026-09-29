"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { canView, checkEntitlement } from "@/lib/subscription";
import { inspectionTemplateSchema, type InspectionTemplateFormData } from "@/lib/validations";
import { isUniqueConstraintError } from "@/lib/invoice-number";

/** Plantillas del taller (DVI avanzado). Vacío si el plan no las incluye. */
export async function getInspectionTemplates() {
  const shopId = await getShopId();
  if (!(await canView(shopId, "dvi.templates"))) return [];
  return db.inspectionTemplate.findMany({ where: { shopId }, orderBy: { name: "asc" } });
}

export async function createInspectionTemplate(data: InspectionTemplateFormData) {
  const shopId = await getWritableShopId();
  const entitlementError = await checkEntitlement(shopId, "dvi.templates");
  if (entitlementError) return { error: entitlementError };

  const parsed = inspectionTemplateSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template" };
  // Sin ítems repetidos (ignorando mayúsculas), en el orden escrito.
  const seen = new Set<string>();
  const items = parsed.data.items.filter((i) => {
    const k = i.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  try {
    await db.inspectionTemplate.create({ data: { shopId, name: parsed.data.name, items } });
  } catch (err) {
    if (isUniqueConstraintError(err)) return { error: "A template with that name already exists" };
    throw err;
  }
  revalidatePath(`${ADMIN.inspections}/templates`);
  return { success: true };
}

export async function deleteInspectionTemplate(id: string) {
  const shopId = await getWritableShopId();
  // Borrar es limpieza: no exige plan vigente de Pro (sí escritura permitida). Scoped por taller.
  const res = await db.inspectionTemplate.deleteMany({ where: { id, shopId } });
  revalidatePath(`${ADMIN.inspections}/templates`);
  return res.count > 0 ? { success: true } : { error: "Template not found" };
}
