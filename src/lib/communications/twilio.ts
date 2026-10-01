// Acceso a Twilio para toda la plataforma. Una sola credencial (la cuenta
// principal de GarageOS, TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN) opera sobre las
// subcuentas de cada taller pasando `accountSid` — así nunca se guardan tokens
// de subcuentas en la base de datos.

import twilio from "twilio";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import { assertProviderSideEffects } from "@/lib/provider-policy";

export type TwilioClient = ReturnType<typeof twilio>;

export const TWILIO_INBOUND_PATH = "/api/webhooks/twilio/inbound";
export const TWILIO_STATUS_PATH = "/api/webhooks/twilio/status";

function parentCredentials(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  return { accountSid, authToken };
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
}

/**
 * Cuenta que de verdad es dueña del número compartido (TWILIO_FROM_NUMBER).
 * Por defecto es la cuenta principal (TWILIO_ACCOUNT_SID) — pero si ese
 * número vive en una subcuenta (armado histórico, antes de que existiera
 * este aprovisionamiento), TWILIO_SHARED_NUMBER_SUBACCOUNT_SID le dice al
 * código cuál es esa subcuenta. TWILIO_ACCOUNT_SID siempre debe ser la
 * cuenta RAÍZ (Twilio no permite crear subcuentas desde una subcuenta —
 * error 21101 "Subaccounts cannot contain subaccounts"), aunque el número
 * compartido en sí no viva ahí.
 */
export function getSharedNumberAccountSid(): string {
  const configured = process.env.TWILIO_SHARED_NUMBER_SUBACCOUNT_SID?.trim();
  return configured || parentCredentials().accountSid;
}

/** Cliente de la cuenta principal (compra de números, subcuentas). */
export function getTwilioParentClient(): TwilioClient {
  const { accountSid, authToken } = parentCredentials();
  return twilio(accountSid, authToken);
}

/**
 * Cliente que actúa dentro de una subcuenta (enviar desde su número, configurar
 * su número) usando las credenciales de la cuenta principal. Sin subcuenta →
 * cuenta principal (número compartido).
 */
export function getTwilioClientFor(subaccountSid?: string | null): TwilioClient {
  const { accountSid, authToken } = parentCredentials();
  if (!subaccountSid || subaccountSid === accountSid) return twilio(accountSid, authToken);
  return twilio(accountSid, authToken, { accountSid: subaccountSid });
}

/**
 * Clientes para acciones que MUTAN o cuestan dinero en Twilio (enviar SMS, crear subcuentas, comprar /
 * configurar / liberar números). Exigen PROVIDER_SIDE_EFFECTS=enabled en el momento de la llamada:
 * las credenciales solas no bastan. `getTwilioClientFor`/`getTwilioParentClient` quedan solo para LECTURAS
 * (consultar estado de un mensaje, resolver el token de una cuenta para validar la firma de un webhook).
 */
export function getTwilioClientForWrite(subaccountSid: string | null | undefined, action: string): TwilioClient {
  assertProviderSideEffects("twilio", action);
  return getTwilioClientFor(subaccountSid);
}

export function getTwilioParentClientForWrite(action: string): TwilioClient {
  assertProviderSideEffects("twilio", action);
  return getTwilioParentClient();
}

/**
 * URL pública de un webhook de Twilio. Debe ser exactamente la misma que se
 * configura en Twilio: la firma X-Twilio-Signature se calcula sobre ella.
 * TWILIO_WEBHOOK_BASE_URL permite fijarla aparte de NEXT_PUBLIC_APP_URL (ej.
 * cuando el dominio de la app no es el de producción).
 */
export function twilioWebhookUrl(path: string): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") || getAppUrl();
  return `${base}${path}`;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;
const tokenCache = new Map<string, { token: string; fetchedAt: number }>();

/**
 * Token con el que Twilio firmó un webhook: el de la cuenta dueña del número.
 * Solo se resuelve para la cuenta principal, para la cuenta del número
 * compartido (si vive en una subcuenta aparte, ver getSharedNumberAccountSid)
 * o para subcuentas que GarageOS creó (ShopSmsNumber.subaccountSid) — un
 * AccountSid desconocido nunca valida.
 */
async function authTokenForAccount(accountSid: string): Promise<string | null> {
  const parent = parentCredentials();
  if (accountSid === parent.accountSid) return parent.authToken;

  const cached = tokenCache.get(accountSid);
  if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) return cached.token;

  if (accountSid !== getSharedNumberAccountSid()) {
    const known = await db.shopSmsNumber.findUnique({ where: { subaccountSid: accountSid }, select: { id: true } });
    if (!known) return null;
  }

  const account = await getTwilioParentClient().api.v2010.accounts(accountSid).fetch();
  if (!account.authToken) return null;
  tokenCache.set(accountSid, { token: account.authToken, fetchedAt: Date.now() });
  return account.authToken;
}

/** Valida X-Twilio-Signature de un webhook (form-urlencoded) contra la URL configurada. */
export async function validateTwilioWebhook(params: {
  path: string;
  signature: string | null;
  body: Record<string, string>;
}): Promise<boolean> {
  if (!params.signature) return false;
  const accountSid = params.body.AccountSid;
  if (!accountSid) return false;

  let token: string | null;
  try {
    token = await authTokenForAccount(accountSid);
  } catch (err) {
    console.error("[twilio] no se pudo resolver el token para validar la firma:", err);
    return false;
  }
  if (!token) return false;

  return twilio.validateRequest(token, params.signature, twilioWebhookUrl(params.path), params.body);
}

/** Lee el body form-urlencoded de un webhook de Twilio a un objeto plano. */
export async function readTwilioForm(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  for (const [key, value] of params) body[key] = value;
  return body;
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
