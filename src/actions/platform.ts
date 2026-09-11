"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { z } from "zod";

const shopSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
});

const ownerSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const shopRoleSchema = z.enum(["OWNER", "MECHANIC", "VIEWER"]);

// ── READ ────────────────────────────────────────────────────

export async function getPlatformOverview() {
  await requireSuperAdmin();

  const shops = await db.shop.findMany({
    include: {
      _count: { select: { users: true, clients: true, invoices: true } },
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { role: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return shops;
}

export async function getShopForAdmin(shopId: string) {
  await requireSuperAdmin();

  return db.shop.findUnique({
    where: { id: shopId },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { role: "asc" },
      },
      _count: { select: { clients: true, invoices: true } },
    },
  });
}

// ── SHOP ────────────────────────────────────────────────────

export async function createShop(formData: FormData) {
  await requireSuperAdmin();

  const parsed = shopSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) return { error: "Datos del taller inválidos" };

  const shop = await db.shop.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    },
  });

  revalidatePath(PLATFORM.home);
  return { success: true, shopId: shop.id };
}

// ── USERS (taller) ──────────────────────────────────────────

export async function createShopOwner(formData: FormData) {
  await requireSuperAdmin();

  const parsed = ownerSchema.safeParse({
    shopId: formData.get("shopId"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Datos inválidos para el dueño" };
  }

  const { shopId, name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return { error: "Taller no encontrado" };

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return { error: "Este correo ya está registrado" };

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      shopId,
      name,
      email: normalizedEmail,
      passwordHash,
      role: "OWNER",
    },
  });

  revalidatePath(PLATFORM.home);
  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

export async function createShopUser(formData: FormData) {
  await requireSuperAdmin();

  const shopId = formData.get("shopId") as string;
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const roleParsed = shopRoleSchema.safeParse(formData.get("role"));

  if (!shopId || !name || !email || !password || !roleParsed.success) {
    return { error: "Datos inválidos" };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "Este correo ya está registrado" };

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      shopId,
      name,
      email,
      passwordHash,
      role: roleParsed.data,
    },
  });

  revalidatePath(PLATFORM.shop(shopId));
  revalidatePath(PLATFORM.home);
  return { success: true };
}

export async function resetShopUserPassword(formData: FormData) {
  await requireSuperAdmin();

  const userId = formData.get("userId") as string;
  const newPassword = formData.get("newPassword") as string;
  const shopId = formData.get("shopId") as string;

  if (!userId || !newPassword || newPassword.length < 8) {
    return { error: "Contraseña inválida (mínimo 8 caracteres)" };
  }

  const user = await db.user.findFirst({
    where: { id: userId, shopId, role: { not: "SUPER_ADMIN" } },
  });
  if (!user) return { error: "Usuario no encontrado" };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

export async function deleteShopUser(userId: string, shopId: string) {
  await requireSuperAdmin();

  const user = await db.user.findFirst({
    where: { id: userId, shopId },
  });
  if (!user) return { error: "Usuario no encontrado" };

  if (user.role === "OWNER") {
    const ownerCount = await db.user.count({ where: { shopId, role: "OWNER" } });
    if (ownerCount <= 1) return { error: "No puedes eliminar al único dueño del taller" };
  }

  await db.user.delete({ where: { id: userId } });
  revalidatePath(PLATFORM.shop(shopId));
  revalidatePath(PLATFORM.home);
  return { success: true };
}
