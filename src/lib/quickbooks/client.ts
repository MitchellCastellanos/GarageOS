// Cliente HTTP de QuickBooks Online (OAuth 2.0 + API v3). `fetch` es inyectable para pruebas.
import { getAppUrl } from "@/config/app";
import { providerSideEffectsEnabled } from "@/lib/provider-policy";
import { QBO_MINOR_VERSION, QBO_SCOPE, classifyQboError, type QboErrorKind } from "@/domain/quickbooks";

export type FetchLike = typeof fetch;

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
  apiBase: string;
}

/**
 * null si Intuit no está configurado (las pantallas lo muestran como "falta configuración") O si el entorno
 * no autoriza efectos externos (PROVIDER_SIDE_EFFECTS): QuickBooks queda inerte y falla cerrado — conectar,
 * sincronizar y revocar escriben en la contabilidad del taller.
 */
export function getQboConfig(): QboConfig | null {
  if (!providerSideEffectsEnabled()) return null;
  const clientId = process.env.QBO_CLIENT_ID?.trim();
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const environment = process.env.QBO_ENVIRONMENT?.trim().toLowerCase() === "production" ? "production" : "sandbox";
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.QBO_REDIRECT_URI?.trim() || `${getAppUrl()}/api/integrations/quickbooks/callback`,
    environment,
    apiBase: environment === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com",
  };
}

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export class QboApiError extends Error {
  constructor(
    public readonly kind: QboErrorKind,
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "QboApiError";
  }
}

export function buildAuthorizeUrl(cfg: QboConfig, state: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, response_type: "code", scope: QBO_SCOPE, redirect_uri: cfg.redirectUri, state });
  return `${AUTHORIZE_URL}?${q.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

function basic(cfg: QboConfig) {
  return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(cfg: QboConfig, body: URLSearchParams, fetchImpl: FetchLike, now: Date): Promise<TokenSet> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basic(cfg), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; x_refresh_token_expires_in?: number; error?: string } | null;
  if (!res.ok || !json?.access_token || !json.refresh_token) {
    // invalid_grant = el refresh token ya no sirve → hay que reconectar; lo demás es transitorio.
    const invalid = json?.error === "invalid_grant" || res.status === 400 || res.status === 401;
    throw new QboApiError(invalid ? "auth" : "transient", json?.error ?? `Token endpoint ${res.status}`, res.status, json?.error);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessTokenExpiresAt: new Date(now.getTime() + (json.expires_in ?? 3600) * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + (json.x_refresh_token_expires_in ?? 8_640_000) * 1000),
  };
}

export function exchangeCodeForTokens(cfg: QboConfig, code: string, fetchImpl: FetchLike = fetch, now = new Date()) {
  return tokenRequest(cfg, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }), fetchImpl, now);
}

/** Intuit ROTA el refresh token: siempre hay que guardar el nuevo. */
export function refreshTokens(cfg: QboConfig, refreshToken: string, fetchImpl: FetchLike = fetch, now = new Date()) {
  return tokenRequest(cfg, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), fetchImpl, now);
}

export async function revokeToken(cfg: QboConfig, token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: basic(cfg), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export class QboClient {
  constructor(
    private readonly cfg: QboConfig,
    private readonly realmId: string,
    private readonly accessToken: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
    const q = new URLSearchParams({ minorversion: QBO_MINOR_VERSION, ...params });
    const res = await this.fetchImpl(`${this.cfg.apiBase}/v3/company/${encodeURIComponent(this.realmId)}/${path}?${q.toString()}`, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const c = classifyQboError(res.status, json);
      throw new QboApiError(c.kind, c.message, res.status, c.code);
    }
    return json as T;
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const json = await this.call<{ QueryResponse?: Record<string, unknown> }>("GET", "query", { query: sql });
    const resp = json.QueryResponse ?? {};
    const key = Object.keys(resp).find((k) => Array.isArray(resp[k]));
    return key ? (resp[key] as T[]) : [];
  }

  companyInfo() {
    return this.call<{ CompanyInfo?: { CompanyName?: string } }>("GET", `companyinfo/${encodeURIComponent(this.realmId)}`);
  }

  /** Crea/actualiza (sparse si trae Id+SyncToken). `requestId` hace el POST idempotente en QBO. */
  post<T>(entity: string, payload: unknown, opts: { requestId?: string; operation?: "void" | "delete" } = {}) {
    return this.call<T>("POST", entity, { ...(opts.requestId ? { requestid: opts.requestId } : {}), ...(opts.operation ? { operation: opts.operation } : {}) }, payload);
  }
}
