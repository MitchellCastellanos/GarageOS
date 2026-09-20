"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { PLATFORM } from "@/lib/routes";
import { publishPlatformMessage, publishPlatformConversationUpdate } from "@/lib/platform/pusher";
import { notifySupportReply } from "@/lib/platform/notify";

/** Lado de super admin de la mensajería con talleres — ver src/actions/support.ts para el lado del taller. */

export async function listPlatformConversations() {
  await requireSuperAdmin();
  return db.platformConversation.findMany({
    include: {
      shop: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ lastMessageAt: "desc" }],
  });
}

export async function getPlatformConversation(id: string) {
  await requireSuperAdmin();
  return db.platformConversation.findUnique({
    where: { id },
    include: {
      shop: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function sendPlatformReply(conversationId: string, content: string) {
  const session = await requireSuperAdmin();
  const trimmed = content.trim();
  if (!trimmed) return { error: "Escribe un mensaje" };

  const conversation = await db.platformConversation.findUnique({
    where: { id: conversationId },
    include: { shop: { select: { id: true, name: true, email: true } } },
  });
  if (!conversation) return { error: "Conversación no encontrada" };

  const message = await db.platformMessage.create({
    data: { conversationId, sender: "SUPER_ADMIN", authorUserId: session.user.id, content: trimmed },
  });

  await db.platformConversation.update({
    where: { id: conversationId },
    data: { status: "LIVE", lastMessageAt: new Date() },
  });

  await publishPlatformMessage(conversationId, {
    id: message.id,
    sender: "SUPER_ADMIN",
    content: trimmed,
    createdAt: message.createdAt.toISOString(),
  });
  await publishPlatformConversationUpdate(conversationId);

  if (conversation.shop.email) {
    await notifySupportReply({
      to: conversation.shop.email,
      shopId: conversation.shop.id,
      shopName: conversation.shop.name,
      reply: trimmed,
    }).catch((err) =>
      console.error("[platform-messages] notifySupportReply falló:", err)
    );
  }

  revalidatePath(PLATFORM.message(conversationId));
  revalidatePath(PLATFORM.messages);
  return { success: true };
}

export async function closePlatformConversation(conversationId: string) {
  await requireSuperAdmin();
  await db.platformConversation.update({ where: { id: conversationId }, data: { status: "CLOSED" } });
  await publishPlatformConversationUpdate(conversationId);
  revalidatePath(PLATFORM.message(conversationId));
  revalidatePath(PLATFORM.messages);
  return { success: true };
}
