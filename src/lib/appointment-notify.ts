// Envío de avisos de citas al cliente — un solo canal por aviso.
// Política por defecto (decisión de producto): SMS primero si el taller lo tiene
// activo y el cliente tiene teléfono; email solo si no hay SMS posible o el SMS
// falla. Nunca los dos a la vez (antes el cliente con teléfono + email recibía
// ambos en cada evento). Centraliza la lógica usada por acciones admin, reserva
// pública y el cron de recordatorios.

import { getAppUrl } from "@/lib/app-url";
import { getPublicBookingUrl } from "@/lib/shop-slug";
import { formatClientName } from "@/lib/client-name";
import { formatShopDateTime } from "@/lib/shop-timezone";
import { sendAppointmentEmail } from "@/lib/email";
import { sendAppointmentSms, type AppointmentSmsType } from "@/lib/sms";
import { shopToEmailConfig, type ShopEmailConfig } from "@/lib/email-config";
import { resolveNotifyChannelPlan, type ClientNotifyChannelPref } from "@/domain/sms";

export type AppointmentNotificationType = AppointmentSmsType;

export interface AppointmentNotifyShop extends ShopEmailConfig {
  name: string;
  phone: string | null;
  timezone: string;
  slug: string | null;
  appointmentEmailsEnabled: boolean;
  appointmentSmsEnabled: boolean;
}

export interface AppointmentNotifyClient {
  firstName: string;
  lastName?: string | null;
  email: string | null;
  phone: string | null;
  /** Idioma preferido — determina el idioma del SMS y del email. Por defecto español. */
  language?: string | null;
  /**
   * Elegido por el cliente (reserva web, link de gestión) o por el taller en su
   * ficha. AUTO/SMS/EMAIL son una preferencia de orden con respaldo automático
   * (nunca se deja al cliente sin avisar); BOTH es la única excepción a "un solo
   * canal por evento" — el cliente pidió expresamente recibir los dos.
   */
  notifyChannel?: ClientNotifyChannelPref | null;
}

export interface NotifyAppointmentEventParams {
  type: AppointmentNotificationType;
  shop: AppointmentNotifyShop;
  client: AppointmentNotifyClient & { id?: string };
  appointmentId: string;
  title: string;
  startsAt: Date;
  manageToken: string | null;
  /**
   * Identifica este aviso en particular (normalmente el id del AppointmentEvent
   * que lo disparó) — entra en la idempotencyKey para que una reprogramación o un
   * reenvío no se deduplique contra el aviso anterior del mismo tipo.
   */
  noticeKey?: string;
}

export type NotifyAppointmentSkipReason = "NO_CONTACT" | "DISABLED";

export interface NotifyAppointmentEventResult {
  smsSent: boolean;
  emailSent: boolean;
  anySent: boolean;
  smsMessageId: string | null;
  emailMessageId: string | null;
  /** Presente cuando no se intentó ningún canal (sin datos de contacto o canales apagados). */
  skipped: NotifyAppointmentSkipReason | null;
}

/** Link público para que el cliente confirme/cancele su cita (null si el taller no tiene slug o no hay token). */
export function buildAppointmentManageUrl(
  shop: { slug: string | null },
  manageToken: string | null
): string | null {
  if (!shop.slug || !manageToken) return null;
  return `${getAppUrl()}/book/${shop.slug}/manage/${manageToken}`;
}

/** SMS primero; email como respaldo si no hay SMS posible o si el SMS falló. */
export async function notifyAppointmentEvent(
  params: NotifyAppointmentEventParams
): Promise<NotifyAppointmentEventResult> {
  const startsAtFormatted = formatShopDateTime(params.startsAt, params.shop.timezone);
  const manageUrl = buildAppointmentManageUrl(params.shop, params.manageToken);
  const bookingUrl = params.shop.slug ? getPublicBookingUrl(params.shop.slug) : null;

  const phone = params.client.phone?.trim();
  const email = params.client.email?.trim();
  const canSms = params.shop.appointmentSmsEnabled && Boolean(phone);
  const canEmail = params.shop.appointmentEmailsEnabled && Boolean(email);

  const result: NotifyAppointmentEventResult = {
    smsSent: false,
    emailSent: false,
    anySent: false,
    smsMessageId: null,
    emailMessageId: null,
    skipped: null,
  };

  if (!canSms && !canEmail) {
    result.skipped = phone || email ? "DISABLED" : "NO_CONTACT";
    return result;
  }

  async function trySms(): Promise<boolean> {
    if (!canSms || !phone) return false;
    try {
      const sent = await sendAppointmentSms({
        type: params.type,
        to: phone,
        shopId: params.shop.id,
        clientId: params.client.id,
        appointmentId: params.appointmentId,
        noticeKey: params.noticeKey,
        shopName: params.shop.name,
        title: params.title,
        startsAtFormatted,
        language: params.client.language,
        manageUrl,
        bookingUrl,
      });
      result.smsSent = true;
      result.smsMessageId = sent.messageId;
      return true;
    } catch (err) {
      console.error(`[appointment-sms] ${params.type} falló (${params.appointmentId}):`, err);
      return false;
    }
  }

  async function tryEmail(): Promise<boolean> {
    if (!canEmail) return false;
    try {
      result.emailMessageId = await sendAppointmentNoticeEmail(params);
      result.emailSent = true;
      return true;
    } catch (err) {
      console.error(`[appointment-email] ${params.type} falló (${params.appointmentId}):`, err);
      return false;
    }
  }

  const { order, sendBoth } = resolveNotifyChannelPlan(params.client.notifyChannel);
  const attempt: Record<"SMS" | "EMAIL", () => Promise<boolean>> = { SMS: trySms, EMAIL: tryEmail };
  if (sendBoth) {
    for (const channel of order) await attempt[channel]();
  } else {
    for (const channel of order) {
      if (await attempt[channel]()) break;
    }
  }

  result.anySent = result.smsSent || result.emailSent;
  return result;
}

/**
 * Envía el aviso por email (sin intentar SMS). Lo usa notifyAppointmentEvent como
 * respaldo inmediato y el webhook de estado de Twilio como respaldo diferido
 * cuando el operador reporta que el SMS no se entregó. Lanza si no hay email o
 * el envío falla.
 */
export async function sendAppointmentNoticeEmail(params: NotifyAppointmentEventParams): Promise<string | null> {
  const email = params.client.email?.trim();
  if (!email) throw new Error("Client has no email");
  const sent = await sendAppointmentEmail({
    shop: shopToEmailConfig(params.shop),
    to: email,
    type: params.type,
    clientId: params.client.id,
    appointmentId: params.appointmentId,
    noticeKey: params.noticeKey,
    clientName: formatClientName(params.client),
    title: params.title,
    startsAtFormatted: formatShopDateTime(params.startsAt, params.shop.timezone),
    shopPhone: params.shop.phone,
    language: params.client.language,
    manageUrl: buildAppointmentManageUrl(params.shop, params.manageToken),
    bookingUrl: params.shop.slug ? getPublicBookingUrl(params.shop.slug) : null,
  });
  return sent.messageId;
}
