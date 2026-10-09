"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { unstable_update } from "@/lib/auth";
import { requireSalesActor, requirePreparedDemo, requireCurrentDemo } from "@/lib/sales-demo";
import { DEMO_DURATION_MS, demoPlanSchema, prospectSchema } from "@/domain/sales-demo";
import { createPendingSubscription } from "@/lib/subscription";
import { provisionDefaultSenderIdentities } from "@/lib/communications/sender-identity";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { normalizeDemoAsset, demoAssetKindSchema } from "@/lib/sales-demo-assets";
import { isStorageConfigured, uploadShopLogoToStorage, uploadBookingPageImageToStorage } from "@/lib/storage";
import { bookingImageStorageFolder } from "@/lib/booking-page";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";

export async function createProspectDemo(form: FormData) {
  const { actor, session } = await requireSalesActor();
  if (session.impersonation) throw new Error("EXIT_DEMO_FIRST");
  const parsed = prospectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" as const };
  const p = parsed.data;
  // Optional CRM link: the opportunity must be inside the seller's scope. Validated BEFORE any Shop is created.
  const rawOpportunity = form.get("opportunityId");
  const opportunity = typeof rawOpportunity === "string" && rawOpportunity
    ? await db.crmOpportunity.findFirst({ where: { id: rawOpportunity, prospect: assignedScopeWhere(actor.platform) }, select: { id: true, prospectId: true } })
    : null;
  if (typeof rawOpportunity === "string" && rawOpportunity && !opportunity) return { error: "invalid" as const };
  const demo = await db.$transaction(async (tx) => {
    const shop = await tx.shop.create({ data: {
      name: p.name, address: p.address || null, phone: p.phone || null,
      email: p.email.toLowerCase() || null, defaultLanguage: p.preferredLanguage,
      // Wave 1 is preparation only. Do not enable public booking or automated outreach.
      communicationsSuspendedAt: new Date(),
    } });
    await createPendingSubscription(tx, shop.id);
    const created = await tx.salesDemo.create({ data: {
      shopId: shop.id, createdByUserId: actor.id, crmOpportunityId: opportunity?.id ?? null,
      contactName: p.contactName || null, contactEmail: p.contactEmail.toLowerCase() || null,
      contactPhone: p.contactPhone || null, preferredLanguage: p.preferredLanguage,
      expiresAt: new Date(Date.now() + DEMO_DURATION_MS),
    }, include: { shop: true } });
    if (opportunity) {
      // Commercial stage is NOT touched: SalesDemo.status stays technical, the pipeline stage stays a human decision.
      await tx.crmActivity.create({ data: { prospectId: opportunity.prospectId, opportunityId: opportunity.id, type: "DEMO", authorUserId: actor.id, metadata: { event: "DEMO_PREPARED", demoId: created.id } } });
      await writeCrmAudit({ actorUserId: actor.id, action: "DEMO_LINKED", entityType: "SalesDemo", entityId: created.id, prospectId: opportunity.prospectId, metadata: { opportunityId: opportunity.id } }, tx);
    }
    return created;
  });
  // Existing helper only provisions local DB sender defaults; no provider calls.
  await provisionDefaultSenderIdentities(demo.shop).catch(() => {});
  revalidatePath(PLATFORM.sales);
  return { demoId: demo.id };
}

export async function startSalesDemo(demoId: string) {
  const { actor, session, demo } = await requirePreparedDemo(demoId);
  await db.salesDemo.updateMany({ where: {
    id: demo.id, shopId: demo.shopId, status: demo.status, expiresAt: { gt: new Date() },
  }, data: { status: demo.status === "PREPARING" ? "ACTIVE" : demo.status } }).then((r) => { if (r.count !== 1) throw new Error("DEMO_UNAVAILABLE"); });
  await unstable_update({ impersonation: {
    salesDemoId: demo.id, shopId: demo.shopId, shopName: demo.shop.name,
    startedByUserId: actor.id, startedByName: session.user.name ?? "Sales",
    expiresAt: Math.min(demo.expiresAt.getTime(), Date.now() + 60 * 60 * 1000),
  } });
  redirect(demo.shop.onboardingCompletedAt ? ADMIN.dashboard : ADMIN.onboarding);
}

