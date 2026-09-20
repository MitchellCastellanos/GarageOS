"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { createDefaultSubscription, resolveBillingNotificationRecipients } from "@/lib/subscription";
import { sendVerificationEmail } from "@/lib/email-verification";
import { auth, unstable_update } from "@/lib/auth";
import { logPlatformAction, getShopAuditLog } from "@/lib/platform/audit";
import { notifyPlanChanged, notifySubscriptionCanceled } from "@/lib/platform/notify";
import { updateStripeSubscriptionPrice, cancelStripeSubscriptionAtPeriodEnd, getPriceId } from "@/lib/stripe";
import { PLANS, PLAN_PRICING_CAD, type Plan } from "@/config/entitlements";
import bcrypt from "bcryptjs";
import { z } from "zod";

const REASON_MIN_LENGTH = 10;

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

/**
 * Indicadores de crecimiento para el dashboard de /platform — MRR, altas
 * recientes, % de cancelación (últimos 30 días) y cohortes por mes de alta.
 */
export async function getPlatformGrowth() {
  await requireSuperAdmin();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const since180d = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [totalShops, newShops30d, newShops90d, subscriptions, cancellations30d, cancellationsAll, cohortsRaw] = await Promise.all([
    db.shop.count(),
    db.shop.count({ where: { createdAt: { gte: since30d } } }),
    db.shop.count({ where: { createdAt: { gte: since90d } } }),
    db.subscription.findMany({ select: { plan: true, status: true, billingInterval: true } }),
    db.subscriptionCancellation.count({ where: { createdAt: { gte: since30d } } }),
    db.subscriptionCancellation.count(),
    db.$queryRaw<{ month: Date; count: bigint }[]>`
      SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS count
      FROM "garageos"."Shop"
      WHERE "createdAt" >= ${since180d}
      GROUP BY 1 ORDER BY 1 ASC
    `,
  ]);

  const byStatus: Record<string, number> = {};
  let mrr = 0;
  for (const sub of subscriptions) {
    byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;
    if (sub.status === "ACTIVE" || sub.status === "PAST_DUE") {
      const pricing = PLAN_PRICING_CAD[sub.plan];
      mrr += sub.billingInterval === "YEARLY" ? pricing.yearly / 12 : pricing.monthly;
    }
  }

  const activeNow = (byStatus["ACTIVE"] ?? 0) + (byStatus["TRIALING"] ?? 0) + (byStatus["PAST_DUE"] ?? 0);
  const churnBase = activeNow + cancellations30d;
  const churnRate30d = churnBase > 0 ? (cancellations30d / churnBase) * 100 : 0;

  return {
    totalShops,
    newShops30d,
    newShops90d,
    mrr,
    byStatus,
    cancellations30d,
    cancellationsAll,
    churnRate30d,
    cohorts: cohortsRaw.map((r) => ({ month: r.month.toISOString().slice(0, 7), count: Number(r.count) })),
  };
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
      _count: {
        select: { clients: true, invoices: true, workOrders: true, appointments: true },
      },
      subscription: {
        include: { cancellations: { orderBy: { createdAt: "desc" }, take: 5 } },
      },
    },
  });
}

export async function getShopUsageSnapshot(shopId: string) {
  await requireSuperAdmin();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [
    workOrders30d,
    invoices30d,
    appointments30d,
    lastWorkOrder,
    lastInvoice,
    lastAppointment,
    overdueInvoiceCount,
  ] = await Promise.all([
    db.workOrder.count({ where: { shopId, createdAt: { gte: since30d } } }),
    db.invoice.count({ where: { shopId, createdAt: { gte: since30d } } }),
    db.appointment.count({ where: { shopId, createdAt: { gte: since30d } } }),
    db.workOrder.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.invoice.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.appointment.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.invoice.count({ where: { shopId, status: "OVERDUE" } }),
  ]);

  const lastActivityAt = [lastWorkOrder?.createdAt, lastInvoice?.createdAt, lastAppointment?.createdAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    workOrders30d,
    invoices30d,
    appointments30d,
    lastActivityAt,
    isInactive90d: lastActivityAt ? lastActivityAt < since90d : true,
    overdueInvoiceCount,
  };
}

