// Segmentación de audiencia para Campañas (Fase 5, doc §11.2) — un conjunto cerrado de
// filtros estructurados compilados a una query de Prisma. Nunca SQL/filtro arbitrario
// del tenant.

import { db } from "@/lib/db";
import type { Client, InvoiceLanguage, Prisma } from "@prisma/client";

export type SegmentDefinition =
  | { type: "ALL_CONSENTED" }
  | { type: "LANGUAGE"; language: InvoiceLanguage }
  | { type: "INACTIVE_MONTHS"; months: number }
  // Clientes con un recordatorio de servicio (pendiente o ya avisado) que vence en ≤ N días o ya venció.
  | { type: "SERVICE_DUE"; days: number }
  | { type: "MANUAL"; clientIds: string[] };

export function isValidSegmentDefinition(value: unknown): value is SegmentDefinition {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "ALL_CONSENTED":
      return true;
    case "LANGUAGE":
      return v.language === "EN" || v.language === "FR";
    case "INACTIVE_MONTHS":
      return typeof v.months === "number" && v.months > 0;
    case "SERVICE_DUE":
      return typeof v.days === "number" && Number.isInteger(v.days) && v.days >= 0 && v.days <= 365;
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

    case "SERVICE_DUE": {
      const horizon = new Date(Date.now() + segment.days * 86_400_000);
      return db.client.findMany({
        where: {
          ...base,
          vehicles: {
            some: { reminders: { some: { shopId, status: { in: ["PENDING", "SENT"] }, dueDate: { lte: horizon } } } },
          },
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
  SERVICE_DUE: "Servicio próximo o vencido",
  MANUAL: "Selección manual",
};
