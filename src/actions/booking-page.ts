"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { getShopServiceCatalog } from "@/lib/booking-slots";
import { bookingPublicUrl, bookingSubdomainUrl } from "@/config/app";
import { can } from "@/lib/subscription";
import { publicUrlForStoragePath, uploadBookingPageImageToStorage } from "@/lib/storage";
import {
  BOOKING_IMAGE_KINDS,
  BOOKING_IMAGE_MAX_WIDTH,
  bookingImageStorageFolder,
  toPublicServices,
  validateBookingImage,
  validateBookingPagePublish,
  type BookingImageKind,
  type PublishBookingPageInput,
} from "@/lib/booking-page";

/**
 * Códigos de error (no texto) — el configurador los traduce con su
 * diccionario (src/lib/admin-locale/booking-page.ts).
 */
export type BookingPageActionError =
  | "notConfigured"
  | "noFile"
  | "tooLarge"
  | "invalidType"
  | "uploadFailed"
  | "invalid"
  | "invalidImage"
  | "entitlement";

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Todo lo que el configurador necesita: la config publicada, datos reales del taller y servicios. */
export async function getBookingPageSettings() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      phone: true,
      address: true,
      brandColor: true,
      bookingEnabled: true,
      bookingSlotMinutes: true,
      bookingTemplate: true,
      bookingTypography: true,
      bookingCoverImageUrl: true,
      bookingShopImageUrl: true,
      bookingPagePublishedAt: true,
      domains: { where: { purpose: "LANDING", status: "VERIFIED" }, select: { domain: true } },
    },
  });
  if (!shop) return null;

  const [catalog, advancedDesignAllowed] = await Promise.all([
    getShopServiceCatalog(shopId),
    can(shopId, "bookingPage.advancedDesign"),
  ]);

  // Misma prioridad que DomainSettings: dominio propio verificado →
  // subdominio {slug}.garageos.com → /book/{slug}.
  const customDomain = shop.domains[0]?.domain;
  const publicUrl = shop.slug
    ? customDomain
      ? `https://${customDomain}`
      : (bookingSubdomainUrl(shop.slug) ?? bookingPublicUrl(shop.slug))
    : null;

  return {
    shop: {
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      phone: shop.phone,
      address: shop.address,
      bookingEnabled: shop.bookingEnabled,
      bookingSlotMinutes: shop.bookingSlotMinutes,
    },
    published: {
      template: shop.bookingTemplate,
      typography: shop.bookingTypography,
      brandColor: shop.brandColor,
      coverImageUrl: shop.bookingCoverImageUrl,
      shopImageUrl: shop.bookingShopImageUrl,
    },
    publishedAt: shop.bookingPagePublishedAt,
    services: toPublicServices(catalog),
    advancedDesignAllowed,
    publicUrl,
  };
}

/**
 * Sube una foto como BORRADOR: devuelve la URL pero no toca el Shop — la
 * página pública solo cambia en publishBookingPage. Se normaliza con sharp
 * (orientación EXIF, ancho máximo, WebP) para que la landing cargue rápido.
 */
export async function uploadBookingPageImage(
  formData: FormData
): Promise<{ success: true; url: string } | { error: BookingPageActionError }> {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  if (!storageConfigured()) return { error: "notConfigured" };

  const kind = formData.get("kind");
  if (!BOOKING_IMAGE_KINDS.includes(kind as BookingImageKind)) return { error: "invalid" };

  const file = formData.get("image");
  if (!(file instanceof File)) return { error: "noFile" };
  const validation = validateBookingImage(file);
  if (validation === "empty") return { error: "noFile" };
  if (validation) return { error: validation };

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const buffer = await sharp(input)
      .rotate()
      .resize({ width: BOOKING_IMAGE_MAX_WIDTH[kind as BookingImageKind], withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const { publicUrl } = await uploadBookingPageImageToStorage(
      bookingImageStorageFolder(shopId),
      kind as BookingImageKind,
      buffer
    );
    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("[booking-page] image upload failed:", err);
    return { error: "uploadFailed" };
  }
}

/**
 * Publica la configuración del configurador en la página pública. El
 * entitlement se valida ACÁ (no solo en la UI): un request armado a mano
 * desde un plan Core no puede guardar una plantilla/tipografía Pro.
 */
export async function publishBookingPage(
  input: PublishBookingPageInput
): Promise<{ success: true; publishedAt: Date } | { error: BookingPageActionError }> {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const current = await db.shop.findUnique({
    where: { id: shopId },
    select: { slug: true, bookingCoverImageUrl: true, bookingShopImageUrl: true },
  });
  if (!current) return { error: "invalid" };

  const result = validateBookingPagePublish(input, {
    advancedDesignAllowed: await can(shopId, "bookingPage.advancedDesign"),
    folderPublicUrl: storageConfigured() ? publicUrlForStoragePath(bookingImageStorageFolder(shopId)) : null,
    currentImages: [current.bookingCoverImageUrl, current.bookingShopImageUrl],
  });
  if (!result.ok) return { error: result.error };
  const data = result.data;

  const publishedAt = new Date();
  await db.shop.update({
    where: { id: shopId },
    data: {
      bookingTemplate: data.template,
      bookingTypography: data.typography,
      brandColor: data.brandColor,
      bookingCoverImageUrl: data.coverImageUrl || null,
      bookingShopImageUrl: data.shopImageUrl || null,
      bookingPagePublishedAt: publishedAt,
    },
  });

  if (current.slug) revalidatePath(`/book/${current.slug}`);
  revalidatePath(ADMIN.settings);
  return { success: true, publishedAt };
}
