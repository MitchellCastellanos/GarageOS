"use server";

import type { Prisma } from "@prisma/client";
import { ADMIN } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireShopSession } from "@/lib/permissions";
import { unstable_update } from "@/lib/auth";
import { shopLocationSchema, type ShopLocationFormData } from "@/lib/validations";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { checkEntitlement } from "@/lib/subscription";
import { getOrganizationAdminContext, getOrganizationRootShopId, resolveLocationAccess } from "@/lib/organization";
import { additionalLocationsMonthlyCad, countAdditionalLocations, ADDITIONAL_LOCATION_BILLING_ENABLED } from "@/domain/locations";

// ── Ubicaciones accesibles para el usuario actual ──────────────
// El shop "de casa" (User.shopId) siempre es accesible implícitamente, sin
// necesidad de una fila en UserShopAccess — así no se requiere backfill
// para usuarios existentes. UserShopAccess solo agrega ubicaciones extra.

export async function getAccessibleShops() {
  const session = await requireShopSession();
  const access = await resolveLocationAccess(session.user.id, session.user.shopId!);
  return access.locations;
}

// ── Cambiar la ubicación activa ────────────────────────────────
// Actualiza el "shop de casa" del usuario; el cliente debe llamar a
// next-auth's update() después para refrescar el JWT (ver auth.ts, trigger
// "update").

export async function switchActiveShop(shopId: string) {
  const session = await requireShopSession();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];
  const previousShopId = session.user.shopId!;

  const accessible = await getAccessibleShops();
  if (!accessible.some((shop) => shop.id === shopId)) {
    return { error: t.locations.errors.noAccess };
  }
  if (shopId === previousShopId) return { success: true };

  // La ubicación activa es User.shopId (acceso implícito). Al moverla, la anterior debe quedar como
  // acceso explícito — si no, el usuario perdería el acceso a la ubicación de la que se va.
  await db.$transaction(async (tx) => {
    await tx.userShopAccess.upsert({
      where: { userId_shopId: { userId: session.user.id, shopId: previousShopId } },
      create: { userId: session.user.id, shopId: previousShopId },
      update: {},
    });
    await tx.user.update({ where: { id: session.user.id }, data: { shopId } });
  });
  // Re-firma la cookie de sesión con el shopId nuevo (jwt() en auth.ts
  // re-resuelve desde la DB en cada llamada) — sin esto el cambio no se
  // reflejaría hasta cerrar sesión.
  await unstable_update({});
  revalidatePath(ADMIN.dashboard);
  return { success: true };
}

// ── Organización / ubicaciones (gestión, solo administrador de la organización) ───────────
// Administrador = OWNER con acceso a la ubicación raíz (src/lib/organization.ts). Un OWNER de una
// ubicación hija no puede listar usuarios de otras ubicaciones ni concederse acceso.

export interface LocationUser {
  id: string;
  name: string;
  email: string;
  viaHome: boolean;
}

export async function getOrganizationLocations() {
  const session = await requireShopSession();
  const admin = await getOrganizationAdminContext(session);
  if (!admin) {
    return { organizationId: null, shops: [] as { id: string; name: string; users: LocationUser[] }[] };
  }

  const shops = await db.shop.findMany({
    where: { organizationId: admin.organizationId },
    select: {
      id: true,
      name: true,
      users: { select: { id: true, name: true, email: true } },
      userAccess: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    organizationId: admin.organizationId,
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

  const entitlementError = await checkEntitlement(session.user.shopId!, "organization.multiLocation");
  if (entitlementError) return { error: entitlementError };

  const parsed = shopLocationSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const currentShop = await db.shop.findUnique({ where: { id: session.user.shopId! } });
  if (!currentShop) return { error: t.locations.errors.shopNotFound };

  // Una organización existente solo la amplía su administrador; una tienda sin organización
  // (primera ubicación adicional) es su propia raíz.
  if (currentShop.organizationId) {
    const admin = await getOrganizationAdminContext(session);
    if (!admin) return { error: t.locations.errors.notOrgAdmin };
  }

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
        // Misma marca/fiscalía que la ubicación existente — el asistente de
        // arranque de esta ubicación nueva no vuelve a pedirlos (ver
        // src/actions/onboarding.ts); el dueño puede ajustarlos después
        // desde Configuración si esta ubicación factura distinto.
        logoUrl: currentShop.logoUrl,
        brandColor: currentShop.brandColor,
        taxId: currentShop.taxId,
        taxLines: currentShop.taxLines as Prisma.InputJsonValue,
        bookingTemplate: currentShop.bookingTemplate,
        bookingTypography: currentShop.bookingTypography,
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
  revalidatePath(ADMIN.organization);
  return { success: true, shopId: newShop.id };
}

// ── Otorgar/revocar acceso de un usuario existente a una ubicación ──

export async function getOrganizationUsers() {
  const session = await requireOwner();
  const admin = await getOrganizationAdminContext(session);
  if (!admin) return [];

  return db.user.findMany({
    where: { shop: { organizationId: admin.organizationId } },
    select: { id: true, name: true, email: true, shopId: true },
    orderBy: { name: "asc" },
  });
}

export async function grantLocationAccess(userId: string, shopId: string) {
  const session = await requireOwner();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const admin = await getOrganizationAdminContext(session);
  if (!admin) return { error: t.locations.errors.notOrgAdmin };

  const [targetShop, targetUser] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { organizationId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { role: true, shop: { select: { organizationId: true } } } }),
  ]);

  if (
    targetShop?.organizationId !== admin.organizationId ||
    targetUser?.shop?.organizationId !== admin.organizationId ||
    targetUser.role === "SUPER_ADMIN"
  ) {
    return { error: t.locations.errors.crossOrganization };
  }

  await db.userShopAccess.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId },
    update: {},
  });

  revalidatePath(ADMIN.settings);
  revalidatePath(ADMIN.organization);
  return { success: true };
}

