"use server";

import { revalidatePath } from "next/cache";
import { ADMIN, adminPath } from "@/lib/routes";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { requireOwner } from "@/lib/permissions";
import {
  resolveSegmentClients,
  isValidSegmentDefinition,
  type SegmentDefinition,
} from "@/lib/communications/segments";
import { sendCampaignEmail } from "@/lib/communications/campaigns";
import { checkEntitlement } from "@/lib/subscription";
import type { InvoiceLanguage } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export async function listCampaigns() {
  const shopId = await getShopId();
  return db.campaign.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
}

export async function getCampaignDetail(id: string) {
  const shopId = await getShopId();
  const campaign = await db.campaign.findFirst({ where: { id, shopId } });
  if (!campaign) return null;

  const counts = await db.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });

  return { campaign, counts };
}

function parseSegmentFromForm(formData: FormData): SegmentDefinition {
  const type = formData.get("segmentType") as string;
  if (type === "LANGUAGE") {
    const language = (formData.get("language") as string) || "ES";
    return { type: "LANGUAGE", language: language as InvoiceLanguage };
  }
  if (type === "INACTIVE_MONTHS") {
    return { type: "INACTIVE_MONTHS", months: Number(formData.get("months")) || 6 };
  }
  if (type === "MANUAL") {
    const ids = ((formData.get("clientIds") as string) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { type: "MANUAL", clientIds: ids };
  }
  return { type: "ALL_CONSENTED" };
}

export async function previewAudienceAction(formData: FormData) {
  const shopId = await getShopId();
  const segment = parseSegmentFromForm(formData);
  const clients = await resolveSegmentClients(shopId, segment);
  return {
    count: clients.length,
    sample: clients.slice(0, 5).map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
      email: c.email,
    })),
  };
}

export async function createCampaignAction(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const entitlementError = await checkEntitlement(shopId, "communications.campaigns");
  if (entitlementError) return { error: entitlementError };

  const name = (formData.get("name") as string)?.trim();
  const subject = (formData.get("subject") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  if (!name || !subject || !body) return { error: "Nombre, asunto y mensaje son requeridos" };

  const segment = parseSegmentFromForm(formData);
  if (!isValidSegmentDefinition(segment)) return { error: "Segmento inválido" };

  const campaign = await db.campaign.create({
    data: {
      shopId,
      name,
      subject,
      bodyHtml: body,
      segment: segment as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      createdByUserId: session.user.id,
    },
  });

  revalidatePath(ADMIN.campaigns);
  return { success: true, campaignId: campaign.id };
}

export async function sendTestEmailAction(campaignId: string) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const testEmail = session.user.email;
  if (!testEmail) return { error: "Tu usuario no tiene email" };

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, shopId } });
  if (!campaign) return { error: "Campaña no encontrada" };
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });

  try {
    await sendCampaignEmail({ shop, campaign, client: null, address: testEmail });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error enviando prueba" };
  }

  return { success: true };
}

async function scheduleCampaign(campaignId: string, scheduledFor: Date) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const entitlementError = await checkEntitlement(shopId, "communications.campaigns");
  if (entitlementError) return { error: entitlementError };

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, shopId } });
  if (!campaign) return { error: "Campaña no encontrada" };
  if (campaign.status !== "DRAFT") return { error: "Solo se puede programar un borrador" };

  const segment = campaign.segment as unknown as SegmentDefinition;
  const clients = await resolveSegmentClients(shopId, segment);
  if (clients.length === 0) return { error: "El segmento elegido no tiene destinatarios con consentimiento" };

  await db.$transaction([
    db.campaignRecipient.createMany({
      data: clients
        .filter((c) => c.email)
        .map((c) => ({ campaignId: campaign.id, clientId: c.id, address: c.email!.toLowerCase() })),
      skipDuplicates: true,
    }),
    db.campaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED", scheduledFor } }),
  ]);

  revalidatePath(ADMIN.campaigns);
  revalidatePath(adminPath(`/campaigns/${campaign.id}`));
  return { success: true };
}

export async function scheduleCampaignAction(campaignId: string, formData: FormData) {
  const raw = formData.get("scheduledFor") as string;
  const scheduledFor = raw ? new Date(raw) : new Date();
  if (Number.isNaN(scheduledFor.getTime())) return { error: "Fecha inválida" };
  return scheduleCampaign(campaignId, scheduledFor);
}

export async function sendNowAction(campaignId: string) {
  return scheduleCampaign(campaignId, new Date());
}

export async function cancelCampaignAction(campaignId: string) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  await db.campaign.updateMany({
    where: { id: campaignId, shopId, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "CANCELLED" },
  });
  revalidatePath(ADMIN.campaigns);
  revalidatePath(adminPath(`/campaigns/${campaignId}`));
  return { success: true };
}
