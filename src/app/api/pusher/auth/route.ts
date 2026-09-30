import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSubscribeToPusherChannel } from "@/lib/platform/pusher-authz";
import { signPusherChannelAuth } from "@/lib/platform/pusher";

export const dynamic = "force-dynamic";

const SOCKET_ID = /^\d{1,20}\.\d{1,20}$/;

/**
 * Autorización de canales privados de Pusher (pusher-js la llama por POST form-encoded con
 * `socket_id` y `channel_name`). Requiere sesión y comprueba en el servidor que el canal pertenece
 * al usuario/taller de la sesión; cualquier otro canal → 403 y no se firma nada.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });

  let socketId: unknown;
  let channelName: unknown;
  try {
    const form = await request.formData();
    socketId = form.get("socket_id");
    channelName = form.get("channel_name");
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (typeof socketId !== "string" || !SOCKET_ID.test(socketId) || typeof channelName !== "string") {
    return new NextResponse("Bad request", { status: 400 });
  }

  const allowed = await canSubscribeToPusherChannel(
    { id: session.user.id, role: session.user.role, shopId: session.user.shopId },
    channelName,
    {
      conversationShopId: async (id) =>
        (await db.platformConversation.findUnique({ where: { id }, select: { shopId: true } }))?.shopId ?? null,
    }
  );
  if (!allowed) return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });

  const signed = signPusherChannelAuth(socketId, channelName);
  if (!signed) return new NextResponse("Realtime not configured", { status: 503 });
  return NextResponse.json(signed, { headers: { "Cache-Control": "no-store" } });
}
