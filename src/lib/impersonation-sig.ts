// Firma HMAC de los claims de impersonación. Auth.js (`POST /api/auth/session`, trigger "update") pasa al callback `jwt` el
// cuerpo que envía el CLIENTE; sin firma, cualquier usuario con sesión (p. ej. personal de ventas) podría inyectar un claim
// con el shopId que quisiera y obtener OWNER en ese taller. Solo el servidor (que conoce el secreto) puede emitir claims válidos.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ImpersonationClaim } from "@/types";

function secret(): string | null {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  return s && s.length >= 16 ? s : null;
}

function mac(claim: Omit<ImpersonationClaim, "sig">, key: string): string {
  const payload = JSON.stringify([
    "impersonation.v1", claim.salesDemoId ?? null, claim.shopId, claim.shopName, claim.startedByUserId, claim.startedByName, claim.expiresAt,
  ]);
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Devuelve el claim firmado. Falla cerrado si no hay secreto configurado. */
export function signImpersonation(claim: Omit<ImpersonationClaim, "sig">): ImpersonationClaim {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET no configurado: no se puede iniciar una impersonación");
  return { ...claim, sig: mac(claim, key) };
}

export function isValidImpersonationSig(claim: ImpersonationClaim | null | undefined): boolean {
  const key = secret();
  if (!claim || !key || typeof claim.sig !== "string") return false;
  const a = Buffer.from(claim.sig);
  const b = Buffer.from(mac(claim, key));
  return a.length === b.length && timingSafeEqual(a, b);
}
