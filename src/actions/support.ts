"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/permissions";
import { ADMIN } from "@/lib/routes";
import { publishPlatformMessage, publishPlatformConversationUpdate } from "@/lib/platform/pusher";
import { sendPlatformTelegramAlert } from "@/lib/platform/telegram";
import { notifySupportMessageReceived, notifyAdminNewSupportMessage } from "@/lib/platform/notify";

/**
 * Mensajería del taller hacia GarageOS (soporte) — lado del taller. La
 * contraparte de super admin vive en src/actions/platform-messages.ts.
 * Todavía sin chatbot (ver docs/super-admin-todo.md): cada mensaje espera
 * respuesta humana directa, con confirmación inmediata al taller y alerta al
 * equipo de GarageOS (Telegram + correo), igual que Montreal Spider Co.
 */

export async function getMyConversation() {
  const session = await requireSession();
  if (!session.user.shopId) return null;
  return db.platformConversation.findFirst({
    where: { shopId: session.user.shopId },
    orderBy: { lastMessageAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * true si el taller tiene una respuesta de GarageOS que no ha visto —
 * alimenta el punto en el ícono de Ayuda del sidebar (ver AdminChrome/Sidebar).
 * Deliberadamente no depende de correo: el punto es la señal confiable,
 * el correo de confirmación es best-effort.
 */
export async function hasUnreadSupportMessage(shopId: string): Promise<boolean> {
  const conversation = await db.platformConversation.findFirst({
    where: { shopId, status: { not: "CLOSED" } },
    orderBy: { lastMessageAt: "desc" },
    select: {
      shopReadAt: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { sender: true, createdAt: true } },
    },
  });
  const latest = conversation?.messages[0];
  if (!latest || latest.sender === "SHOP") return false;
  return !conversation.shopReadAt || latest.createdAt > conversation.shopReadAt;
}

/** Se llama al abrir /admin/support — apaga el punto de "mensaje nuevo". */
export async function markSupportConversationRead() {
  const session = await requireSession();
  if (!session.user.shopId) return { success: true };
  await db.platformConversation.updateMany({
    where: { shopId: session.user.shopId, status: { not: "CLOSED" } },
    data: { shopReadAt: new Date() },
  });
  return { success: true };
}

export async function sendSupportMessage(content: string) {
  const session = await requireSession();
  if (!session.user.shopId) return { error: "No autorizado" };

  const trimmed = content.trim();
  if (!trimmed) return { error: "Escribe un mensaje" };

  const shop = await db.shop.findUnique({ where: { id: session.user.shopId }, select: { id: true, name: true, email: true } });
  if (!shop) return { error: "Taller no encontrado" };

  let conversation = await db.platformConversation.findFirst({
    where: { shopId: shop.id, status: { not: "CLOSED" } },
    orderBy: { lastMessageAt: "desc" },
  });

  const isNewConversation = !conversation;
  if (!conversation) {
    conversation = await db.platformConversation.create({ data: { shopId: shop.id } });
  }

  const message = await db.platformMessage.create({
    data: { conversationId: conversation.id, sender: "SHOP", authorUserId: session.user.id, content: trimmed },
  });

  await db.platformConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

  await publishPlatformMessage(conversation.id, {
    id: message.id,
    sender: "SHOP",
    content: trimmed,
    createdAt: message.createdAt.toISOString(),
  });
  await publishPlatformConversationUpdate(conversation.id);

  if (isNewConversation && shop.email) {
    await notifySupportMessageReceived({ to: shop.email, shopId: shop.id, shopName: shop.name, message: trimmed }).catch((err) =>
      console.error("[support] notifySupportMessageReceived falló:", err)
    );
  }

  // Solo alertamos una vez por espera — igual que MSC (evita spamear al equipo si el taller manda varios mensajes seguidos).
  if (!conversation.staffAlertedAt) {
    await db.platformConversation.update({ where: { id: conversation.id }, data: { staffAlertedAt: new Date() } });
    await sendPlatformTelegramAlert(`💬 Mensaje nuevo de ${shop.name}\n"${trimmed}"\n/platform/messages/${conversation.id}`).catch(() => {});
    await notifyAdminNewSupportMessage({ shopName: shop.name, message: trimmed, conversationId: conversation.id }).catch((err) =>
      console.error("[support] notifyAdminNewSupportMessage falló:", err)
    );
  }

  revalidatePath(ADMIN.support);
  return { success: true };
}
