"use server";

import { revalidatePath } from "next/cache";
import { ADMIN, adminPath } from "@/lib/routes";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { requireShopSession } from "@/lib/permissions";
import { isThreadUnread, sendInboxMessage, sendInboxSms } from "@/lib/communications/inbox";
import { shopHasDedicatedSmsNumber } from "@/lib/communications/sms-numbers";
import { isSuppressed } from "@/lib/communications/suppression";
import { toE164 } from "@/lib/phone";
import { findClientsByPhone } from "@/lib/communications/sms-inbound";
import { getInboxSenderOptions } from "@/lib/communications/sender-identity";
import { parseEmailAttachments } from "@/lib/email-attachments";
import { emailRichTextToPlainText, parseEmailRichText } from "@/lib/email-rich-text";


export async function listThreads(status: "OPEN" | "ARCHIVED" = "OPEN") {
  const shopId = await getShopId();
  const threads = await db.communicationThread.findMany({
    where: { shopId, status },
    include: {
      client: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  return threads.map((thread) => ({ ...thread, unread: isThreadUnread(thread) }));
}

export async function markThreadReadAction(threadId: string) {
  const shopId = await getShopId();
  await db.communicationThread.updateMany({ where: { id: threadId, shopId }, data: { readAt: new Date() } });
  return { success: true };
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

export async function getSmsComposeState(threadPhone?: string | null) {
  const shopId = await getShopId();
  const dedicated = await shopHasDedicatedSmsNumber(shopId);
  const phone = threadPhone ? toE164(threadPhone) : null;
  const optedOut = phone ? await isSuppressed(shopId, "SMS", phone) : false;
  return { dedicated, optedOut };
}

function readSmsBody(formData: FormData): string {
  return ((formData.get("body") as string | null) ?? "").trim();
}

function smsErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function replyToThreadAction(threadId: string, formData: FormData) {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const thread = await db.communicationThread.findFirst({ where: { id: threadId, shopId } });
  if (!thread) return { error: "Conversation not found" };

  if (thread.channel === "SMS") {
    const body = readSmsBody(formData);
    if (!body) return { error: "The message cannot be empty" };
    if (!thread.contactAddress) return { error: "This conversation has no phone number" };
    try {
      await sendInboxSms({
        shopId,
        threadId,
        clientId: thread.clientId,
        to: thread.contactAddress,
        body,
        createdByUserId: session.user.id,
      });
    } catch (err) {
      console.error(`Error replying by SMS to thread ${threadId}:`, err);
      return { error: smsErrorMessage(err) };
    }
    revalidatePath(adminPath(`/inbox/${threadId}`));
    revalidatePath(ADMIN.inbox);
    return { success: true };
  }

  const to = splitAddresses(formData.get("to"));
  if (to.length === 0) return { error: "Add at least one recipient" };

  const { bodyRich, bodyText } = getMessageBody(formData);
  if (!bodyText) return { error: "The message cannot be empty" };

  const subject = (formData.get("subject") as string)?.trim() || thread.subject || "Message";
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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error replying to thread ${threadId}:`, err);
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
  if (to.length === 0) return { error: "Add at least one recipient" };

  const { bodyRich, bodyText } = getMessageBody(formData);
  if (!bodyText) return { error: "The message cannot be empty" };

  const subject = (formData.get("subject") as string)?.trim();
  if (!subject) return { error: "Subject is required" };
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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error composing message:", err);
    return { error: message };
  }

  revalidatePath(ADMIN.inbox);
  return { success: true, threadId };
}

/** Nueva conversación SMS desde el Inbox — a un cliente (su teléfono) o a un número suelto. */
export async function composeSmsAction(formData: FormData) {
  const session = await requireShopSession();
  const shopId = session.user.shopId!;

  const body = readSmsBody(formData);
  if (!body) return { error: "The message cannot be empty" };

  const clientId = (formData.get("clientId") as string | null) || null;
  let to = ((formData.get("to") as string | null) ?? "").trim();
  if (clientId) {
    const client = await db.client.findFirst({ where: { id: clientId, shopId }, select: { phone: true } });
    if (!client) return { error: "Client not found" };
    to = to || client.phone || "";
  }
  const phone = toE164(to);
  if (!phone) return { error: "Enter a valid phone number" };

  // Número suelto: se enlaza al cliente del taller con ese teléfono si existe.
  let resolvedClientId = clientId;
  if (!resolvedClientId) {
    resolvedClientId = (await findClientsByPhone(shopId, phone))[0]?.id ?? null;
  }

  let threadId: string;
  try {
    const result = await sendInboxSms({ shopId, clientId: resolvedClientId, to: phone, body, createdByUserId: session.user.id });
    threadId = result.threadId;
  } catch (err) {
    console.error("Error composing SMS:", err);
    return { error: smsErrorMessage(err) };
  }

  revalidatePath(ADMIN.inbox);
  return { success: true, threadId };
}