export async function setSalesDemoPlan(demoId: string, plan: string) {
  const { demo } = await requireCurrentDemo(demoId);
  const parsed = demoPlanSchema.safeParse(plan);
  if (!parsed.success) return { error: "invalid" as const };
  const changed = await db.salesDemo.updateMany({ where: {
    id: demo.id, shopId: demo.shopId, status: { in: ["PREPARING", "ACTIVE", "ACTIVATION_SENT", "AWAITING_PAYMENT"] }, expiresAt: { gt: new Date() },
  }, data: { currentPlan: parsed.data } });
  if (changed.count !== 1) throw new Error("DEMO_UNAVAILABLE");
  // Never mutate Subscription or call commercial plan/billing/email helpers.
  revalidatePath("/admin", "layout");
  revalidatePath("/book", "layout");
  revalidatePath(PLATFORM.sales);
  return { success: true as const };
}

export async function completeSalesDemoOnboarding(demoId: string) {
  const { demo } = await requireCurrentDemo(demoId);
  await db.$transaction(async (tx) => {
    // Conditional update locks lifecycle before touching the associated Shop.
    const valid = await tx.salesDemo.updateMany({ where: {
      id: demo.id, shopId: demo.shopId, status: "ACTIVE", expiresAt: { gt: new Date() },
    }, data: { status: "ACTIVE" } });
    if (valid.count !== 1) throw new Error("DEMO_UNAVAILABLE");
    await tx.shop.update({ where: { id: demo.shopId }, data: { onboardingCompletedAt: new Date() } });
  });
  revalidatePath("/admin", "layout");
  return { success: true as const };
}

export async function exitSalesDemo() {
  await requireSalesActor();
  await unstable_update({ impersonation: null });
  redirect(PLATFORM.sales);
}

export async function uploadSalesDemoAsset(demoId: string, form: FormData) {
  const { demo } = await requirePreparedDemo(demoId);
  const kind = demoAssetKindSchema.safeParse(form.get("kind"));
  const file = form.get("image");
  if (!kind.success || !(file instanceof File)) return { error: "invalid" as const };
  if (!isStorageConfigured()) return { error: "notConfigured" as const };
  try {
    const buffer = await normalizeDemoAsset(file, kind.data);
    const { publicUrl } = kind.data === "logo"
      ? await uploadShopLogoToStorage(demo.shopId, buffer, "image/png", "png", randomUUID())
      : await uploadBookingPageImageToStorage(bookingImageStorageFolder(demo.shopId), kind.data, buffer);
    const url = kind.data === "logo" ? `${publicUrl}?v=${Date.now()}` : publicUrl;
    // Revalidate lifecycle after processing/storage; do not accept arbitrary URLs.
    await db.$transaction(async (tx) => {
      const valid = await tx.salesDemo.updateMany({ where: {
        id: demo.id, shopId: demo.shopId, status: { in: ["PREPARING", "ACTIVE", "ACTIVATION_SENT", "AWAITING_PAYMENT"] }, expiresAt: { gt: new Date() },
      }, data: { updatedAt: new Date() } });
      if (valid.count !== 1) throw new Error("DEMO_UNAVAILABLE");
      const field = kind.data === "logo" ? "logoUrl" : kind.data === "cover" ? "bookingCoverImageUrl" : "bookingShopImageUrl";
      await tx.shop.update({ where: { id: demo.shopId }, data: { [field]: url } });
    });
    revalidatePath(PLATFORM.sales);
    return { url };
  } catch {
    return { error: "uploadFailed" as const };
  }
}
