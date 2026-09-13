"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { DEFAULT_WORKING_HOURS, getShopServiceCatalog } from "@/lib/booking-slots";
import { getPublicBookingUrl } from "@/lib/shop-slug";
import { dayLabel, type WorkingHoursRow } from "@/lib/working-hours";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { z } from "zod";

const INVALID_SCHEDULE_FOR: Record<AdminLocale, (day: string) => string> = {
  es: (day) => `Horario inválido para ${day}`,
  en: (day) => `Invalid schedule for ${day}`,
  fr: (day) => `Horaire invalide pour ${day}`,
};

export async function getAppointmentBookingSettings() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const locale = await getAdminLocale();

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    include: { workingHours: { orderBy: { dayOfWeek: "asc" } } },
  });

  if (!shop) return null;

  const mechanics = await db.user.findMany({
    where: {
      shopId,
      role: { in: ["MECHANIC", "OWNER"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, bookable: true },
  });

  let workingHours: WorkingHoursRow[] = DEFAULT_WORKING_HOURS.map((row) => ({
    ...row,
    dayLabel: dayLabel(row.dayOfWeek, locale),
  }));

  if (shop.workingHours.length > 0) {
    workingHours = shop.workingHours.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      dayLabel: dayLabel(row.dayOfWeek, locale),
      openTime: row.openTime,
      closeTime: row.closeTime,
      isClosed: row.isClosed,
    }));
  }

  const mechanicHoursRows = await db.mechanicWorkingHours.findMany({
    where: { userId: { in: mechanics.map((m) => m.id) } },
    orderBy: { dayOfWeek: "asc" },
  });

  const mechanicsWithHours = mechanics.map((mechanic) => {
    const rows = mechanicHoursRows.filter((r) => r.userId === mechanic.id);
    const usesShopHours = rows.length === 0;
    const hours: WorkingHoursRow[] = usesShopHours
      ? workingHours
      : workingHours.map((shopRow) => {
          const row = rows.find((r) => r.dayOfWeek === shopRow.dayOfWeek);
          return row
            ? {
                dayOfWeek: row.dayOfWeek,
                dayLabel: dayLabel(row.dayOfWeek, locale),
                openTime: row.openTime,
                closeTime: row.closeTime,
                isClosed: row.isClosed,
              }
            : { ...shopRow, isClosed: true };
        });

    return { ...mechanic, usesShopHours, workingHours: hours };
  });

  return {
    shop: {
      name: shop.name,
      logoUrl: shop.logoUrl,
      bookingEnabled: shop.bookingEnabled,
      timezone: shop.timezone,
      bookingSlotMinutes: shop.bookingSlotMinutes,
      bookingLeadTimeHours: shop.bookingLeadTimeHours,
      bookingAdvanceDays: shop.bookingAdvanceDays,
      bookingUrl: shop.slug ? getPublicBookingUrl(shop.slug) : null,
    },
    workingHours,
    mechanics: mechanicsWithHours,
  };
}

const bookingSettingsSchema = z.object({
  bookingSlotMinutes: z.coerce.number().int().min(15).max(240),
  bookingLeadTimeHours: z.coerce.number().int().min(1).max(168),
  bookingAdvanceDays: z.coerce.number().int().min(1).max(90),
});

