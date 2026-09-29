// Ciclo de vida de la conexión: OAuth start/callback, tokens cifrados, refresh con rotación,
// desconexión. Todo acotado al taller de la sesión; los tokens no salen del servidor.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/integrations-crypto";
import { tokenNeedsRefresh } from "@/domain/quickbooks";
import {
  QboApiError,
  QboClient,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getQboConfig,
  refreshTokens,
  revokeToken,
  type FetchLike,
} from "@/lib/quickbooks/client";

const STATE_TTL_MS = 10 * 60_000;

/** Paso 1: nonce de un solo uso ligado a (taller, usuario). Devuelve la URL de autorización de Intuit. */
export async function startQuickBooksOAuth(shopId: string, userId: string, now = new Date()): Promise<string> {
  const cfg = getQboConfig();
  if (!cfg) throw new Error("QuickBooks no está configurado (QBO_CLIENT_ID / QBO_CLIENT_SECRET)");
  const nonce = randomBytes(24).toString("base64url");
  await db.quickBooksOAuthState.deleteMany({ where: { shopId, userId, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } });
  await db.quickBooksOAuthState.create({ data: { nonce, shopId, userId, expiresAt: new Date(now.getTime() + STATE_TTL_MS) } });
  return buildAuthorizeUrl(cfg, nonce);
}

export type CallbackResult = { ok: true; realmId: string; companyName: string | null } | { ok: false; reason: "invalid_state" | "expired_state" | "wrong_user" | "denied" | "exchange_failed" | "not_configured" };

/**
 * Paso 2 (callback): el `state` debe existir, no haber sido usado, no estar vencido y pertenecer al
 * usuario/taller de la sesión actual. Se consume ANTES de intercambiar el código (anti-replay).
 */
