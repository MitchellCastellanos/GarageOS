"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireOwner } from "@/lib/permissions";
import { getShopId } from "@/lib/shop-context";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uploadShopLogoToStorage } from "@/lib/storage";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { validateLogo } from "@/lib/logo-upload";
import { adminLocaleToDb, type AdminLocale } from "@/lib/admin-locale";

// Recorta el borde uniforme/transparente del logo para que el dibujo llene
// su espacio (de lo contrario un PNG con mucho aire transparente se ve chico,
// sobre todo impreso). Conserva el formato y la transparencia.
async function trimLogo(buffer: Buffer, contentType: string): Promise<Buffer> {
  // SVG es vectorial: escala sin pérdida y no tiene padding rasterizado.
  if (contentType === "image/svg+xml") return buffer;
  try {
    return await sharp(buffer).trim().toBuffer();
  } catch {
    // Si el recorte falla (imagen uniforme o formato inesperado), usa el original.
    return buffer;
  }
}

// ── READ ────────────────────────────────────────────────────

export async function getShopSettings() {
  const shopId = await getShopId();
  return db.shop.findUnique({ where: { id: shopId } });
}

// ── UPDATE SHOP INFO ─────────────────────────────────────────

const shopSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  address: z.string().max(255).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  taxId: z.string().max(100).optional().or(z.literal("")),
});

export async function updateShopSettings(formData: FormData) {
  const shopId = await getShopId();

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

  const {
    name,
    address,
    phone,
    email,
    taxId,
  } = parsed.data;

  const updatedShop = await db.shop.update({
    where: { id: shopId },
    data: {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      taxId: taxId || null,
    },
  });

  // Mantiene SenderIdentity/CommunicationRoute sincronizados con los campos de email
  // recién guardados — ver docs/communications-platform.md y el comentario en
  // src/lib/communications/sender-identity.ts.
  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities falló:", err);
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── SLUG PÚBLICO (URL de reservas) ───────────────────

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mínimo 3 caracteres")
  .max(60, "Máximo 60 caracteres")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (sin empezar/terminar en guión)");

export async function updateShopSlug(formData: FormData) {
  const shopId = await getShopId();

  const parsed = slugSchema.safeParse(formData.get("slug"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Identificador inválido" };
  }

  try {
    await db.shop.update({ where: { id: shopId }, data: { slug: parsed.data } });
  } catch (err) {
    const isUniqueConflict =
      typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
    return { error: isUniqueConflict ? "Ese identificador ya está en uso" : "No se pudo guardar" };
  }

  revalidatePath(ADMIN.settings);
  return { success: true, slug: parsed.data };
}

// ── MAILBOXES ───────────────────────────────────────────────

const mailboxSchema = z.object({
  billingEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  infoEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  providersEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  newsletterEmail: z.string().email("Email inválido").optional().or(z.literal("")),
});

export async function updateMailboxSettings(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const raw = {
    billingEmail: formData.get("billingEmail") as string,
    infoEmail: formData.get("infoEmail") as string,
    providersEmail: formData.get("providersEmail") as string,
    newsletterEmail: formData.get("newsletterEmail") as string,
  };

  const parsed = mailboxSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const {
    billingEmail,
    infoEmail,
    providersEmail,
    newsletterEmail,
  } = parsed.data;

  const updatedShop = await db.shop.update({
    where: { id: shopId },
    data: {
      billingEmail: billingEmail || null,
      infoEmail: infoEmail || null,
      providersEmail: providersEmail || null,
      newsletterEmail: newsletterEmail || null,
    },
  });

  // Mantiene SenderIdentity/CommunicationRoute sincronizados con los campos de email
  // recién guardados — ver docs/communications-platform.md y el comentario en
  // src/lib/communications/sender-identity.ts.
  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities falló:", err);
  });

  revalidatePath(ADMIN.notifications);
  return { success: true };
}

// ── UPLOAD LOGO ──────────────────────────────────────────────

export async function uploadShopLogo(formData: FormData) {
  const shopId = await getShopId();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Supabase no está configurado. Agrega NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env / Vercel.",
    };
  }

  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "No se seleccionó ningún archivo" };
  const validation = validateLogo(file);
  if (validation === "empty") return { error: "No se seleccionó ningún archivo" };
  if (validation === "tooLarge") return { error: "El logo no puede superar 4 MB" };
  if (validation === "invalidType") return { error: "Solo se aceptan JPG, PNG, WebP o SVG" };

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
    const message = err instanceof Error ? err.message : "Error desconocido";
    return { error: `Error subiendo logo: ${message}` };
  }
}

// ── CHANGE PASSWORD ──────────────────────────────────────────

export async function changePassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);

  const current = formData.get("currentPassword") as string;
  const next = formData.get("newPassword") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!current || !next || !confirm) return { error: "Todos los campos son requeridos" };
  if (next.length < 8) return { error: "La nueva contraseña debe tener al menos 8 caracteres" };
  if (next !== confirm) return { error: "Las contraseñas no coinciden" };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.passwordHash) return { error: "Usuario no encontrado" };

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return { error: "La contraseña actual es incorrecta" };

  const hash = await bcrypt.hash(next, 12);
  await db.user.update({ where: { id: session.user.id }, data: { passwordHash: hash } });
  return { success: true };
}

// ── PREFERRED LOCALE ─────────────────────────────────────────

export async function updatePreferredLocale(locale: AdminLocale) {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);

  await db.user.update({
    where: { id: session.user.id },
    data: { preferredLocale: adminLocaleToDb(locale) },
  });

  revalidatePath(ADMIN.dashboard, "layout");
}
