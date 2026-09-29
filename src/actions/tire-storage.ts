"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, TireSeason, TireStorageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ADMIN, adminPath } from "@/lib/routes";
import { requireShopSession } from "@/lib/permissions";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { canView, checkEntitlement } from "@/lib/subscription";
import { tireStorageSchema, type TireStorageFormData } from "@/lib/validations";
import { normalizeLocation, normalizeTireSize } from "@/domain/tire-storage";

export type TireActionError = "INVALID_SIZE" | "CLIENT_NOT_FOUND" | "VEHICLE_MISMATCH" | "NOT_FOUND" | "INVALID_STATE";

// ── READ (solo si el plan incluye Tire Storage; un taller restringido conserva la vista) ──

const setInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vehicle: { select: { id: true, year: true, make: true, model: true, licensePlate: true } },
} satisfies Prisma.TireStorageSetInclude;

export interface TireSetFilters {
  q?: string;
  status?: "STORED" | "CHECKED_OUT" | "ALL";
  season?: TireSeason | "ALL";
}

export async function getTireStorageSets(filters: TireSetFilters = {}) {
  const shopId = await getShopId();
  if (!(await canView(shopId, "tireStorage.manage"))) return [];

  const q = filters.q?.trim();
  return db.tireStorageSet.findMany({
    where: {
      shopId,
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status as TireStorageStatus } : {}),
      ...(filters.season && filters.season !== "ALL" ? { season: filters.season } : {}),
      ...(q
        ? {
            OR: [
              { size: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { storageLocation: { contains: q, mode: "insensitive" } },
              { client: { firstName: { contains: q, mode: "insensitive" } } },
              { client: { lastName: { contains: q, mode: "insensitive" } } },
              { client: { phone: { contains: q, mode: "insensitive" } } },
              { vehicle: { licensePlate: { contains: q, mode: "insensitive" } } },
              { vehicle: { make: { contains: q, mode: "insensitive" } } },
              { vehicle: { model: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: setInclude,
    orderBy: [{ status: "asc" }, { checkedInAt: "desc" }],
    take: 300,
  });
}

export async function getTireStorageSet(id: string) {
  const shopId = await getShopId();
  if (!(await canView(shopId, "tireStorage.manage"))) redirect(ADMIN.tireStorage);
  const set = await db.tireStorageSet.findFirst({
    where: { id, shopId },
    include: { ...setInclude, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!set) redirect(ADMIN.tireStorage);
  return set;
}

/** Juegos de un cliente / vehículo, para las fichas (vacío si el plan no lo incluye). */
export async function getTireSetsForClient(clientId: string) {
  const shopId = await getShopId();
  if (!(await canView(shopId, "tireStorage.manage"))) return null;
  return db.tireStorageSet.findMany({
    where: { shopId, clientId },
    include: setInclude,
    orderBy: [{ status: "asc" }, { checkedInAt: "desc" }],
  });
}

export async function getTireSetsForVehicle(vehicleId: string) {
  const shopId = await getShopId();
  if (!(await canView(shopId, "tireStorage.manage"))) return null;
  return db.tireStorageSet.findMany({
    where: { shopId, vehicleId },
    include: setInclude,
    orderBy: [{ status: "asc" }, { checkedInAt: "desc" }],
  });
}

// ── WRITE ────────────────────────────────────────────────────

/** Cliente (y vehículo, si viene) deben ser de ESTE taller y el vehículo del cliente. */
async function resolveOwnership(
  shopId: string,
  clientId: string,
  vehicleId: string | null
): Promise<TireActionError | null> {
  const client = await db.client.findFirst({ where: { id: clientId, shopId }, select: { id: true } });
  if (!client) return "CLIENT_NOT_FOUND";
  if (vehicleId) {
    const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, clientId, client: { shopId } }, select: { id: true } });
    if (!vehicle) return "VEHICLE_MISMATCH";
  }
  return null;
}

function parseForm(formData: TireStorageFormData) {
  const parsed = tireStorageSchema.safeParse(formData);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const size = normalizeTireSize(parsed.data.size);
  if (!size) return { fieldErrors: { size: ["INVALID_SIZE"] } as Record<string, string[]> };
  return { data: { ...parsed.data, size } };
}

export async function createTireSet(formData: TireStorageFormData) {
  const shopId = await getWritableShopId();
  const session = await requireShopSession();
  const entitlementError = await checkEntitlement(shopId, "tireStorage.manage");
  if (entitlementError) return { error: { _form: [entitlementError] } };

  const p = parseForm(formData);
  if (!p.data) return { error: p.fieldErrors };
  const d = p.data;

  const ownership = await resolveOwnership(shopId, d.clientId, d.vehicleId || null);
  if (ownership) return { error: { _form: [ownership] } };

  const location = normalizeLocation(d.storageLocation);
  const set = await db.$transaction(async (tx) => {
    const created = await tx.tireStorageSet.create({
      data: {
        shopId,
        clientId: d.clientId,
        vehicleId: d.vehicleId || null,
        season: d.season,
        brand: d.brand?.trim() || null,
        model: d.model?.trim() || null,
        size: d.size,
        quantity: d.quantity,
        condition: d.condition,
        withRims: d.withRims,
        storageLocation: location,
        notes: d.notes?.trim() || null,
        status: "STORED",
      },
    });
    await tx.tireStorageEvent.create({
      data: { shopId, setId: created.id, type: "CHECK_IN", location, userId: session.user.id },
    });
    return created;
  });

  revalidatePath(ADMIN.tireStorage);
  redirect(adminPath(`/tire-storage/${set.id}`));
}

export async function updateTireSet(id: string, formData: TireStorageFormData) {
  const shopId = await getWritableShopId();
  const entitlementError = await checkEntitlement(shopId, "tireStorage.manage");
  if (entitlementError) return { error: { _form: [entitlementError] } };

  const p = parseForm(formData);
  if (!p.data) return { error: p.fieldErrors };
  const d = p.data;
  const ownership = await resolveOwnership(shopId, d.clientId, d.vehicleId || null);
  if (ownership) return { error: { _form: [ownership] } };

  const res = await db.tireStorageSet.updateMany({
    where: { id, shopId },
    data: {
      clientId: d.clientId,
      vehicleId: d.vehicleId || null,
      season: d.season,
      brand: d.brand?.trim() || null,
      model: d.model?.trim() || null,
      size: d.size,
      quantity: d.quantity,
      condition: d.condition,
      withRims: d.withRims,
      notes: d.notes?.trim() || null,
    },
  });
  if (res.count === 0) return { error: { _form: ["NOT_FOUND"] } };

  revalidatePath(ADMIN.tireStorage);
  redirect(adminPath(`/tire-storage/${id}`));
}

interface TransitionResult {
  ok: boolean;
  error?: TireActionError;
}

/** Salida del taller (el cliente se lleva las llantas). Solo desde STORED; atómico contra doble clic. */
export async function checkOutTireSet(id: string, note?: string): Promise<TransitionResult> {
  const shopId = await getWritableShopId();
  const session = await requireShopSession();
  const entitlementError = await checkEntitlement(shopId, "tireStorage.manage");
  if (entitlementError) return { ok: false, error: "INVALID_STATE" };

  const outcome = await db.$transaction(async (tx) => {
    const res = await tx.tireStorageSet.updateMany({
      where: { id, shopId, status: "STORED" },
      data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await tx.tireStorageSet.findFirst({ where: { id, shopId }, select: { id: true } });
      return exists ? ("INVALID_STATE" as const) : ("NOT_FOUND" as const);
    }
    const set = await tx.tireStorageSet.findFirst({ where: { id, shopId }, select: { storageLocation: true } });
    await tx.tireStorageEvent.create({
      data: { shopId, setId: id, type: "CHECK_OUT", location: set?.storageLocation ?? null, note: note?.trim() || null, userId: session.user.id },
    });
    return null;
  });
  if (outcome) return { ok: false, error: outcome };

  revalidatePath(ADMIN.tireStorage);
  revalidatePath(adminPath(`/tire-storage/${id}`));
  return { ok: true };
}

/** Volver a guardar un juego que había salido (p. ej. cambio de temporada). Solo desde CHECKED_OUT. */
export async function checkInTireSet(id: string, location?: string): Promise<TransitionResult> {
  const shopId = await getWritableShopId();
  const session = await requireShopSession();
  const entitlementError = await checkEntitlement(shopId, "tireStorage.manage");
  if (entitlementError) return { ok: false, error: "INVALID_STATE" };

  const loc = normalizeLocation(location);
  const outcome = await db.$transaction(async (tx) => {
    const res = await tx.tireStorageSet.updateMany({
      where: { id, shopId, status: "CHECKED_OUT" },
      data: { status: "STORED", checkedInAt: new Date(), checkedOutAt: null, ...(loc ? { storageLocation: loc } : {}) },
    });
    if (res.count === 0) {
      const exists = await tx.tireStorageSet.findFirst({ where: { id, shopId }, select: { id: true } });
      return exists ? ("INVALID_STATE" as const) : ("NOT_FOUND" as const);
    }
    const set = await tx.tireStorageSet.findFirst({ where: { id, shopId }, select: { storageLocation: true } });
    await tx.tireStorageEvent.create({
      data: { shopId, setId: id, type: "CHECK_IN", location: set?.storageLocation ?? null, userId: session.user.id },
    });
    return null;
  });
  if (outcome) return { ok: false, error: outcome };

  revalidatePath(ADMIN.tireStorage);
  revalidatePath(adminPath(`/tire-storage/${id}`));
  return { ok: true };
}

export async function moveTireSet(id: string, location: string): Promise<TransitionResult> {
  const shopId = await getWritableShopId();
  const session = await requireShopSession();
  const entitlementError = await checkEntitlement(shopId, "tireStorage.manage");
  if (entitlementError) return { ok: false, error: "INVALID_STATE" };

  const loc = normalizeLocation(location);
  if (!loc) return { ok: false, error: "INVALID_STATE" };

  const outcome = await db.$transaction(async (tx) => {
    const res = await tx.tireStorageSet.updateMany({
      where: { id, shopId, status: "STORED" },
      data: { storageLocation: loc },
    });
    if (res.count === 0) {
      const exists = await tx.tireStorageSet.findFirst({ where: { id, shopId }, select: { id: true } });
      return exists ? ("INVALID_STATE" as const) : ("NOT_FOUND" as const);
    }
    await tx.tireStorageEvent.create({
      data: { shopId, setId: id, type: "MOVED", location: loc, userId: session.user.id },
    });
    return null;
  });
  if (outcome) return { ok: false, error: outcome };

  revalidatePath(ADMIN.tireStorage);
  revalidatePath(adminPath(`/tire-storage/${id}`));
  return { ok: true };
}
