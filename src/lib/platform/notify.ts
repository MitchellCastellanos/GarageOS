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

async function sendPlatformEmail(to: string | string[], subject: string, react: React.ReactElement): Promise<void> {
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

export async function notifyPlanChanged(params: {
  to: string | string[];
  shopName: string;
  previousPlan: Plan;
  newPlan: Plan;
  reason: string;
}): Promise<void> {
  await sendPlatformEmail(
    params.to,
    `Tu plan cambió a ${params.newPlan} — ${APP_NAME}`,
    React.createElement(PlanChangedEmail, {
      shopName: params.shopName,
      previousPlan: params.previousPlan,
      newPlan: params.newPlan,
      reason: params.reason,
    })
  );
}

function preview(text: string, max = 240): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Confirmación al taller de que su mensaje llegó — mismo patrón que MSC (confirmación inmediata + respuesta luego). */
export async function notifySupportMessageReceived(params: { to: string; shopName: string; message: string }): Promise<void> {
  await sendPlatformEmail(
    params.to,
    `Recibimos tu mensaje — ${APP_NAME}`,
    React.createElement(SupportMessageReceivedEmail, { shopName: params.shopName, messagePreview: preview(params.message) })
  );
}

/** Confirmación al taller cuando el super admin responde desde /platform/messages. */
export async function notifySupportReply(params: { to: string; shopName: string; reply: string }): Promise<void> {
  await sendPlatformEmail(
    params.to,
    `Nueva respuesta de ${APP_NAME}`,
    React.createElement(SupportReplyEmail, { shopName: params.shopName, replyPreview: preview(params.reply) })
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

export async function notifySubscriptionCanceled(params: {
  to: string | string[];
  shopName: string;
  reason: string;
  initiatedBySuperAdmin: boolean;
  effectiveAt: Date;
}): Promise<void> {
  await sendPlatformEmail(
    params.to,
    `Cancelación de tu suscripción — ${APP_NAME}`,
    React.createElement(SubscriptionCanceledEmail, {
      shopName: params.shopName,
      reason: params.reason,
      initiatedBySuperAdmin: params.initiatedBySuperAdmin,
      effectiveAtFormatted: params.effectiveAt.toLocaleDateString("es-CA", { year: "numeric", month: "long", day: "numeric" }),
    })
  );
}
