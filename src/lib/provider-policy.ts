// Política CENTRAL de efectos secundarios salientes hacia proveedores externos.
//
// Tener credenciales NO basta para producir un efecto externo (SMS, correo, evento de
// Pusher, alerta de Telegram, compras/altas en Twilio, dominios en Resend, mutaciones de
// Stripe). Un entorno debe AUTORIZARLO de forma explícita con
//
//     PROVIDER_SIDE_EFFECTS=enabled
//
// Cualquier otro valor — ausente, vacío, "true", "1", "Enabled ", "on", basura — se interpreta
// como DESHABILITADO (falla cerrado). Producción recibe el valor explícito; Preview no debe
// tenerlo salvo en pruebas controladas de un proveedor concreto.
//
// Esto solo gobierna lo SALIENTE. Lo entrante (webhooks firmados de Stripe/Twilio/Resend, la
// autorización de canales de Pusher) y las lecturas no están afectados.
//
// Stripe tiene además un permiso propio y más estrecho (ver stripeMutationsAllowed) para poder
// validar Stripe TEST en Preview sin habilitar SMS/correo reales.

export const PROVIDER_SIDE_EFFECTS_ENV = "PROVIDER_SIDE_EFFECTS";
export const STRIPE_TEST_MUTATIONS_ENV = "STRIPE_TEST_MUTATIONS";

export type ProviderName = "twilio" | "resend" | "pusher" | "telegram" | "stripe" | "quickbooks";

type EnvLike = Record<string, string | undefined>;

/** Parseo estricto: solo el literal `enabled` (sin distinguir espacios/mayúsculas) autoriza. */
export function parseEnabledFlag(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "enabled";
}

export function providerSideEffectsEnabled(env: EnvLike = process.env): boolean {
  return parseEnabledFlag(env[PROVIDER_SIDE_EFFECTS_ENV]);
}

/**
 * Error de "proveedor deshabilitado". El mensaje es seguro para mostrar al usuario: no revela
 * nombres de variables, valores ni qué credenciales existen.
 */
export class ProviderDisabledError extends Error {
  readonly code = "PROVIDER_SIDE_EFFECTS_DISABLED";
  constructor(
    public readonly provider: ProviderName,
    public readonly action: string
  ) {
    super("This action is unavailable: external provider actions are disabled in this environment.");
    this.name = "ProviderDisabledError";
  }
}

export function isProviderDisabledError(err: unknown): err is ProviderDisabledError {
  return err instanceof ProviderDisabledError || (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "PROVIDER_SIDE_EFFECTS_DISABLED");
}

/** Lanza ProviderDisabledError salvo que el entorno autorice efectos externos salientes. */
export function assertProviderSideEffects(provider: ProviderName, action: string, env: EnvLike = process.env): void {
  if (!providerSideEffectsEnabled(env)) throw new ProviderDisabledError(provider, action);
}

/**
 * Variante para notificaciones "best-effort" (Pusher, Telegram, correos internos): devuelve false
 * y deja un log SIN secretos ni destinatarios en lugar de lanzar.
 */
export function providerSideEffectsEnabledOrLog(provider: ProviderName, action: string, env: EnvLike = process.env): boolean {
  if (providerSideEffectsEnabled(env)) return true;
  console.warn(`[provider-policy] ${provider}:${action} omitido — efectos externos deshabilitados en este entorno.`);
  return false;
}

/**
 * Envuelve un cliente de SDK: toda función cuyo nombre NO empiece por un verbo de lectura se ejecuta solo
 * si `assertAllowed` no lanza — evaluado EN CADA LLAMADA, a cualquier profundidad (`client.a.b.c()`).
 * Es el límite común más bajo de un SDK: ningún sitio de llamada puede saltárselo, y un verbo nuevo o
 * desconocido queda bloqueado por defecto (falla cerrado).
 */
export function gateClient<T extends object>(
  target: T,
  readOnlyVerb: RegExp,
  assertAllowed: (action: string) => void,
  path: string
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof prop === "symbol") return value;
      const here = `${path}.${prop}`;
      if (typeof value === "function") {
        if (readOnlyVerb.test(prop)) return value.bind(obj);
        return (...args: unknown[]) => {
          assertAllowed(here);
          return Reflect.apply(value, obj, args);
        };
      }
      if (typeof value === "object" && value !== null) return gateClient(value as object, readOnlyVerb, assertAllowed, here);
      return value;
    },
  });
}

/** Claves de prueba de Stripe (nunca sk_live_/rk_live_). */
export function isStripeTestKey(key: string | undefined): boolean {
  const k = key?.trim() ?? "";
  return /^(sk|rk)_test_[A-Za-z0-9_]+$/.test(k);
}

/**
 * ¿Puede el código MUTAR objetos de Stripe (crear Customer/Checkout/portal, cambiar o cancelar
 * suscripciones, reportar uso medido)? Dos vías, ninguna basta con solo tener STRIPE_SECRET_KEY:
 *  1. PROVIDER_SIDE_EFFECTS=enabled (entorno autorizado — Producción).
 *  2. STRIPE_TEST_MUTATIONS=enabled Y la clave es de PRUEBA (sk_test_/rk_test_): permite validar
 *     Stripe TEST en Preview sin autorizar SMS/correo/Pusher/Telegram. Con una clave live este
 *     permiso NO aplica: solo la vía 1 puede tocar Live.
 * La verificación de firma y el procesamiento de webhooks entrantes no pasan por aquí.
 */
export function stripeMutationsAllowed(env: EnvLike = process.env): boolean {
  if (providerSideEffectsEnabled(env)) return true;
  return parseEnabledFlag(env[STRIPE_TEST_MUTATIONS_ENV]) && isStripeTestKey(env.STRIPE_SECRET_KEY);
}

export function assertStripeMutationAllowed(action: string, env: EnvLike = process.env): void {
  if (!stripeMutationsAllowed(env)) throw new ProviderDisabledError("stripe", action);
}
