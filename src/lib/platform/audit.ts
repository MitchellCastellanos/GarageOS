import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Acciones sensibles de super admin — toda función nueva de /platform que
 * toque datos de un taller debe registrar una fila vía logPlatformAction.
 * String (no enum de Prisma) a propósito, igual que CommunicationAuditLog:
 * agregar una acción nueva no pide migración.
 */
export type PlatformAuditAction =
  | "SHOP_CREATED"
  | "OWNER_CREATED"
  | "USER_CREATED"
  | "USER_DELETED"
  | "PASSWORD_RESET"
  | "PLAN_CHANGED"
  | "SUBSCRIPTION_CANCELED"
  | "BILLING_CONTACT_UPDATED"
  | "COMMUNICATIONS_SUSPENDED"
  | "COMMUNICATIONS_RESUMED"
  | "NOTE_ADDED"
  | "IMPERSONATION_STARTED"
  | "IMPERSONATION_ENDED";

interface LogPlatformActionInput {
  actorUserId: string;
  shopId?: string | null;
  action: PlatformAuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function logPlatformAction(input: LogPlatformActionInput): Promise<void> {
  await db.platformAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      shopId: input.shopId ?? undefined,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? undefined,
      metadata: input.metadata ?? {},
    },
  });
}

export async function getShopAuditLog(shopId: string, take = 50) {
  return db.platformAuditLog.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
