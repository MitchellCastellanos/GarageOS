// Server-side ownership checks for ids that arrive from the client inside a create/update payload
// (customer, vehicle, mechanic). UI pickers only list the shop's own records, but a forged request can
// carry any id — so every write that stores such an id must verify it belongs to the acting shop.
import { db } from "@/lib/db";

export type ForeignRef = "CLIENT" | "VEHICLE" | "MECHANIC";

/** Returns the first reference that does NOT belong to `shopId`, or null when all are valid/absent. */
export async function findForeignRef(
  shopId: string,
  refs: { clientId?: string | null; vehicleId?: string | null; mechanicId?: string | null }
): Promise<ForeignRef | null> {
  if (refs.clientId) {
    const client = await db.client.findFirst({ where: { id: refs.clientId, shopId }, select: { id: true } });
    if (!client) return "CLIENT";
  }
  if (refs.vehicleId) {
    const vehicle = await db.vehicle.findFirst({
      where: { id: refs.vehicleId, client: { shopId }, ...(refs.clientId ? { clientId: refs.clientId } : {}) },
      select: { id: true },
    });
    if (!vehicle) return "VEHICLE";
  }
  if (refs.mechanicId) {
    // A staff member of this location, or one explicitly granted access to it (Multi-Shop).
    const mechanic = await db.user.findFirst({
      where: { id: refs.mechanicId, role: { not: "SUPER_ADMIN" }, OR: [{ shopId }, { shopAccess: { some: { shopId } } }] },
      select: { id: true },
    });
    if (!mechanic) return "MECHANIC";
  }
  return null;
}

const FOREIGN_REF_MESSAGE: Record<"es" | "en" | "fr", Record<ForeignRef, string>> = {
  es: { CLIENT: "Cliente no encontrado", VEHICLE: "Vehículo no encontrado", MECHANIC: "Mecánico no encontrado" },
  en: { CLIENT: "Customer not found", VEHICLE: "Vehicle not found", MECHANIC: "Mechanic not found" },
  fr: { CLIENT: "Client introuvable", VEHICLE: "Véhicule introuvable", MECHANIC: "Mécanicien introuvable" },
};

export function foreignRefMessage(locale: string, ref: ForeignRef): string {
  const l = locale === "fr" || locale === "en" ? locale : "es";
  return FOREIGN_REF_MESSAGE[l][ref];
}

/** Same as findForeignRef for a document that lists several vehicles (invoices/quotes). */
export async function findForeignDocumentRefs(
  shopId: string,
  clientId: string,
  vehicleIds: string[]
): Promise<ForeignRef | null> {
  const first = await findForeignRef(shopId, { clientId });
  if (first) return first;
  for (const vehicleId of new Set(vehicleIds)) {
    const bad = await findForeignRef(shopId, { clientId, vehicleId });
    if (bad) return bad;
  }
  return null;
}
