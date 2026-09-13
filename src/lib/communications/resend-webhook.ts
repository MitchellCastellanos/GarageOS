// Verificación de firma de webhooks de Resend (formato Svix) — Fase 4, NO activada.
// Ver src/app/api/webhooks/resend/route.ts para el porqué de "no activada".
//
// Svix: headers svix-id / svix-timestamp / svix-signature, secreto "whsec_<base64>",
// firma = base64(HMAC-SHA256(secretBytes, `${svixId}.${svixTimestamp}.${rawBody}`)),
// svix-signature puede traer varias firmas espacio-separadas como "v1,<base64>".
// Ventana de tolerancia de 5 minutos.

import crypto from "crypto";

const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}

export function verifyResendWebhookSignature(
  secret: string,
  rawBody: string,
  headers: SvixHeaders
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .some((candidate) => {
      const candidateBuf = Buffer.from(candidate);
      return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
    });
}
