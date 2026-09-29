// Customer Portal (Block 13) — acceso y lectura. Una ventana segura a los MISMOS registros del taller
// (clientes, vehículos, estimados, facturas, DVI, citas, historial): no hay lógica de negocio paralela.
//
// Modelo de acceso: enlace mágico con token aleatorio de 256 bits; la BD guarda solo su SHA-256.
// El token identifica UN cliente de UN taller (Client ya es por taller): toda consulta se acota por
// (shopId, clientId) tomados de la fila de acceso — jamás de la URL. Los ids de la URL (vehículo,
// factura…) solo se aceptan si pertenecen a ese cliente; si no, "no existe".
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import { can } from "@/lib/subscription";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  HISTORY_WORK_ORDER_STATUSES,
  PORTAL_MAX_ACTIVE_LINKS,
  generatePortalToken,
  hashPortalToken,
  isInvoiceVisibleToCustomer,
  isQuoteVisibleToCustomer,
  isUpcomingAppointment,
  looksLikePortalToken,
  portalLinkExpiry,
  portalLinkState,
  type PortalLinkState,
} from "@/domain/portal";

export function buildPortalUrl(token: string): string {
  return `${getAppUrl()}/portal/${token}`;
}

// ── Emisión / revocación (staff o solicitud del cliente) ─────

