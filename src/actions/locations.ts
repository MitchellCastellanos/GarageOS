"use server";

import { ADMIN } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireShopSession } from "@/lib/permissions";
import { unstable_update } from "@/lib/auth";
import { shopLocationSchema, type ShopLocationFormData } from "@/lib/validations";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

// ── Ubicaciones accesibles para el usuario actual ──────────────
// El shop "de casa" (User.shopId) siempre es accesible implícitamente, sin
// necesidad de una fila en UserShopAccess — así no se requiere backfill
// para usuarios existentes. UserShopAccess solo agrega ubicaciones extra.

export async function getAccessibleShops() {
  const session = await requireShopSession();
  const homeShopId = session.user.shopId!;

  const [homeShop, grants] = await Promise.all([
    db.shop.findUnique({ where: { id: homeShopId }, select: { id: true, name: true } }),
    db.userShopAccess.findMany({
      where: { userId: session.user.id },
      include: { shop: { select: { id: true, name: true } } },
    }),
  ]);

  const shops = new Map<string, { id: string; name: string }>();
  if (homeShop) shops.set(homeShop.id, homeShop);
  for (const grant of grants) shops.set(grant.shop.id, grant.shop);

  return Array.from(shops.values());
}

// ── Cambiar la ubicación activa ────────────────────────────────
// Actualiza el "shop de casa" del usuario; el cliente debe llamar a
// next-auth's update() después para refrescar el JWT (ver auth.ts, trigger
// "update").

export async function switchActiveShop(shopId: string) {
  const session = await requireShopSession();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const accessible = await getAccessibleShops();
  if (!accessible.some((shop) => shop.id === shopId)) {
    return { error: t.locations.errors.noAccess };
  }

  await db.user.update({ where: { id: session.user.id }, data: { shopId } });
  // Re-firma la cookie de sesión con el shopId nuevo (jwt() en auth.ts
  // re-resuelve desde la DB en cada llamada) — sin esto el cambio no se
  // reflejaría hasta cerrar sesión.
  await unstable_update({});
  revalidatePath(ADMIN.dashboard);
  return { success: true };
}

// ── Organización / ubicaciones (gestión, solo OWNER) ───────────

export interface LocationUser {
  id: string;
  name: string;
  email: string;
  viaHome: boolean;
}

export async function getOrganizationLocations() {
  const session = await requireShopSession();
  const shop = await db.shop.findUnique({
    where: { id: session.user.shopId! },
    select: { id: true, organizationId: true },
  });
  if (!shop?.organizationId) {
    return { organizationId: null, shops: [] as { id: string; name: string; users: LocationUser[] }[] };
  }

  const shops = await db.shop.findMany({
    where: { organizationId: shop.organizationId },
    select: {
      id: true,
      name: true,
      users: { select: { id: true, name: true, email: true } },
      userAccess: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    organizationId: shop.organizationId,
    shops: shops.map((s) => {
      const users = new Map<string, LocationUser>();
      for (const u of s.users) users.set(u.id, { ...u, viaHome: true });
      for (const grant of s.userAccess) {
        if (!users.has(grant.user.id)) users.set(grant.user.id, { ...grant.user, viaHome: false });
      }
      return { id: s.id, name: s.name, users: Array.from(users.values()) };
    }),
  };
}

export async function createShopLocation(formData: ShopLocationFormData) {
  const session = await requireOwner();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const parsed = shopLocationSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const currentShop = await db.shop.findUnique({ where: { id: session.user.shopId! } });
  if (!currentShop) return { error: t.locations.errors.shopNotFound };

  const newShop = await db.$transaction(async (tx) => {
    let organizationId = currentShop.organizationId;
    if (!organizationId) {
      const org = await tx.organization.create({ data: { name: currentShop.name } });
      organizationId = org.id;
      await tx.shop.update({ where: { id: currentShop.id }, data: { organizationId } });
    }

    const created = await tx.shop.create({
      data: {
        organizationId,
        name: parsed.data.name,
        currency: currentShop.currency,
        timezone: currentShop.timezone,
        defaultLanguage: currentShop.defaultLanguage,
      },
    });

    // El dueño que crea la ubicación queda con acceso a ella de inmediato,
    // sin cambiar su ubicación activa.
    await tx.userShopAccess.create({
      data: { userId: session.user.id, shopId: created.id },
    });

    return created;
  });

  await provisionDefaultSenderIdentities(newShop).catch((err) => {
    console.error("[locations] provisionDefaultSenderIdentities falló al crear ubicación:", err);
  });

  revalidatePath(ADMIN.settings);
  return { success: true, shopId: newShop.id };
}

// ── Otorgar/revocar acceso de un usuario existente a una ubicación ──

export async function getOrganizationUsers() {
  const session = await requireOwner();
  const shop = await db.shop.findUnique({
    where: { id: session.user.shopId! },
    select: { organizationId: true },
  });
  if (!shop?.organizationId) return [];

  return db.user.findMany({
    where: { shop: { organizationId: shop.organizationId } },
    select: { id: true, name: true, email: true, shopId: true },
    orderBy: { name: "asc" },
  });
}

export async function grantLocationAccess(userId: string, shopId: string) {
  const session = await requireOwner();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const [ownerShop, targetShop, targetUser] = await Promise.all([
    db.shop.findUnique({ where: { id: session.user.shopId! }, select: { organizationId: true } }),
    db.shop.findUnique({ where: { id: shopId }, select: { organizationId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { shop: { select: { organizationId: true } } } }),
  ]);

  const orgId = ownerShop?.organizationId;
  if (
    !orgId ||
    targetShop?.organizationId !== orgId ||
    targetUser?.shop?.organizationId !== orgId
  ) {
    return { error: t.locations.errors.crossOrganization };
  }

  await db.userShopAccess.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId },
    update: {},
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

export async function revokeLocationAccess(userId: string, shopId: string) {
  const session = await requireOwner();
  const ownerShop = await db.shop.findUnique({
    where: { id: session.user.shopId! },
    select: { organizationId: true },
  });
  const targetShop = await db.shop.findUnique({ where: { id: shopId }, select: { organizationId: true } });
  if (!ownerShop?.organizationId || targetShop?.organizationId !== ownerShop.organizationId) {
    return { error: "No autorizado" };
  }

  await db.userShopAccess.deleteMany({ where: { userId, shopId } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}
