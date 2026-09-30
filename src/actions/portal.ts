"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { requireShopSession } from "@/lib/permissions";
import { sendPortalLinkEmail } from "@/lib/email";
import { ADMIN } from "@/lib/routes";
import { ensureQuoteApprovalToken } from "@/lib/quote-approval";
import {
  countActivePortalLinks,
  findClientForPortalRequest,
  getPortalQuote,
  issuePortalLink,
  resolvePortalAccess,
  revokePortalLinks,
} from "@/lib/portal";
import { PORTAL_LINK_TTL_DAYS, PORTAL_REQUESTS_PER_HOUR, canCustomerDecideQuote } from "@/domain/portal";
import { formatClientName } from "@/lib/client-name";
import { RATE_LIMITS, checkRateLimit, currentRequestIp } from "@/lib/rate-limit";

// ── Staff (panel del taller) ────────────────────────────────
// Emitir/enviar/revocar enlaces es una acción operativa con clientes: getWritableShopId("customers.write")
// (rol + permisos + taller no restringido). El cliente siempre se busca por (id, shopId).

async function ownClient(shopId: string, clientId: string) {
  return db.client.findFirst({
    where: { id: clientId, shopId },
    select: { id: true, firstName: true, lastName: true, email: true, language: true },
  });
}

/** Genera un enlace nuevo y lo devuelve UNA vez (para copiarlo/compartirlo). */
export async function createPortalLinkForClient(clientId: string) {
  const shopId = await getWritableShopId("customers.write");
  const session = await requireShopSession();
  const client = await ownClient(shopId, clientId);
  if (!client) return { error: "NOT_FOUND" as const };
  const link = await issuePortalLink({ shopId, clientId: client.id, via: "STAFF", createdById: session.user.id });
  revalidatePath(`${ADMIN.clients}/${client.id}`);
  return { success: true as const, url: link.url, expiresAt: link.expiresAt.toISOString() };
}

export async function sendPortalLinkToClient(clientId: string) {
  const shopId = await getWritableShopId("customers.write");
  const session = await requireShopSession();
  const client = await ownClient(shopId, clientId);
  if (!client) return { error: "NOT_FOUND" as const };
  const email = client.email?.trim();
  if (!email) return { error: "NO_EMAIL" as const };
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true, email: true } });
  if (!shop) return { error: "NOT_FOUND" as const };

  const link = await issuePortalLink({ shopId, clientId: client.id, via: "STAFF", createdById: session.user.id });
  try {
    await sendPortalLinkEmail({
      shop, to: email, clientId: client.id, clientName: formatClientName(client),
      portalUrl: link.url, expiresInDays: PORTAL_LINK_TTL_DAYS, language: client.language,
    });
  } catch (err) {
    console.error(`[portal] no se pudo enviar el enlace al cliente ${client.id}:`, err);
    // El enlace no llegó: no lo dejamos vivo sin que nadie lo tenga.
    await revokePortalLinks(shopId, client.id).catch(() => undefined);
    return { error: "SEND_FAILED" as const };
  }
  revalidatePath(`${ADMIN.clients}/${client.id}`);
  return { success: true as const, sentTo: email };
}

export async function revokeClientPortalLinks(clientId: string) {
  const shopId = await getWritableShopId("customers.write");
  const client = await ownClient(shopId, clientId);
  if (!client) return { error: "NOT_FOUND" as const };
  const revoked = await revokePortalLinks(shopId, client.id);
  revalidatePath(`${ADMIN.clients}/${client.id}`);
  return { success: true as const, revoked };
}

export async function getClientPortalStatus(clientId: string) {
  const shopId = await getShopId("customers.view");
  const client = await ownClient(shopId, clientId);
  if (!client) return null;
  return { activeLinks: await countActivePortalLinks(shopId, client.id), hasEmail: Boolean(client.email?.trim()) };
}

// ── Cliente (público, sin sesión) ───────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Envíame mi enlace": la respuesta es SIEMPRE la misma (exista o no el correo, haya o no límite), así no se
 * puede enumerar a los clientes de un taller. Solo se envía al correo registrado del cliente, con un tope por hora.
 */
export async function requestPortalLink(slug: string, email: string): Promise<{ ok: true }> {
  const normalized = String(email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(normalized) || typeof slug !== "string" || !slug) return { ok: true };

  // Per-IP cap on top of the per-customer cap: stops an attacker mailing many customers of a shop
  // (email bombing) or probing for addresses. The reply stays identical either way (no enumeration).
  const ip = await currentRequestIp();
  if (ip && !(await checkRateLimit(RATE_LIMITS.portalRequestIp(ip))).allowed) return { ok: true };

  const shop = await db.shop.findUnique({ where: { slug }, select: { id: true, name: true, email: true } });
  if (!shop) return { ok: true };
  const client = await findClientForPortalRequest(shop.id, normalized);
  if (!client?.email) return { ok: true };

  const since = new Date(Date.now() - 3_600_000);
  const recent = await db.customerPortalAccess.count({
    where: { shopId: shop.id, clientId: client.id, createdVia: "CUSTOMER_REQUEST", createdAt: { gte: since } },
  });
  if (recent >= PORTAL_REQUESTS_PER_HOUR) return { ok: true };

  const link = await issuePortalLink({ shopId: shop.id, clientId: client.id, via: "CUSTOMER_REQUEST" });
  try {
    await sendPortalLinkEmail({
      shop, to: client.email, clientId: client.id, clientName: formatClientName(client),
      portalUrl: link.url, expiresInDays: PORTAL_LINK_TTL_DAYS, language: client.language,
    });
  } catch (err) {
    console.error(`[portal] falló el envío del enlace solicitado (${client.id}):`, err);
    await revokePortalLinks(shop.id, client.id).catch(() => undefined);
  }
  return { ok: true };
}

/**
 * Abre el flujo de aprobación EXISTENTE (/quote/[token]) para un estimado del cliente del portal. No aprueba
 * nada por sí misma: reutiliza el token y las reglas de decideQuoteApproval (hash del documento, alerta al taller).
 * Solo estimados de este cliente/taller, enviados y vigentes.
 */
export async function openEstimateForApproval(portalToken: string, quoteId: string): Promise<{ error: "INVALID" | "NOT_AVAILABLE" }> {
  const resolved = await resolvePortalAccess(portalToken);
  if (!resolved.ok) return { error: "INVALID" };
  const quote = await getPortalQuote(resolved.access, String(quoteId));
  if (!quote || !canCustomerDecideQuote(quote)) return { error: "NOT_AVAILABLE" };
  const approval = await ensureQuoteApprovalToken(quote.id, quote.approvalToken, quote.approvalTokenExpiresAt);
  redirect(`/quote/${approval.token}`);
}