export async function completeQuickBooksOAuth(params: {
  session: { userId: string; shopId: string };
  code: string | null;
  state: string | null;
  realmId: string | null;
  error?: string | null;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<CallbackResult> {
  const now = params.now ?? new Date();
  const cfg = getQboConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  if (!params.state) return { ok: false, reason: "invalid_state" };

  const claimed = await db.quickBooksOAuthState.updateMany({
    where: { nonce: params.state, shopId: params.session.shopId, userId: params.session.userId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count === 0) {
    // Distingue el motivo (para el mensaje) sin revelar nada útil a un atacante.
    const row = await db.quickBooksOAuthState.findUnique({ where: { nonce: params.state }, select: { shopId: true, userId: true, expiresAt: true, usedAt: true } });
    if (!row || row.usedAt) return { ok: false, reason: "invalid_state" };
    if (row.shopId !== params.session.shopId || row.userId !== params.session.userId) return { ok: false, reason: "wrong_user" };
    return { ok: false, reason: "expired_state" };
  }
  if (params.error === "access_denied") return { ok: false, reason: "denied" };
  if (!params.code || !params.realmId) return { ok: false, reason: "invalid_state" };

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(cfg, params.code, params.fetchImpl, now);
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }

  let companyName: string | null = null;
  try {
    const info = await new QboClient(cfg, params.realmId, tokens.accessToken, params.fetchImpl).companyInfo();
    companyName = info.CompanyInfo?.CompanyName ?? null;
  } catch {
    // El nombre es cosmético: la conexión sigue siendo válida.
  }

  const shopId = params.session.shopId;
  const existing = await db.quickBooksConnection.findUnique({ where: { shopId }, select: { realmId: true } });
  const data = {
    realmId: params.realmId,
    companyName,
    environment: cfg.environment,
    accessTokenEnc: encryptSecret(tokens.accessToken, shopId),
    refreshTokenEnc: encryptSecret(tokens.refreshToken, shopId),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    status: "ACTIVE" as const,
    lastError: null,
    connectedById: params.session.userId,
    connectedAt: now,
    disconnectedAt: null,
    syncingSince: null,
  };
  // Reconectar a OTRA compañía: no se reutilizan vínculos ni mapeos de la anterior.
  const sameCompany = existing?.realmId === params.realmId;
  await db.quickBooksConnection.upsert({
    where: { shopId },
    create: { shopId, ...data, syncStartDate: now },
    update: sameCompany ? data : { ...data, settings: {}, syncStartDate: now, lastSyncAt: null },
  });
  return { ok: true, realmId: params.realmId, companyName };
}

/**
 * Cliente listo para usar: renueva el access token si vence pronto. Intuit rota el refresh token, así
 * que el nuevo se guarda con un swap optimista (si otra corrida ya renovó, se reutiliza su token).
 * Un refresh token inválido marca la conexión NEEDS_RECONNECT.
 */
export async function getAuthorizedQboClient(shopId: string, opts: { fetchImpl?: FetchLike; now?: Date } = {}): Promise<{ client: QboClient; realmId: string; connectionId: string }> {
  const now = opts.now ?? new Date();
  const cfg = getQboConfig();
  if (!cfg) throw new QboApiError("validation", "QuickBooks no está configurado", 0);
  let conn = await db.quickBooksConnection.findUnique({ where: { shopId } });
  if (!conn || conn.status !== "ACTIVE") throw new QboApiError("auth", "QuickBooks no está conectado", 401);

  if (tokenNeedsRefresh(conn.accessTokenExpiresAt, now)) {
    try {
      const oldRefresh = decryptSecret(conn.refreshTokenEnc, shopId);
      const tokens = await refreshTokens(cfg, oldRefresh, opts.fetchImpl, now);
      const swapped = await db.quickBooksConnection.updateMany({
        where: { id: conn.id, refreshTokenEnc: conn.refreshTokenEnc },
        data: {
          accessTokenEnc: encryptSecret(tokens.accessToken, shopId),
          refreshTokenEnc: encryptSecret(tokens.refreshToken, shopId),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          lastError: null,
        },
      });
      if (swapped.count === 0) {
        // Otra corrida renovó primero: usar lo que guardó.
        conn = (await db.quickBooksConnection.findUnique({ where: { shopId } })) ?? conn;
      } else {
        return { client: new QboClient(cfg, conn.realmId, tokens.accessToken, opts.fetchImpl), realmId: conn.realmId, connectionId: conn.id };
      }
    } catch (e) {
      if (e instanceof QboApiError && e.kind === "auth") {
        await db.quickBooksConnection.updateMany({ where: { id: conn.id }, data: { status: "NEEDS_RECONNECT", lastError: "QuickBooks rechazó la renovación de acceso — vuelve a conectar." } });
      }
      throw e;
    }
  }
  return { client: new QboClient(cfg, conn.realmId, decryptSecret(conn.accessTokenEnc, shopId), opts.fetchImpl), realmId: conn.realmId, connectionId: conn.id };
}

/**
 * Desconecta: revoca el token en Intuit (mejor esfuerzo) y borra los secretos locales. Los vínculos de
 * sincronización se conservan (reconectar a la MISMA compañía retoma sin duplicar).
 */
export async function disconnectQuickBooks(shopId: string, fetchImpl?: FetchLike, now = new Date()): Promise<boolean> {
  const conn = await db.quickBooksConnection.findUnique({ where: { shopId } });
  if (!conn) return false;
  const cfg = getQboConfig();
  if (cfg && conn.status !== "DISCONNECTED") {
    try {
      await revokeToken(cfg, decryptSecret(conn.refreshTokenEnc, shopId), fetchImpl);
    } catch {
      // Revocar es mejor esfuerzo: igual se borran los secretos locales.
    }
  }
  await db.quickBooksConnection.update({
    where: { shopId },
    data: { status: "DISCONNECTED", accessTokenEnc: "", refreshTokenEnc: "", disconnectedAt: now, syncingSince: null, lastError: null },
  });
  return true;
}
