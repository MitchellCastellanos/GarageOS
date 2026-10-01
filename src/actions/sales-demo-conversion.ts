"use server";
import React from "react";
import { render } from "@react-email/render";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth, signIn } from "@/lib/auth";
import { requirePreparedDemo } from "@/lib/sales-demo";
import { activateDemoOwner, activationDetails } from "@/lib/sales-demo-conversion";
import { ACTIVATION_TTL_MS, activationToken, activationHash, activationRequestSchema, canLinkOwner } from "@/domain/sales-demo-conversion";
import { tryGetResendClient } from "@/lib/providers/resend";
import { getAppUrl, APP_NAME } from "@/config/app";
import { SalesDemoActivationEmail } from "@/emails/SalesDemoActivationEmail";

export async function sendSalesDemoActivation(demoId: string, form: FormData, resend = false) {
  const { demo } = await requirePreparedDemo(demoId);
  const parsed = activationRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success || !demo.shop.onboardingCompletedAt) return { error: "invalid" };
  const p = parsed.data;
  if (demo.activatedOwnerId) return { error: "activated" };
  const existing = await db.user.findFirst({ where: { email: { equals: p.ownerEmail, mode: "insensitive" } } });
  if (!canLinkOwner(existing, demo.shopId)) return { error: "collision" };
  const provider = tryGetResendClient();
  const rawFrom = process.env.EMAIL_FROM_PLATFORM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!provider || !rawFrom) return { error: "unavailable" };
  const token = activationToken();
  const hash = activationHash(token);
  const now = new Date();
  const claimed = await db.$transaction(async (tx) => {
    const locked = await tx.salesDemo.updateMany({ where: { id: demo.id, shopId: demo.shopId, status: { in: ["PREPARING", "ACTIVE", "ACTIVATION_SENT"] }, expiresAt: { gt: now } }, data: { updatedAt: now } });
    if (locked.count !== 1) throw new Error("DEMO_UNAVAILABLE");
    const current = await tx.salesDemo.findUniqueOrThrow({ where: { id: demo.id } });
    // A double click returns success without creating another email/token.
    // Explicit resend has a one-minute cooldown and always revokes the old link.
    if (current.status === "ACTIVATION_SENT" && current.activationTokenHash) {
      const unchanged = current.ownerName === p.ownerName && current.ownerEmail === p.ownerEmail && current.proposedPlan === p.plan && current.proposedBillingInterval === p.interval;
      if (!resend) return unchanged ? "duplicate" : "cooldown";
      if (current.activationSentAt && now.getTime() - current.activationSentAt.getTime() < 60_000) return "cooldown";
    }
    await tx.salesDemo.update({ where: { id: demo.id }, data: { status: "ACTIVATION_SENT", ownerName: p.ownerName, ownerEmail: p.ownerEmail,
      proposedPlan: p.plan, proposedBillingInterval: p.interval, retainScenario: true,
      activationTokenHash: hash, activationExpiresAt: new Date(Math.min(now.getTime() + ACTIVATION_TTL_MS, demo.expiresAt.getTime())), activationSentAt: now } });
    return "claimed";
  });
  if (claimed === "cooldown") return { error: "cooldown" };
  if (claimed === "duplicate") return { success: true };
  try {
    const french = demo.preferredLanguage === "FR";
    const html = await render(React.createElement(SalesDemoActivationEmail, { name: p.ownerName, shopName: demo.shop.name, french,
      activationUrl: `${getAppUrl()}/activate-demo/${demo.id}?lang=${french ? "fr" : "en"}#token=${token}` }));
    const result = await provider.emails.send({ from: rawFrom.includes("<") ? rawFrom : `"${APP_NAME}" <${rawFrom}>`, to: p.ownerEmail,
      subject: french ? "Votre GarageOS est prêt" : "Your GarageOS is ready", html }, { idempotencyKey: `demo-activation:${demo.id}:${hash}` });
    if (result.error) throw new Error("DELIVERY_FAILED");
  } catch {
    // Do not log provider errors: they may contain the reusable activation URL.
    // No persisted plaintext is needed for retries; resend issues a fresh link.
    await db.salesDemo.updateMany({ where: { id: demo.id, activationTokenHash: hash }, data: { status: "ACTIVE", activationTokenHash: null, activationExpiresAt: null, activationSentAt: null } });
    return { error: "delivery" };
  }
  revalidatePath("/platform/sales");
  return { success: true };
}

export async function inspectSalesDemoActivation(demoId: string, token: string) {
  try {
    const { demo, existing, existingUserId } = await activationDetails(demoId, token);
    const session = await auth();
    return { details: { shopName: demo.shop.name, locale: demo.preferredLanguage === "FR" ? "fr" : "en", existing,
      signedIn: !!session && !session.impersonation && session.user.id === existingUserId } };
  } catch { return { error: "invalid" }; }
}

export async function activateSalesDemoAccount(demoId: string, token: string, form: FormData) {
  let owner;
  const password = String(form.get("password") ?? "");
  try { owner = await activateDemoOwner(demoId, token, password); }
  catch { return { error: "invalid" }; }
  if (!owner.existing) {
    // Standard credentials auth, with the verified OWNER just created.
    // Token remains consumed if login is interrupted; ordinary login resumes payment.
    await signIn("credentials", { email: owner.email, password, redirectTo: "/admin/activation-payment" });
  }
  const session = await auth();
  if (session) redirect("/admin/activation-payment");
  redirect("/admin/login?callbackUrl=%2Fadmin%2Factivation-payment");
}
