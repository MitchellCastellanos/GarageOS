"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

// Server Actions para clientes
// "use server" le dice a Next.js que estas funciones corren SOLO en el servidor.
// Se pueden llamar directo desde formularios o componentes — sin fetch() manual.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { clientSchema, type ClientFormData } from "@/lib/validations";

// ── READ ────────────────────────────────────────────────────

export async function getClients(search?: string) {
  const shopId = await getShopId();

  return db.client.findMany({
    where: {
      shopId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { vehicles: true, invoices: true } },
    },
    orderBy: { lastName: "asc" },
  });
}

export async function getClientById(id: string) {
  const shopId = await getShopId();

  const client = await db.client.findFirst({
    where: { id, shopId }, // siempre scoped al shop — seguridad multi-tenant
    include: {
      vehicles: { orderBy: { createdAt: "desc" } },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { vehicles: { include: { vehicle: true }, orderBy: { sortOrder: "asc" } } },
      },
      _count: { select: { vehicles: true, invoices: true } },
    },
  });

  if (!client) redirect(ADMIN.clients);
  return client;
}

// ── CREATE ──────────────────────────────────────────────────

export async function createClient(formData: ClientFormData) {
  const shopId = await getShopId();

  const parsed = clientSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { firstName, lastName, email, phone, language, address, notes } = parsed.data;

  const client = await db.client.create({
    data: {
      shopId,
      firstName,
      lastName: lastName || null,
      email: email || null,
      phone: phone || null,
      language,
      address: address || null,
      notes: notes || null,
    },
  });

  // revalidatePath invalida el caché de la lista de clientes
  // para que Next.js re-fetch los datos actualizados
  revalidatePath(ADMIN.clients);
  redirect(`${ADMIN.clients}/${client.id}`);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateClient(id: string, formData: ClientFormData) {
  const shopId = await getShopId();

  const parsed = clientSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { firstName, lastName, email, phone, language, address, notes } = parsed.data;

  // Verificar que el cliente pertenece a este shop antes de actualizar
  await db.client.updateMany({
    where: { id, shopId },
    data: {
      firstName,
      lastName: lastName || null,
      email: email || null,
      phone: phone || null,
      language,
      address: address || null,
      notes: notes || null,
    },
  });

  revalidatePath(`/clients/${id}`);
  revalidatePath(ADMIN.clients);
  redirect(`${ADMIN.clients}/${id}`);
}

// ── DELETE ──────────────────────────────────────────────────

export async function deleteClient(id: string) {
  const shopId = await getShopId();

  // deleteMany con shopId garantiza que no puedas borrar clientes de otro shop
  await db.client.deleteMany({ where: { id, shopId } });

  revalidatePath(ADMIN.clients);
  redirect(ADMIN.clients);
}
