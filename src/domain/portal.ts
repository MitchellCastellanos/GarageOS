// Customer Portal (Block 13) — reglas puras: vigencia del enlace, visibilidad de documentos y
// clasificación de citas. Nada de I/O aquí; el acceso a datos vive en src/lib/portal.ts.
import { createHash, randomBytes } from "node:crypto";

/** Vigencia de un enlace del portal. Un enlace nuevo (staff o "envíame un enlace") vuelve a dar 30 días. */
export const PORTAL_LINK_TTL_DAYS = 30;
/** Máximo de enlaces activos por cliente; al emitir uno nuevo se revocan los más viejos. */
export const PORTAL_MAX_ACTIVE_LINKS = 5;
/** Solicitudes de enlace de un mismo cliente por hora desde la página pública (anti-spam de correo). */
export const PORTAL_REQUESTS_PER_HOUR = 3;

/** 256 bits de entropía, seguro en URL. Solo se muestra/envía una vez: la BD guarda el hash. */
export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forma válida de un token (evita consultas con basura); no valida que exista. */
export function looksLikePortalToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function portalLinkExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + PORTAL_LINK_TTL_DAYS * 86_400_000);
}

export type PortalLinkState = "ACTIVE" | "EXPIRED" | "REVOKED";

export function portalLinkState(link: { expiresAt: Date; revokedAt: Date | null }, now: Date = new Date()): PortalLinkState {
  if (link.revokedAt) return "REVOKED";
  if (link.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

/** Facturas que el cliente ve: pagadas o ya enviadas/emitidas. Borradores nunca enviados y anuladas, no. */
export function isInvoiceVisibleToCustomer(inv: { status: string; sentAt: Date | null }): boolean {
  if (inv.status === "CANCELLED") return false;
  if (inv.status === "PAID") return true;
  return inv.sentAt != null;
}

/** Estimados visibles: los ya enviados (o decididos). Borradores y cancelados no. */
export function isQuoteVisibleToCustomer(status: string): boolean {
  return status !== "DRAFT" && status !== "CANCELLED";
}

/** ¿Puede el cliente revisar/aprobar este estimado ahora? (misma regla que el enlace público de aprobación). */
export function canCustomerDecideQuote(q: { status: string; validUntil: Date | null }, now: Date = new Date()): boolean {
  if (q.status !== "SENT") return false;
  return q.validUntil == null || q.validUntil.getTime() >= now.getTime();
}

export function isUpcomingAppointment(a: { status: string; startsAt: Date }, now: Date = new Date()): boolean {
  return (a.status === "SCHEDULED" || a.status === "CONFIRMED") && a.startsAt.getTime() >= now.getTime();
}

/** Trabajo en curso en el taller (visible con su estado) vs historial. */
export const ACTIVE_WORK_ORDER_STATUSES = ["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"] as const;
export const HISTORY_WORK_ORDER_STATUSES = ["COMPLETED", "INVOICED"] as const;
