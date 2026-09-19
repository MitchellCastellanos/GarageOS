"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getShopId } from "@/lib/shop-context";
import { requireShopSession } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uploadShopLogoToStorage } from "@/lib/storage";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { sendShopEmailVerification } from "@/lib/email-verification";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { validateLogo } from "@/lib/logo-upload";
import { adminLocaleToDb, type AdminLocale } from "@/lib/admin-locale";

async function trimLogo(buffer: Buffer, contentType: string): Promise<Buffer> {
  if (contentType === "image/svg+xml") return buffer;
  try {
    return await sharp(buffer).trim().toBuffer();
  } catch {
    return buffer;
  }
}

export async function getShopSettings() {
  const shopId = await getShopId();
  return db.shop.findUnique({ where: { id: shopId } });
}

const shopSchema = z.object({
  name: z.string().min(1, "Shop name is required").max(100),
  address: z.string().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  taxId: z.string().max(100).optional().or(z.literal("")),
});

export async function updateShopSettings(formData: FormData) {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const raw = {
    name: formData.get("name") as string,
    address: formData.get("address") as string,
    phone: formData.get("phone") as string,
    email: formData.get("email") as string,
    taxId: formData.get("taxId") as string,
  };

  const parsed = shopSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, address, phone, email, taxId } = parsed.data;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  const previous = await db.shop.findUnique({ where: { id: shopId }, select: { email: true, emailVerified: true } });
  const previousEmail = previous?.email?.trim().toLowerCase() || null;
  const loginEmailMatch = session.user.role === "OWNER" && normalizedEmail === session.user.email?.trim().toLowerCase();

  let emailVerified: Date | null;
  let shouldSendVerification = false;

  if (!normalizedEmail) {
    emailVerified = null;
  } else if (normalizedEmail === previousEmail) {
    // Sin cambio real en el correo — no reiniciar una confirmación que ya tenía.
    emailVerified = previous?.emailVerified ?? null;
  } else if (loginEmailMatch) {
    // Es el mismo correo con el que el dueño inicia sesión — ya está probado
    // (src/lib/auth.ts fuerza esa verificación al login), no hace falta mandar otro correo.
    emailVerified = new Date();
  } else {
    emailVerified = null;
    shouldSendVerification = true;
  }

  const updatedShop = await db.shop.update({
    where: { id: shopId },
    data: {
      name,
      address: address || null,
      phone: phone || null,
      email: normalizedEmail,
      taxId: taxId || null,
      emailVerified,
    },
  });

  if (shouldSendVerification && normalizedEmail) {
    await sendShopEmailVerification({ shopId, email: normalizedEmail, shopName: updatedShop.name }).catch((err) =>
      console.error("[updateShopSettings] sendShopEmailVerification falló:", err)
    );
  }

  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities failed:", err);
  });

  revalidatePath(ADMIN.settings);
  revalidatePath(ADMIN.notifications);
  return { success: true, email: normalizedEmail, emailVerified: !!emailVerified };
}

/** Botón de acceso rápido en Configuración → General — usa el correo con el que ya iniciaste sesión como email principal, auto-confirmado (ver updateShopSettings). Solo tiene sentido para OWNER, el único rol con login forzosamente verificado. */
export async function setShopContactToLoginEmail() {
  const session = await requireShopSession();
  if (session.user.role !== "OWNER" || !session.user.email) {
    return { error: "No autorizado" };
  }

  const shopId = session.user.shopId!;
  const email = session.user.email.trim().toLowerCase();

  const updatedShop = await db.shop.update({
    where: { id: shopId },
    data: { email, emailVerified: new Date() },
  });

  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities failed:", err);
  });

  revalidatePath(ADMIN.settings);
  revalidatePath(ADMIN.notifications);
  return { success: true, email };
}

/** Reenviar la verificación del email principal del taller — desde el badge "sin confirmar" en Configuración. */
export async function resendShopEmailVerification() {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { email: true, name: true, emailVerified: true } });
  if (!shop?.email) return { error: "No hay un correo principal configurado" };
  if (shop.emailVerified) return { error: "Este correo ya está confirmado" };

  await sendShopEmailVerification({ shopId, email: shop.email, shopName: shop.name });
  return { success: true };
}