export async function getShopNotes(shopId: string) {
  await requireSuperAdmin();
  return db.platformNote.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
}

export async function getShopAuditLogEntries(shopId: string) {
  await requireSuperAdmin();
  return getShopAuditLog(shopId);
}

// ── SHOP ────────────────────────────────────────────────────

export async function createShop(formData: FormData) {
  const session = await requireSuperAdmin();

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

  // Identidad de envío inicial (Communications Platform) — no bloquea la creación si falla.
  await provisionDefaultSenderIdentities(shop).catch((err) => {
    console.error("[communications] provisionDefaultSenderIdentities falló al crear taller:", err);
  });
  await createDefaultSubscription(db, shop.id).catch((err) => {
    console.error("[subscription] createDefaultSubscription falló al crear taller:", err);
  });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId: shop.id,
    action: "SHOP_CREATED",
    targetType: "SHOP",
    targetId: shop.id,
  });

  revalidatePath(PLATFORM.home);
  return { success: true, shopId: shop.id };
}

/**
 * Interruptor de emergencia (Fase 7, doc §20) — pausa envíos sin tocar datos de negocio.
 * recordAndSend revisa este campo en cada intento de envío.
 */
export async function toggleShopCommunicationsSuspension(shopId: string, suspend: boolean) {
  const session = await requireSuperAdmin();

  await db.shop.update({
    where: { id: shopId },
    data: { communicationsSuspendedAt: suspend ? new Date() : null },
  });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: suspend ? "COMMUNICATIONS_SUSPENDED" : "COMMUNICATIONS_RESUMED",
    targetType: "SHOP",
    targetId: shopId,
  });

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

// ── USERS (taller) ──────────────────────────────────────────

export async function createShopOwner(formData: FormData) {
  const session = await requireSuperAdmin();

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

  const created = await db.user.create({
    data: {
      shopId,
      name,
      email: normalizedEmail,
      passwordHash,
      role: "OWNER",
    },
  });

  await sendVerificationEmail({ email: normalizedEmail, name, language: shop.defaultLanguage === "FR" ? "FR" : "EN" }).catch((err) =>
    console.error("[createShopOwner] sendVerificationEmail falló:", err)
  );

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "OWNER_CREATED",
    targetType: "USER",
    targetId: created.id,
    metadata: { email: normalizedEmail },
  });

  revalidatePath(PLATFORM.home);
  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

export async function createShopUser(formData: FormData) {
  const session = await requireSuperAdmin();

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

  const created = await db.user.create({
    data: {
      shopId,
      name,
      email,
      passwordHash,
      role: roleParsed.data,
    },
  });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "USER_CREATED",
    targetType: "USER",
    targetId: created.id,
    metadata: { email, role: roleParsed.data },
  });

  revalidatePath(PLATFORM.shop(shopId));
  revalidatePath(PLATFORM.home);
  return { success: true };
}

export async function resetShopUserPassword(formData: FormData) {
  const session = await requireSuperAdmin();

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

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "PASSWORD_RESET",
    targetType: "USER",
    targetId: userId,
    metadata: { targetEmail: user.email },
  });

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

export async function deleteShopUser(userId: string, shopId: string) {
  const session = await requireSuperAdmin();

  const user = await db.user.findFirst({
    where: { id: userId, shopId },
  });
  if (!user) return { error: "Usuario no encontrado" };

  if (user.role === "OWNER") {
    const ownerCount = await db.user.count({ where: { shopId, role: "OWNER" } });
    if (ownerCount <= 1) return { error: "No puedes eliminar al único dueño del taller" };
  }

  await db.user.delete({ where: { id: userId } });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "USER_DELETED",
    targetType: "USER",
    targetId: userId,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath(PLATFORM.shop(shopId));
  revalidatePath(PLATFORM.home);
  return { success: true };
}

