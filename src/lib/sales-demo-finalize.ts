import type { Prisma } from "@prisma/client";
import { hasConversionEvidence } from "@/domain/sales-demo-conversion";

// Called only from the shared Stripe sync transaction, never from Sales/UI.
export async function finalizeSalesDemo(tx: Prisma.TransactionClient, shopId: string,
  sub: Parameters<typeof hasConversionEvidence>[0]) {
  if (!hasConversionEvidence(sub)) return;
  const demo = await tx.salesDemo.findUnique({ where: { shopId } });
  if (!demo || demo.status !== "AWAITING_PAYMENT" || !demo.activatedOwnerId) return;
  const owner = await tx.user.findUnique({ where: { id: demo.activatedOwnerId } });
  if (!owner || owner.shopId !== shopId || owner.email.toLowerCase() !== demo.ownerEmail || owner.role !== "OWNER" || !owner.emailVerified) return;
  const result = await tx.salesDemo.updateMany({ where: { id: demo.id, shopId, status: "AWAITING_PAYMENT", activatedOwnerId: owner.id },
    data: { status: "CONVERTED", convertedAt: new Date(), activationTokenHash: null, activationExpiresAt: null } });
  if (result.count === 1) await tx.shop.update({ where: { id: shopId }, data: { onboardingCompletedAt: new Date() } });
}
