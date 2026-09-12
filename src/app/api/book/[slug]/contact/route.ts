import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getShopBySlug } from "@/lib/booking-slots";
import { shopToEmailConfig } from "@/lib/email-config";
import { sendContactStaffNotification, sendContactAcknowledgment } from "@/lib/email";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(120),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  message: z.string().min(1, "El mensaje es requerido").max(4000),
});

/**
 * Contact Us del sitio público del taller (doc §6.3) — persiste como conversación real
 * en el Inbox en vez de ser solo un mailto:. Vincula al Client existente solo por email
 * exacto, nunca por coincidencia ambigua (ver docs/domain-model.md invariante 1).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);

  if (!shop) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, message } = parsed.data;
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const phone = parsed.data.phone?.trim() || null;

  const client = email ? await db.client.findFirst({ where: { shopId: shop.id, email } }) : null;

  const thread = await db.communicationThread.create({
    data: {
      shopId: shop.id,
      clientId: client?.id ?? null,
      subject: `Contacto: ${name}`,
      status: "OPEN",
      lastMessageAt: new Date(),
    },
  });

  await db.communicationMessage.create({
    data: {
      shopId: shop.id,
      clientId: client?.id ?? null,
      threadId: thread.id,
      direction: "INBOUND",
      channel: "EMAIL",
      messageType: "HUMAN",
      status: "RECEIVED",
      provider: "web_form",
      purpose: "WEB_CONTACT",
      businessEntityType: "COMMUNICATION_THREAD",
      businessEntityId: thread.id,
      from: email ?? phone ?? "formulario web",
      to: [],
      subject: `Contacto: ${name}`,
      textBody: `${message}\n\n— ${name}${phone ? ` · ${phone}` : ""}`,
    },
  });

  const shopConfig = shopToEmailConfig(shop);

  try {
    await sendContactStaffNotification({
      shop: shopConfig,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      message,
      threadId: thread.id,
    });
  } catch (err) {
    console.error("[contact] aviso al taller falló:", err);
  }

  if (email) {
    try {
      await sendContactAcknowledgment({
        shop: shopConfig,
        customerName: name,
        customerEmail: email,
        threadId: thread.id,
      });
    } catch (err) {
      console.error("[contact] acuse de recibo falló:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
