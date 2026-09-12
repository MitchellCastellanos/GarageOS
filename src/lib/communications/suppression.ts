// Supresión y unsubscribe de marketing (Fase 5/7, doc §12.1/§12.3). Un token de
// unsubscribe firmado (HMAC, sin estado en DB) identifica taller+cliente — no hace
// falta una tabla nueva de tokens ni exponer IDs en claro.

import crypto from "crypto";
import { db } from "@/lib/db";
import type { CommChannel, SuppressionReason } from "@prisma/client";

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET no está configurado");
  return secret;
}

export function buildUnsubscribeToken(shopId: string, clientId: string): string {
  const payload = `${shopId}.${clientId}`;
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { shopId: string; clientId: string } | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const [shopId, clientId] = payload.split(".");
  if (!shopId || !clientId) return null;
  return { shopId, clientId };
}

export async function isSuppressed(shopId: string, channel: CommChannel, address: string): Promise<boolean> {
  const row = await db.communicationSuppression.findUnique({
    where: { shopId_channel_address: { shopId, channel, address: address.toLowerCase() } },
  });
  return Boolean(row);
}

export async function addSuppression(
  shopId: string,
  channel: CommChannel,
  address: string,
  reason: SuppressionReason
): Promise<void> {
  await db.communicationSuppression.upsert({
    where: { shopId_channel_address: { shopId, channel, address: address.toLowerCase() } },
    update: {},
    create: { shopId, channel, address: address.toLowerCase(), reason },
  });

  await db.communicationAuditLog.create({
    data: {
      shopId,
      action: "suppression.add",
      targetType: "CommunicationSuppression",
      targetId: null,
      metadata: { channel, address: address.toLowerCase(), reason },
    },
  });
}
