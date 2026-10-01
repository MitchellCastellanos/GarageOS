// ÚNICO punto que instancia el SDK de Pusher del servidor.
//  - Publicar (trigger, triggerBatch, …) es un efecto externo saliente: exige PROVIDER_SIDE_EFFECTS=enabled
//    en cada llamada (cliente "gateado"), y `getPusherForPublish` devuelve null si no está autorizado o
//    faltan credenciales — el realtime es de mejor esfuerzo, el respaldo es refrescar / hacer polling.
//  - Firmar la autorización de un canal privado (authorizeChannel) es un cálculo local (HMAC), no un efecto
//    saliente: sigue funcionando con credenciales aunque los efectos estén deshabilitados.
// Un test de código impide volver a hacer `new Pusher(` en el servidor fuera de este archivo.

import Pusher from "pusher";
import { assertProviderSideEffects, gateClient, providerSideEffectsEnabled } from "@/lib/provider-policy";

const LOCAL_OR_READ_VERB = /^(authorize|authenticate|webhook|get|channelInfo)/;

function credentials() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  return { appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER };
}

export function pusherConfigured(): boolean {
  return credentials() !== null;
}

let cached: { sig: string; client: Pusher } | null = null;

function build(): Pusher | null {
  const c = credentials();
  if (!c) return null;
  const sig = `${c.appId}|${c.key}|${c.cluster}|${c.secret.length}`;
  if (cached?.sig === sig) return cached.client;
  const client = gateClient(new Pusher({ ...c, useTLS: true }), LOCAL_OR_READ_VERB, (action) => assertProviderSideEffects("pusher", action), "pusher");
  cached = { sig, client };
  return client;
}

let warned = false;

/** Cliente para PUBLICAR. null si faltan credenciales o los efectos externos no están autorizados. */
export function getPusherForPublish(): Pusher | null {
  if (!pusherConfigured()) return null;
  if (!providerSideEffectsEnabled()) {
    if (!warned) {
      warned = true;
      console.warn("[pusher] publicación omitida — efectos externos deshabilitados en este entorno.");
    }
    return null;
  }
  return build();
}

/** Cliente para firmar autorizaciones de canales privados (operación local). null si faltan credenciales. */
export function getPusherForAuth(): Pusher | null {
  return build();
}
