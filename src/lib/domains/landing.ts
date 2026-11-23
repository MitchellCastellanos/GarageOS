// Dominio propio para la landing pública de reservas (/book/[slug]).
// No depende de la API de Vercel: el taller apunta un CNAME hacia nuestro
// host y nosotros verificamos resolviendo DNS directamente. Ver docs/domain-model.md.

import { promises as dns } from "node:dns";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAppUrl } from "@/config/app";
import type { DnsRecordRow } from "@/lib/domains/types";

/** Host al que el taller debe apuntar su CNAME. */
export function getLandingCnameTarget(): string {
  const explicit = process.env.LANDING_DOMAIN_CNAME_TARGET?.trim();
  if (explicit) return explicit.replace(/\.$/, "").toLowerCase();
  return new URL(getAppUrl()).hostname.toLowerCase();
}

/** Nombre del registro TXT de prueba de propiedad (el CNAME solo no prueba que el taller controle el dominio). */
export function landingChallengeName(domain: string): string {
  return `_garageos-challenge.${domain}`;
}

/**
 * Token de propiedad por taller+dominio: HMAC con el secreto del servidor, sin columna nueva. Sin secreto configurado devuelve
 * null y la verificación falla cerrada.
 */
export function landingOwnershipToken(shopId: string, domain: string): string | null {
  const key = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key || key.length < 16) return null;
  return `garageos-verify=${createHmac("sha256", key).update(`landing-domain.v1|${shopId}|${domain.toLowerCase()}`).digest("hex").slice(0, 32)}`;
}

/**
 * Instrucciones DNS a mostrar en la UI: CNAME (para servir la landing) + TXT (prueba de propiedad). Solo soportamos
 * subdominios (ej. "citas.sutaller.com") porque un dominio raíz no puede tener un registro CNAME.
 */
export function getLandingDnsInstructions(domain: string, shopId: string): DnsRecordRow[] {
  const rows: DnsRecordRow[] = [
    { record: "CNAME", type: "CNAME", name: domain, value: getLandingCnameTarget() },
  ];
  const token = landingOwnershipToken(shopId, domain);
  if (token) rows.push({ record: "TXT", type: "TXT", name: landingChallengeName(domain), value: token });
  return rows;
}

export function isApexDomain(domain: string): boolean {
  return domain.trim().split(".").length <= 2;
}

/** Confirma que el CNAME apunta a nuestro host Y que el TXT de propiedad de ESTE taller está publicado. */
export async function checkLandingDnsRecord(domain: string, shopId: string): Promise<boolean> {
  const target = getLandingCnameTarget();
  const expected = landingOwnershipToken(shopId, domain);
  if (!expected) return false;
  try {
    const records = await dns.resolveCname(domain);
    if (!records.some((record) => record.replace(/\.$/, "").toLowerCase() === target)) return false;
    const txt = (await dns.resolveTxt(landingChallengeName(domain))).map((chunks) => chunks.join(""));
    const want = Buffer.from(expected);
    return txt.some((v) => {
      const got = Buffer.from(v.trim());
      return got.length === want.length && timingSafeEqual(got, want);
    });
  } catch {
    return false;
  }
}
