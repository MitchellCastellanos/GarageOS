import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Voice API-key secret at rest: AES-256-GCM, key derived (HKDF-SHA256) from the application's auth secret. The secret is created by the provisioning step, stored only in this form and
// never returned by any endpoint. Rotating AUTH_SECRET makes it undecryptable on purpose: re-run provisioning to mint a new key.

function key(): Buffer {
  const base = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!base || base.length < 16) throw new Error("VOICE_SECRET_KEY_UNAVAILABLE");
  return Buffer.from(hkdfSync("sha256", base, "garageos-voice", "voice-api-key-secret-v1", 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("VOICE_SECRET_FORMAT");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
