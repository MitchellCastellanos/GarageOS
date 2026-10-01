// ÚNICO punto que instancia el SDK de Resend. Todo envío / alta de dominio saliente pasa por el cliente
// "gateado": cualquier función que no sea de lectura exige PROVIDER_SIDE_EFFECTS=enabled EN EL MOMENTO DE LA
// LLAMADA (emails.send, batch.send, domains.create/verify/remove/update…). Tener RESEND_API_KEY no basta.
// Un test de código (tests/provider-policy.test.ts) impide volver a hacer `new Resend(` fuera de este archivo.

import { Resend } from "resend";
import { assertProviderSideEffects, gateClient, providerSideEffectsEnabled } from "@/lib/provider-policy";

const READ_ONLY_VERB = /^(get|list|retrieve)/;

function configuredKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  return !key || key === "re_placeholder" ? null : key;
}

function build(key: string): Resend {
  return gateClient(new Resend(key), READ_ONLY_VERB, (action) => assertProviderSideEffects("resend", action), "resend");
}

/** Para flujos que deben fallar con claridad: lanza si falta la clave. Las mutaciones lanzan ProviderDisabledError si no están autorizadas. */
export function getResendClient(missingMessage = "RESEND_API_KEY is not configured"): Resend {
  const key = configuredKey();
  if (!key) throw new Error(missingMessage);
  return build(key);
}

/**
 * Para correos internos / de mejor esfuerzo (verificación, alertas de plataforma): null si falta la clave
 * O si los efectos externos no están autorizados — el llamador omite el envío (y nunca finge haberlo hecho).
 */
export function tryGetResendClient(): Resend | null {
  const key = configuredKey();
  if (!key || !providerSideEffectsEnabled()) return null;
  return build(key);
}
