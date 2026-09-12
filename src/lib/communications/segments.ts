// Segmentación de audiencia para Campañas (Fase 5, doc §11.2) — un conjunto cerrado de
// filtros estructurados compilados a una query de Prisma. Nunca SQL/filtro arbitrario
// del tenant.

import { db } from "@/lib/db";
import type { Client, InvoiceLanguage, Prisma } from "@prisma/client";

export type SegmentDefinition =
  | { type: "ALL_CONSENTED" }
  | { type: "LANGUAGE"; language: InvoiceLanguage }
  | { type: "INACTIVE_MONTHS"; months: number }
  | { type: "MANUAL"; clientIds: string[] };

export function isValidSegmentDefinition(value: unknown): value is SegmentDefinition {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "ALL_CONSENTED":
      return true;
    case "LANGUAGE":
      return v.language === "ES" || v.language === "EN" || v.language === "FR";
    case "INACTIVE_MONTHS":
      return typeof v.months === "number" && v.months > 0;
    case "MANUAL":
      return Array.isArray(v.clientIds) && v.clientIds.every((id) => typeof id === "string");
    default:
      return false;
  }
}

/** Base común: siempre consentimiento vigente + email registrado — ninguna segmentación la salta. */
function baseWhere(shopId: string): Prisma.ClientWhereInput {
  return {
    shopId,
    marketingEmailConsent: true,
    emailMarketingOptOutAt: null,
    email: { not: null },
  };
}

export async function resolveSegmentClients(shopId: string, segment: SegmentDefinition): Promise<Client[]> {
  const base = baseWhere(shopId);

  switch (segment.type) {
    case "ALL_CONSENTED":
      return db.client.findMany({ where: base });

    case "LANGUAGE":
      return db.client.findMany({ where: { ...base, language: segment.language } });

    case "INACTIVE_MONTHS": {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - segment.months);
      return db.client.findMany({
        where: {
          ...base,
          invoices: { none: { createdAt: { gte: cutoff } } },
          appointments: { none: { startsAt: { gte: cutoff } } },
        },
      });
    }

    case "MANUAL":
      return db.client.findMany({ where: { ...base, id: { in: segment.clientIds } } });
  }
}

export const SEGMENT_LABELS: Record<SegmentDefinition["type"], string> = {
  ALL_CONSENTED: "Todos los clientes con consentimiento",
  LANGUAGE: "Por idioma",
  INACTIVE_MONTHS: "Inactivos hace X meses",
  MANUAL: "Selección manual",
};