// ── NOTAS INTERNAS ──────────────────────────────────────────

export async function addPlatformNote(shopId: string, body: string) {
  const session = await requireSuperAdmin();

  const trimmed = body.trim();
  if (!trimmed) return { error: "La nota no puede estar vacía" };

  await db.platformNote.create({ data: { shopId, authorUserId: session.user.id, body: trimmed } });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "NOTE_ADDED",
    targetType: "SHOP",
    targetId: shopId,
  });

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

// ── PLAN Y FACTURACIÓN ──────────────────────────────────────

/**
 * Cambio de plan manual "a voluntad" del super admin (decisión de producto:
 * el motivo es obligatorio y siempre se le notifica al taller por correo —
 * ver docs/super-admin-todo.md). Si el taller tiene una suscripción de
 * Stripe real, mueve el price ahí también (con proration) para que Stripe y
 * la base nunca queden desincronizados.
 */
export async function changeShopPlan(shopId: string, newPlan: Plan, reason: string) {
  const session = await requireSuperAdmin();

  const trimmedReason = reason.trim();
  if (trimmedReason.length < REASON_MIN_LENGTH) {
    return { error: `Escribe un motivo (mínimo ${REASON_MIN_LENGTH} caracteres) — se le enviará al taller por correo` };
  }
  if (!PLANS.includes(newPlan)) return { error: "Plan inválido" };

  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { subscription: true } });
  if (!shop) return { error: "Taller no encontrado" };

  const previousPlan: Plan = shop.subscription?.plan ?? "CORE";
  if (previousPlan === newPlan) return { error: "El taller ya está en ese plan" };

  if (shop.subscription?.stripeSubscriptionId) {
    const interval = shop.subscription.billingInterval ?? "MONTHLY";
    const priceId = getPriceId(newPlan, interval);
    if (!priceId) return { error: `No hay Price ID de Stripe configurado para ${newPlan}/${interval}` };
    try {
      await updateStripeSubscriptionPrice(shop.subscription.stripeSubscriptionId, priceId);
    } catch (err) {
      console.error("[platform] cambio de plan en Stripe falló:", err);
      return { error: "No se pudo actualizar el plan en Stripe — intenta de nuevo" };
    }
  }

  if (shop.subscription) {
    await db.subscription.update({ where: { id: shop.subscription.id }, data: { plan: newPlan } });
  } else {
    await db.subscription.create({ data: { shopId, plan: newPlan, status: "ACTIVE" } });
  }

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "PLAN_CHANGED",
    targetType: "SUBSCRIPTION",
    targetId: shop.subscription?.id,
    metadata: { previousPlan, newPlan, reason: trimmedReason },
  });

  const billingTo = await resolveBillingNotificationRecipients(shopId);
  if (billingTo.length > 0) {
    await notifyPlanChanged({ to: billingTo, shopId, shopName: shop.name, previousPlan, newPlan, reason: trimmedReason }).catch((err) =>
      console.error("[platform] notifyPlanChanged falló:", err)
    );
  }

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

/** Contacto de cobro — separado del contacto operativo del taller (Shop.email), editable solo desde aquí. */
export async function updateBillingContact(shopId: string, billingEmail: string) {
  const session = await requireSuperAdmin();

  const trimmed = billingEmail.trim();
  if (trimmed && !z.string().email().safeParse(trimmed).success) {
    return { error: "Email inválido" };
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { subscription: true } });
  if (!shop) return { error: "Taller no encontrado" };

  if (shop.subscription) {
    await db.subscription.update({ where: { id: shop.subscription.id }, data: { billingEmail: trimmed || null } });
  } else {
    await db.subscription.create({ data: { shopId, plan: "CORE", status: "ACTIVE", billingEmail: trimmed || null } });
  }

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "BILLING_CONTACT_UPDATED",
    targetType: "SUBSCRIPTION",
    targetId: shop.subscription?.id,
    metadata: { billingEmail: trimmed || null },
  });

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

