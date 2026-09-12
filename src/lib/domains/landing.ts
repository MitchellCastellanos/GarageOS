// Dominio propio para la landing pública de reservas (/book/[slug]).
// No depende de la API de Vercel: el taller apunta un CNAME hacia nuestro
// host y nosotros verificamos resolviendo DNS directamente. Ver docs/domain-model.md.

import { promises as dns } from "node:dns";
import { getAppUrl } from "@/config/app";
import type { DnsRecordRow } from "@/lib/domains/types";

/** Host al que el taller debe apuntar su CNAME. */
export function getLandingCnameTarget(): string {
  const explicit = process.env.LANDING_DOMAIN_CNAME_TARGET?.trim();
  if (explicit) return explicit.replace(/\.$/, "").toLowerCase();
  return new URL(getAppUrl()).hostname.toLowerCase();
}

/**
 * Instrucciones DNS a mostrar en la UI. Solo soportamos subdominios (ej.
 * "citas.sutaller.com") porque un dominio raíz no puede tener un registro
 * CNAME — el taller necesitaría un ALIAS/ANAME que no todos los proveedores
 * DNS ofrecen, así que no lo prometemos.
 */
export function getLandingDnsInstructions(domain: string): DnsRecordRow[] {
  return [
    {
      record: "CNAME",
      type: "CNAME",
      name: domain,
      value: getLandingCnameTarget(),
    },
  ];
}

export function isApexDomain(domain: string): boolean {
  return domain.trim().split(".").length <= 2;
}

/** Resuelve el CNAME del dominio y confirma que apunta a nuestro host. */
export async function checkLandingDnsRecord(domain: string): Promise<boolean> {
  const target = getLandingCnameTarget();
  try {
    const records = await dns.resolveCname(domain);
    return records.some((record) => record.replace(/\.$/, "").toLowerCase() === target);
  } catch {
    return false;
  }
}
