import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken, addSuppression } from "@/lib/communications/suppression";

/**
 * Unsubscribe de campañas (doc §12.1) — enlace firmado embebido por ShopEmailLayout en
 * cada correo de campaña, nunca removible desde el cuerpo de la campaña.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = verifyUnsubscribeToken(token);

  if (!parsed) {
    return new NextResponse("Enlace inválido o vencido.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const client = await db.client.findFirst({
    where: { id: parsed.clientId, shopId: parsed.shopId },
  });

  if (!client) {
    return new NextResponse("No encontrado.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  await db.client.update({
    where: { id: client.id },
    data: { marketingEmailConsent: false, emailMarketingOptOutAt: new Date() },
  });

  if (client.email) {
    await addSuppression(parsed.shopId, "EMAIL", client.email, "UNSUBSCRIBE");
  }

  return new NextResponse("Listo — ya no recibirás más correos de campañas de este taller.", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
