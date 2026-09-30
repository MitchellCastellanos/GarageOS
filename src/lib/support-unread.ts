// Server-only helper (NOT a server action): it takes a shopId, so it must never
// live in a "use server" module, where every export is a public endpoint.
import { db } from "@/lib/db";

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
