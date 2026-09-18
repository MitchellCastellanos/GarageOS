"use server";

import { revalidatePath } from "next/cache";
import { ADMIN, adminPath } from "@/lib/routes";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { requireShopSession } from "@/lib/permissions";
import { sendInboxMessage } from "@/lib/communications/inbox";
import { getInboxSenderOptions } from "@/lib/communications/sender-identity";
import { parseEmailAttachments } from "@/lib/email-attachments";
import { emailRichTextToPlainText, parseEmailRichText } from "@/lib/email-rich-text";

export async function listThreads(status: "OPEN" | "ARCHIVED" = "OPEN") {
  const shopId = await getShopId();
  return db.communicationThread.findMany({
    where: { shopId, status },
    include: {
      client: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });
}

export async function getThreadDetail(threadId: string) {
  const shopId = await getShopId();
  const thread = await db.communicationThread.findFirst({
    where: { id: threadId, shopId },
    include: {
      client: true,
      messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
    },
  });
  if (!thread) return null;

  const clientHistory = thread.clientId
    ? await db.communicationMessage.findMany({
        where: { shopId, clientId: thread.clientId, threadId: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  return { thread, clientHistory };
}

export async function archiveThreadAction(threadId: string) {
  const shopId = await getShopId();
  await db.communicationThread.updateMany({
    where: { id: threadId, shopId },
    data: { status: "ARCHIVED" },
  });
  revalidatePath(ADMIN.inbox);
  revalidatePath(adminPath(`/inbox/${threadId}`));
  return { success: true };
}

export async function reopenThreadAction(threadId: string) {
  const shopId = await getShopId();
  await db.communicationThread.updateMany({
    where: { id: threadId, shopId },
    data: { status: "OPEN" },
  });
  revalidatePath(ADMIN.inbox);
  revalidatePath(adminPath(`/inbox/${threadId}`));
  return { success: true };
}

export async function getInboxSenderOptionsAction() {
  const shopId = await getShopId();
  return getInboxSenderOptions(shopId);
}

function readSenderIdentityId(formData: FormData): string | null {
  const value = formData.get("senderIdentityId");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitAddresses(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function getMessageBody(formData: FormData) {
  const bodyRich = parseEmailRichText(formData.get("bodyRich"));
  const richText = bodyRich ? emailRichTextToPlainText(bodyRich) : "";
  const fallbackText = (formData.get("body") as string | null)?.trim() ?? "";
  return { bodyRich, bodyText: richText || fallbackText };
}

export async function replyToThreadAction(threadId: string, formData: FormData) {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const thread = await db.communicationThread.findFirst({ where: { id: threadId, shopId } });
  if (!thread) return { error: "Conversación no encontrada" };

  const to = splitAddresses(formData.get("to"));
  if (to.length === 0) return { error: "Agrega al menos un destinatario" };

  const { bodyRich, bodyText } = getMessageBody(formData);
  if (!bodyText) return { error: "El mensaje no puede estar vacío" };

  const subject = (formData.get("subject") as string)?.trim() || thread.subject || "Mensaje";
  const attachmentResult = await parseEmailAttachments(formData);
  if ("error" in attachmentResult) return { error: attachmentResult.error };
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });

  try {
    await sendInboxMessage({
      shopId,
      threadId,
      clientId: thread.clientId,
      createdByUserId: session.user.id,
      to,
      cc: splitAddresses(formData.get("cc")),
      bcc: splitAddresses(formData.get("bcc")),
      subject,
      bodyText,
      bodyRich,
      shopName: shop.name,
      attachments: attachmentResult.attachments,
      senderIdentityId: readSenderIdentityId(formData),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error(`Error respondiendo thread ${threadId}:`, err);
    return { error: message };
  }

  revalidatePath(adminPath(`/inbox/${threadId}`));
  revalidatePath(ADMIN.inbox);
  return { success: true };
}

export async function composeMessageAction(formData: FormData) {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const to = splitAddresses(formData.get("to"));
  if (to.length === 0) return { error: "Agrega al menos un destinatario" };

  const { bodyRich, bodyText } = getMessageBody(formData);
  if (!bodyText) return { error: "El mensaje no puede estar vacío" };

  const subject = (formData.get("subject") as string)?.trim();
  if (!subject) return { error: "El asunto es requerido" };
  const clientId = (formData.get("clientId") as string) || null;
  const attachmentResult = await parseEmailAttachments(formData);
  if ("error" in attachmentResult) return { error: attachmentResult.error };
  const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });

  let threadId: string | null = null;
  try {
    const result = await sendInboxMessage({
      shopId,
      clientId,
      createdByUserId: session.user.id,
      to,
      cc: splitAddresses(formData.get("cc")),
      bcc: splitAddresses(formData.get("bcc")),
      subject,
      bodyText,
      bodyRich,
      shopName: shop.name,
      attachments: attachmentResult.attachments,
      senderIdentityId: readSenderIdentityId(formData),
    });
    threadId = result.threadId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("Error componiendo mensaje:", err);
    return { error: message };
  }

  revalidatePath(ADMIN.inbox);
  return { success: true, threadId };
}