/** Crea un enlace nuevo y devuelve el token EN CLARO una sola vez (no se puede recuperar después). */
export async function issuePortalLink(input: {
  shopId: string;
  clientId: string;
  via: "STAFF" | "CUSTOMER_REQUEST";
  createdById?: string | null;
  now?: Date;
}): Promise<{ token: string; url: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = generatePortalToken();
  const expiresAt = portalLinkExpiry(now);
  await db.customerPortalAccess.create({
    data: {
      shopId: input.shopId,
      clientId: input.clientId,
      tokenHash: hashPortalToken(token),
      createdVia: input.via,
      createdById: input.createdById ?? null,
      expiresAt,
    },
  });

  // Tope de enlaces activos por cliente: los más antiguos se revocan.
  const active = await db.customerPortalAccess.findMany({
    where: { shopId: input.shopId, clientId: input.clientId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const stale = active.slice(PORTAL_MAX_ACTIVE_LINKS).map((l) => l.id);
  if (stale.length > 0) {
    await db.customerPortalAccess.updateMany({ where: { id: { in: stale } }, data: { revokedAt: now } });
  }
  return { token, url: buildPortalUrl(token), expiresAt };
}

/** Revoca todos los enlaces vigentes de un cliente del taller. Devuelve cuántos. */
export async function revokePortalLinks(shopId: string, clientId: string, now: Date = new Date()): Promise<number> {
  const res = await db.customerPortalAccess.updateMany({
    where: { shopId, clientId, revokedAt: null },
    data: { revokedAt: now },
  });
  return res.count;
}

export async function countActivePortalLinks(shopId: string, clientId: string, now: Date = new Date()): Promise<number> {
  return db.customerPortalAccess.count({ where: { shopId, clientId, revokedAt: null, expiresAt: { gt: now } } });
}

// ── Resolución del token ────────────────────────────────────

export interface PortalAccess {
  accessId: string;
  shopId: string;
  clientId: string;
}

export type PortalResolution =
  | { ok: true; access: PortalAccess }
  | { ok: false; reason: "INVALID" }
  | { ok: false; reason: Exclude<PortalLinkState, "ACTIVE">; shopSlug: string | null; shopName: string };

const TOUCH_INTERVAL_MS = 10 * 60_000;

/** Valida un token. INVALID = no existe (o basura); EXPIRED/REVOKED = existió pero ya no sirve. */
export async function resolvePortalAccess(token: unknown, now: Date = new Date()): Promise<PortalResolution> {
  if (!looksLikePortalToken(token)) return { ok: false, reason: "INVALID" };
  const row = await db.customerPortalAccess.findUnique({
    where: { tokenHash: hashPortalToken(token) },
    select: {
      id: true,
      shopId: true,
      clientId: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      shop: { select: { name: true, slug: true } },
    },
  });
  if (!row) return { ok: false, reason: "INVALID" };

  const state = portalLinkState(row, now);
  if (state !== "ACTIVE") return { ok: false, reason: state, shopSlug: row.shop.slug, shopName: row.shop.name };

  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.customerPortalAccess
      .updateMany({ where: { id: row.id, revokedAt: null }, data: { lastUsedAt: now } })
      .catch(() => undefined);
  }
  return { ok: true, access: { accessId: row.id, shopId: row.shopId, clientId: row.clientId } };
}

// ── Lectura (todo acotado por access.shopId + access.clientId) ─

const own = (a: PortalAccess) => ({ shopId: a.shopId, clientId: a.clientId });

export async function getPortalShop(access: PortalAccess) {
  return db.shop.findUnique({
    where: { id: access.shopId },
    select: {
      id: true, name: true, logoUrl: true, brandColor: true, phone: true, email: true, address: true,
      slug: true, bookingEnabled: true, timezone: true,
    },
  });
}

export async function getPortalClient(access: PortalAccess) {
  return db.client.findFirst({
    where: { id: access.clientId, shopId: access.shopId },
    select: { id: true, firstName: true, lastName: true, language: true },
  });
}

export async function getPortalOverview(access: PortalAccess, now: Date = new Date()) {
  const [vehicles, appointments, quotes, invoices, activeWork, inspections, reminders, dviShared] = await Promise.all([
    db.vehicle.findMany({
      where: { clientId: access.clientId, client: { shopId: access.shopId } },
      select: { id: true, year: true, make: true, model: true, licensePlate: true, color: true },
      orderBy: { createdAt: "asc" },
    }),
    db.appointment.findMany({
      where: { ...own(access), status: { not: "CANCELLED" } },
      select: {
        id: true, title: true, startsAt: true, status: true, manageToken: true,
        vehicle: { select: { year: true, make: true, model: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 12,
    }),
    db.quote.findMany({
      where: { ...own(access), status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { id: true, quoteNumber: true, status: true, issuedAt: true, validUntil: true, total: true },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    db.invoice.findMany({
      where: { ...own(access), status: { not: "CANCELLED" }, OR: [{ status: "PAID" }, { sentAt: { not: null } }] },
      select: { id: true, invoiceNumber: true, status: true, issuedAt: true, dueAt: true, paidAt: true, sentAt: true, total: true },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    db.workOrder.findMany({
      where: { ...own(access), status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } },
      select: {
        id: true, orderNumber: true, status: true, jobStatus: true, concern: true, createdAt: true,
        vehicle: { select: { year: true, make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.inspection.findMany({
      where: { ...own(access), shareToken: { not: null } },
      select: { id: true, shareToken: true, createdAt: true, vehicle: { select: { year: true, make: true, model: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.serviceReminder.findMany({
      where: { shopId: access.shopId, vehicle: { clientId: access.clientId }, status: { in: ["PENDING", "SENT"] } },
      select: { id: true, serviceType: true, dueDate: true, dueMileage: true, vehicle: { select: { year: true, make: true, model: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
    // El reporte compartible de DVI es Pro+ (mismo criterio que /inspection/[token]).
    can(access.shopId, "dvi.customerReport"),
  ]);

  return {
    vehicles,
    upcomingAppointments: appointments.filter((a) => isUpcomingAppointment(a, now)).reverse(),
    recentAppointments: appointments.filter((a) => !isUpcomingAppointment(a, now)).slice(0, 5),
    quotes: quotes.filter((q) => isQuoteVisibleToCustomer(q.status)),
    invoices: invoices.filter(isInvoiceVisibleToCustomer),
    activeWork,
    inspections: dviShared ? inspections : [],
    reminders,
  };
}

export async function getPortalVehicleHistory(access: PortalAccess, vehicleId: string) {
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, clientId: access.clientId, client: { shopId: access.shopId } },
    select: { id: true, year: true, make: true, model: true, licensePlate: true, color: true },
  });
  if (!vehicle) return null;
  const [workOrders, invoices, inspections, reminders, dviShared] = await Promise.all([
    db.workOrder.findMany({
      where: { ...own(access), vehicleId, status: { in: [...ACTIVE_WORK_ORDER_STATUSES, ...HISTORY_WORK_ORDER_STATUSES] } },
      select: {
        id: true, orderNumber: true, status: true, jobStatus: true, concern: true, mileageIn: true, createdAt: true,
        lines: { select: { id: true, description: true, quantity: true, itemType: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.invoice.findMany({
      where: {
        ...own(access), status: { not: "CANCELLED" }, OR: [{ status: "PAID" }, { sentAt: { not: null } }],
        vehicles: { some: { vehicleId } },
      },
      select: { id: true, invoiceNumber: true, status: true, issuedAt: true, paidAt: true, sentAt: true, total: true },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
    db.inspection.findMany({
      where: { ...own(access), vehicleId, shareToken: { not: null } },
      select: { id: true, shareToken: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.serviceReminder.findMany({
      where: { shopId: access.shopId, vehicleId, status: { in: ["PENDING", "SENT"] } },
      select: { id: true, serviceType: true, dueDate: true, dueMileage: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    can(access.shopId, "dvi.customerReport"),
  ]);
  return { vehicle, workOrders, invoices: invoices.filter(isInvoiceVisibleToCustomer), inspections: dviShared ? inspections : [], reminders };
}

export const portalInvoiceInclude = {
  client: true,
  vehicles: {
    include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
  paymentEntries: { orderBy: { sortOrder: "asc" as const } },
  shop: true,
} as const;

/** Factura completa (para detalle/PDF) SOLO si es de este cliente y es visible para el cliente. */
export async function getPortalInvoice(access: PortalAccess, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, ...own(access) },
    include: { ...portalInvoiceInclude, refunds: { select: { amount: true, refundedAt: true }, orderBy: { refundedAt: "asc" } } },
  });
  if (!invoice || !isInvoiceVisibleToCustomer(invoice)) return null;
  return invoice;
}

/** Estimado de este cliente, visible y aún decidible (para abrir el flujo de aprobación existente). */
export async function getPortalQuote(access: PortalAccess, quoteId: string) {
  return db.quote.findFirst({
    where: { id: quoteId, ...own(access), status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { id: true, status: true, validUntil: true, approvalToken: true, approvalTokenExpiresAt: true },
  });
}

// ── Solicitud del cliente ("envíame mi enlace") ─────────────

export async function findClientForPortalRequest(shopId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return db.client.findFirst({
    where: { shopId, email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, email: true, language: true },
    orderBy: { createdAt: "asc" },
  });
}
