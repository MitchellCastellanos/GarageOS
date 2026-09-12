// Autenticación de dominio propio para envío transaccional (confirmaciones,
// facturas, cotizaciones) vía la API de dominios de Resend. Ver src/lib/email.ts
// y src/lib/email-config.ts — una vez VERIFIED, el taller puede usar direcciones
// @sudominio.com en sus buzones de Configuración y Resend las entregará.

import { Resend } from "resend";
import type { DnsRecordRow } from "@/lib/domains/types";

export interface EmailDomainResult {
  providerId: string;
  status: "PENDING" | "VERIFIED" | "FAILED";
  records: DnsRecordRow[];
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY no está configurado");
  }
  return new Resend(key);
}

function toRecords(records: { record: string; name: string; type: string; value: string; status: string }[]): DnsRecordRow[] {
  return records.map((r) => ({
    record: r.record,
    name: r.name,
    type: r.type,
    value: r.value,
    status: r.status,
  }));
}

function toDomainStatus(status: string): "PENDING" | "VERIFIED" | "FAILED" {
  if (status === "verified") return "VERIFIED";
  if (status === "failed" || status === "partially_failed") return "FAILED";
  return "PENDING";
}

export async function createEmailDomain(domain: string): Promise<EmailDomainResult> {
  const { data, error } = await getResend().domains.create({ name: domain });
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo registrar el dominio en Resend");
  }
  return {
    providerId: data.id,
    status: toDomainStatus(data.status),
    records: toRecords(data.records),
  };
}

export async function getEmailDomain(providerId: string): Promise<EmailDomainResult> {
  const { data, error } = await getResend().domains.get(providerId);
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo consultar el dominio en Resend");
  }
  return {
    providerId: data.id,
    status: toDomainStatus(data.status),
    records: toRecords(data.records),
  };
}

export async function verifyEmailDomain(providerId: string): Promise<EmailDomainResult> {
  const { error } = await getResend().domains.verify(providerId);
  if (error) {
    throw new Error(error.message ?? "No se pudo verificar el dominio en Resend");
  }
  return getEmailDomain(providerId);
}

export async function removeEmailDomain(providerId: string): Promise<void> {
  const { error } = await getResend().domains.remove(providerId);
  if (error) {
    throw new Error(error.message ?? "No se pudo eliminar el dominio en Resend");
  }
}