/**
 * Cancelación iniciada por el super admin (soporte/cobranza). Siempre pide
 * motivo, se registra en SubscriptionCancellation (historial, nunca se
 * sobrescribe) y se notifica al taller por correo. Cancela al final del
 * período pagado, nunca de inmediato.
 */
export async function cancelShopSubscription(shopId: string, reason: string) {
  const session = await requireSuperAdmin();

  const trimmedReason = reason.trim();
  if (trimmedReason.length < REASON_MIN_LENGTH) {
    return { error: `Escribe un motivo (mínimo ${REASON_MIN_LENGTH} caracteres) — se le enviará al taller por correo` };
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { subscription: true } });
  if (!shop?.subscription) return { error: "Este taller no tiene una suscripción" };
  const sub = shop.subscription;

  if (sub.status === "CANCELED" || sub.cancelAtPeriodEnd) {
    return { error: "Esta suscripción ya está cancelada o programada para cancelarse" };
  }

  if (sub.stripeSubscriptionId) {
    try {
      await cancelStripeSubscriptionAtPeriodEnd(sub.stripeSubscriptionId);
    } catch (err) {
      console.error("[platform] cancelación en Stripe falló:", err);
      return { error: "No se pudo cancelar en Stripe — intenta de nuevo" };
    }
  }

  const effectiveAt = sub.currentPeriodEnd ?? new Date();

  await db.$transaction([
    db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } }),
    db.subscriptionCancellation.create({
      data: {
        subscriptionId: sub.id,
        shopId,
        planAtCancellation: sub.plan,
        reason: trimmedReason,
        initiatedBy: "SUPER_ADMIN",
        initiatedByUserId: session.user.id,
        effectiveAt,
      },
    }),
  ]);

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "SUBSCRIPTION_CANCELED",
    targetType: "SUBSCRIPTION",
    targetId: sub.id,
    metadata: { reason: trimmedReason, effectiveAt: effectiveAt.toISOString() },
  });

  const billingTo = await resolveBillingNotificationRecipients(shopId);
  if (billingTo.length > 0) {
    await notifySubscriptionCanceled({
      to: billingTo,
      shopId,
      shopName: shop.name,
      reason: trimmedReason,
      initiatedBySuperAdmin: true,
      effectiveAt,
    }).catch((err) => console.error("[platform] notifySubscriptionCanceled falló:", err));
  }

  revalidatePath(PLATFORM.shop(shopId));
  return { success: true };
}

// ── IMPERSONACIÓN ("login as") ──────────────────────────────

/**
 * Abre una sesión "viendo como" el taller — la identidad real del super
 * admin queda intacta en el token (ver src/lib/auth.ts) para poder salir en
 * cualquier momento. Expira sola a la hora además del botón manual de salida.
 */
export async function startImpersonation(shopId: string) {
  const session = await requireSuperAdmin();

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true } });
  if (!shop) return { error: "Taller no encontrado" };

  await unstable_update({
    impersonation: {
      shopId: shop.id,
      shopName: shop.name,
      startedByUserId: session.user.id,
      startedByName: session.user.name ?? session.user.email ?? "Super admin",
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
  });

  await logPlatformAction({
    actorUserId: session.user.id,
    shopId,
    action: "IMPERSONATION_STARTED",
    targetType: "SHOP",
    targetId: shopId,
  });

  redirect(ADMIN.dashboard);
}

/** Botón "Salir" del banner de impersonación — vuelve a /platform con la identidad real. */
export async function endImpersonation() {
  const session = await auth();

  if (session?.impersonation) {
    await logPlatformAction({
      actorUserId: session.impersonation.startedByUserId,
      shopId: session.impersonation.shopId,
      action: "IMPERSONATION_ENDED",
      targetType: "SHOP",
      targetId: session.impersonation.shopId,
    });
  }

  await unstable_update({ impersonation: null });
  redirect(PLATFORM.home);
}
