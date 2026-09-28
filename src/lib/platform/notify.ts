import "server-only";
import { render } from "@react-email/render";
import { Resend } from "resend";
import React from "react";
import { PlanChangedEmail } from "@/emails/PlanChangedEmail";
import { SubscriptionCanceledEmail } from "@/emails/SubscriptionCanceledEmail";
import { SupportMessageReceivedEmail } from "@/emails/SupportMessageReceivedEmail";
import { SupportReplyEmail } from "@/emails/SupportReplyEmail";
import { InternalSupportAlertEmail } from "@/emails/InternalSupportAlertEmail";
import type { Plan } from "@/config/entitlements";
import { APP_NAME, getAppUrl } from "@/config/app";
import { resolveShopEmailLanguage, type PlatformEmailLanguage } from "@/lib/platform/locale";

/**
 * Correos de GarageOS→taller sobre la cuenta del taller con GarageOS (plan,
 * cancelación) — deliberadamente fuera del sistema de Communications del
 * taller (src/lib/communications/*): esa es la relación taller↔cliente, esta
 * es GarageOS↔taller. Envío directo por Resend, sin outbox/log de
 * CommunicationMessage — la auditoría de estas acciones vive en
 * PlatformAuditLog (ver src/lib/platform/audit.ts), no en el log de correo
 * del taller.
 */

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") return null;
  return new Resend(key);
}

function platformFromAddress(): string {
  const raw = process.env.EMAIL_FROM_PLATFORM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!raw) throw new Error("EMAIL_FROM_PLATFORM/EMAIL_FROM no configurado — no se puede enviar correo de plataforma.");
  return raw.includes("<") ? raw : `"${APP_NAME}" <${raw}>`;
}

export async function sendPlatformEmail(to: string | string[], subject: string, react: React.ReactElement): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(`[platform/notify] RESEND_API_KEY no configurada — correo "${subject}" a ${to} omitido.`);
    return;
  }
  const html = await render(react);
  const { error } = await resend.emails.send({ from: platformFromAddress(), to, subject, html });
  if (error) {
    console.error(`[platform/notify] Error enviando "${subject}" a ${to}:`, error);
  }
}

const PLAN_CHANGED_SUBJECT: Record<PlatformEmailLanguage, (plan: Plan) => string> = {
  EN: (plan) => `Your plan changed to ${plan} — ${APP_NAME}`,
  FR: (plan) => `Votre forfait a changé pour ${plan} — ${APP_NAME}`,
};

export async function notifyPlanChanged(params: {
  to: string | string[];
  shopId: string;
  shopName: string;
  previousPlan: Plan;
  newPlan: Plan;
  reason: string;
}): Promise<void> {
  const language = await resolveShopEmailLanguage(params.shopId);
  await sendPlatformEmail(
    params.to,
    PLAN_CHANGED_SUBJECT[language](params.newPlan),
    React.createElement(PlanChangedEmail, {
      shopName: params.shopName,
      previousPlan: params.previousPlan,
      newPlan: params.newPlan,
      reason: params.reason,
      language,
    })
  );
}

function preview(text: string, max = 240): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

const SUPPORT_RECEIVED_SUBJECT: Record<PlatformEmailLanguage, string> = {
  EN: `We received your message — ${APP_NAME}`,
  FR: `Nous avons reçu votre message — ${APP_NAME}`,
};

/** Confirmación al taller de que su mensaje llegó — mismo patrón que MSC (confirmación inmediata + respuesta luego). */
export async function notifySupportMessageReceived(params: {
  to: string;
  shopId: string;
  shopName: string;
  message: string;
}): Promise<void> {
  const language = await resolveShopEmailLanguage(params.shopId);
  await sendPlatformEmail(
    params.to,
    SUPPORT_RECEIVED_SUBJECT[language],
    React.createElement(SupportMessageReceivedEmail, {
      shopName: params.shopName,
      messagePreview: preview(params.message),
      language,
    })
  );
}

const SUPPORT_REPLY_SUBJECT: Record<PlatformEmailLanguage, string> = {
  EN: `New reply from ${APP_NAME}`,
  FR: `Nouvelle réponse de ${APP_NAME}`,
};

/** Confirmación al taller cuando el super admin responde desde /platform/messages. */
export async function notifySupportReply(params: { to: string; shopId: string; shopName: string; reply: string }): Promise<void> {
  const language = await resolveShopEmailLanguage(params.shopId);
  await sendPlatformEmail(
    params.to,
    SUPPORT_REPLY_SUBJECT[language],
    React.createElement(SupportReplyEmail, { shopName: params.shopName, replyPreview: preview(params.reply), language })
  );
}

/** Alerta interna al equipo de GarageOS — a PLATFORM_ADMIN_EMAIL, además del push de Telegram. */
export async function notifyAdminNewSupportMessage(params: { shopName: string; message: string; conversationId: string }): Promise<void> {
  const to = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  if (!to) return;
  await sendPlatformEmail(
    to,
    `Mensaje nuevo de ${params.shopName} — ${APP_NAME}`,
    React.createElement(InternalSupportAlertEmail, {
      shopName: params.shopName,
      messagePreview: preview(params.message),
      adminUrl: `${getAppUrl()}/platform/messages/${params.conversationId}`,
    })
  );
}

const SUBSCRIPTION_CANCELED_SUBJECT: Record<PlatformEmailLanguage, string> = {
  EN: `Your subscription cancellation — ${APP_NAME}`,
  FR: `Annulation de votre abonnement — ${APP_NAME}`,
};
const DATE_LOCALE: Record<PlatformEmailLanguage, string> = { EN: "en-CA", FR: "fr-CA" };

export async function notifySubscriptionCanceled(params: {
  to: string | string[];
  shopId: string;
  shopName: string;
  reason: string;
  initiatedBySuperAdmin: boolean;
  effectiveAt: Date;
}): Promise<void> {
  const language = await resolveShopEmailLanguage(params.shopId);
  await sendPlatformEmail(
    params.to,
    SUBSCRIPTION_CANCELED_SUBJECT[language],
    React.createElement(SubscriptionCanceledEmail, {
      shopName: params.shopName,
      reason: params.reason,
      initiatedBySuperAdmin: params.initiatedBySuperAdmin,
      effectiveAtFormatted: params.effectiveAt.toLocaleDateString(DATE_LOCALE[language], {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      language,
    })
  );
}
