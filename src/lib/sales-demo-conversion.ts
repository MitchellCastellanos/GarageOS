import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { activationHash, canLinkOwner, ownerPasswordSchema } from "@/domain/sales-demo-conversion";

export async function expireSalesDemos() {
  // Activated owners may finish an in-flight payment. Expiration removes Sales
  // access via isDemoAvailable without destroying their ownership/payment path.
  return db.salesDemo.updateMany({ where: { status: { in: ["PREPARING", "ACTIVE", "ACTIVATION_SENT"] }, expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", activationTokenHash: null, activationExpiresAt: null } });
}

export async function activationDetails(demoId: string, token: string) {
  const hash = activationHash(token);
  const demo = await db.salesDemo.findFirst({ where: { id: demoId, activationTokenHash: hash, status: "ACTIVATION_SENT",
    expiresAt: { gt: new Date() }, activationExpiresAt: { gt: new Date() } }, include: { shop: { select: { name: true } } } });
  if (!demo?.ownerEmail || !demo.ownerName) throw new Error("ACTIVATION_INVALID");
  const user = await db.user.findFirst({ where: { email: { equals: demo.ownerEmail, mode: "insensitive" } } });
  if (!canLinkOwner(user, demo.shopId)) throw new Error("ACTIVATION_INVALID");
  return { demo, existing: !!user, existingUserId: user?.id };
}

export async function activateDemoOwner(demoId: string, token: string, password: string) {
  const { demo, existing } = await activationDetails(demoId, token);
  const session = await auth();
  if (session?.impersonation || session?.user.role === "SUPER_ADMIN") throw new Error("ACTIVATION_INVALID");
  const passwordHash = existing ? null : await bcrypt.hash(ownerPasswordSchema.parse(password), 12);
  return db.$transaction(async (tx) => {
    // CAS acquires a row lock. Losers/replays fail before any user changes.
    const claimed = await tx.salesDemo.updateMany({ where: { id: demoId, shopId: demo.shopId, ownerEmail: demo.ownerEmail,
      activationTokenHash: activationHash(token), status: "ACTIVATION_SENT", expiresAt: { gt: new Date() }, activationExpiresAt: { gt: new Date() } },
      data: { activationTokenHash: null, activationExpiresAt: null, status: "AWAITING_PAYMENT", activatedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("ACTIVATION_INVALID");
    const user = await tx.user.findFirst({ where: { email: { equals: demo.ownerEmail!, mode: "insensitive" } } });
    if (!canLinkOwner(user, demo.shopId)) throw new Error("ACTIVATION_INVALID");
    // Existing account requires its real login; possession of the activation
    // link must never replace a password or silently take over that account.
    if (user && (session?.user.id !== user.id || session.impersonation)) throw new Error("ACTIVATION_LOGIN_REQUIRED");
    if (!user && !passwordHash) throw new Error("ACTIVATION_INVALID");
    const owner = user
      ? await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } })
      : await tx.user.create({ data: { shopId: demo.shopId, email: demo.ownerEmail!, name: demo.ownerName!, role: "OWNER",
        passwordHash, emailVerified: new Date(), preferredLocale: demo.preferredLanguage } });
    await tx.salesDemo.update({ where: { id: demoId }, data: { activatedOwnerId: owner.id } });
    return { email: owner.email, existing: !!user };
  });
}

export async function claimDemoCheckout(demoId: string, ownerId: string) {
  return db.$transaction(async (tx) => {
    const locked = await tx.salesDemo.updateMany({ where: { id: demoId, status: "AWAITING_PAYMENT", activatedOwnerId: ownerId }, data: { updatedAt: new Date() } });
    if (locked.count !== 1) throw new Error("DEMO_BILLING_DISABLED");
    const demo = await tx.salesDemo.findUniqueOrThrow({ where: { id: demoId } });
    if (demo.checkoutAttemptId) return demo;
    return tx.salesDemo.update({ where: { id: demoId }, data: { checkoutAttemptId: randomUUID(), checkoutAttemptAt: new Date() } });
  });
}
