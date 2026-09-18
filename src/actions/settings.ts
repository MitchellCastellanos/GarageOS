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

  const { name, address, phone, email, taxId } = parsed.data;

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

  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities failed:", err);
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

const mailboxSchema = z.object({
  billingEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  infoEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  newsletterEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
});

export async function updateMailboxSettings(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const raw = {
    billingEmail: formData.get("billingEmail") as string,
    infoEmail: formData.get("infoEmail") as string,
    newsletterEmail: formData.get("newsletterEmail") as string,
  };

  const parsed = mailboxSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { billingEmail, infoEmail, newsletterEmail } = parsed.data;

  const updatedShop = await db.shop.update({
    where: { id: shopId },
    data: {
      billingEmail: billingEmail || null,
      infoEmail: infoEmail || null,
      newsletterEmail: newsletterEmail || null,
    },
  });

  await provisionDefaultSenderIdentities(updatedShop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities failed:", err);
  });

  revalidatePath(ADMIN.notifications);
  return { success: true };
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