const etransferSchema = z
  .object({
    etransferEnabled: z.coerce.boolean(),
    etransferEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  })
  .refine((data) => !data.etransferEnabled || !!data.etransferEmail, {
    message: "Email is required to enable this",
    path: ["etransferEmail"],
  });

export async function updateEtransferSettings(formData: FormData) {
  const shopId = await getShopId();

  const parsed = etransferSchema.safeParse({
    etransferEnabled: formData.get("etransferEnabled") === "on",
    etransferEmail: formData.get("etransferEmail") as string,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { etransferEnabled, etransferEmail } = parsed.data;

  await db.shop.update({
    where: { id: shopId },
    data: {
      etransferEnabled,
      etransferEmail: etransferEmail || null,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Minimum 3 characters")
  .max(60, "Maximum 60 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only (no leading or trailing hyphen)");

export async function updateShopSlug(formData: FormData) {
  const shopId = await getShopId();

  const parsed = slugSchema.safeParse(formData.get("slug"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid identifier" };
  }

  let updatedShop;
  try {
    updatedShop = await db.shop.update({ where: { id: shopId }, data: { slug: parsed.data } });
  } catch (err) {
    const isUniqueConflict =
      typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
    return { error: isUniqueConflict ? "That identifier is already in use" : "Could not save changes" };
  }

  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities failed:", err);
  });

  revalidatePath(ADMIN.settings);
  return { success: true, slug: parsed.data };
}

const brandColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color (use #RRGGBB format)");

export async function updateShopBrandColor(formData: FormData) {
  const shopId = await getShopId();

  const raw = (formData.get("brandColor") as string) ?? "";
  if (!raw.trim()) {
    await db.shop.update({ where: { id: shopId }, data: { brandColor: null } });
    revalidatePath(ADMIN.settings);
    return { success: true, brandColor: null };
  }

  const parsed = brandColorSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid color" };
  }

  await db.shop.update({ where: { id: shopId }, data: { brandColor: parsed.data } });
  revalidatePath(ADMIN.settings);
  return { success: true, brandColor: parsed.data };
}

export async function uploadShopLogo(formData: FormData) {
  const shopId = await getShopId();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env / Vercel.",
    };
  }

  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "No file selected" };
  const validation = validateLogo(file);
  if (validation === "empty") return { error: "No file selected" };
  if (validation === "tooLarge") return { error: "Logo must be 4 MB or smaller" };
  if (validation === "invalidType") return { error: "Only JPG, PNG, WebP or SVG files are accepted" };

  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const buffer = await trimLogo(rawBuffer, file.type);

    const { publicUrl } = await uploadShopLogoToStorage(shopId, buffer, file.type, ext);
    const logoUrl = `${publicUrl}?t=${Date.now()}`;

    await db.shop.update({ where: { id: shopId }, data: { logoUrl } });
    revalidatePath(ADMIN.settings);
    return { success: true, logoUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: `Error uploading logo: ${message}` };
  }
}

export async function changePassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);

  const current = formData.get("currentPassword") as string;
  const next = formData.get("newPassword") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!current || !next || !confirm) return { error: "All fields are required" };
  if (next.length < 8) return { error: "The new password must be at least 8 characters" };
  if (next !== confirm) return { error: "Passwords do not match" };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.passwordHash) return { error: "User not found" };

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };

  const hash = await bcrypt.hash(next, 12);
  await db.user.update({ where: { id: session.user.id }, data: { passwordHash: hash } });
  return { success: true };
}

export async function updatePreferredLocale(locale: AdminLocale) {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);

  const normalizedLocale: AdminLocale = locale === "fr" ? "fr" : "en";

  await db.user.update({
    where: { id: session.user.id },
    data: { preferredLocale: adminLocaleToDb(normalizedLocale) },
  });

  revalidatePath(ADMIN.dashboard, "layout");
}
