"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/permissions";
import { canAddUser } from "@/lib/subscription";
import { sendVerificationEmail } from "@/lib/email-verification";
import bcrypt from "bcryptjs";
import { z } from "zod";

const roleSchema = z.enum(["OWNER", "MECHANIC", "VIEWER"]);

const createUserSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: roleSchema,
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// ── READ ────────────────────────────────────────────────────

export async function getTeamMembers() {
  const session = await requireOwner();
  const members = await db.user.findMany({
    where: { shopId: session.user.shopId, role: { not: "SUPER_ADMIN" } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      emailVerified: true,
      receiveBillingNotifications: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return members as (Omit<(typeof members)[number], "role"> & {
    role: "OWNER" | "MECHANIC" | "VIEWER";
  })[];
}

// ── CREATE ──────────────────────────────────────────────────

export async function createTeamMember(formData: FormData) {
  const session = await requireOwner();

  const { allowed, limit } = await canAddUser(session.user.shopId!);
  if (!allowed) {
    return {
      error: {
        email: [
          `Tu plan actual permite hasta ${limit} usuarios — actualiza tu plan en Configuración → Facturación para agregar más.`,
        ],
      },
    };
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: { email: ["Este correo ya está registrado"] } };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      shopId: session.user.shopId,
      name,
      email,
      passwordHash,
      role,
    },
  });

  await sendVerificationEmail({ email, name }).catch((err) =>
    console.error("[createTeamMember] sendVerificationEmail falló:", err)
  );

  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── RESET PASSWORD (owner) ───────────────────────────────────

export async function resetTeamMemberPassword(formData: FormData) {
  const session = await requireOwner();

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    const msg = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { error: msg ?? "Datos inválidos" };
  }

  const { userId, newPassword } = parsed.data;

  const target = await db.user.findFirst({
    where: { id: userId, shopId: session.user.shopId },
  });

  if (!target) return { error: "Usuario no encontrado" };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── UPDATE ROLE ─────────────────────────────────────────────

export async function updateTeamMemberRole(formData: FormData) {
  const session = await requireOwner();

  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;

  const parsedRole = roleSchema.safeParse(role);
  if (!userId || !parsedRole.success) return { error: "Datos inválidos" };

  const target = await db.user.findFirst({
    where: { id: userId, shopId: session.user.shopId },
  });
  if (!target) return { error: "Usuario no encontrado" };

  if (target.id === session.user.id && parsedRole.data !== "OWNER") {
    return { error: "No puedes quitarte el rol de dueño a ti mismo" };
  }

  if (target.role === "OWNER" && parsedRole.data !== "OWNER") {
    const ownerCount = await db.user.count({
      where: { shopId: session.user.shopId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return { error: "Debe haber al menos un dueño en el taller" };
    }
  }

  await db.user.update({ where: { id: userId }, data: { role: parsedRole.data } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── DELETE ──────────────────────────────────────────────────

export async function deleteTeamMember(userId: string) {
  const session = await requireOwner();

  if (userId === session.user.id) {
    return { error: "No puedes eliminar tu propia cuenta" };
  }

  const target = await db.user.findFirst({
    where: { id: userId, shopId: session.user.shopId },
  });
  if (!target) return { error: "Usuario no encontrado" };

  if (target.role === "OWNER") {
    const ownerCount = await db.user.count({
      where: { shopId: session.user.shopId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return { error: "No puedes eliminar al único dueño del taller" };
    }
  }

  await db.user.delete({ where: { id: userId } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── VERIFICACIÓN DE EMAIL ────────────────────────────────────

/** Reenvía el correo de verificación al usuario logueado (banner "confirma tu correo"). */
export async function resendMyVerificationEmail() {
  const session = await requireSession();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, emailVerified: true },
  });
  if (!user) return { error: "Usuario no encontrado" };
  if (user.emailVerified) return { error: "Este correo ya está confirmado" };

  await sendVerificationEmail({ email: user.email, name: user.name });
  return { success: true };
}

/** El dueño reenvía la verificación a un miembro de su equipo (ej. un mecánico que no la recibió). */
export async function resendTeamMemberVerification(userId: string) {
  const session = await requireOwner();

  const target = await db.user.findFirst({
    where: { id: userId, shopId: session.user.shopId },
    select: { email: true, name: true, emailVerified: true },
  });
  if (!target) return { error: "Usuario no encontrado" };
  if (target.emailVerified) return { error: "Este correo ya está confirmado" };

  await sendVerificationEmail({ email: target.email, name: target.name });
  return { success: true };
}

// ── NOTIFICACIONES DE FACTURACIÓN (solo OWNER) ───────────────

/**
 * Cada OWNER decide si recibe los correos de facturación/cambios de plan de
 * GarageOS (opt-out, todos activos por defecto — ver resolveBillingNotificationRecipients).
 * Un owner puede prender/apagar esto para sí mismo o para otro owner del mismo taller.
 */
export async function updateOwnerBillingNotification(userId: string, receive: boolean) {
  const session = await requireOwner();

  const target = await db.user.findFirst({
    where: { id: userId, shopId: session.user.shopId, role: "OWNER" },
  });
  if (!target) return { error: "Usuario no encontrado" };

  await db.user.update({ where: { id: userId }, data: { receiveBillingNotifications: receive } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}
