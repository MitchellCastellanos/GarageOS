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

// ── Voice (browser softphone) helpers. The SDK is only touched here, in the gated module. ─────────────────────────────────────────────────────────────────

/** Short-lived Voice access token for the browser Device: outgoing calls only (no inbound), bound to one identity. */
export function createVoiceAccessToken(p: { accountSid: string; apiKeySid: string; apiKeySecret: string; twimlAppSid: string; identity: string; ttlSeconds: number }): string {
  const { AccessToken } = twilio.jwt;
  const t = new AccessToken(p.accountSid, p.apiKeySid, p.apiKeySecret, { identity: p.identity, ttl: p.ttlSeconds });
  t.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: p.twimlAppSid, incomingAllow: false }));
  return t.toJwt();
}

/** TwiML that rings exactly one number with the given caller ID and reports the child leg's status to `statusCallbackUrl`. */
export function dialNumberTwiml(p: { destination: string; callerId: string; maxSeconds: number; statusCallbackUrl: string }): string {
  const r = new twilio.twiml.VoiceResponse();
  const d = r.dial({ callerId: p.callerId, answerOnBridge: true, timeLimit: p.maxSeconds });
  d.number({ statusCallback: p.statusCallbackUrl, statusCallbackEvent: ["initiated", "ringing", "answered", "completed"], statusCallbackMethod: "POST" }, p.destination);
  return r.toString();
}

// ── Voice hold (conference topology). Each call gets a private conference named after the session: the browser leg and the prospect leg are its only two participants. ──

/** Parent (browser) leg: joins the session's conference; ending the conference ends the browser leg. No wait music while the prospect's phone rings. */
export function conferenceHostTwiml(p: { name: string; eventsUrl: string; maxSeconds: number }): string {
  const r = new twilio.twiml.VoiceResponse();
  const d = r.dial({ timeLimit: p.maxSeconds });
  d.conference({ startConferenceOnEnter: true, endConferenceOnExit: true, beep: "false", waitUrl: "", statusCallback: p.eventsUrl, statusCallbackEvent: ["start", "end", "join", "leave"], statusCallbackMethod: "POST", record: "do-not-record" }, p.name);
  return r.toString();
}

/** Prospect leg (fetched when the callee answers): joins the same conference; if the prospect hangs up the conference ends, which also ends the browser leg. */
export function conferenceGuestTwiml(p: { name: string }): string {
  const r = new twilio.twiml.VoiceResponse();
  const d = r.dial();
  d.conference({ startConferenceOnEnter: true, endConferenceOnExit: true, beep: "false", waitUrl: "", record: "do-not-record" }, p.name);
  return r.toString();
}

/** What the held participant hears: a short spoken notice, a pause, then the same document again (a loop that needs no stored audio asset). */
export function holdTwiml(p: { selfUrl: string; language: "en-CA" | "fr-CA" }): string {
  const r = new twilio.twiml.VoiceResponse();
  r.say({ language: p.language }, p.language === "fr-CA" ? "Veuillez patienter, nous revenons dans un instant." : "Please hold, we will be right back.");
  r.pause({ length: 20 });
  r.redirect({ method: "POST" }, p.selfUrl);
  return r.toString();
}

/** Places the prospect's call through the REST API (the only way to put it in the conference). Returns the new Call SID. */
export async function createConferenceProspectCall(p: { accountSid: string | null; to: string; from: string; joinUrl: string; statusCallbackUrl: string; maxSeconds: number }): Promise<string> {
  const c = getTwilioClientForWrite(p.accountSid, "voice:conference-call");
  const call = await c.calls.create({
    to: p.to, from: p.from, url: p.joinUrl, method: "POST", timeout: 45, timeLimit: p.maxSeconds,
    statusCallback: p.statusCallbackUrl, statusCallbackMethod: "POST", statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
  return call.sid;
}

/** Hard-stops a provider call that must not continue (e.g. the browser leg never joined). Best effort. */
export async function endProviderCall(p: { accountSid: string | null; callSid: string }): Promise<void> {
  const c = getTwilioClientForWrite(p.accountSid, "voice:end-call");
  await c.calls(p.callSid).update({ status: "completed" });
}

/** Resolves the live conference SID by its friendly name (the session id based name). */
export async function findConferenceSid(p: { accountSid: string | null; name: string }): Promise<string | null> {
  const c = getTwilioClientFor(p.accountSid);
  const list = await c.conferences.list({ friendlyName: p.name, status: "in-progress", limit: 1 });
  return list[0]?.sid ?? null;
}

/** Real hold: the participant stops hearing/speaking in the conference and hears `holdUrl` until resumed. */
export async function setParticipantHold(p: { accountSid: string | null; conferenceSid: string; callSid: string; hold: boolean; holdUrl?: string }): Promise<void> {
  const c = getTwilioClientForWrite(p.accountSid, "voice:participant-hold");
  await c.conferences(p.conferenceSid).participants(p.callSid).update({ hold: p.hold, ...(p.hold && p.holdUrl ? { holdUrl: p.holdUrl, holdMethod: "POST" } : {}) });
}

/** Reads the participant's current hold flag (used to heal an interrupted hold/resume request). null = participant not found (call over). */
export async function readParticipantHold(p: { accountSid: string | null; conferenceSid: string; callSid: string }): Promise<boolean | null> {
  const c = getTwilioClientFor(p.accountSid);
  try { return (await c.conferences(p.conferenceSid).participants(p.callSid).fetch()).hold; }
  catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
}

/** The provider calls the hold-capable topology makes, behind one swappable object so tests can script provider behaviour (production always uses these defaults). */
export const voiceProvider = { createConferenceProspectCall, endProviderCall, findConferenceSid, setParticipantHold, readParticipantHold };