export async function revokeLocationAccess(userId: string, shopId: string) {
  const session = await requireOwner();
  const locale = await getAdminLocale();
  const t = SETTINGS_DICT[locale];

  const admin = await getOrganizationAdminContext(session);
  if (!admin) return { error: t.locations.errors.notOrgAdmin };
  const targetShop = await db.shop.findUnique({ where: { id: shopId }, select: { organizationId: true } });
  if (targetShop?.organizationId !== admin.organizationId) return { error: t.locations.errors.crossOrganization };

  const target = await db.user.findUnique({ where: { id: userId }, select: { shopId: true } });
  if (!target) return { error: t.locations.errors.crossOrganization };

  // Si es la ubicación activa del usuario (acceso implícito), la revocación mueve su ubicación activa a
  // otra a la que aún tenga acceso; si no le queda ninguna, no se puede revocar (quedaría sin taller).
  if (target.shopId === shopId) {
    const other = await db.userShopAccess.findFirst({
      where: { userId, shopId: { not: shopId }, shop: { organizationId: admin.organizationId } },
      select: { shopId: true },
    });
    if (!other) return { error: t.locations.errors.lastLocation };
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { shopId: other.shopId } });
      await tx.userShopAccess.deleteMany({ where: { userId, shopId } });
    });
  } else {
    await db.userShopAccess.deleteMany({ where: { userId, shopId } });
  }

  revalidatePath(ADMIN.settings);
  revalidatePath(ADMIN.organization);
  return { success: true };
}

// ── Vista de la organización (Complete) ─────────────────────────

export interface OrganizationLocationSummary {
  id: string;
  name: string;
  isActive: boolean;
  isRoot: boolean;
  openWorkOrders: number;
  clients: number;
  teamMembers: number;
}

export interface OrganizationOverview {
  organizationId: string;
  organizationName: string;
  locations: OrganizationLocationSummary[];
  additionalLocations: number;
  /** Cobro automático por ubicación adicional: inactivo hasta confirmar precio + Price de Stripe. */
  additionalLocationBilling: { active: boolean; monthlyCad: number };
}

/**
 * Resumen para el administrador de la organización: ubicaciones a las que tiene acceso, cuál está activa
 * y contadores operativos por ubicación (sin dinero — el dinero vive en Reportes con `financial.view`).
 */
export async function getOrganizationOverview(): Promise<OrganizationOverview | null> {
  const session = await requireShopSession();
  const admin = await getOrganizationAdminContext(session);
  if (!admin) return null;

  const ids = admin.locations.map((l) => l.id);
  const [org, shops, openWo, clients, team, total] = await Promise.all([
    db.organization.findUnique({ where: { id: admin.organizationId }, select: { name: true } }),
    db.shop.findMany({ where: { id: { in: ids }, organizationId: admin.organizationId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    db.workOrder.groupBy({ by: ["shopId"], where: { shopId: { in: ids }, status: { in: ["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"] } }, _count: { _all: true } }),
    db.client.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _count: { _all: true } }),
    db.user.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _count: { _all: true } }),
    db.shop.count({ where: { organizationId: admin.organizationId } }),
  ]);
  const count = (rows: { shopId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.shopId === id)?._count._all ?? 0;
  const rootId = admin.rootShopId ?? (await getOrganizationRootShopId(admin.organizationId));

  return {
    organizationId: admin.organizationId,
    organizationName: org?.name ?? "",
    locations: shops.map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.id === admin.activeShopId,
      isRoot: s.id === rootId,
      openWorkOrders: count(openWo, s.id),
      clients: count(clients, s.id),
      teamMembers: count(team, s.id),
    })),
    additionalLocations: countAdditionalLocations(total),
    additionalLocationBilling: {
      active: ADDITIONAL_LOCATION_BILLING_ENABLED,
      monthlyCad: ADDITIONAL_LOCATION_BILLING_ENABLED ? additionalLocationsMonthlyCad(total) : 0,
    },
  };
}