export async function updateAppointmentBookingSettings(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const parsed = bookingSettingsSchema.safeParse({
    bookingSlotMinutes: formData.get("bookingSlotMinutes"),
    bookingLeadTimeHours: formData.get("bookingLeadTimeHours"),
    bookingAdvanceDays: formData.get("bookingAdvanceDays"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { bookingSlotMinutes, bookingLeadTimeHours, bookingAdvanceDays } =
    parsed.data;

  await db.shop.update({
    where: { id: shopId },
    data: {
      bookingSlotMinutes,
      bookingLeadTimeHours,
      bookingAdvanceDays,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

export async function updateWebBookingEnabled(enabled: boolean) {
  const session = await requireOwner();
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return { error: "Valor de reservas inválido" };

  const shop = await db.shop.update({
    where: { id: session.user.shopId! },
    data: { bookingEnabled: parsed.data },
    select: { slug: true, bookingEnabled: true },
  });

  if (shop.slug) revalidatePath(`/book/${shop.slug}`);
  revalidatePath(ADMIN.settings);
  return { success: true, bookingEnabled: shop.bookingEnabled };
}

const timeRegex = /^\d{2}:\d{2}$/;

export async function updateShopWorkingHours(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const locale = await getAdminLocale();

  const rows: {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[] = [];

  for (let day = 0; day <= 6; day++) {
    const isClosed = formData.get(`closed_${day}`) === "on";
    const openTime = (formData.get(`open_${day}`) as string) || "08:00";
    const closeTime = (formData.get(`close_${day}`) as string) || "17:00";

    if (!timeRegex.test(openTime) || !timeRegex.test(closeTime)) {
      return { error: { _form: [INVALID_SCHEDULE_FOR[locale](dayLabel(day, locale))] } };
    }

    rows.push({ dayOfWeek: day, openTime, closeTime, isClosed });
  }

  await db.$transaction([
    db.shopWorkingHours.deleteMany({ where: { shopId } }),
    db.shopWorkingHours.createMany({
      data: rows.map((row) => ({
        id: crypto.randomUUID(),
        shopId,
        ...row,
      })),
    }),
  ]);

  revalidatePath(ADMIN.settings);
  return { success: true };
}

export async function updateMechanicBookable(userId: string, bookable: boolean) {
  const session = await requireOwner();

  const user = await db.user.findFirst({
    where: {
      id: userId,
      shopId: session.user.shopId,
      role: { in: ["MECHANIC", "OWNER"] },
    },
  });

  if (!user) return { error: "Mecánico no encontrado" };

  await db.user.update({ where: { id: userId }, data: { bookable } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── DISPONIBILIDAD POR MECÁNICO ────────────────────────────────

async function findShopMechanic(userId: string, shopId: string) {
  return db.user.findFirst({
    where: { id: userId, shopId, role: { in: ["MECHANIC", "OWNER"] } },
  });
}

export async function updateMechanicWorkingHours(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const locale = await getAdminLocale();

  const userId = formData.get("userId") as string;
  if (!userId) return { error: { _form: ["Mecánico no especificado"] } };

  const mechanic = await findShopMechanic(userId, shopId);
  if (!mechanic) return { error: { _form: ["Mecánico no encontrado"] } };

  const rows: {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[] = [];

  for (let day = 0; day <= 6; day++) {
    const isClosed = formData.get(`closed_${day}`) === "on";
    const openTime = (formData.get(`open_${day}`) as string) || "08:00";
    const closeTime = (formData.get(`close_${day}`) as string) || "17:00";

    if (!timeRegex.test(openTime) || !timeRegex.test(closeTime)) {
      return { error: { _form: [INVALID_SCHEDULE_FOR[locale](dayLabel(day, locale))] } };
    }

    rows.push({ dayOfWeek: day, openTime, closeTime, isClosed });
  }

  await db.$transaction([
    db.mechanicWorkingHours.deleteMany({ where: { userId } }),
    db.mechanicWorkingHours.createMany({
      data: rows.map((row) => ({
        id: crypto.randomUUID(),
        userId,
        ...row,
      })),
    }),
  ]);

  revalidatePath(ADMIN.settings);
  return { success: true };
}

/** El mecánico vuelve a seguir el horario general del taller (borra su horario propio). */
export async function resetMechanicWorkingHours(userId: string) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const mechanic = await findShopMechanic(userId, shopId);
  if (!mechanic) return { error: "Mecánico no encontrado" };

  await db.mechanicWorkingHours.deleteMany({ where: { userId } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── SERVICIOS DEL CALENDARIO PÚBLICO ────────────────────────────

/**
 * Catálogo de servicios del taller para /admin/settings: si el taller nunca
 * guardó nada, ve el catálogo de fábrica (src/lib/service-catalog.ts +
 * src/lib/site-locale.ts); en cuanto guarda algo, ShopBookingService pasa a
 * ser la única verdad.
 */
export async function getServiceCatalogSettings() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  return getShopServiceCatalog(shopId);
}

const serviceRowSchema = z.object({
  labelFr: z.string().trim().min(1, "Falta el nombre en francés").max(120),
  labelEn: z.string().trim().min(1, "Falta el nombre en inglés").max(120),
  labelEs: z.string().trim().min(1, "Falta el nombre en español").max(120),
  durationMinutes: z.coerce.number().int().min(5, "Mínimo 5 minutos").max(480, "Máximo 480 minutos"),
  isActive: z.boolean(),
});

const serviceCatalogSchema = z.array(serviceRowSchema).min(1, "Agrega al menos un servicio").max(50);

/**
 * Reemplaza TODO el catálogo de servicios del taller de una sola vez — el
 * admin puede agregar, editar o quitar filas libremente desde la UI, así
 * que no tiene sentido intentar actualizar fila por fila (mismo patrón que
 * updateShopWorkingHours: borra todo y vuelve a crear).
 */
export async function updateServiceCatalog(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("services") ?? "[]"));
  } catch {
    return { error: { _form: ["Datos de servicios inválidos"] } };
  }

  const parsed = serviceCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: { _form: [parsed.error.issues[0]?.message ?? "Datos inválidos"] } };
  }

  await db.$transaction([
    db.shopBookingService.deleteMany({ where: { shopId } }),
    db.shopBookingService.createMany({
      data: parsed.data.map((row, index) => ({
        id: crypto.randomUUID(),
        shopId,
        sortOrder: index,
        ...row,
      })),
    }),
  ]);

  revalidatePath(ADMIN.settings);
  return { success: true };
}

const reminderSchema = z.object({
  appointmentReminderHours: z.coerce.number().int().min(1).max(168),
  appointmentSmsEnabled: z.coerce.boolean(),
  appointmentEmailsEnabled: z.coerce.boolean(),
});

export async function updateAppointmentReminderSettings(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const parsed = reminderSchema.safeParse({
    appointmentReminderHours: formData.get("appointmentReminderHours"),
    appointmentSmsEnabled: formData.get("appointmentSmsEnabled") === "on",
    appointmentEmailsEnabled: formData.get("appointmentEmailsEnabled") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  await db.shop.update({ where: { id: shopId }, data: parsed.data });
  revalidatePath(ADMIN.settings);
  return { success: true };
}
