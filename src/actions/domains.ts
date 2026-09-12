"use server";

import type { Prisma } from "@prisma/client";
import { ADMIN } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { getPublicBookingUrl } from "@/lib/shop-slug";
import { bookingSubdomainUrl, getRootDomain } from "@/config/app";
import type { DnsRecordRow } from "@/lib/domains/types";
import {
  createEmailDomain,
  verifyEmailDomain,
  removeEmailDomain,
} from "@/lib/domains/email";
import {
  checkLandingDnsRecord,
  getLandingDnsInstructions,
  isApexDomain,
} from "@/lib/domains/landing";
import { z } from "zod";

function toJson(records: DnsRecordRow[]): Prisma.InputJsonValue {
  return records as unknown as Prisma.InputJsonValue;
}

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Dominio inválido")
  .max(255)
  .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "Dominio inválido");

export async function getShopDomains() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { slug: true },
  });

  const rows = await db.shopDomain.findMany({ where: { shopId } });
  const email = rows.find((r) => r.purpose === "EMAIL") ?? null;
  const landing = rows.find((r) => r.purpose === "LANDING") ?? null;

  return {
    slug: shop?.slug ?? null,
    bookingUrl: shop?.slug ? getPublicBookingUrl(shop.slug) : null,
    subdomainUrl: shop?.slug ? bookingSubdomainUrl(shop.slug) : null,
    rootDomainConfigured: Boolean(getRootDomain()),
    email: email
      ? {
          domain: email.domain,
          status: email.status,
          dnsRecords: email.dnsRecords as unknown as DnsRecordRow[],
          verifiedAt: email.verifiedAt,
        }
      : null,
    landing: landing
      ? {
          domain: landing.domain,
          status: landing.status,
          dnsRecords: landing.dnsRecords as unknown as DnsRecordRow[],
          verifiedAt: landing.verifiedAt,
        }
      : null,
  };
}

// ── DOMINIO DE CORREO (Resend) ──────────────────────────────────

export async function setEmailDomain(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const parsed = domainSchema.safeParse(formData.get("domain"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dominio inválido" };
  }
  const domain = parsed.data;

  let result;
  try {
    result = await createEmailDomain(domain);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al registrar el dominio" };
  }

  await db.shopDomain.upsert({
    where: { shopId_purpose: { shopId, purpose: "EMAIL" } },
    create: {
      shopId,
      purpose: "EMAIL",
      domain,
      status: result.status,
      providerId: result.providerId,
      dnsRecords: toJson(result.records),
      lastCheckedAt: new Date(),
    },
    update: {
      domain,
      status: result.status,
      providerId: result.providerId,
      dnsRecords: toJson(result.records),
      lastCheckedAt: new Date(),
      verifiedAt: null,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

export async function verifyEmailDomainAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const row = await db.shopDomain.findUnique({
    where: { shopId_purpose: { shopId, purpose: "EMAIL" } },
  });
  if (!row?.providerId) return { error: "No hay dominio de correo configurado" };

  let result;
  try {
    result = await verifyEmailDomain(row.providerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al verificar" };
  }

  await db.shopDomain.update({
    where: { id: row.id },
    data: {
      status: result.status,
      dnsRecords: toJson(result.records),
      lastCheckedAt: new Date(),
      verifiedAt: result.status === "VERIFIED" ? new Date() : null,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true, status: result.status };
}

export async function removeEmailDomainAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const row = await db.shopDomain.findUnique({
    where: { shopId_purpose: { shopId, purpose: "EMAIL" } },
  });
  if (!row) return { success: true };

  if (row.providerId) {
    try {
      await removeEmailDomain(row.providerId);
    } catch {
      // Si ya no existe en Resend, igual limpiamos nuestro registro.
    }
  }

  await db.shopDomain.delete({ where: { id: row.id } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}

// ── DOMINIO DE LANDING (booking público) ────────────────────────

export async function setLandingDomain(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const parsed = domainSchema.safeParse(formData.get("domain"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dominio inválido" };
  }
  const domain = parsed.data;

  if (isApexDomain(domain)) {
    return {
      error:
        "Por ahora solo soportamos subdominios (ej. citas.tudominio.com) — un dominio raíz " +
        "necesita un registro que la mayoría de proveedores DNS no ofrece.",
    };
  }

  await db.shopDomain.upsert({
    where: { shopId_purpose: { shopId, purpose: "LANDING" } },
    create: {
      shopId,
      purpose: "LANDING",
      domain,
      status: "PENDING",
      dnsRecords: toJson(getLandingDnsInstructions(domain)),
    },
    update: {
      domain,
      status: "PENDING",
      dnsRecords: toJson(getLandingDnsInstructions(domain)),
      verifiedAt: null,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true };
}

export async function verifyLandingDomainAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const row = await db.shopDomain.findUnique({
    where: { shopId_purpose: { shopId, purpose: "LANDING" } },
  });
  if (!row) return { error: "No hay dominio de landing configurado" };

  const ok = await checkLandingDnsRecord(row.domain);

  await db.shopDomain.update({
    where: { id: row.id },
    data: {
      status: ok ? "VERIFIED" : "FAILED",
      lastCheckedAt: new Date(),
      verifiedAt: ok ? new Date() : null,
    },
  });

  revalidatePath(ADMIN.settings);
  return { success: true, status: ok ? "VERIFIED" : "FAILED" };
}

export async function removeLandingDomainAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  await db.shopDomain.deleteMany({ where: { shopId, purpose: "LANDING" } });
  revalidatePath(ADMIN.settings);
  return { success: true };
}
