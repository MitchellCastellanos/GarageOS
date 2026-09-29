// Cifrado de secretos de integraciones (tokens OAuth) — AES-256-GCM con la clave de
// INTEGRATIONS_ENCRYPTION_KEY (32 bytes en base64: `openssl rand -base64 32`). El AAD (aquí el shopId)
// liga el texto cifrado a su taller: copiarlo a la fila de otro taller no permite descifrarlo.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY no está configurada");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATIONS_ENCRYPTION_KEY debe ser de 32 bytes en base64");
  return buf;
}

export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(payload: string, aad: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ct) throw new Error("Formato de secreto inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
