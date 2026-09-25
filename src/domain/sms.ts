// Reglas puras de SMS — sin DB ni Twilio, para poder probarlas directamente.
// Las usan sms.ts (envío), los webhooks de Twilio, el cálculo de cupos y el
// ciclo de vida de los números dedicados.

import type { CommStatus } from "@prisma/client";

// ── Segmentos ────────────────────────────────────────────────────────────────
// Twilio cobra por segmento, no por mensaje. Con solo caracteres del alfabeto
// GSM-7 caben 160 por segmento (153 si se concatena); un solo carácter fuera de
// ese alfabeto (« », ê, ô, ç, emojis…) pasa todo el mensaje a UCS-2: 70 por
// segmento (67 concatenado).

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€\f";

const GSM7_BASIC_SET = new Set(Array.from(GSM7_BASIC));
const GSM7_EXTENDED_SET = new Set(Array.from(GSM7_EXTENDED));

export type SmsEncoding = "GSM7" | "UCS2";

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  /** Unidades de codificación usadas (septetos GSM-7 o unidades UTF-16). */
  units: number;
  segments: number;
}

export function countSmsSegments(text: string): SmsSegmentInfo {
  let gsmUnits = 0;
  let isGsm = true;
  for (const ch of Array.from(text)) {
    if (GSM7_BASIC_SET.has(ch)) gsmUnits += 1;
    else if (GSM7_EXTENDED_SET.has(ch)) gsmUnits += 2;
    else {
      isGsm = false;
      break;
    }
  }

  if (isGsm) {
    const segments = gsmUnits === 0 ? 1 : gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153);
    return { encoding: "GSM7", units: gsmUnits, segments };
  }

  const ucsUnits = text.length; // unidades UTF-16 — un emoji cuenta 2, igual que en Twilio
  const segments = ucsUnits <= 70 ? 1 : Math.ceil(ucsUnits / 67);
  return { encoding: "UCS2", units: ucsUnits, segments };
}

// ── Palabras clave de cumplimiento ───────────────────────────────────────────
// Twilio ya bloquea y responde por su cuenta a las palabras estándar en inglés
// en números de EE. UU./Canadá; acá las registramos para que GarageOS deje de
// intentar enviar (y caiga al email) y para mostrar el estado en la ficha. Se
// agregan las variantes en francés que usan los operadores canadienses.

export type SmsKeyword = "STOP" | "START" | "HELP";

const KEYWORDS: Record<string, SmsKeyword> = {
  STOP: "STOP",
  STOPALL: "STOP",
  UNSUBSCRIBE: "STOP",
  CANCEL: "STOP",
  END: "STOP",
  QUIT: "STOP",
  ARRET: "STOP",
  ARRETER: "STOP",
  START: "START",
  UNSTOP: "START",
  YES: "START",
  HELP: "HELP",
  INFO: "HELP",
  AIDE: "HELP",
};

/** Detecta una palabra clave solo si el mensaje ES la palabra (no si la contiene). */
export function parseSmsKeyword(body: string | null | undefined): SmsKeyword | null {
  if (!body) return null;
  const normalized = body
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!¡?¿\s]+$/g, "")
    .toUpperCase();
  return KEYWORDS[normalized] ?? null;
}

// ── Estados de entrega ───────────────────────────────────────────────────────

export function mapTwilioMessageStatus(status: string | null | undefined): CommStatus | null {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
    case "scheduled":
    case "queued":
      return "QUEUED";
    case "sending":
      return "SENDING";
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "undelivered":
    case "failed":
    case "canceled":
      return "FAILED";
    case "received":
    case "receiving":
      return "RECEIVED";
    default:
      return null;
  }
}

const STATUS_RANK: Partial<Record<CommStatus, number>> = {
  DRAFT: 0,
  QUEUED: 1,
  SENDING: 2,
  SENT: 3,
  DELIVERED: 4,
  FAILED: 4,
  BOUNCED: 4,
};

/**
 * Los callbacks de estado de Twilio pueden llegar repetidos o desordenados
 * ("sent" después de "delivered"). Solo se avanza; un estado terminal
 * (DELIVERED/FAILED) nunca se sobrescribe.
 */
export function shouldApplyStatusUpdate(current: CommStatus, next: CommStatus): boolean {
  const currentRank = STATUS_RANK[current];
  const nextRank = STATUS_RANK[next];
  if (currentRank === undefined || nextRank === undefined) return false;
  if (currentRank >= 4) return false;
  return nextRank > currentRank;
}

// ── Cupos ────────────────────────────────────────────────────────────────────

/** Período de facturación de SMS: mes calendario UTC. */
export function smsBillingPeriod(now: Date = new Date()): { key: string; start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { key, start, end };
}

export function canSpendSmsSegments(used: number, allowance: number, needed: number): boolean {
  return used + needed <= allowance;
}

/** Umbral de alerta alcanzado (0, 80 o 100 %). */
export function smsUsageAlertLevel(used: number, allowance: number): 0 | 80 | 100 {
  if (allowance <= 0) return used > 0 ? 100 : 0;
  const pct = (used / allowance) * 100;
  if (pct >= 100) return 100;
  if (pct >= 80) return 80;
  return 0;
}

/** ¿Hay que avisar? Solo si se cruzó un umbral mayor al último avisado este mes. */
export function nextUsageAlert(
  level: 0 | 80 | 100,
  periodKey: string,
  lastMarker: string | null
): 80 | 100 | null {
  if (level === 0) return null;
  const [markerPeriod, markerLevel] = (lastMarker ?? "").split(":");
  const alreadyAlerted = markerPeriod === periodKey ? Number(markerLevel) || 0 : 0;
  return level > alreadyAlerted ? level : null;
}

// ── Ciclo de vida del número dedicado ────────────────────────────────────────

export const SMS_NUMBER_RELEASE_GRACE_DAYS = 30;

export interface SubscriptionStanding {
  status: string;
  isTrialExpired: boolean;
}

/** Un taller sigue pagando (o en gracia de cobro de Stripe) → conserva su número. */
export function isSubscriptionInGoodStanding(sub: SubscriptionStanding): boolean {
  if (sub.isTrialExpired) return false;
  return sub.status === "ACTIVE" || sub.status === "TRIALING" || sub.status === "PAST_DUE";
}

export type SmsNumberLifecycleAction = "SCHEDULE_RELEASE" | "CANCEL_RELEASE" | "RELEASE" | "NONE";

/**
 * Decide qué hacer con el número de un taller en la corrida diaria:
 * - deja de estar al día → se programa la liberación a 30 días;
 * - vuelve a estar al día antes de ese plazo → se cancela la liberación
 *   (solo si la programó el ciclo automático, no una liberación manual);
 * - se cumplió el plazo → se libera.
 */
export function decideSmsNumberLifecycle(params: {
  status: string;
  releaseScheduledAt: Date | null;
  releaseReason: string | null;
  inGoodStanding: boolean;
  now: Date;
}): SmsNumberLifecycleAction {
  if (params.status === "RELEASE_SCHEDULED" && params.releaseScheduledAt) {
    if (params.releaseScheduledAt.getTime() <= params.now.getTime()) return "RELEASE";
    if (params.inGoodStanding && params.releaseReason === SUBSCRIPTION_LAPSED_REASON) return "CANCEL_RELEASE";
    return "NONE";
  }
  if (params.status === "ACTIVE" && !params.inGoodStanding) return "SCHEDULE_RELEASE";
  return "NONE";
}

export const SUBSCRIPTION_LAPSED_REASON = "subscription_lapsed";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
